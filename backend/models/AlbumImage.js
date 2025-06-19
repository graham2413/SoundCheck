const mongoose = require("mongoose");

const AlbumImageSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: String,
  artist: String,
  cover: String,
  releaseDate: Date,
  type: { type: String, enum: ['Album'], default: 'Album' },
  isExplicit: Boolean,
}, { timestamps: true });

module.exports = mongoose.model("AlbumImage", AlbumImageSchema);
