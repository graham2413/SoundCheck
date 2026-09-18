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
  // Deezer's own classification ("album" | "single" | "ep" | "compile") -
  // absent on rows synced before this field existed; those show a generic
  // label client-side rather than a guessed/wrong one. See syncArtistAlbums.
  recordType: { type: String, default: null },
  // Set once notifyUsersForNewMusicRelease actually sends for this release -
  // lets the notification sweep (notificationJobs.js) tell "already notified"
  // apart from "not yet due", instead of the old exact-release-day-only gate
  // permanently losing a release that Deezer synced a day or two late.
  notifiedAt: { type: Date, default: null },
}, {
  timestamps: true
});

Release.index({ artistId: 1, releaseDate: -1 });
Release.index({ releaseDate: -1, _id: -1 }); // for pagination

module.exports = mongoose.model('Release', Release);
