// models/UpcomingRelease.js
//
// The "upcoming" counterpart to Release.js (which only ever holds PAST
// releases synced from Deezer's own catalog). Deezer rarely lists a real
// pre-release date, so upcoming rows come from Spotify pre-save pages and
// MusicBrainz community-logged announcements instead (see
// mainSearchController.js's syncUpcomingReleasesForArtist) - two sources
// with no shared exact id the way Release has Deezer's albumId, hence the
// fuzzy normalizedTitle-based dedupe key below instead of a hard-unique one.
const mongoose = require("mongoose");

const UpcomingRelease = new mongoose.Schema(
  {
    artistId: { type: String, required: true, index: true }, // Deezer artist id - same identity space as Release.artistId
    artistName: { type: String, required: true },
    title: { type: String, required: true },
    cover: { type: String, default: null },
    releaseDate: { type: Date, required: true, index: true },
    // Each source's own vocabulary ("album"/"single"/etc), lowercased at the
    // source for both providers (see callSpotify.js/callMusicBrainz.js) so
    // it matches Release.recordType's existing lowercase convention - same
    // "null falls back to a generic label client-side" contract otherwise.
    recordType: { type: String, default: null },
    // Dedupe key component - see syncUpcomingReleasesForArtist's
    // normalizeReleaseTitle usage. Combined with artistId+releaseDate below.
    normalizedTitle: { type: String, required: true },
    // Whichever source most recently wrote this row - not a "the source
    // that's authoritative" flag, just provenance for debugging/tracing.
    source: { type: String, enum: ["spotify", "musicbrainz"], required: true },
    sourceId: { type: String, required: true },
    // Only ever populated from MusicBrainz (see getReleaseGroupTracklist) -
    // Spotify's own API has no pre-release tracklist endpoint. Coverage
    // isn't guaranteed (depends on whether a label/editor entered the full
    // tracklist ahead of release) - [] when unavailable, same "degrade
    // quietly" contract as everything else in this pipeline. Replaced
    // wholesale by the real Deezer-sourced Release row's tracklist once the
    // album actually ships - never migrated in place.
    tracklist: {
      type: [
        {
          title: { type: String, required: true },
          artist: { type: String, default: null },
          durationMs: { type: Number, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// Dedupe/upsert key (see syncUpcomingReleasesForArtist) - not a `unique`
// index on purpose: a same-day/same-normalized-title collision from two
// unrelated releases should overwrite via upsert, not throw.
UpcomingRelease.index({ artistId: 1, releaseDate: 1, normalizedTitle: 1 });
// Calendar read path - getMusicCalendar's upcoming branch reads soonest-first.
UpcomingRelease.index({ releaseDate: 1, _id: 1 });

module.exports = mongoose.model("UpcomingRelease", UpcomingRelease);
