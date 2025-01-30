const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true }, // Optional for Spotify users
    password: { type: String }, // Only required for regular users
    profilePicture: { type: String, default: "" }, // Profile picture URL
    spotifyId: { type: String, unique: true, sparse: true }, // Only for Spotify users
    displayName: { type: String }, // Can be used for both regular & Spotify users
    spotifyAccessToken: { type: String }, // Spotify token (expires periodically)
    spotifyRefreshToken: { type: String }, // Token to refresh Spotify access
    createdAt: { type: Date, default: Date.now }
});

// Export User model
module.exports = mongoose.model("User", userSchema);
