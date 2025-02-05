const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const passport = require("passport");

// Authentication Routes
router.post("/register", authController.registerUser);
router.post("/login", authController.loginUser);
router.post("/logout", authController.logoutUser);
router.get("/spotify/logout", authController.logoutSpotify);

// Spotify Authentication Route
router.get("/spotify", (req, res, next) => {
    passport.authenticate("spotify", { scope: ["user-read-email", "playlist-read-private"] })(req, res, next);
});

// Spotify OAuth Callback Route
router.get("/spotify/callback", (req, res, next) => {
    next();
}, passport.authenticate("spotify", { failureRedirect: "/" }), authController.spotifyCallback);

module.exports = router;
