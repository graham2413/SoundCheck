const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: { type: String, sparse: true }, // Display name, not unique
    email: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    profilePicture: { type: String, default: "" },
    googleId: {type: String, default: ""}, 

    // Friends & Friend Requests
    friends: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsReceived: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsSent: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    // When each pending friendRequestsReceived entry was sent, keyed by sender user id
    friendRequestTimestamps: { type: Map, of: Date, default: {} },

    // Spotify/ Spotify Authentication
    spotifyAccessToken: { type: String },
    spotifyRefreshToken: { type: String },
    spotifyId: { type: String, unique: true, sparse: true },

    // Reset Password properties
    resetPasswordToken: String,  
    resetPasswordExpires: Date,  

    // Profile background selection
    gradient: { type: Schema.Types.Mixed, default: {} },

    // Cinema watchlist visibility (private by default)
    cinemaWatchlistIsPublic: { type: Boolean, default: false },

    // Recent search terms, capped at 8 per search type, most recent first
    recentSearches: {
      music: { type: [String], default: [] },
      cinema: { type: [String], default: [] },
    },

    notificationPreferences: {
      immediateMusic: { type: Boolean, default: true },
      immediateMovies: { type: Boolean, default: true },
      immediateTvEpisodes: { type: Boolean, default: true },
      immediateTvSeasons: { type: Boolean, default: true },
      weeklySummary: { type: Boolean, default: false },
      weeklySummaryDay: { type: Number, min: 0, max: 6, default: 1 },
      weeklySummaryHour: { type: Number, min: 0, max: 23, default: 9 },
      timezone: { type: String, default: "America/Chicago" },
    },

    // Profile created date
    createdAt: { type: Date, default: Date.now },

    // Timestamp of most recent successful login (any auth method)
    lastLoggedIn: { type: Date, default: null },

    // List of songs, albums, artists
    artistList: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          picture: { type: String },
          addedAt: { type: Date, default: Date.now },
          tracklist: { type: Array, default: [] },
          preview: { type: String, default: '' }
        }
      ],
      default: []
    },

    // Top 3 podium per category. Each category defaults to "auto" (no stored
    // items - computed live from the user's own ratings on read, see
    // computeAutoTopThree in userController.js) until manualOverride is set,
    // at which point `items` holds the user's own curated (ordered) picks
    // instead. isPublic gates the whole feature on other users' profiles,
    // same pattern as cinemaWatchlistIsPublic above.
    topThree: {
      isPublic: { type: Boolean, default: false },
      movies: {
        manualOverride: { type: Boolean, default: false },
        items: {
          type: [{ id: String, title: String, cover: String }],
          default: [],
        },
      },
      shows: {
        manualOverride: { type: Boolean, default: false },
        items: {
          type: [{ id: String, title: String, cover: String }],
          default: [],
        },
      },
      songs: {
        manualOverride: { type: Boolean, default: false },
        items: {
          type: [{ id: String, title: String, subtitle: String, cover: String }],
          default: [],
        },
      },
      albums: {
        manualOverride: { type: Boolean, default: false },
        items: {
          type: [{ id: String, title: String, subtitle: String, cover: String }],
          default: [],
        },
      },
      artists: {
        manualOverride: { type: Boolean, default: false },
        items: {
          type: [{ id: String, title: String, cover: String }],
          default: [],
        },
      },
    },
});

// Export User model
module.exports = mongoose.model("User", userSchema);
