const express = require("express");
const router = express.Router();
const { getImdbStats, debugTmdbDetails, debugTmdbSearch } = require("../controllers/cinemaController");

// Live IMDb community stats (cached in Redis, not persisted in Mongo)
router.get("/imdb-stats/:imdbId", getImdbStats);

// TEMP DEBUG ONLY - remove once real Phase 2 TMDb routes exist
router.get("/debug/tmdb-details/:tmdbId", debugTmdbDetails);
router.get("/debug/tmdb-search", debugTmdbSearch);

module.exports = router;
