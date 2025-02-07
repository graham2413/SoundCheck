const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authenticateUser = require("../middleware/authMiddleware");
const { upload } = require("../config/cloudinaryConfig");

// Get authenticated user's profile (Protected Route)
router.get("/profile", authenticateUser, userController.getAuthenticatedUserProfile);

// Get a specific user by ID (Public Route)
router.get("/:id", userController.getUserProfile);

// Allow users to update their own profile (Protected Route)
router.put("/profile", authenticateUser, upload.single("profilePicture"), userController.updateUserProfile);

module.exports = router;
