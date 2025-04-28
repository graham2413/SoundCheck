const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: { type: String, sparse: true }, // Display name, not unique
    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    profilePicture: { type: String, default: "" },
    googleId: {type: String, default: ""}, 

    // Friends & Friend Requests
    friends: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsReceived: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsSent: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },    

    // Spotify/ Spotify Authentication
    spotifyAccessToken: { type: String },
    spotifyRefreshToken: { type: String },
    spotifyId: { type: String, unique: true, sparse: true },

    // Reset Password properties
    resetPasswordToken: String,  
    resetPasswordExpires: Date,  

    // Profile background selection
    gradient: { type: Schema.Types.Mixed, default: {} },

    // Profile created date
    createdAt: { type: Date, default: Date.now },

    // List of songs, albums, artists
    list: {
      type: [
        {
          id: { type: String, required: true },
          type: { type: String, required: true }, // 'Album' | 'Song' | 'Artist'
          title: { type: String },
          name: { type: String },
          artist: { type: String },
          cover: { type: String },
          picture: { type: String },
          album: { type: String },
          genre: { type: String },
          preview: { type: String },         // Song field
          duration: { type: Number },         // Song field
          isExplicit: { type: Boolean },      // Song field
          releaseDate: { type: String },      // Album/Song field
          contributors: { type: [String] },   // Song field
          tracklist: { type: Array },          // Album/Artist field
          addedAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    },    
});

// Export User model
module.exports = mongoose.model("User", userSchema);
