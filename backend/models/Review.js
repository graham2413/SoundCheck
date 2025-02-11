const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Only logged-in users can review
    albumSongOrArtistId: { type: String, required: true }, // Can be linked to an album, artist, or song
    type: { type: String, enum: ["album", "song"], required: true }, // Defines if it's for an album or song
    rating: { type: Number, min: 0, max: 10, default: null },
    reviewText: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

// Add validation for reviews
reviewSchema.pre("validate", function (next) {
    // If reviewText is not empty, ensure a rating is provided
    if (this.reviewText.trim() !== "" && this.rating === null) {
        return next(new Error("A rating is required when submitting a text review."));
    }
    next();
});

module.exports = mongoose.model("Review", reviewSchema);
