const express = require("express");
const router = express.Router();
const songController = require("../controllers/songController");

// Song routes
router.get("/", songController.getAllSongs);
router.get("/:id", songController.getSongById);
router.post("/", songController.createSong);

module.exports = router;
