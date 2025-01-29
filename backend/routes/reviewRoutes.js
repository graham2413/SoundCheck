const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");

// Review routes
router.get("/", reviewController.getAllReviews);
router.get("/:id", reviewController.getReviewById);
router.post("/", reviewController.createReview);

module.exports = router;
