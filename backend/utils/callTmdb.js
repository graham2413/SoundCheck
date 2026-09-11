// utils/callTmdb.js
const axios = require("axios");
const https = require("https");
const redis = require("./redisClient");

const TMDB_BASE = "https://api.themoviedb.org/3";

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 40;
const QUEUE_DELAY_MS = 200;

const DETAILS_CACHE_TTL = 259200; // 3 days - short enough to keep watch/providers reasonably fresh
const SEARCH_CACHE_TTL = 7200; // 2 hours
const GENRE_CACHE_TTL = 2592000; // 30 days
const CALENDAR_DETAILS_CACHE_TTL = 43200; // 12 hours - short enough to always refresh at least once per calendar day
const SEASON_CACHE_TTL = 86400; // 1 day - shorter than DETAILS_CACHE_TTL since airing seasons get new stills/air dates as episodes approach

// Caps simultaneous connections to stay under TMDb's ~20 concurrent connections/IP limit
const tmdbAgent = new https.Agent({ maxSockets: 20, keepAlive: true });

// In-process sliding-window limiter (was Redis-backed via a Lua script -
// moved in-process since this only needs to hold across requests within a
// single Node process, not across instances). Holds recent request
// timestamps; expired ones are pruned on each check. A plain array check
// here (unlike a naive read-then-write) is safe without extra locking since
// Node is single-threaded - no other call can interleave mid-check.
const tmdbRequestTimestamps = [];

function tryReserveTmdbSlot() {
  const now = Date.now();
  while (tmdbRequestTimestamps.length && tmdbRequestTimestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    tmdbRequestTimestamps.shift();
  }
  if (tmdbRequestTimestamps.length < RATE_LIMIT_MAX_REQUESTS) {
    tmdbRequestTimestamps.push(now);
    return true;
  }
  return false;
}

// Sliding window limiter (mirrors callDeezer.js) - delays instead of throwing 429
async function waitForRateLimitSlot() {
  while (true) {
    if (tryReserveTmdbSlot()) return;

    await new Promise((resolve) => setTimeout(resolve, QUEUE_DELAY_MS));
  }
}

// Low-level TMDb GET with rate-limit queueing + retry/backoff (mirrors callDeezer.js)
async function callTmdb(path, params = {}) {
  await waitForRateLimitSlot();

  let attempt = 0;
  while (attempt < 5) {
    try {
      const response = await axios.get(`${TMDB_BASE}${path}`, {
        params,
        timeout: 7000,
        httpsAgent: tmdbAgent,
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
          Accept: "application/json",
        },
      });

      return response;
    } catch (error) {
      console.error(
        `TMDb API error [${attempt + 1}/5]:`,
        path,
        error.response?.status,
        error.message
      );

      // Auth/client errors (401/403/404) will never succeed on retry - failing
      // fast avoids wasting ~31s of backoff per item (multiplied across an
      // entire import) when e.g. TMDB_API_KEY is missing/invalid.
      const status = error.response?.status;
      if (status && status !== 429 && status < 500) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000)); // Exponential backoff
      attempt++;
    }
  }

  console.error(`All attempts failed for ${path}`);
  return { data: null };
}

// Cache-aware wrapper: GET /movie/:id or /tv/:id details. `forceRefresh`
// bypasses the cache read (used by the daily cinema-metadata refresh cron so
// it actually sees changes, instead of just re-reading the same 7-day-stale
// cached blob) but still writes the fresh result back to cache either way.

// Cast fields cinemaController.js actually reads (see getCinemaDetail) -
// TMDb's raw cast objects also carry adult/gender/known_for_department/
// original_name/cast_id/credit_id, none of which anything ever uses.
function trimCast(cast) {
  return (cast || []).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
    order: c.order,
    popularity: c.popularity,
    // TV's aggregate_credits nests character under roles[] instead of a
    // flat field - only roles[0] is ever read, so the rest is dropped.
    ...(c.roles ? { roles: c.roles.slice(0, 1).map((r) => ({ character: r.character })) } : {}),
  }));
}

// Only the Director's name is displayed today, but a handful of other roles
// are common "who made this" credits a future feature might want - keeping
// just name+job for those (a few dozen bytes) avoids another cache-version
// bump later, without keeping the full ~150-person raw crew array around.
const KEY_CREW_JOBS = new Set([
  "Director",
  "Writer",
  "Screenplay",
  "Producer",
  "Executive Producer",
  "Director of Photography",
  "Composer",
]);
function trimCrew(crew) {
  return (crew || [])
    .filter((c) => KEY_CREW_JOBS.has(c.job))
    .map((c) => ({ name: c.name, job: c.job }));
}

