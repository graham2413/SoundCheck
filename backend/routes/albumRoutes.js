const express = require("express");
const router = express.Router();
const albumController = require("../controllers/albumController");

// Album routes
router.get("/", albumController.getAllAlbums);
router.get("/:id", albumController.getAlbumById);
router.post("/", albumController.createAlbum);

module.exports = router;
