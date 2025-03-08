const express = require("express");
const router = express.Router();
const { getTrackDetails, getAlbumDetails, searchMusic, getArtistTopTracks } = require("../controllers/mainSearchController");

// Main search route
router.get("/", searchMusic);

// Search Track route
router.get("/track/:trackId", getTrackDetails);

// Search Album route
router.get("/album/:albumId", getAlbumDetails);

// Search Artist Tracks route
router.get("/artistTracks/:artistId", getArtistTopTracks);

module.exports = router;
