const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authenticateUser = require("../middleware/authMiddleware");

// Public - Get reviews for a song/album
router.get("/:id", reviewController.getReviewsByAlbumOrSong);

// Protected - Post a new review
router.post("/", authenticateUser, reviewController.createReview);

// Protected - Edit a review (Only the review owner)
router.put("/:id", authenticateUser, reviewController.editReview);

// Protected - Delete a review (Only the review owner)
router.delete("/:id", authenticateUser, reviewController.deleteReview);

module.exports = router;
