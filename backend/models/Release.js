// models/Release.ts
const mongoose = require("mongoose");

const Release = new mongoose.Schema({
  albumId: { type: String, required: true, index: true },
  artistId: { type: String, required: true, index: true },
  artistName: { type: String, required: true },
  title: { type: String, required: true },
  cover: { type: String, required: true },
  releaseDate: { type: Date, required: true, index: true },
  isExplicit: { type: Boolean, default: false },
}, {
  timestamps: true
});

Release.index({ artistId: 1, releaseDate: -1 });
Release.index({ releaseDate: -1, _id: -1 }); // for pagination

module.exports = mongoose.model('Release', Release);
