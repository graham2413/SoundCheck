const express = require("express");
const router = express.Router();
const { getTrackDetails, getAlbumDetails, searchMusic } = require("../controllers/mainSearchController");

// Main search route
router.get("/", searchMusic);

// Search Track route
router.get("/track/:trackId", getTrackDetails);

// Serach Album route
router.get("/album/:albumId", getAlbumDetails);

module.exports = router;
