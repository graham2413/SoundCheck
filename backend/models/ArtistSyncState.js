// models/ArtistSyncState.js
//
// One doc per Deezer artist we've ever fully synced (see
// mainSearchController.js's cronSyncAllArtists). Lets the daily cron skip
// the expensive paginated album fetch + DB diff for an artist whose Deezer
// nb_album count hasn't moved since the last check - most followed artists
// release nothing on any given day, so this avoids re-fetching/re-diffing
// their whole recent catalog every single day for no reason.
const mongoose = require("mongoose");

const artistSyncStateSchema = new mongoose.Schema({
  artistId: { type: String, required: true, unique: true, index: true },
  // Deezer's own nb_album count as of the last full sync - compared against
  // on each daily cron pass to decide whether anything might have changed.
  albumCount: { type: Number, default: null },
  lastCheckedAt: { type: Date, default: null },
  lastFullSyncAt: { type: Date, default: null },
});

module.exports = mongoose.model("ArtistSyncState", artistSyncStateSchema);
