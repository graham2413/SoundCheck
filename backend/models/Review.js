const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  albumSongOrArtist: {
    // Store full album/song/artist details here
    id: { type: String, required: true }, // Deezer ID
    canonicalId: { type: String, index: true }, // Single vs Song or Album vs Clean/Deluxe
    type: { type: String, enum: ["Album", "Song", "Artist"], required: true },
    wasOriginallyAlbumButTreatedAsSingle: { type: Boolean, default: false },
    title: String,
    name: String,
    cover: String,
    picture: String,
    isExplicit: Boolean, // Song
    artist: String, // Song and album
    album: String, // Song
    genre: String,
  },
  rating: { type: Number, min: 0, max: 10, default: null },
  reviewText: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  likes: { type: Number, default: 0, min: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model("Review", reviewSchema);
