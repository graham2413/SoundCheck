// utils/callTmdb.js
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const redis = require("./redisClient");

const TMDB_BASE = "https://api.themoviedb.org/3";

const RATE_LIMIT_KEY = "tmdb-rate-limit";
const RATE_LIMIT_WINDOW_SECONDS = 1;
const RATE_LIMIT_MAX_REQUESTS = 40;
const QUEUE_DELAY_MS = 200;

const DETAILS_CACHE_TTL = 604800; // 7 days
const SEARCH_CACHE_TTL = 7200; // 2 hours
const GENRE_CACHE_TTL = 2592000; // 30 days
const CALENDAR_DETAILS_CACHE_TTL = 43200; // 12 hours - short enough to always refresh at least once per calendar day

// Caps simultaneous connections to stay under TMDb's ~20 concurrent connections/IP limit
const tmdbAgent = new https.Agent({ maxSockets: 20, keepAlive: true });

// Sliding window limiter (mirrors callDeezer.js) - delays instead of throwing 429
async function waitForRateLimitSlot() {
  const now = Date.now();

  while (true) {
    await redis.zremrangebyscore(RATE_LIMIT_KEY, "-inf", now - RATE_LIMIT_WINDOW_SECONDS * 1000);
    const requests = await redis.zcard(RATE_LIMIT_KEY);

    if (requests < RATE_LIMIT_MAX_REQUESTS) {
      const requestId = `${now}:${crypto.randomUUID()}`;
      await redis.multi()
        .zadd(RATE_LIMIT_KEY, now, requestId)
        .expire(RATE_LIMIT_KEY, RATE_LIMIT_WINDOW_SECONDS)
        .exec();
      return;
    }

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
async function getTmdbDetails(tmdbId, mediaType = "movie", { forceRefresh = false } = {}) {
  // v5: bumped so older cached blobs (from before images/videos were added
  // to append_to_response) get treated as a miss and re-fetched - otherwise
  // the trailer/gallery UI silently stays empty for any title already
  // cached under the old v4 key for its full 7-day TTL.
  const cacheKey = `tmdb:details:v5:${tmdbId}`;
  if (!forceRefresh) {
    const cached = await redis.get(cacheKey);
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
      ? "watch/providers,credits,release_dates,images,videos"
      : "watch/providers,credits,aggregate_credits,external_ids,images,videos";

  const response = await callTmdb(`/${mediaType}/${tmdbId}`, {
    append_to_response: appendToResponse,
    include_image_language: "en,null",
  });

  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", DETAILS_CACHE_TTL);
  }

  return response.data;
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
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  // Movies need release_dates too: TMDb's top-level release_date is often an
  // earliest-worldwide/festival date, not the US theatrical date IMDb shows.
  const response = await callTmdb(
    `/${mediaType}/${tmdbId}`,
    mediaType === "movie" ? { append_to_response: "release_dates" } : undefined
  );

  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", CALENDAR_DETAILS_CACHE_TTL);
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
  const cached = await redis.get(cacheKey);
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
  await redis.set(cacheKey, JSON.stringify(data), "EX", SEARCH_CACHE_TTL);

  return data;
}

// Cache-aware wrapper: GET /genre/movie|tv/list -> { [id]: name }. Fetched live
// (instead of hardcoded) so newly-added TMDb genres show up automatically.
async function getGenreMap(mediaType) {
  const cacheKey = `tmdb:genres:${mediaType}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/genre/${mediaType}/list`);
  const map = {};
  (response.data?.genres || []).forEach((g) => {
    map[g.id] = g.name;
  });

  await redis.set(cacheKey, JSON.stringify(map), "EX", GENRE_CACHE_TTL);
  return map;
}

// Cache-aware wrapper: GET /person/:id - bio + combined credits (movies/TV,
// both as cast and crew) + external social/IMDb ids. Used by the cast list's
// tap-to-expand detail popup.
async function getTmdbPersonDetails(personId) {
  const cacheKey = `tmdb:person:${personId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/person/${personId}`, {
    append_to_response: "combined_credits,external_ids",
  });

  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", DETAILS_CACHE_TTL);
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
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const actors = [];
  for (let page = 1; page <= 5 && actors.length < 50; page++) {
    const response = await callTmdb("/person/popular", { page });
    const results = response.data?.results || [];
    if (!results.length) break;
    actors.push(...results.filter((p) => p.known_for_department === "Acting"));
  }

  await redis.set(cacheKey, JSON.stringify(actors), "EX", POPULAR_PEOPLE_CACHE_TTL);
  return actors;
}

// Cache-aware wrapper: GET /person/:id/external_ids - just the lightweight
// social/wikidata IDs, without the heavy combined_credits payload
// getTmdbPersonDetails also fetches. Wikidata IDs essentially never change,
// so this gets a long TTL.
const EXTERNAL_IDS_CACHE_TTL = 2592000; // 30 days
async function getTmdbExternalIds(personId) {
  const cacheKey = `tmdb:person-external-ids:${personId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/person/${personId}/external_ids`);
  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", EXTERNAL_IDS_CACHE_TTL);
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
  const cached = await redis.get(cacheKey);
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

  await redis.set(cacheKey, JSON.stringify(results), "EX", TRENDING_CACHE_TTL);
  return results;
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
};
