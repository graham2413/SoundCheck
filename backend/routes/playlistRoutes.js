const express = require("express");
const router = express.Router();
const playlistController = require("../controllers/playlistController");
const authenticateUser = require("../middleware/authMiddleware");

// Get a user's Spotify playlists
router.get("/", authenticateUser, playlistController.getUserPlaylists);

// Import selected playlists into the database
router.post("/import", authenticateUser, playlistController.importPlaylists);

module.exports = router;