// Strips TMDb's raw /movie|tv details response down to only the fields
// cinemaController.js (and the backfill scripts) actually read, before
// caching - the full raw response includes every country's watch-provider/
// release-date data, ~150 full crew objects, 100+ full-size image objects,
// etc. that were never used but still counted toward Redis storage.
function trimTmdbDetails(raw) {
  const usRelease = raw.release_dates?.results?.find((r) => r.iso_3166_1 === "US") || null;
  const usProviders = raw["watch/providers"]?.results?.US || null;

  return {
    id: raw.id,
    title: raw.title,
    name: raw.name,
    poster_path: raw.poster_path,
    overview: raw.overview,
    genres: raw.genres,
    status: raw.status,
    runtime: raw.runtime,
    episode_run_time: raw.episode_run_time,
    revenue: raw.revenue,
    budget: raw.budget,
    imdb_id: raw.imdb_id,
    release_date: raw.release_date,
    first_air_date: raw.first_air_date,
    last_air_date: raw.last_air_date,
    number_of_seasons: raw.number_of_seasons,
    last_episode_to_air: raw.last_episode_to_air,
    next_episode_to_air: raw.next_episode_to_air,
    external_ids: raw.external_ids ? { imdb_id: raw.external_ids.imdb_id } : undefined,
    release_dates: usRelease ? { results: [usRelease] } : null,
    "watch/providers": usProviders ? { results: { US: { flatrate: usProviders.flatrate } } } : null,
    credits: raw.credits ? { cast: trimCast(raw.credits.cast), crew: trimCrew(raw.credits.crew) } : undefined,
    aggregate_credits: raw.aggregate_credits ? { cast: trimCast(raw.aggregate_credits.cast) } : undefined,
    images: {
      backdrops: (raw.images?.backdrops || []).slice(0, 20).map((img) => ({ file_path: img.file_path })),
      posters: (raw.images?.posters || []).slice(0, 20).map((img) => ({ file_path: img.file_path })),
    },
    videos: {
      results: (raw.videos?.results || [])
        .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
        .map((v) => ({ site: v.site, type: v.type, official: v.official, key: v.key })),
    },
    recommendations: {
      results: (raw.recommendations?.results || []).slice(0, 15).map((r) => ({
        id: r.id,
        title: r.title,
        name: r.name,
        poster_path: r.poster_path,
        release_date: r.release_date,
        first_air_date: r.first_air_date,
        genre_ids: r.genre_ids,
      })),
    },
  };
}

