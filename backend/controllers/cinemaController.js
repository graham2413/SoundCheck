const axios = require("axios");
const redis = require("../utils/redisClient");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { getTmdbDetails, searchTmdb } = require("../utils/callTmdb");
const { parseTraktExport } = require("../utils/parseTraktExport");
const { backfillCinemaCovers } = require("../scripts/backfillCinemaCovers");
const { getMediaCanonicalId } = require("../utils/canonical-id");
const CinemaItem = require("../models/CinemaItem");
const User = require("../models/User");

const IMDB_STATS_CACHE_TTL = 86400; // 24h

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

    item.decimalRating = decimalRating;
    item.isUnrefinedImport = false;
    if (reviewText !== undefined) item.reviewText = reviewText;
    item.createdAt = new Date(); // matches music's editReview() behavior
    await item.save();

    res.status(200).json({ success: true, data: item });
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

    const items = await CinemaItem.find({
      user: userId,
      isWatchlist: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Server Error" });
  }
};
