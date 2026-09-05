const mongoose = require("mongoose");

// Sparse - only one entry per episode the user has actually watched/rated/
// reviewed, not pre-populated from TMDb. No entry for an episode means "not
// watched". Used for TV shows only.
const episodeReviewSchema = new mongoose.Schema({
  seasonNumber: { type: Number, required: true },
  episodeNumber: { type: Number, required: true },
  isWatched: { type: Boolean, default: true },
  decimalRating: { type: Number, min: 0, max: 10 },
  reviewText: String,
  reviewedAt: Date,
}, { _id: false });

const cinemaItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  mediaType: { type: String, enum: ["movie", "tv"], required: true },
  canonicalId: { type: String, index: true }, // normalized "title-releaseYear" for dedup

  imdbId: { type: String, index: true }, // e.g. tt0111161
  tmdbId: String,
  title: { type: String, required: true },
  cover: String,
  duration: Number, // runtime in seconds (movie only)
  releaseDate: Date,
  releaseYearRange: String, // TV only, e.g. "2017-2025" or "2016-Present" (mirrors search's display format)
  hadTheatricalRelease: Boolean, // movie only - did it actually get a US theatrical run at all (see hasTheatricalRelease())
  digitalReleaseDate: Date, // movie only - earliest known US digital release date, see getUsDigitalRelease()
  genres: [String],
  streamingPlatforms: [String],
  decimalRating: { type: Number, min: 0, max: 10 }, // e.g. 8.4
  reviewText: { type: String, default: "" },
  likes: { type: Number, default: 0, min: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  isWatchlist: { type: Boolean, default: false },
  watchlistAddedAt: Date, // set whenever isWatchlist flips to true - decoupled from createdAt, which gets bumped on every rating edit
  isWatched: { type: Boolean, default: false }, // coarse "watched at least once" flag, used for filtering
  isUnrefinedImport: { type: Boolean, default: false }, // true if imported without full metadata (e.g. Trakt/Nuvio)
  traktSynced: { type: Boolean, default: false },

  episodeReviews: [episodeReviewSchema], // TV only, see schema comment above

  createdAt: { type: Date, default: Date.now },
});

cinemaItemSchema.index({ user: 1, canonicalId: 1 });
cinemaItemSchema.index({ user: 1, mediaType: 1 });
// Prevents duplicate documents from concurrent/double-submitted imports
// (findOneAndUpdate upsert alone doesn't guard against insert-vs-insert races
// without a unique index backing the match keys).
cinemaItemSchema.index(
  { user: 1, imdbId: 1 },
  { unique: true, partialFilterExpression: { imdbId: { $exists: true } } }
);

cinemaItemSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("CinemaItem", cinemaItemSchema);
