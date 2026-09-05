const axios = require("axios");
const redis = require("../utils/redisClient");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { getTmdbDetails, getTmdbDetailsForCalendar, searchTmdb, getGenreMap, getTmdbPersonDetails, getTmdbPopularActors } = require("../utils/callTmdb");
const { getPersonWikipediaPopularity } = require("../utils/wikipediaPopularity");
const { parseTraktExport } = require("../utils/parseTraktExport");
const { backfillCinemaCovers } = require("../scripts/backfillCinemaCovers");
const { getMediaCanonicalId } = require("../utils/canonical-id");
const CinemaItem = require("../models/CinemaItem");
const User = require("../models/User");

const IMDB_STATS_CACHE_TTL = 86400; // 24h
const CALENDAR_RESPONSE_CACHE_TTL = 86400; // 24h safety-net TTL - actual invalidation is calendar-day based, see getLocalDateString
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original"; // matches backfillCinemaCovers.js
const CALENDAR_CACHE_TIMEZONE = "America/Chicago"; // matches server.js cron timezone

// TMDb's top-level release_date is often an earliest-worldwide/festival date,
// not the US theatrical date shown on IMDb - prefer the US theatrical entry
// (type 3) from release_dates when available.
const RERELEASE_NOTE_PATTERN = /re-release|rerelease|restoration|anniversary/i;

const getUsTheatricalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  const theatrical = usDates?.find((d) => d.type === 3);
  // release_dates entries are full ISO datetimes ("...T00:00:00.000Z"), unlike
  // the plain "YYYY-MM-DD" from the generic release_date field - normalize to
  // date-only so both shapes match what the frontend countdown parser expects.
  const releaseDate = (theatrical?.release_date || movieDetails?.release_date)?.slice(0, 10);
  const isRerelease = RERELEASE_NOTE_PATTERN.test(theatrical?.note || "");
  return { releaseDate, isRerelease };
};
exports.getUsTheatricalRelease = getUsTheatricalRelease;

// The movie's actual original theatrical release date, ignoring any later
// re-release/reissue (e.g. a 25th-anniversary theatrical re-release) - the
// earliest US "Theatrical limited"/"Theatrical" (type 2/3) entry on record,
// since a reissue can only ever come after the original by definition. Used
// anywhere the title's canonical release year is shown (search, watchlist,
// detail page, sorting) - unlike getUsTheatricalRelease above, which is only
// for the calendar's "next theatrical event" (which legitimately wants to
// surface an upcoming re-release as its own event).
const getUsOriginalTheatricalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates || [];
  const earliestTheatrical = usDates
    .filter((d) => d.type === 2 || d.type === 3)
    .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""))[0];
  return (earliestTheatrical?.release_date || movieDetails?.release_date)?.slice(0, 10) || null;
};
exports.getUsOriginalTheatricalRelease = getUsOriginalTheatricalRelease;

// The most recent US theatrical re-release date on record, if any - any
// type 2/3 entry that's a different date than the original (rather than
// pattern-matching the note text, which isn't always populated) - drives a
// "Back in Theaters"/"Returning to Theaters" badge for movies like Wet Hot
// American Summer or Akira that get an anniversary reissue.
const getUsRerelease = (movieDetails, originalReleaseDate) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates || [];
  const rereleases = usDates
    .filter((d) => (d.type === 2 || d.type === 3) && d.release_date?.slice(0, 10) !== originalReleaseDate)
    .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
  return rereleases[0]?.release_date?.slice(0, 10) || null;
};
exports.getUsRerelease = getUsRerelease;

// Whether this movie actually had/has a theatrical run at all (TMDb release
// types: 1=Premiere, 2=Theatrical limited, 3=Theatrical, 4=Digital,
// 5=Physical, 6=TV). Needed because plenty of movies (streaming originals,
// VOD-only releases) never go to theaters - falling back to "no streaming
// platform yet = in theaters" would misclassify those as "In Theaters" when
// they simply haven't been picked up by a major platform we track yet.
const hasTheatricalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  return !!usDates?.some((d) => d.type === 2 || d.type === 3);
};
exports.hasTheatricalRelease = hasTheatricalRelease;

// Earliest US "Digital" release date TMDb has on record (type 4), if any -
// lets "in theaters" be dynamic per-movie instead of a fixed day-count guess:
// once this date exists and has passed, the movie has left its exclusive
// theatrical window even if our own streamingPlatforms field hasn't been
// refreshed to reflect it yet.
const getUsDigitalRelease = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  const digitalDates = usDates?.filter((d) => d.type === 4).map((d) => d.release_date?.slice(0, 10)).filter(Boolean);
  if (!digitalDates?.length) return null;
  return digitalDates.sort()[0];
};
exports.getUsDigitalRelease = getUsDigitalRelease;



