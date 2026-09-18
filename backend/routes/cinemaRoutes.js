const express = require("express");
const router = express.Router();
const multer = require("multer");
const authenticateUser = require("../middleware/authMiddleware");
const {
  getImdbStats,
  getCinemaSoundtrack,
  getEpisodeImdbRatings,
  getCinemaDetail,
  getCinemaPersonDetail,
  getPopularActors,
  importTraktExport,
  getWatchlist,
  getWatchlistFilterOptions,
  editCinemaItem,
  getCinemaReviews,
  searchCinema,
  getSearchEnrichment,
  getCinemaTrending,
  getCalendar,
  toggleWatchlist,
  markCinemaWatched,
  getCinemaItemStatus,
  getTvSeasonEpisodes,
  rateCinema,
  markEpisodeWatched,
  rateEpisode,
  getEpisodeReviews,
  getCinemaActivityFeed,
} = require("../controllers/cinemaController");

// Zip never touches disk/Cloudinary - parsed directly from the in-memory buffer
const traktUpload = multer({ storage: multer.memoryStorage() });

// Live IMDb community stats (cached in Redis, not persisted in Mongo)
router.get("/imdb-stats/:imdbId", getImdbStats);

// Officially-released soundtrack/score tracks, free via MusicBrainz - series-
// level only for TV (Protected). See utils/callMusicBrainz.js for details.
router.get("/soundtrack/:imdbId", authenticateUser, getCinemaSoundtrack);

// Per-episode IMDb ratings for one season of a TV show, by its IMDb ID
// (Protected) - see utils/episodeRatingLookup.js for the per-episode TMDb
// lookup architecture.
router.get("/tv/:parentTconst/season/:seasonNumber/episodes/imdb-ratings", authenticateUser, getEpisodeImdbRatings);

// Episode name/overview/air date/still image for one TV season, TMDb-sourced (Protected)
router.get("/tv/:tmdbId/season/:seasonNumber", authenticateUser, getTvSeasonEpisodes);

// Everyone's reviews (rating + text) for one specific episode (Protected)
router.get("/tv/:tmdbId/episode/:seasonNumber/:episodeNumber/reviews", authenticateUser, getEpisodeReviews);

// Consolidated payload for the cinema review detail page (Protected)
router.get("/detail/:mediaType/:tmdbId", authenticateUser, getCinemaDetail);

// Whether the current user already has this title tracked, keyed by tmdbId+mediaType (Protected)
router.get("/status/:mediaType/:tmdbId", authenticateUser, getCinemaItemStatus);

// Bio + filmography + social links for the cast detail popup (Protected)
router.get("/person/:personId", authenticateUser, getCinemaPersonDetail);

// Top 50 Actors ranking, TMDb-wide (Protected)
router.get("/popular-actors", authenticateUser, getPopularActors);

// Search movies/shows via TMDb (Protected)
router.get("/search", authenticateUser, searchCinema);

// Per-result "nice to have" extras (real TV year range, badge fields) for
// one search result at a time (Protected) - see getSearchEnrichment's own
// comment for why this is separate from /search itself.
router.get("/search-enrichment/:mediaType/:tmdbId", authenticateUser, getSearchEnrichment);

router.get("/trending", authenticateUser, getCinemaTrending);

// Distinct genres/providers available to filter this user's watchlist by (Protected)
router.get("/watchlist/:userId/filters", authenticateUser, getWatchlistFilterOptions);

// A user's watchlist - owner always allowed, others only if public (Protected)
router.get("/watchlist/:userId", authenticateUser, getWatchlist);

// Add/remove a movie or show from the current user's watchlist (Protected)
router.post("/watchlist/toggle", authenticateUser, toggleWatchlist);

// Mark a movie/show as watched WITHOUT a rating (Protected)
router.post("/mark-watched", authenticateUser, markCinemaWatched);

// Create/edit a rating+review for a whole movie/show (Protected)
router.post("/rate", authenticateUser, rateCinema);

// Toggle watched (no rating) for one specific episode (Protected)
router.post("/episode/mark-watched", authenticateUser, markEpisodeWatched);

// Create/edit a rating+review for one specific episode (Protected)
router.post("/episode/rate", authenticateUser, rateEpisode);

// Everyone's reviews (rating + text) for the same movie/show (Protected)
router.get("/reviews", authenticateUser, getCinemaReviews);

// Chronological feed of self + friends' cinema activity (Protected)
router.get("/activityFeed", authenticateUser, getCinemaActivityFeed);

// Upcoming episodes/releases for tracked shows/movies (Protected)
router.get("/calendar", authenticateUser, getCalendar);

// Import a Trakt data-export zip (ratings + watchlist) as CinemaItems (Protected)
router.post("/import-trakt", authenticateUser, traktUpload.single("file"), importTraktExport);

// Submit a precise decimal rating for an imported item (Protected, owner only)
router.patch("/:id/refine", authenticateUser, editCinemaItem);

module.exports = router;
