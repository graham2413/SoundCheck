const Review = require("../models/Review");

// Create a new review
exports.createReview = async (req, res) => {
    try {
        const { albumOrSongId, type, rating, reviewText } = req.body;

        if (!albumOrSongId || !type) {
            return res.status(400).json({ message: "Album or song ID and type are required." });
        }

        const newReview = new Review({
            user: req.user._id,
            albumOrSongId,
            type,
            rating,
            reviewText
        });

        await newReview.save();
        res.status(201).json({ message: "Review created successfully!", review: newReview });
    } catch (error) {
        res.status(400).json({ message: error.message || "Error creating review." });
    }
};

// Get all reviews for an album/song
exports.getReviewsByAlbumOrSong = async (req, res) => {
    try {
        const { id } = req.params;
        const reviews = await Review.find({ albumOrSongId: id }).populate("user", "username");

        // Only count non-null ratings
        const validRatings = reviews.filter(r => r.rating !== null).map(r => r.rating);
        const averageRating = validRatings.length > 0 
            ? (validRatings.reduce((sum, rating) => sum + rating, 0) / validRatings.length).toFixed(1)
            : null;

        res.json({
            averageRating,
            totalReviews: reviews.length,
            reviews
        });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// Edit a review (Only the review owner)
exports.editReview = async (req, res) => {
    try {
        const { rating, reviewText } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Ensure the user is the owner
        if (review.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Unauthorized to edit this review" });
        }

        // Update only provided fields
        if (rating !== undefined) review.rating = rating;
        if (reviewText !== undefined) review.reviewText = reviewText;

        await review.save();
        res.json({ message: "Review updated successfully", review });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// Delete a review (Only the review owner)
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ message: "Review not found" });
        }

        // Ensure the user is the owner
        if (review.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Unauthorized to delete this review" });
        }

        await review.deleteOne();
        res.json({ message: "Review deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};
