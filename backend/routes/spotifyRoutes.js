const express = require("express");
const router = express.Router();
const spotifyController = require("../controllers/spotifyController");
const authenticateUser = require("../middleware/authMiddleware");

// Get a user's Spotify playlists
router.get("/", authenticateUser, spotifyController.getUserPlaylists);

// Import selected playlists into the database
router.post("/import", authenticateUser, spotifyController.importPlaylists);

// Retrieve and set spotify new released albums in DB (Not calling this from front-end, just here for structure)
router.get("/popular-albums", spotifyController.setAlbumImages);

// Get stored popular album images
router.get("/stored-albums", spotifyController.getAlbumImages);

module.exports = router;
