const express = require("express");
const router = express.Router();
const spotifyController = require("../controllers/spotifyController");
const authenticateUser = require("../middleware/authMiddleware");

// Get a user's Spotify playlists
router.get("/", authenticateUser, spotifyController.getUserPlaylists);

// Import selected playlists into the database
router.post("/import", authenticateUser, spotifyController.importPlaylists);

// Get stored popular album images
router.get("/stored-albums", spotifyController.getAlbumImages);

module.exports = router;
