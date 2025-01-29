const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

// User routes
router.post("/register", userController.registerUser);
router.post("/login", userController.loginUser);
router.get("/:id", userController.getUserProfile);

module.exports = router;
