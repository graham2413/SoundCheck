const mongoose = require("mongoose");

// Local mirror of IMDb's official title.ratings.tsv.gz dataset (refreshed
// daily by scripts/imdbRatingsSync.js), so per-title rating/vote lookups are
// an instant local read instead of a live OMDb call - which (per direct
// verification against OMDb's live API, see /memories or session notes) can
// lag real IMDb numbers by an unpredictable, sometimes very large amount for
// newer/trending titles. Non-commercial use only, per IMDb's dataset terms.
const imdbRatingSchema = new mongoose.Schema(
  {
    _id: String, // tconst, e.g. "tt0111161"
    averageRating: Number,
    numVotes: Number,
  },
  { versionKey: false }
);

module.exports = mongoose.model("ImdbRating", imdbRatingSchema);
