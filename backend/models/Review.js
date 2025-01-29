const reviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rating: Number,
    reviewText: String,
    album: { type: mongoose.Schema.Types.ObjectId, ref: "Album", default: null },
    song: { type: mongoose.Schema.Types.ObjectId, ref: "Song", default: null }
});

module.exports = mongoose.model("Review", reviewSchema);