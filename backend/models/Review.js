const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    albumSongOrArtist: { // Store full album/song/artist details here
        id: { type: String, required: true }, // Deezer ID
        type: { type: String, enum: ["Album", "Song", "Artist"], required: true },
    title: String,
        name: String,
        cover: String,
        picture: String,
        isExplicit: Boolean, // Song
        artist: String, // Song and album
        album: String, // Song
        genre: String
    },
    rating: { type: Number, min: 0, max: 10, default: null },
    reviewText: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model("Review", reviewSchema);
