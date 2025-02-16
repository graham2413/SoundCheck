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

/*
FRIENDSHIP ROUTES
*/

// Send Friend Request (Protected)
router.post("/friends/send/:toUserId", authenticateUser, userController.sendFriendRequest);

// Accept Friend Request (Protected)
router.post("/friends/accept/:fromUserId", authenticateUser, userController.acceptFriendRequest);

// Decline Friend Request (Protected)
router.post("/friends/decline/:fromUserId", authenticateUser, userController.declineFriendRequest);

// Unfriend a User (Protected)
router.post("/friends/unfriend/:friendId", authenticateUser, userController.unfriendUser);

// Search for Users to Add (Protected)
router.get("/friends/search", authenticateUser, userController.searchUsers);

module.exports = router;