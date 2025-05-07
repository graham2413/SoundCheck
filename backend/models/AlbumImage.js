const mongoose = require("mongoose");

const AlbumImageSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: String,
  artist: String,
  cover: String,
  releaseDate: Date,
  genre: String,
  type: { type: String, enum: ['Album'], default: 'Album' },
  isExplicit: Boolean,
  preview: String,
  tracklist: [
    {
      id: Number,
      title: String,
      duration: Number,
      preview: String,
      isExplicit: Boolean
    }
  ]

}, { timestamps: true });

module.exports = mongoose.model("AlbumImage", AlbumImageSchema);
