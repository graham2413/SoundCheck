const axios = require("axios");
const redis = require("../utils/redisClient");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { getTmdbDetails, getTmdbDetailsForCalendar, searchTmdb, getGenreMap } = require("../utils/callTmdb");
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
      $or: [{ isWatchlist: true }, { decimalRating: { $ne: null } }],
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
  "fuboTV",
  "Starz",
  "Showtime",
  "AMC+",
  "Crunchyroll",
  "ESPN Plus",
]);

// Strips "... Amazon Channel" / "... Roku Premium Channel" style suffixes TMDb
// uses for bundled add-on listings, so e.g. "HBO Max Amazon Channel" dedupes
// against a plain "HBO Max" entry instead of showing as a separate tile.
const normalizeProviderName = (name) =>
  name.replace(/\s+(Amazon Channel|Roku Premium Channel|Apple TV Channel|Channel)$/i, "").trim();

const TMDB_PROVIDER_LOGO_BASE = "https://image.tmdb.org/t/p/w92";

const buildWatchProviders = (flatrateProviders) => {
  if (!Array.isArray(flatrateProviders)) return [];

  const seen = new Map();
  for (const provider of flatrateProviders) {
    const normalizedName = normalizeProviderName(provider.provider_name || "");
    if (!MAJOR_WATCH_PROVIDERS.has(normalizedName) || seen.has(normalizedName)) continue;

    seen.set(normalizedName, {
      name: normalizedName,
      logoUrl: provider.logo_path ? `${TMDB_PROVIDER_LOGO_BASE}${provider.logo_path}` : null,
    });
  }

  return Array.from(seen.values());
};
exports.buildWatchProviders = buildWatchProviders;

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
    const cast = (details.credits?.cast || []).slice(0, 10).map((c) => ({
      name: c.name,
      character: c.character,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

    const { releaseDate, isRerelease } =
      mediaType === "movie"
        ? getUsTheatricalRelease(details)
        : { releaseDate: details.first_air_date || null, isRerelease: false };

    const certification =
      mediaType === "movie"
        ? details.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates?.find(
            (d) => d.type === 3
          )?.certification || null
        : null;

    let omdbData = null;
    if (details.imdb_id) {
      omdbData = await fetchOmdbData(details.imdb_id).catch(() => null);
    }

    const watchProviders = buildWatchProviders(
      details["watch/providers"]?.results?.US?.flatrate
    );

    res.status(200).json({
      success: true,
      data: {
        tmdbId,
        mediaType,
        imdbId: details.imdb_id || null,
        title: details.title || details.name,
        cover: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
        year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
        releaseDate,
        isRerelease,
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
// immediately stale while waiting on that script to run again.
const fetchCinemaMetadata = async (tmdbId, mediaType) => {
  const details = await getTmdbDetails(tmdbId, mediaType).catch(() => null);
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

  const releaseDate =
    mediaType === "movie" ? getUsTheatricalRelease(details).releaseDate : details.first_air_date;
  if (releaseDate) {
    metadata.releaseDate = releaseDate;
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
  }

  const providers = buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate);
  if (providers.length) {
    metadata.streamingPlatforms = providers.map((p) => p.name);
  }

  if (details.imdb_id) {
    metadata.imdbId = details.imdb_id;
  }

  return metadata;
};

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

// GET /api/cinema/watchlist/:userId (Protected)
// Owners can always view their own watchlist; viewing someone else's requires
// that user to have set cinemaWatchlistIsPublic (private by default).
exports.getWatchlist = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursorDate, cursorId, limit = 30, mediaType } = req.query;
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

    const baseQuery = { user: userId, isWatchlist: true };
    if (mediaType === "movie" || mediaType === "tv") {
      baseQuery.mediaType = mediaType;
    }
    const query = { ...baseQuery };

    // Apply cursor logic if present - same pattern as getActivityFeed
    if (cursorDate && cursorId) {
      query.$or = [
        { createdAt: { $lt: new Date(cursorDate) } },
        { createdAt: new Date(cursorDate), _id: { $lt: cursorId } },
      ];
    }

    // totalCount reflects the full watchlist (ignores the cursor), so the
    // profile stat badge/panel header can show the real total, not just
    // however many items happen to be loaded on the current page
    const [items, totalCount] = await Promise.all([
      CinemaItem.find(query).sort({ createdAt: -1, _id: -1 }).limit(Number(limit)),
      CinemaItem.countDocuments(baseQuery),
    ]);

    const last = items[items.length - 1];
    const nextCursor = last
      ? { cursorDate: last.createdAt.toISOString(), cursorId: last._id }
      : null;

    res.status(200).json({ success: true, data: items, nextCursor, totalCount });
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
