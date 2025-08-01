const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authenticateUser = require("../middleware/authMiddleware");

// Public - Get reviews for a song/ and get user review for the record also
router.get("/:id/reviews", authenticateUser, reviewController.getReviewsWithUserReview);

// Protected - Post a new review
router.post("/", authenticateUser, reviewController.createReview);

// Protected - Edit a review (Only the review owner)
router.patch("/:id", authenticateUser, reviewController.editReview);

// Protected - Delete a review (Only the review owner)
router.delete("/:id", authenticateUser, reviewController.deleteReview);

// Get all reviews from user's friends
router.get("/activityFeed", authenticateUser, reviewController.getActivityFeed);

// Get top 10 songs, albums, artists in DB
router.get("/top-albums", authenticateUser, reviewController.getTopAlbums);
router.get("/top-songs", authenticateUser, reviewController.getTopSongs);
router.get("/top-artists", authenticateUser, reviewController.getTopArtists);

// Method to  proxy images for getting dynamic image gradient for SPA (color thief needs CORS setup)
router.get("/image-proxy", reviewController.proxyImage);

// Toggle like on a review (Only the review owner)
router.post('/:id/toggle-like', authenticateUser, reviewController.toggleLikeHandler);

module.exports = router;
