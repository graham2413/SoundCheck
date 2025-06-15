const express = require("express");
const router = express.Router();
const { getTrackDetails, getAlbumDetails, searchMusic, getArtistTopTracks, getAndStoreArtistAlbums, getReleasesByArtistIds } = require("../controllers/mainSearchController");
const authenticateUser = require("../middleware/authMiddleware");

// Main search route
router.get("/", searchMusic);

// Search Track route
router.get("/track/:trackId", getTrackDetails);

// Search Album route
router.get("/album/:albumId", getAlbumDetails);

// Search Artist Tracks route
router.get("/artistTracks/:artistId", getArtistTopTracks);

// Sync artist albums (trigger album fetch + save)
router.post("/artist/:id/sync", authenticateUser, getAndStoreArtistAlbums);

// Search for releases by artist IDs
router.post("/artist/releases", getReleasesByArtistIds);

module.exports = router;
