const express = require("express");
const router = express.Router();
const mainSearchController = require("../controllers/mainSearchController");

// Song routes
router.get("/", mainSearchController.searchMusic);

module.exports = router;
