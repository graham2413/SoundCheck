const mongoose = require("mongoose");

// Episode subdocument (used only when mediaType === "tv")
const episodeSchema = new mongoose.Schema({
  seasonNumber: { type: Number, required: true },
  episodeNumber: { type: Number, required: true },
  title: String,
  duration: Number, // runtime in seconds
  airDate: Date,
  isWatched: { type: Boolean, default: false },
}, { _id: false });

// Season subdocument (used only when mediaType === "tv")
const seasonSchema = new mongoose.Schema({
  seasonNumber: { type: Number, required: true },
  title: String,
  episodes: [episodeSchema],
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
  genres: [String],
  streamingPlatforms: [String],
  decimalRating: { type: Number, min: 0, max: 10 }, // e.g. 8.4
  reviewText: { type: String, default: "" },
  likes: { type: Number, default: 0, min: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  isWatchlist: { type: Boolean, default: false },
  isUnrefinedImport: { type: Boolean, default: false }, // true if imported without full metadata (e.g. Trakt/Nuvio)
  traktSynced: { type: Boolean, default: false },

  seasons: [seasonSchema], // only populated when mediaType === "tv"

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

// Completion % across all seasons/episodes (TV only)
cinemaItemSchema.methods.getCompletionPercentage = function () {
  if (!this.seasons || this.seasons.length === 0) return 0;

  let totalEpisodes = 0;
  let watchedEpisodes = 0;

  this.seasons.forEach((season) => {
    season.episodes.forEach((episode) => {
      totalEpisodes += 1;
      if (episode.isWatched) watchedEpisodes += 1;
    });
  });

  return totalEpisodes === 0 ? 0 : Math.round((watchedEpisodes / totalEpisodes) * 100);
};

cinemaItemSchema.virtual("completionPercentage").get(function () {
  return this.getCompletionPercentage();
});

cinemaItemSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("CinemaItem", cinemaItemSchema);
