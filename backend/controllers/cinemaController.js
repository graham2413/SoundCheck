const axios = require("axios");
const redis = require("../utils/redisClient");
const { fetchWithRetry } = require("../utils/fetchWithRetry");
const { getTmdbDetails, searchTmdb } = require("../utils/callTmdb");

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
