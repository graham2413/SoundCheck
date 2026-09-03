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
const getUsTheatricalReleaseDate = (movieDetails) => {
  const usDates = movieDetails?.release_dates?.results?.find((r) => r.iso_3166_1 === "US")?.release_dates;
  const theatrical = usDates?.find((d) => d.type === 3)?.release_date;
  // release_dates entries are full ISO datetimes ("...T00:00:00.000Z"), unlike
  // the plain "YYYY-MM-DD" from the generic release_date field - normalize to
  // date-only so both shapes match what the frontend countdown parser expects.
  return (theatrical || movieDetails?.release_date)?.slice(0, 10);
};


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

// GET /api/cinema/calendar (Protected)
// Upcoming: next episode to air for tracked TV shows (watchlisted OR already
// reviewed, so a show doesn't disappear once you've reviewed an earlier
// season), plus watchlisted movies with a future release date. Sorted
// soonest-first.
exports.getCalendar = async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const cacheKey = `calendar:${req.user._id}`;
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
    const now = new Date();

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
        const next = tvDetails[i]?.next_episode_to_air;
        if (!next?.air_date || new Date(next.air_date) < now) return null;
        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "tv",
          title: item.title,
          cover: item.cover,
          airDate: next.air_date,
          seasonNumber: next.season_number,
          episodeNumber: next.episode_number,
          episodeName: next.name,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const movieEntries = movieItems
      .map((item, i) => {
        const releaseDate = getUsTheatricalReleaseDate(movieDetails[i]);
        if (!releaseDate || new Date(releaseDate) < now) return null;
        return {
          _id: item._id,
          tmdbId: item.tmdbId,
          mediaType: "movie",
          title: item.title,
          cover: item.cover,
          airDate: releaseDate,
          isWatchlist: item.isWatchlist,
          decimalRating: item.decimalRating,
          reviewText: item.reviewText,
          isUnrefinedImport: item.isUnrefinedImport,
        };
      })
      .filter(Boolean);

    const calendar = [...tvEntries, ...movieEntries].sort(
      (a, b) => new Date(a.airDate) - new Date(b.airDate)
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

    const cacheKey = `imdb:stats:${imdbId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return res.status(200).json({ success: true, data: JSON.parse(cached) });
    }

    if (!process.env.OMDB_API_KEY) {
      return res.status(500).json({ success: false, message: "OMDb API key not configured" });
    }

    const response = await fetchWithRetry(() =>
      axios.get("https://www.omdbapi.com/", {
        params: { i: imdbId, apikey: process.env.OMDB_API_KEY },
        timeout: 7000,
      })
    );

    const omdbData = response.data;

    if (!omdbData || omdbData.Response === "False") {
      return res.status(404).json({ success: false, message: omdbData?.Error || "Title not found" });
    }

    const data = {
      imdbId,
      imdbRating: omdbData.imdbRating ?? null,
      voteCount: omdbData.imdbVotes ?? null,
    };

    await redis.set(cacheKey, JSON.stringify(data), "EX", IMDB_STATS_CACHE_TTL);

    res.status(200).json({ success: true, data });
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
      await item.save();
    } else {
      item = await CinemaItem.create({
        user: req.user._id,
        tmdbId,
        mediaType,
        title,
        cover,
        ...(releaseDate ? { releaseDate } : {}),
        isWatchlist: true,
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
    const { cursorDate, cursorId, limit = 30 } = req.query;
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
