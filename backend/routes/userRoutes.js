const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const authenticateUser = require("../middleware/authMiddleware");
const { upload } = require("../config/cloudinaryConfig");
const notificationController = require("../controllers/notificationController");

// Get authenticated user's profile (Protected Route)
router.get("/profile", authenticateUser, userController.getAuthenticatedUserProfile);

// Get a specific user by ID (Public Route)
router.get("/profile/:id", userController.getUserProfile);

// Allow users to update their own profile (Protected Route)
router.put("/profile", authenticateUser, upload.single("profilePicture"), userController.updateUserProfile);

// Delete User Profile (Protected)
router.delete("/profile", authenticateUser, userController.deleteUserProfile);

// User list methods
router.post('/list', authenticateUser, userController.addToList);

router.post('/list/remove', authenticateUser, userController.removeFromArtistList);

// Recent search terms (persisted per-user, replaces localStorage)
router.post('/recent-searches', authenticateUser, userController.addRecentSearch);
router.post('/recent-searches/remove', authenticateUser, userController.removeRecentSearch);
router.post('/recent-searches/clear', authenticateUser, userController.clearRecentSearches);

// Top 3 podium
router.get('/top-three', authenticateUser, userController.getMyTopThree);
router.get('/top-three/:id', userController.getUserTopThree); // public, gated by topThree.isPublic
router.put('/top-three/visibility', authenticateUser, userController.setTopThreeVisibility);
router.put('/top-three/:category/auto', authenticateUser, userController.setTopThreeAuto);
router.put('/top-three/:category', authenticateUser, userController.setTopThreeCategory);

// Push subscriptions and notification to-do list
router.get("/notifications", authenticateUser, notificationController.getNotifications);
router.delete("/notifications", authenticateUser, notificationController.deleteAllNotifications);
router.delete("/notifications/:id", authenticateUser, notificationController.deleteNotification);
router.put("/notifications/subscription", authenticateUser, notificationController.savePushSubscription);
router.delete("/notifications/subscription", authenticateUser, notificationController.deletePushSubscription);
router.get("/notifications/preferences", authenticateUser, notificationController.getNotificationPreferences);
router.put("/notifications/preferences", authenticateUser, notificationController.updateNotificationPreferences);


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

// Suggested users for the Friends page (Protected)
router.get("/friends/suggested", authenticateUser, userController.getSuggestedUsers);

module.exports = router;