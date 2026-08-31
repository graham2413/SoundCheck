const express = require("express");
const router = express.Router();
const multer = require("multer");
const authenticateUser = require("../middleware/authMiddleware");
const {
  getImdbStats,
  debugTmdbDetails,
  debugTmdbSearch,
  importTraktExport,
  getWatchlist,
  editCinemaItem,
  getCinemaReviews,
  searchCinema,
} = require("../controllers/cinemaController");

// Zip never touches disk/Cloudinary - parsed directly from the in-memory buffer
const traktUpload = multer({ storage: multer.memoryStorage() });

// Live IMDb community stats (cached in Redis, not persisted in Mongo)
router.get("/imdb-stats/:imdbId", getImdbStats);

// Search movies/shows via TMDb (Protected)
router.get("/search", authenticateUser, searchCinema);

// A user's watchlist - owner always allowed, others only if public (Protected)
router.get("/watchlist/:userId", authenticateUser, getWatchlist);

// Everyone's reviews (rating + text) for the same movie/show (Protected)
router.get("/reviews", authenticateUser, getCinemaReviews);

// Import a Trakt data-export zip (ratings + watchlist) as CinemaItems (Protected)
router.post("/import-trakt", authenticateUser, traktUpload.single("file"), importTraktExport);

// Submit a precise decimal rating for an imported item (Protected, owner only)
router.patch("/:id/refine", authenticateUser, editCinemaItem);

// TEMP DEBUG ONLY - remove once real Phase 2 TMDb routes exist
router.get("/debug/tmdb-details/:tmdbId", debugTmdbDetails);
router.get("/debug/tmdb-search", debugTmdbSearch);

module.exports = router;
