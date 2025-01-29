const express = require("express");
const router = express.Router();
const artistController = require("../controllers/artistController");

// Artist routes
router.get("/", artistController.getAllArtists);
router.get("/:id", artistController.getArtistById);
router.post("/", artistController.createArtist);

module.exports = router;