// Today's date (YYYY-MM-DD) in a fixed local timezone, so "a new day" lines up
// with the user's expected midnight instead of the server's UTC midnight
const getLocalDateString = (timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

// GET /api/cinema/search?query=... (Protected)
// Searches movies/shows via TMDb's /search/multi, filtered down to just
// movie/tv results (no "person" entries) and mapped to a clean shape.
exports.searchCinema = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: "query is required" });
    }

    const [data, movieGenres, tvGenres] = await Promise.all([
      searchTmdb(query.trim()),
      getGenreMap("movie"),
      getGenreMap("tv"),
    ]);

    const results = (data?.results || [])
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => {
        const genreMap = r.media_type === "movie" ? movieGenres : tvGenres;
        return {
          tmdbId: r.id.toString(),
          mediaType: r.media_type,
          title: r.title || r.name,
          cover: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
          releaseDate: r.release_date || r.first_air_date || null,
          genres: (r.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
        };
      });

    // TV shows only get a start year from /search/multi (no last_air_date there) -
    // fetch full details (cached 7 days via getTmdbDetails) just for the TV
    // results so we can show a real "2008-2013"/"2008-Present" year range.
    const tvResults = results.filter((r) => r.mediaType === "tv");
    if (tvResults.length > 0) {
      const tvDetails = await Promise.all(
        tvResults.map((r) => getTmdbDetails(r.tmdbId, "tv").catch(() => null))
      );

      tvResults.forEach((r, i) => {
        const details = tvDetails[i];
        if (!details) return;

        const startYear = r.releaseDate ? new Date(r.releaseDate).getFullYear() : null;
        const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
        if (!startYear) return;

        const hasEnded = details.status === "Ended" || details.status === "Canceled";
        if (hasEnded) {
          r.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
        } else if (endYear && endYear !== startYear) {
          r.releaseYearRange = `${startYear}-Present`;
        }
        // Free - already have the full details object fetched above for the year range.
        if (details.number_of_seasons) {
          r.numberOfSeasons = details.number_of_seasons;
        }
        // Free too - drives the "New Episode"/"Airing Soon"/"New Season Soon" badge client-side.
        r.lastEpisodeAirDate = details.last_episode_to_air?.air_date || null;
        r.nextEpisodeAirDate = details.next_episode_to_air?.air_date || null;
        r.nextEpisodeNumber = details.next_episode_to_air?.episode_number ?? null;
      });
    }

    // Movies need their own details call (release_dates isn't in /search/multi)
    // to know about a later theatrical reissue - mirrors the TV block above so
    // watchlist and search show the exact same "Back in Theaters"/"Returning
    // to Theaters" badge, and also corrects the release year for the rare
    // title whose only US theatrical entry on record is itself a reissue.
    // Also drives the "In Theaters"/"New Release" badge (see movie-release-badge.ts).
    const movieResults = results.filter((r) => r.mediaType === "movie");
    if (movieResults.length > 0) {
      const movieDetailsList = await Promise.all(
        movieResults.map((r) => getTmdbDetails(r.tmdbId, "movie").catch(() => null))
      );

      movieResults.forEach((r, i) => {
        const details = movieDetailsList[i];
        if (!details) return;

        const originalReleaseDate = getUsOriginalTheatricalRelease(details);
        if (originalReleaseDate) {
          r.releaseDate = originalReleaseDate;
        }
        r.rereleaseDate = getUsRerelease(details, originalReleaseDate);
        r.hadTheatricalRelease = hasTheatricalRelease(details);
        r.digitalReleaseDate = getUsDigitalRelease(details);
        r.hasStreamingAvailability = !!buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate).length;
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/calendar?range=upcoming|past (Protected)
// Upcoming (default): next episode to air for tracked TV shows (watchlisted
// OR already reviewed, so a show doesn't disappear once you've reviewed an
// earlier season), plus watchlisted movies with a release date today or
// later. Sorted soonest-first.
// Past: the most recently aired episode for tracked TV shows, plus
// watchlisted movies already released. Sorted most-recent-first.
//
// Dates are compared as plain "YYYY-MM-DD" strings (not `new Date(...) < now`)
// on purpose - `new Date("2026-09-04")` parses as UTC midnight, which for any
// timezone behind UTC (e.g. America/Chicago) is already several hours in the
// past by the time it's actually today in that timezone, so a naive
// timestamp comparison incorrectly drops/moves items releasing "today".
exports.getCalendar = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const range = req.query.range === "past" ? "past" : "upcoming";
    const cacheKey = `calendar:${req.user._id}:${range}`;
    const todayStr = getLocalDateString(CALENDAR_CACHE_TIMEZONE);

    if (!forceRefresh) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // One fresh call per calendar day, not a rolling 24h window - stale
        // as soon as the date rolls over, even if it's only been a minute
        if (parsed.cachedDate === todayStr) {
          return res.status(200).json({ success: true, data: parsed.data });
        }
      }
    }

    const items = await CinemaItem.find({
      user: req.user._id,
      tmdbId: { $exists: true, $ne: null },
      $or: [{ isWatchlist: true }, { isWatched: true }],
    });

    const tvItems = items.filter((i) => i.mediaType === "tv");
    const movieItems = items.filter((i) => i.mediaType === "movie" && i.isWatchlist);

    // forceRefresh only bypasses the outer per-user calendar cache above (so
    // newly added/removed watchlist items show up immediately) - it does NOT
    // force every individual item to hit TMDb live. Each item's own TMDb
    // details already refresh themselves every 3 days on their own, and with
    // a large watchlist, forcing hundreds of live calls at once (rate-limited
    // to 40/sec, each with retry/backoff) is what was making refresh take ~20s.
    const [tvDetails, movieDetails] = await Promise.all([
      Promise.all(tvItems.map((i) => getTmdbDetailsForCalendar(i.tmdbId, "tv").catch(() => null))),
      Promise.all(movieItems.map((i) => getTmdbDetailsForCalendar(i.tmdbId, "movie").catch(() => null))),
    ]);

    const tvEntries = tvItems
      .map((item, i) => {
        const episode =
          range === "past" ? tvDetails[i]?.last_episode_to_air : tvDetails[i]?.next_episode_to_air;
        const airDate = episode?.air_date?.slice(0, 10);
        if (!airDate) return null;
        if (range === "upcoming" && airDate < todayStr) return null;
        if (range === "past" && airDate >= todayStr) return null;
        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "tv",
          title: item.title,
          cover: item.cover,
          airDate,
          seasonNumber: episode.season_number,
          episodeNumber: episode.episode_number,
          episodeName: episode.name,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const movieEntries = movieItems
      .map((item, i) => {
        const { releaseDate, isRerelease } = getUsTheatricalRelease(movieDetails[i]);
        if (!releaseDate) return null;
        if (range === "upcoming" && releaseDate < todayStr) return null;
        if (range === "past" && releaseDate >= todayStr) return null;
        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "movie",
          title: item.title,
          cover: item.cover,
          airDate: releaseDate,
          isRerelease,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const calendar = [...tvEntries, ...movieEntries].sort((a, b) =>
      range === "past" ? b.airDate.localeCompare(a.airDate) : a.airDate.localeCompare(b.airDate)
    );

    await redis.set(cacheKey, JSON.stringify({ cachedDate: todayStr, data: calendar }), "EX", CALENDAR_RESPONSE_CACHE_TTL);

    res.status(200).json({ success: true, data: calendar });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/imdb-stats/:imdbId
// Fetches live IMDb community rating/vote count via OMDb (no stale data stored in Mongo)
exports.getImdbStats = async (req, res) => {
  try {
    const { imdbId } = req.params;

    if (!imdbId || !/^tt\d+$/.test(imdbId)) {
      return res.status(400).json({ success: false, message: "Invalid imdbId" });
    }

    const data = await fetchOmdbData(imdbId);

    if (!data) {
      return res.status(404).json({ success: false, message: "Title not found" });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// Shared OMDb fetch (cached) used by both getImdbStats and getCinemaDetail -
// avoids double-hitting OMDb for the same imdbId across endpoints.
const fetchOmdbData = async (imdbId) => {
  const cacheKey = `imdb:stats:${imdbId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  if (!process.env.OMDB_API_KEY) {
    throw new Error("OMDb API key not configured");
  }

  const response = await fetchWithRetry(() =>
    axios.get("https://www.omdbapi.com/", {
      params: { i: imdbId, apikey: process.env.OMDB_API_KEY },
      timeout: 7000,
    })
  );

  const omdbData = response.data;
  if (!omdbData || omdbData.Response === "False") return null;

  const data = {
    imdbId,
    imdbRating: omdbData.imdbRating ?? null,
    voteCount: omdbData.imdbVotes ?? null,
    awardsRaw: omdbData.Awards && omdbData.Awards !== "N/A" ? omdbData.Awards : null,
    boxOfficeUs: omdbData.BoxOffice && omdbData.BoxOffice !== "N/A" ? omdbData.BoxOffice : null,
  };

  await redis.set(cacheKey, JSON.stringify(data), "EX", IMDB_STATS_CACHE_TTL);
  return data;
};

// Parses OMDb's free-text Awards sentence (e.g. "Won 2 Oscars. 163 wins & 165
// nominations total") down to a short pill-friendly summary like "2 Oscars ·
// 163 wins". No structured/category-level award data exists in any of our
// sources (OMDb/TMDb) - the raw sentence is kept alongside for a "show more" expand.
const parseAwardsSummary = (awardsRaw) => {
  if (!awardsRaw) return null;

  const oscarMatch = awardsRaw.match(/(Won|Nominated for)\s+(\d+)\s+Oscars?/i);
  const winsMatch = awardsRaw.match(/(\d+)\s+wins?/i);

  const parts = [];
  if (oscarMatch) {
    const count = oscarMatch[2];
    const verb = oscarMatch[1].toLowerCase() === "won" ? "Oscar" : "Oscar nom";
    parts.push(`${count} ${verb}${count === "1" ? "" : "s"}`);
  }
  if (winsMatch) {
    const count = winsMatch[1];
    parts.push(`${count} win${count === "1" ? "" : "s"}`);
  }

  return parts.length ? parts.join(" · ") : awardsRaw;
};

// Abbreviates a raw dollar amount (number or "$1,234,567" string) to e.g. "$1.0B"/"$535M"
const abbreviateMoney = (value) => {
  const amount = typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : value;
  if (!amount || Number.isNaN(amount)) return null;

  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(0)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(0)}K`;
  return `$${amount}`;
};

// Combines OMDb's US box office with TMDb's worldwide revenue into one label
const formatBoxOffice = (usBoxOffice, worldwideRevenue) => {
  const parts = [];
  const us = abbreviateMoney(usBoxOffice);
  const worldwide = abbreviateMoney(worldwideRevenue);
  if (us) parts.push(`${us} US`);
  if (worldwide) parts.push(`${worldwide} worldwide`);
  return parts.length ? parts.join(" · ") : null;
};

// Curated allow-list of major streaming providers - TMDb/JustWatch's raw list
// includes noisy add-on/channel entries (e.g. "HBO Max Amazon Channel", "TNT",
// "tru TV") that don't match the clean short list users expect to see.
const MAJOR_WATCH_PROVIDERS = new Set([
  "Netflix",
  "Max",
  "HBO Max",
  "Disney Plus",
  "Hulu",
  "Amazon Prime Video",
  "Prime Video",
  "Apple TV",
  "Apple TV Plus",
  "Paramount Plus",
  "Peacock",
  "YouTube",
  "Google Play Movies",
  "Vudu",
  "Fandango At Home",
  "fuboTV",
  "Starz",
  "Showtime",
  "AMC+",
  "Crunchyroll",
  "ESPN Plus",
  "Tubi",
  "Pluto TV",
  "MGM Plus",
  "Discovery Plus",
  "Discovery+",
  "BritBox",
  "Acorn TV",
  "Shudder",
  "MUBI",
  "Criterion Channel",
  "Philo",
  "The Roku Channel",
  "Sling TV Orange",
  "Sling TV Orange and Blue",
  "YouTube TV",
]);

// Strips "... Amazon Channel" / "... Roku Premium Channel" style suffixes TMDb
// uses for bundled add-on listings, so e.g. "HBO Max Amazon Channel" dedupes
// against a plain "HBO Max" entry instead of showing as a separate tile.
const CHANNEL_SUFFIX_RE = /\s+(Amazon Channel|Roku Premium Channel|Apple TV Channel|Channel)$/i;
const normalizeProviderName = (name) => name.replace(CHANNEL_SUFFIX_RE, "").trim();

// Tile renders at 76px but pull the max source resolution TMDb offers so
// logos stay crisp on any display density.
const TMDB_PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/original";

const buildWatchProviders = (flatrateProviders) => {
  if (!Array.isArray(flatrateProviders)) return [];

  const seen = new Map();
  for (const provider of flatrateProviders) {
    const rawName = provider.provider_name || "";
    const normalizedName = normalizeProviderName(rawName);
    if (!MAJOR_WATCH_PROVIDERS.has(normalizedName)) continue;

    // TMDb often lists both a clean canonical entry ("HBO Max") and a
    // bundled "channel" add-on entry ("HBO Max Amazon Channel") for the same
    // platform - the channel variant's logo is a composited "X on Y" badge,
    // not the plain brand mark, so always prefer the canonical one if seen.
    const isCanonical = !CHANNEL_SUFFIX_RE.test(rawName);
    const existing = seen.get(normalizedName);
    if (existing && (existing.isCanonical || !isCanonical)) continue;

    seen.set(normalizedName, {
      name: normalizedName,
      logoUrl: provider.logo_path ? `${TMDB_PROVIDER_LOGO_BASE}${provider.logo_path}` : null,
      isCanonical,
    });
  }

  return Array.from(seen.values()).map(({ name, logoUrl }) => ({ name, logoUrl }));
};
exports.buildWatchProviders = buildWatchProviders;

// GET /api/cinema/status/:mediaType/:tmdbId (Protected)
// Whether the current user already has this exact title tracked (watchlist/
// watched/rating), keyed only by tmdbId+mediaType - used when opening a
// detail modal from an untracked context (search results) that has no real
// CinemaItem _id yet, so the modal doesn't wrongly show "Add to Watchlist"
// for something already on the user's watchlist.
exports.getCinemaItemStatus = async (req, res) => {
  try {
    const { mediaType, tmdbId } = req.params;
    const item = await CinemaItem.findOne({ user: req.user._id, mediaType, tmdbId });
    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/detail/:mediaType/:tmdbId (Protected)
// Consolidated payload for the cinema review detail page: TMDb metadata +
// credits + watch providers, plus OMDb-derived IMDb rating/awards/box office.
exports.getCinemaDetail = async (req, res) => {
  try {
    const { mediaType, tmdbId } = req.params;
    if (mediaType !== "movie" && mediaType !== "tv") {
      return res.status(400).json({ success: false, message: "mediaType must be 'movie' or 'tv'" });
    }

    const details = await getTmdbDetails(tmdbId, mediaType);
    if (!details) {
      return res.status(404).json({ success: false, message: "Title not found" });
    }

    const director = details.credits?.crew?.find((c) => c.job === "Director")?.name || null;
    // Full cast list, no cap (the frontend's "View full cast" screen is a
    // plain scrollable list). Movies: TMDb's plain credits.cast is already
    // the full film cast, ordered by billing. TV: the plain "credits" field
    // only covers the CURRENT season, so aggregate_credits (merged across
    // every season/episode) is used instead - its cast entries nest
    // character(s) under "roles" rather than a flat "character" field.
    // order/popularity passed through as-is (real TMDb fields) so the
    // frontend can offer Credit Order/Popularity sort without extra calls.
    const cast =
      mediaType === "tv"
        ? (details.aggregate_credits?.cast || []).map((c) => ({
            personId: c.id,
            name: c.name,
            character: c.roles?.[0]?.character || "",
            profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            order: c.order,
            popularity: c.popularity,
          }))
        : (details.credits?.cast || []).map((c) => ({
            personId: c.id,
            name: c.name,
            character: c.character,
            profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
            order: c.order,
            popularity: c.popularity,
          }));

    // Detail page shows the title's canonical release date (not a later
    // reissue), so use the original-release helper here - isRerelease is
    // only meaningful for the calendar's "next theatrical event" concept.
    const releaseDate =
      mediaType === "movie" ? getUsOriginalTheatricalRelease(details) : details.first_air_date || null;

    // Movie only - a later theatrical reissue (e.g. an anniversary
    // re-release), if TMDb has one on record. Drives "Back in Theaters"/
    // "Returning to Theaters" client-side.
    const rereleaseDate = mediaType === "movie" ? getUsRerelease(details, releaseDate) : null;

    // Movie only - drives the "In Theaters"/"New Release" badge client-side
    // (see movie-release-badge.ts) alongside watchProviders below.
    const hadTheatricalReleaseValue = mediaType === "movie" ? hasTheatricalRelease(details) : false;
    const digitalReleaseDate = mediaType === "movie" ? getUsDigitalRelease(details) : null;


    // TV only - "2016-2025"/"2023-Present" style range shown instead of a
    // single year (mirrors the same logic already used for watchlist rows/
    // fetchCinemaMetadata, just inlined here since getCinemaDetail doesn't
    // go through that helper).
    let releaseYearRange = null;
    if (mediaType === "tv" && releaseDate) {
      const startYear = new Date(releaseDate).getFullYear();
      const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
      const hasEnded = details.status === "Ended" || details.status === "Canceled";
      if (hasEnded) {
        releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
      } else {
        releaseYearRange = endYear && endYear !== startYear ? `${startYear}-Present` : `${startYear}`;
      }
    }

    const certification =
      mediaType === "movie"
        ? details.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates?.find(
            (d) => d.type === 3
          )?.certification || null
        : null;

    // Movies have imdb_id natively; TV only exposes it via external_ids.
    const imdbId = details.imdb_id || details.external_ids?.imdb_id || null;

    let omdbData = null;
    if (imdbId) {
      omdbData = await fetchOmdbData(imdbId).catch(() => null);
    }

    const watchProviders = buildWatchProviders(
      details["watch/providers"]?.results?.US?.flatrate
    );

    res.status(200).json({
      success: true,
      data: {
        tmdbId,
        mediaType,
        imdbId,
        title: details.title || details.name,
        cover: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
        year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
        releaseYearRange,
        releaseDate,
        rereleaseDate,
        hadTheatricalRelease: hadTheatricalReleaseValue,
        digitalReleaseDate,
        // TMDb's production status ("In Production", "Post Production",
        // "Planned", "Released", "Ended", "Returning Series", etc) - shown
        // instead of a release date for titles that don't have one yet.
        status: details.status || null,
        // TV only - drives the "New Episode"/"Airing Soon"/"New Season Soon" badge.
        lastEpisodeAirDate: mediaType === "tv" ? details.last_episode_to_air?.air_date || null : null,
        nextEpisodeAirDate: mediaType === "tv" ? details.next_episode_to_air?.air_date || null : null,
        nextEpisodeNumber: mediaType === "tv" ? details.next_episode_to_air?.episode_number ?? null : null,
        runtimeMinutes: details.runtime || details.episode_run_time?.[0] || null,
        certification,
        genres: (details.genres || []).map((g) => g.name),
        description: details.overview || null,
        director,
        cast,
        awardsRaw: omdbData?.awardsRaw || null,
        awardsSummary: parseAwardsSummary(omdbData?.awardsRaw),
        boxOffice: formatBoxOffice(omdbData?.boxOfficeUs, details.revenue),
        imdbRating: omdbData?.imdbRating ? Number(omdbData.imdbRating) : null,
        imdbVoteCount: omdbData?.voteCount
          ? Number(omdbData.voteCount.replace(/,/g, ""))
          : null,
        watchProviders,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/person/:personId (Protected)
// Bio + filmography + social links for the cast list's tap-to-expand detail
// popup. Filmography is split into "acting" (combined_credits.cast) and
// "directed" (combined_credits.crew filtered to job === "Director") per
// user's choice - full lists, not capped, sorted newest-release-first.
exports.getCinemaPersonDetail = async (req, res) => {
  try {
    const { personId } = req.params;

    const details = await getTmdbPersonDetails(personId);
    if (!details) {
      return res.status(404).json({ success: false, message: "Person not found" });
    }

    const toCredit = (c) => ({
      tmdbId: String(c.id),
      mediaType: c.media_type,
      title: c.title || c.name,
      cover: c.poster_path ? `${TMDB_IMAGE_BASE}${c.poster_path}` : null,
      releaseDate: c.release_date || c.first_air_date || null,
    });

    // A person can appear more than once in combined_credits.cast for the
    // same title (e.g. multiple TV credit entries per season) - dedupe by
    // tmdbId+mediaType, keeping the first (TMDb's own array order).
    const dedupe = (credits) => {
      const seen = new Set();
      return credits.filter((c) => {
        const key = `${c.tmdbId}:${c.mediaType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const sortNewestFirst = (a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || "");

    const acting = dedupe(
      (details.combined_credits?.cast || []).filter((c) => c.poster_path).map(toCredit)
    ).sort(sortNewestFirst);

    const directed = dedupe(
      (details.combined_credits?.crew || [])
        .filter((c) => c.job === "Director" && c.poster_path)
        .map(toCredit)
    ).sort(sortNewestFirst);

    res.status(200).json({
      success: true,
      data: {
        name: details.name,
        profilePath: details.profile_path ? `https://image.tmdb.org/t/p/w185${details.profile_path}` : null,
        biography: details.biography || null,
        instagramUrl: details.external_ids?.instagram_id
          ? `https://instagram.com/${details.external_ids.instagram_id}`
          : null,
        twitterUrl: details.external_ids?.twitter_id
          ? `https://x.com/${details.external_ids.twitter_id}`
          : null,
        imdbUrl: details.external_ids?.imdb_id
          ? `https://www.imdb.com/name/${details.external_ids.imdb_id}`
          : null,
        acting,
        directed,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/popular-actors (Protected)
// Real, TMDb-wide "Top 50 Actors" ranking (not scoped to any single title) -
// opened by tapping a cast member's popularity number. Directors are
// deliberately not included here yet - TMDb's /person/popular endpoint isn't
// filterable by department and skews heavily toward actors, so a reliable
// "Top 50 Directors" list isn't available from this endpoint alone.
//
// Ranked by real Wikipedia monthly pageviews (not TMDb's raw `popularity`),
// which is a far more reliable "real world fame" signal - TMDb's own score
// can be skewed by a minor credit on an otherwise high-traffic show. This
// only re-ranks the candidates TMDb's /person/popular already surfaced; it
// can't surface someone who never made that seed list at all.
exports.getPopularActors = async (req, res) => {
  try {
    const actors = await getTmdbPopularActors();
    const candidates = actors.slice(0, 50);

    const enriched = await Promise.all(
      candidates.map(async (p) => {
        const { views, isFallback } = await getPersonWikipediaPopularity(p.id, p.popularity);
        return {
          personId: p.id,
          name: p.name,
          profilePath: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
          popularity: views,
          isEstimated: isFallback,
          knownForTitle: p.known_for?.[0]?.title || p.known_for?.[0]?.name || null,
        };
      })
    );

    enriched.sort((a, b) => b.popularity - a.popularity);

    res.status(200).json({ success: true, data: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// TEMP DEBUG ONLY - remove once real Phase 2 TMDb routes exist
// GET /api/cinema/debug/tmdb-details/:tmdbId?mediaType=movie
exports.debugTmdbDetails = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    const data = await getTmdbDetails(tmdbId, mediaType);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// TEMP DEBUG ONLY - remove once real Phase 2 TMDb routes exist
// GET /api/cinema/debug/tmdb-search?query=matrix
exports.debugTmdbSearch = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, message: "query is required" });
    }
    const data = await searchTmdb(query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/import-trakt (multipart/form-data, field name "file")
// Imports a Trakt data-export zip (ratings + watchlist only) as CinemaItems for the authenticated user.
exports.importTraktExport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Trakt export zip file is required" });
    }

    const rows = parseTraktExport(req.file.buffer);

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "No importable rows found in export" });
    }

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const seenKeys = new Set();

    for (const row of rows) {
      const canonicalId = getMediaCanonicalId(row.title, row.year);

      if (!canonicalId && !row.imdbId) {
        console.log(`Trakt import: skipped "${row.title}" - no title/year and no imdbId to identify it.`);
        skipped++;
        continue;
      }

      const dedupeKey = row.imdbId || canonicalId;
      if (seenKeys.has(dedupeKey)) {
        // Same title appears more than once in this export (e.g. duplicate
        // watchlist entry) - the item itself was already imported via the
        // first occurrence, so this isn't a failure, just a duplicate.
        console.log(`Trakt import: "${row.title}" (${row.year ?? "?"}) is a duplicate row in this export (key: ${dedupeKey}) - already imported via an earlier row.`);
        duplicates++;
        continue;
      }
      seenKeys.add(dedupeKey);

      const matchQuery = {
        user: req.user._id,
        ...(row.imdbId ? { imdbId: row.imdbId } : { canonicalId }),
      };

      const update = {
        user: req.user._id,
        mediaType: row.mediaType,
        title: row.title,
        ...(canonicalId ? { canonicalId } : {}),
        ...(row.imdbId ? { imdbId: row.imdbId } : {}),
        ...(row.tmdbId ? { tmdbId: row.tmdbId } : {}),
        ...(row.year ? { releaseDate: new Date(`${row.year}-01-01`) } : {}),
        ...(row.dateAdded ? { createdAt: row.dateAdded } : {}),
        isUnrefinedImport: true,
      };

      if (Number.isFinite(row.rating)) {
        update.decimalRating = Math.trunc(row.rating);
      } else {
        update.isWatchlist = true;
      }

      await CinemaItem.findOneAndUpdate(
        matchQuery,
        { $set: update },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      imported++;
    }

    console.log(`Trakt import: ${imported} item(s) imported, ${skipped} skipped, ${duplicates} duplicate(s) removed. Fetching cover art from TMDb...`);

    const { updated: coversUpdated, failed: coversFailed } = await backfillCinemaCovers({
      user: req.user._id,
    });

    console.log(`Trakt import: successfully updated cover art for ${coversUpdated} record(s) (${coversFailed} failed).`);

    res.status(200).json({
      success: true,
      data: { imported, skipped, duplicates, total: rows.length, coversUpdated },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// PATCH /api/cinema/:id/refine (Protected) - owner only
// Submits a precise decimal rating (and optionally review text) for an
// imported item, clearing isUnrefinedImport. Mirrors reviewController's
// editReview - the general "edit cinema item" endpoint.
exports.editCinemaItem = async (req, res) => {
  try {
    const { decimalRating, reviewText } = req.body;

    if (typeof decimalRating !== "number" || decimalRating < 0 || decimalRating > 10) {
      return res.status(400).json({ success: false, message: "decimalRating must be a number between 0 and 10" });
    }

    const item = await CinemaItem.findOne({ _id: req.params.id, user: req.user._id });

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    // Refining an unrated/imported item (first rating) keeps its original
    // createdAt so import history stays intact; only a later, regular edit
    // of an already-refined item bumps createdAt (matches music's editReview()).
    const isRefinement = item.isUnrefinedImport;

    item.decimalRating = decimalRating;
    item.isUnrefinedImport = false;
    item.isWatchlist = false; // rating it means it's watched, not still "to watch"
    item.isWatched = true;
    if (reviewText !== undefined) item.reviewText = reviewText;
    if (!isRefinement) item.createdAt = new Date();
    await item.save();

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/watchlist/toggle (Protected)
// Toggles watchlist status for a movie/show, creating the CinemaItem if it
// doesn't exist yet (e.g. adding straight from search, before any review).
// Removing from the watchlist deletes the item outright if it has never been
// rated - otherwise (already reviewed) it just clears the isWatchlist flag,
// since the user may still want the review tracked (e.g. planning a rewatch).

// Fetches genres/duration/streamingPlatforms/releaseDate/releaseYearRange/imdbId
// for a single tmdbId (one cached getTmdbDetails call) - mirrors
// backfillCinemaMetadata.js's logic so newly-added watchlist items aren't
// immediately stale while waiting on that script to run again. `forceRefresh`
// bypasses the TMDb cache (used by the daily cinema-metadata refresh cron).
const fetchCinemaMetadata = async (tmdbId, mediaType, { forceRefresh = false } = {}) => {
  const details = await getTmdbDetails(tmdbId, mediaType, { forceRefresh }).catch(() => null);
  if (!details) return {};

  const metadata = {};

  if (details.genres?.length) {
    metadata.genres = details.genres.map((g) => g.name);
  }

  if (mediaType === "movie" && details.runtime) {
    metadata.duration = details.runtime * 60;
  } else if (mediaType === "tv" && details.episode_run_time?.[0]) {
    metadata.duration = details.episode_run_time[0] * 60;
  }

  // Canonical release date (not a later reissue) - see getUsOriginalTheatricalRelease.
  const releaseDate =
    mediaType === "movie" ? getUsOriginalTheatricalRelease(details) : details.first_air_date;
  if (releaseDate) {
    metadata.releaseDate = releaseDate;
  }

  if (details.status) {
    metadata.status = details.status;
  }

  if (mediaType === "movie") {
    metadata.hadTheatricalRelease = hasTheatricalRelease(details);
    metadata.digitalReleaseDate = getUsDigitalRelease(details);
    // Free too - same details call already fetched above. Drives the
    // "Back in Theaters"/"Returning to Theaters" badge client-side.
    metadata.rereleaseDate = getUsRerelease(details, releaseDate);
  }

  if (mediaType === "tv") {
    const startYear = releaseDate ? new Date(releaseDate).getFullYear() : null;
    const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
    const hasEnded = details.status === "Ended" || details.status === "Canceled";

    if (startYear && hasEnded) {
      metadata.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
    } else if (startYear) {
      metadata.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-Present` : `${startYear}`;
    }

    if (details.number_of_seasons) {
      metadata.numberOfSeasons = details.number_of_seasons;
    }

    // Free too - same details call already fetched above. Drives the
    // "New Episode"/"Airing Soon"/"New Season Soon" badge client-side.
    metadata.lastEpisodeAirDate = details.last_episode_to_air?.air_date || null;
    metadata.nextEpisodeAirDate = details.next_episode_to_air?.air_date || null;
    metadata.nextEpisodeNumber = details.next_episode_to_air?.episode_number ?? null;
  }

  const providers = buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate);
  if (providers.length) {
    metadata.streamingPlatforms = providers.map((p) => p.name);
  }

  if (details.imdb_id || details.external_ids?.imdb_id) {
    metadata.imdbId = details.imdb_id || details.external_ids.imdb_id;
  }

  return metadata;
};

// Local day-of-week in a fixed timezone (matches CALENDAR_CACHE_TIMEZONE/cron
// timezone) - used to decide "is today the weekly full-recheck day".
const getLocalDayOfWeek = (timeZone) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
exports.getLocalDayOfWeek = getLocalDayOfWeek;

// Distinct (tmdbId, mediaType) pairs across ALL users' tracked items (still
// on a watchlist OR already watched) - fetched/refreshed once per unique
// title, not once per user, since many users can track the same movie/show.
// `fullRecheck` false (the daily default) narrows to "unsettled" titles only:
// movies with no streaming platform yet (or an unconfirmed/future digital
// release date), and TV shows still ongoing (no releaseYearRange yet, or one
// ending in "-Present") - settled titles (already streaming, ended shows)
// are skipped since they're unlikely to have changed.
const getTitlesToRefresh = async (fullRecheck) => {
  const match = {
    tmdbId: { $exists: true, $ne: null },
    $or: [{ isWatchlist: true }, { isWatched: true }],
  };

  if (!fullRecheck) {
    const today = new Date();
    match.$and = [
      {
        $or: [
          { mediaType: "movie", streamingPlatforms: { $exists: false } },
          { mediaType: "movie", streamingPlatforms: { $size: 0 } },
          { mediaType: "movie", digitalReleaseDate: { $exists: false } },
          { mediaType: "movie", digitalReleaseDate: null },
          { mediaType: "movie", digitalReleaseDate: { $gt: today } },
          { mediaType: "tv", releaseYearRange: { $exists: false } },
          { mediaType: "tv", releaseYearRange: { $regex: "Present$" } },
        ],
      },
    ];
  }

  const groups = await CinemaItem.aggregate([
    { $match: match },
    { $group: { _id: { tmdbId: "$tmdbId", mediaType: "$mediaType" } } },
  ]);

  return groups.map((g) => g._id);
};

// Daily cron entry point (see server.js) - refreshes genres/duration/
// streamingPlatforms/releaseDate/hadTheatricalRelease/digitalReleaseDate/
// releaseYearRange/imdbId for every user's tracked CinemaItems, deduped by
// title so a blockbuster tracked by many users only costs one TMDb call.
// `fullRecheck` true (weekly, e.g. Sundays) re-checks every tracked title
// instead of just the "unsettled" subset - a safety net against rare TMDb
// data corrections that a settled/ended title might otherwise never pick up.
async function cronRefreshCinemaMetadata({ fullRecheck = false, batchSize = 10, delayMs = 1000 } = {}) {
  const titles = await getTitlesToRefresh(fullRecheck);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async ({ tmdbId, mediaType }) => {
        const metadata = await fetchCinemaMetadata(tmdbId, mediaType, { forceRefresh: true });
        if (!Object.keys(metadata).length) return { status: "skipped" };
        await CinemaItem.updateMany({ tmdbId, mediaType }, { $set: metadata });
        return { status: "updated" };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.status === "updated") {
        updated++;
      } else if (result.status === "rejected") {
        failed++;
        console.error("Cinema metadata refresh failed for a title:", result.reason);
      }
    }

    console.log(
      `Cinema metadata refresh: batch ${i / batchSize + 1} of ${Math.ceil(titles.length / batchSize)}`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  console.log(
    `Cinema metadata refresh complete (${fullRecheck ? "full" : "unsettled-only"}). Titles checked: ${titles.length}, updated: ${updated}, failed: ${failed}`
  );

  return { titlesChecked: titles.length, updated, failed };
}
exports.cronRefreshCinemaMetadata = cronRefreshCinemaMetadata;

exports.toggleWatchlist = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, cover, releaseDate } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return res.status(400).json({ success: false, message: "tmdbId, mediaType, and title are required" });
    }

    let item = await CinemaItem.findOne({ user: req.user._id, tmdbId, mediaType });

    if (item && item.isWatchlist) {
      if (item.decimalRating == null) {
        await item.deleteOne();
        return res.status(200).json({ success: true, data: { isWatchlist: false, item: null } });
      }
      item.isWatchlist = false;
      await item.save();
      return res.status(200).json({ success: true, data: { isWatchlist: false, item } });
    }

    if (item) {
      item.isWatchlist = true;
      item.watchlistAddedAt = new Date();
      // Backfill metadata on re-add too, in case it was created before this capture existed
      if (!item.genres?.length) {
        Object.assign(item, await fetchCinemaMetadata(tmdbId, mediaType));
      }
      await item.save();
    } else {
      const metadata = await fetchCinemaMetadata(tmdbId, mediaType);
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        isWatchlist: true,
        watchlistAddedAt: new Date(),
        ...metadata,
        // Frontend-supplied releaseDate is a reasonable fallback if the TMDb
        // lookup above failed/returned nothing
        ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
      });
    }

    res.status(200).json({ success: true, data: { isWatchlist: true, item } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// POST /api/cinema/mark-watched (Protected)
// Toggles watched WITHOUT a rating (e.g. "I've seen this but don't want to
// rate it") - mirrors toggleWatchlist's create-if-missing/delete-if-nothing-
// left pattern. Unlike editCinemaItem (rating), this never touches decimalRating.
exports.markCinemaWatched = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, cover, releaseDate } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return res.status(400).json({ success: false, message: "tmdbId, mediaType, and title are required" });
    }

    let item = await CinemaItem.findOne({ user: req.user._id, tmdbId, mediaType });

    if (item && item.isWatched) {
      // Undo - nothing left tracking this item (no rating, not on
      // watchlist), so delete it entirely instead of leaving an empty record.
      if (item.decimalRating == null && !item.isWatchlist) {
        await item.deleteOne();
        return res.status(200).json({ success: true, data: null });
      }
      item.isWatched = false;
      await item.save();
      return res.status(200).json({ success: true, data: item });
    }

    if (item) {
      item.isWatched = true;
      item.isWatchlist = false;
      if (!item.genres?.length) {
        Object.assign(item, await fetchCinemaMetadata(tmdbId, mediaType));
      }
      await item.save();
    } else {
      const metadata = await fetchCinemaMetadata(tmdbId, mediaType);
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        isWatched: true,
        isWatchlist: false,
        ...metadata,
        ...(!metadata.releaseDate && releaseDate ? { releaseDate } : {}),
      });
    }

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/watchlist/:userId/filters (Protected)
// Distinct genres/providers actually present across everything this user is
// tracking (watchlist or watched) - powers the Genre/Availability dropdowns
// in the filter overlay so they only ever show options that could match something.
exports.getWatchlistFilterOptions = async (req, res) => {
  try {
    const { userId } = req.params;
    const isOwner = userId === req.user._id.toString();

    if (!isOwner) {
      const targetUser = await User.findById(userId).select("cinemaWatchlistIsPublic");
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!targetUser.cinemaWatchlistIsPublic) {
        return res.status(403).json({ success: false, message: "This watchlist is private" });
      }
    }

    const trackedFilter = { user: userId, $or: [{ isWatchlist: true }, { isWatched: true }] };
    const [genres, providers] = await Promise.all([
      CinemaItem.distinct("genres", trackedFilter),
      CinemaItem.distinct("streamingPlatforms", trackedFilter),
    ]);

    res.status(200).json({
      success: true,
      genres: genres.filter(Boolean).sort(),
      providers: providers.filter(Boolean).sort(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/watchlist/:userId (Protected)
// Owners can always view their own watchlist; viewing someone else's requires
// that user to have set cinemaWatchlistIsPublic (private by default).
exports.getWatchlist = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      cursorValue,
      cursorId,
      limit = 30,
      mediaType,
      search,
      status,
      releaseStatus,
      genre,
      provider,
      hasReleaseDate,
      hasRating,
      sortBy,
      sortOrder,
    } = req.query;
    const isOwner = userId === req.user._id.toString();

    if (!isOwner) {
      const targetUser = await User.findById(userId).select("cinemaWatchlistIsPublic");
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (!targetUser.cinemaWatchlistIsPublic) {
        return res.status(403).json({ success: false, message: "This watchlist is private" });
      }
    }

    // Default (no status filter) shows everything actively tracked - still
    // on the watchlist OR already watched (rating something flips isWatchlist
    // off, so without the isWatched half here, watched items would never
    // show up at all). "unwatched"/"watched" narrow to just one side.
    // mediaType is deliberately NOT pushed into `conditions` here - it's
    // combined in separately below, so `conditions` alone (everything else)
    // can be reused to compute the All/Movies/TV Shows tab counts without
    // one tab's count being restricted by another tab's own filter.
    const conditions = [];
    if (status === "unwatched") {
      conditions.push({ isWatchlist: true, isWatched: { $ne: true } });
    } else if (status === "watched") {
      conditions.push({ isWatched: true });
    } else {
      conditions.push({ $or: [{ isWatchlist: true }, { isWatched: true }] });
    }
    if (search?.trim()) {
      // Escape regex special characters so a title like "Se7en" or a stray
      // "(" in a search term doesn't throw/behave unexpectedly
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({ title: { $regex: escaped, $options: "i" } });
    }
    if (genre?.trim()) {
      conditions.push({ genres: genre.trim() });
    }
    if (provider?.trim()) {
      conditions.push({ streamingPlatforms: provider.trim() });
    }
    if (hasReleaseDate === "true") {
      conditions.push({ releaseDate: { $ne: null } });
    }
    if (hasRating === "true") {
      conditions.push({ decimalRating: { $ne: null } });
    }
    // Release status: "coming_soon" is releaseDate in the future for either
    // media type. For movies specifically, we distinguish "in_theaters" from
    // "available" using each movie's own TMDb digital-release record instead
    // of a fixed day-count guess: once digitalReleaseDate exists and has
    // passed, it's left its exclusive theatrical window (even if our own
    // streamingPlatforms field hasn't caught up to reflect that yet). TV
    // shows have no theatrical stage, so they're just "available" once aired.
    // Caveat: streamingPlatforms/digitalReleaseDate aren't refreshed on a
    // recurring schedule yet (only at add-time/backfill), so a movie can
    // still lag briefly after actually becoming available.
    if (["available", "in_theaters", "coming_soon"].includes(releaseStatus)) {
      const todayBoundary = new Date(`${getLocalDateString(CALENDAR_CACHE_TIMEZONE)}T00:00:00`);
      const hasStreamingPlatform = { streamingPlatforms: { $exists: true, $ne: [] } };
      const noStreamingPlatform = { $or: [{ streamingPlatforms: { $exists: false } }, { streamingPlatforms: { $size: 0 } }] };
      const isReleased = { releaseDate: { $ne: null, $lte: todayBoundary } };
      const digitalReleaseArrived = { digitalReleaseDate: { $ne: null, $lte: todayBoundary } };
      const digitalReleaseNotArrived = {
        $or: [{ digitalReleaseDate: { $exists: false } }, { digitalReleaseDate: null }, { digitalReleaseDate: { $gt: todayBoundary } }],
      };
      // Exclusive theatrical windows don't last forever - without this bound,
      // an old catalog title that never got streamingPlatforms/digitalReleaseDate
      // backfilled (missing data, not actually still in theaters) would be
      // misclassified as "in theaters" indefinitely.
      const IN_THEATERS_WINDOW_DAYS = 90;
      const inTheatersWindowStart = new Date(todayBoundary.getTime() - IN_THEATERS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const releasedWithinTheatersWindow = { releaseDate: { $ne: null, $lte: todayBoundary, $gte: inTheatersWindowStart } };
      const releasedBeforeTheatersWindow = { releaseDate: { $lt: inTheatersWindowStart } };

      if (releaseStatus === "coming_soon") {
        conditions.push({ releaseDate: { $gt: todayBoundary } });
      } else if (releaseStatus === "in_theaters") {
        // Only counts as "in theaters" if it actually had a US theatrical run
        // at all - otherwise a streaming-only/VOD-only movie that just hasn't
        // been picked up by a tracked platform yet would be misclassified.
        // noStreamingPlatform/digitalReleaseNotArrived both use "$or" - can't
        // spread both into one object (the second would silently clobber the
        // first's key), so combine them via an explicit "$and" instead.
        conditions.push({
          mediaType: "movie",
          hadTheatricalRelease: true,
          ...releasedWithinTheatersWindow,
          $and: [noStreamingPlatform, digitalReleaseNotArrived],
        });
      } else {
        conditions.push({
          $or: [
            { mediaType: "tv", ...isReleased },
            { mediaType: "movie", $or: [hasStreamingPlatform, digitalReleaseArrived] },
            // Fallback for the same aged-out-of-theaters gap above: past the
            // window with no streaming/digital data on record, assume it's
            // available by now rather than leaving it in neither bucket.
            { mediaType: "movie", hadTheatricalRelease: true, ...releasedBeforeTheatersWindow },
          ],
        });
      }
    }

    // TV only - mirrors the client's shared getTvEpisodeBadge windows: a
    // recently-aired episode (30 days), a soon-airing season premiere (45
    // days, episode 1), or a soon-airing regular next episode (7 days).
    if (releaseStatus === "new_episodes") {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysFromNow = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      conditions.push({
        mediaType: "tv",
        $or: [
          { lastEpisodeAirDate: { $gte: thirtyDaysAgo, $lte: now } },
          { nextEpisodeAirDate: { $gte: now, $lte: sevenDaysFromNow }, nextEpisodeNumber: { $ne: 1 } },
          { nextEpisodeAirDate: { $gte: now, $lte: fortyFiveDaysFromNow }, nextEpisodeNumber: 1 },
        ],
      });
    }

    // Movie only - mirrors the client's shared getMovieRereleaseBadge windows:
    // a theatrical reissue that's either recently happened or coming soon
    // (both ±45 days), e.g. an anniversary re-release like Akira or Wet Hot
    // American Summer.
    if (releaseStatus === "back_in_theaters") {
      const now = new Date();
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysFromNow = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
      conditions.push({
        mediaType: "movie",
        rereleaseDate: { $gte: fortyFiveDaysAgo, $lte: fortyFiveDaysFromNow },
      });
    }

    const mediaTypeCondition = mediaType === "movie" || mediaType === "tv" ? [{ mediaType }] : [];
    const baseQuery = { user: userId, $and: [...conditions, ...mediaTypeCondition] };
    const query = { ...baseQuery };

    // Sort field is selectable now (previously always createdAt) - cursor
    // pagination generalizes to whichever field is active. Known limitation:
    // items with no releaseDate (sorting by releaseDate) can make the cursor
    // comparison at that exact page boundary imprecise - acceptable given
    // how few items that affects in practice.
    const SORT_FIELDS = { dateAdded: "createdAt", releaseDate: "releaseDate", title: "title" };
    const sortField = SORT_FIELDS[sortBy] || "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    if (cursorValue && cursorId) {
      const parsedCursorValue = sortField === "title" ? cursorValue : new Date(cursorValue);
      const cmpOp = sortDirection === 1 ? "$gt" : "$lt";
      query.$or = [
        { [sortField]: { [cmpOp]: parsedCursorValue } },
        { [sortField]: parsedCursorValue, _id: { [cmpOp]: cursorId } },
      ];
    }

    // totalCount reflects the current filters (ignores the cursor) - what the
    // panel header shows. watchlistCount is ALWAYS the true "still on my
    // watchlist" count regardless of any filter - what the outer profile stat
    // badge shows, kept separate so broadening the default above doesn't
    // change what that stat means. movieCount/tvCount/allCount power the
    // All/Movies/TV Shows tabs - each computed against every OTHER active
    // filter but ignoring the mediaType filter itself, so switching tabs
    // shows what each tab WOULD contain, not a count already narrowed by
    // whichever tab happens to be selected right now.
    const [items, totalCount, watchlistCount, allCount, movieCount, tvCount] = await Promise.all([
      CinemaItem.find(query).sort({ [sortField]: sortDirection, _id: sortDirection }).limit(Number(limit)),
      CinemaItem.countDocuments(baseQuery),
      CinemaItem.countDocuments({ user: userId, isWatchlist: true }),
      CinemaItem.countDocuments({ user: userId, $and: conditions }),
      CinemaItem.countDocuments({ user: userId, $and: [...conditions, { mediaType: "movie" }] }),
      CinemaItem.countDocuments({ user: userId, $and: [...conditions, { mediaType: "tv" }] }),
    ]);

    const last = items[items.length - 1];
    const nextCursor = last
      ? {
          cursorValue:
            sortField === "title" ? last.title : last[sortField] ? last[sortField].toISOString() : "",
          cursorId: last._id,
        }
      : null;

    res.status(200).json({
      success: true,
      data: items,
      nextCursor,
      totalCount,
      watchlistCount,
      mediaTypeCounts: { all: allCount, movie: movieCount, tv: tvCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};

// GET /api/cinema/reviews (Protected)
// Everyone's rated CinemaItems for the same movie/show (mirrors music's
// getReviewsWithUserReview) - identifies "the same title" by imdbId first
// (most reliable), then tmdbId, then canonicalId (title+year, scoped to
// mediaType since canonicalId alone can't distinguish a movie from a show
// sharing the same title/year).
exports.getCinemaReviews = async (req, res) => {
  try {
    const { imdbId, tmdbId, canonicalId, mediaType } = req.query;
    const userId = req.user._id;

    let identityQuery;
    if (imdbId) {
      identityQuery = { imdbId };
    } else if (tmdbId) {
      identityQuery = { tmdbId, ...(mediaType ? { mediaType } : {}) };
    } else if (canonicalId) {
      identityQuery = { canonicalId, ...(mediaType ? { mediaType } : {}) };
    } else {
      return res.status(400).json({ success: false, message: "imdbId, tmdbId, or canonicalId is required." });
    }

    const reviews = await CinemaItem.find({
      ...identityQuery,
      decimalRating: { $ne: null },
    })
      .populate("user", "username profilePicture")
      .sort({ createdAt: -1 })
      .lean();

    const userReview =
      reviews.find((item) => item.user?._id?.toString() === userId.toString()) || null;
    res.status(200).json({ success: true, data: { reviews, userReview } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};
