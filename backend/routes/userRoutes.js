const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authenticateUser = require("../middleware/authMiddleware");

// Get authenticated user's profile (Protected Route)
router.get("/profile", authenticateUser, userController.getAuthenticatedUserProfile);

// Get a specific user by ID (Public Route)
router.get("/:id", userController.getUserProfile);

module.exports = router;
