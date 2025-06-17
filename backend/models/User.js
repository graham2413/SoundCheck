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
    } 
});

// Export User model
module.exports = mongoose.model("User", userSchema);