async function getTmdbDetails(tmdbId, mediaType = "movie", { forceRefresh = false } = {}) {
  // v8: bumped to key by mediaType+tmdbId, not just tmdbId - movie IDs and TV
  // IDs are separate TMDb namespaces (e.g. movie 1398 is "Stalker", TV 1398
  // is "The Sopranos"), so the old tmdbId-only key let whichever media type
  // got cached first silently serve its data for the other's requests too.
  const cacheKey = `tmdb:details:v8:${mediaType}:${tmdbId}`;
  if (!forceRefresh) {
    const cached = await redis.safeGet(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  // release_dates is movie-only (TV uses content_ratings instead) - needed
  // for certification + accurate US theatrical release date/re-release detection.
  // aggregate_credits is TV-only - merges cast across every season/episode,
  // unlike the plain "credits" field which is just the current season.
  // external_ids is TV-only - movies already get imdb_id natively, but TV's
  // top-level details response never includes it.
  const appendToResponse =
    mediaType === "movie"
      ? "watch/providers,credits,release_dates,images,videos,recommendations"
      : "watch/providers,credits,aggregate_credits,external_ids,images,videos,recommendations";

  const response = await callTmdb(`/${mediaType}/${tmdbId}`, {
    append_to_response: appendToResponse,
    include_image_language: "en,null",
  });

  // Trimmed before returning too (not just before caching) so callers get
  // the same shape on a cache hit or a fresh fetch.
  const trimmed = response.data ? trimTmdbDetails(response.data) : null;
  if (trimmed) {
    await redis.safeSet(cacheKey, JSON.stringify(trimmed), "EX", DETAILS_CACHE_TTL);
  }

  return trimmed;
}

// Cache-aware wrapper for the calendar: same /movie|tv/:id details call as
// getTmdbDetails, but with a much shorter TTL since next_episode_to_air and
// release_date can change within days - short TTL keeps this fresh at least
// once per calendar day without needing day-boundary-aware invalidation.
// `forceRefresh` bypasses the cache read (used by the calendar's refresh
// button) but still writes the fresh result back to cache.
async function getTmdbDetailsForCalendar(tmdbId, mediaType, forceRefresh = false) {
  const cacheKey = `tmdb:calendar-details:${mediaType}:${tmdbId}`;

  if (!forceRefresh) {
    const cached = await redis.safeGet(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  // Movies need release_dates too: TMDb's top-level release_date is often an
  // earliest-worldwide/festival date, not the US theatrical date IMDb shows.
  const response = await callTmdb(
    `/${mediaType}/${tmdbId}`,
    mediaType === "movie" ? { append_to_response: "release_dates" } : undefined
  );

  if (response.data) {
    // +/-10% jitter so items cached around the same time (e.g. a user's whole
    // watchlist backfilled at once) don't all expire in the same instant and
    // stampede TMDb with a burst of simultaneous live calls on the next load.
    const jitter = CALENDAR_DETAILS_CACHE_TTL * (0.9 + Math.random() * 0.2);
    await redis.safeSet(cacheKey, JSON.stringify(response.data), "EX", Math.round(jitter));
  } else {
    // callTmdb never throws itself (it exhausts retries and resolves with
    // `{ data: null }`) - throw here instead of returning null so a genuine
    // fetch failure is distinguishable from "TMDb succeeded, item just has no
    // upcoming/past episode/release" up in getCalendar, which needs that
    // distinction to avoid caching an incomplete calendar for the day.
    throw new Error(`TMDb fetch failed for ${mediaType}/${tmdbId}`);
  }

  return response.data;
}

// Cache-aware wrapper: GET /search/multi?query=... - fetches 2 pages (up to
// 40 raw results, TMDb returns 20/page) in parallel and merges them, so the
// cinema search cap isn't stuck at a single page's worth of results. Both
// pages are fetched unconditionally - TMDb returns an empty `results` array
// (not an error) for a page past the end, so this is safe even for queries
// with under 20 total matches.
const SEARCH_PAGES = 2;
async function searchTmdb(query) {
  const cacheKey = `tmdb:search:${query}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const pages = await Promise.all(
    Array.from({ length: SEARCH_PAGES }, (_, i) => callTmdb("/search/multi", { query, page: i + 1 }))
  );

  const seen = new Set();
  const results = [];
  for (const response of pages) {
    for (const item of response.data?.results || []) {
      // Movie/TV ids share the same numeric namespace on TMDb, so a movie
      // and a show can have the same `id` - key on media_type too.
      const key = `${item.media_type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }

  const data = { results };
  await redis.safeSet(cacheKey, JSON.stringify(data), "EX", SEARCH_CACHE_TTL);

  return data;
}

// Cache-aware wrapper: GET /genre/movie|tv/list -> { [id]: name }. Fetched live
// (instead of hardcoded) so newly-added TMDb genres show up automatically.
async function getGenreMap(mediaType) {
  const cacheKey = `tmdb:genres:${mediaType}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/genre/${mediaType}/list`);
  const map = {};
  (response.data?.genres || []).forEach((g) => {
    map[g.id] = g.name;
  });

  await redis.safeSet(cacheKey, JSON.stringify(map), "EX", GENRE_CACHE_TTL);
  return map;
}

// Cache-aware wrapper: GET /person/:id - bio + combined credits (movies/TV,
// both as cast and crew) + external social/IMDb ids. Used by the cast list's
// tap-to-expand detail popup.
async function getTmdbPersonDetails(personId) {
  const cacheKey = `tmdb:person:${personId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/person/${personId}`, {
    append_to_response: "combined_credits,external_ids",
  });

  if (response.data) {
    await redis.safeSet(cacheKey, JSON.stringify(response.data), "EX", DETAILS_CACHE_TTL);
  }

  return response.data;
}

// Cache-aware wrapper: GET /person/popular - real, TMDb-wide (not scoped to
// any single movie/show) live popularity ranking. Fetches enough pages to
// have 50+ people after filtering to known_for_department === "Acting"
// (directors/crew aren't reliably represented in this endpoint).
const POPULAR_PEOPLE_CACHE_TTL = 43200; // 12h - popularity shifts day to day, not minute to minute
async function getTmdbPopularActors() {
  const cacheKey = "tmdb:popular-actors";
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const actors = [];
  for (let page = 1; page <= 5 && actors.length < 50; page++) {
    const response = await callTmdb("/person/popular", { page });
    const results = response.data?.results || [];
    if (!results.length) break;
    actors.push(...results.filter((p) => p.known_for_department === "Acting"));
  }

  await redis.safeSet(cacheKey, JSON.stringify(actors), "EX", POPULAR_PEOPLE_CACHE_TTL);
  return actors;
}

// Cache-aware wrapper: GET /person/:id/external_ids - just the lightweight
// social/wikidata IDs, without the heavy combined_credits payload
// getTmdbPersonDetails also fetches. Wikidata IDs essentially never change,
// so this gets a long TTL.
const EXTERNAL_IDS_CACHE_TTL = 2592000; // 30 days
async function getTmdbExternalIds(personId) {
  const cacheKey = `tmdb:person-external-ids:${personId}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/person/${personId}/external_ids`);
  if (response.data) {
    await redis.safeSet(cacheKey, JSON.stringify(response.data), "EX", EXTERNAL_IDS_CACHE_TTL);
  }

  return response.data;
}

// Cache-aware wrapper: GET /trending/movie|tv/week - TMDb's own pre-ranked
// trending list (unlike /search, no popularity/genre filtering needed on our
// end). Fetches 5 pages (100 raw results) as a buffer against cross-page
// duplicates (TMDb's live ranking can shift slightly between our page 1 and
// page 2 requests, causing the same title to appear on both), against
// obscure/low-vote noise that starts showing up past page ~2, and so a true
// top-50-by-popularity slice (see getCinemaTrending) still has 50+ candidates
// left after that noise filter. Dedupes by id.
const TRENDING_CACHE_TTL = 86400; // 24h - trending/week updates continuously server-side, not tied to a fixed weekly release cycle like Spotify
async function getTmdbTrending(mediaType) {
  const cacheKey = `tmdb:trending:${mediaType}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const seen = new Set();
  const results = [];
  for (let page = 1; page <= 5; page++) {
    const response = await callTmdb(`/trending/${mediaType}/week`, { page });
    const pageResults = response.data?.results || [];
    if (!pageResults.length) break;

    for (const item of pageResults) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      results.push(item);
    }
  }

  await redis.safeSet(cacheKey, JSON.stringify(results), "EX", TRENDING_CACHE_TTL);
  return results;
}

// Cache-aware wrapper: GET /tv/{id}/season/{n} - episode name/overview/air
// date/still image for one season. Neither IMDb dataset used by
// imdbEpisodeMap.js has this metadata (only tconst/season/episode numbers),
// so this is the only source for it. Trimmed to just the fields the
// Episodes tab actually renders before caching.
async function getTmdbSeasonDetails(tvId, seasonNumber) {
  // v3: added season-level posterPath - bumped so entries cached before that
  // are refetched instead of served without it until their old TTL expires.
  const cacheKey = `tmdb:season:v3:${tvId}:${seasonNumber}`;
  const cached = await redis.safeGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/tv/${tvId}/season/${seasonNumber}`);
  const raw = response.data;
  if (!raw) return null;

  const trimmed = {
    seasonNumber: raw.season_number,
    posterPath: raw.poster_path || null,
    episodes: (raw.episodes || []).map((e) => ({
      episodeNumber: e.episode_number,
      name: e.name,
      overview: e.overview,
      airDate: e.air_date,
      stillPath: e.still_path,
      runtime: e.runtime ?? null,
    })),
  };

  await redis.safeSet(cacheKey, JSON.stringify(trimmed), "EX", SEASON_CACHE_TTL);
  return trimmed;
}

module.exports = {
  callTmdb,
  getTmdbDetails,
  getTmdbDetailsForCalendar,
  searchTmdb,
  getGenreMap,
  getTmdbPersonDetails,
  getTmdbPopularActors,
  getTmdbExternalIds,
  getTmdbTrending,
  getTmdbSeasonDetails,
};
