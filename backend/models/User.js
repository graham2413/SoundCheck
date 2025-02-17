const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    profilePicture: { type: String, default: "" }, // Profile picture URL
    displayName: { type: String },

    // Friends & Friend Requests
    friends: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsReceived: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    friendRequestsSent: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },    

    // Spotify/ Spotify Authentication
    spotifyAccessToken: { type: String }, // Spotify token (expires periodically)
    spotifyRefreshToken: { type: String }, // Token to refresh Spotify access
    spotifyId: { type: String, unique: true, sparse: true }, // Spotify user ID

    createdAt: { type: Date, default: Date.now }
});

// Export User model
module.exports = mongoose.model("User", userSchema);
