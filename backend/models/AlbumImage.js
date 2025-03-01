const mongoose = require("mongoose");

const AlbumImageSchema = new mongoose.Schema({
    spotifyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    artist: { type: String, required: true },
    imageUrl: { type: String, required: true },
    releaseDate: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model("AlbumImage", AlbumImageSchema);
