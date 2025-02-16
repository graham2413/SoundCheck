const User = require("../models/User");
const { cloudinary, upload } = require("../config/cloudinaryConfig");
const bcrypt = require("bcryptjs");

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password"); // Exclude password
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getAuthenticatedUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password")
    .populate("friendRequestsSent", "username profilePicture")
    .populate("friendRequestsReceived", "username profilePicture")
    .populate("friends", "username profilePicture");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ message: "Unauthorized. User not found in request." });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Handle Profile Picture Upload (Using Multer)
    let profilePictureUrl = user.profilePicture;
    if (req.file) {
      const uploadedImage = await cloudinary.uploader.upload(req.file.path, {
        folder: "profile_pictures",
        transformation: [{ width: 300, height: 300, crop: "fill" }],
      });
      profilePictureUrl = uploadedImage.secure_url;
    }

    // Handle Password Update (If a new password is provided)
    if (req.body.newPassword && req.body.newPassword.trim() !== "") {
      const isSamePassword = await bcrypt.compare(
        req.body.newPassword,
        user.password
      );
      if (isSamePassword) {
        return res
          .status(400)
          .json({
            message:
              "New password must be different from the current password.",
          });
      }

      // Hash and save the new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.newPassword, salt);
    }

    // Update user fields
    user.username = req.body.username || user.username;
    user.profilePicture = profilePictureUrl;

    // Save updated user data
    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profilePicture: updatedUser.profilePicture,
      createdAt: updatedUser.createdAt,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.sendFriendRequest = async (req, res) => {
  const userId  = req.user._id; // Authenticated user (sender)
  const { toUserId } = req.params; // Target user (receiver)

  // Prevent sending a friend request to yourself
  if (userId === toUserId) {
    return res
      .status(400)
      .json({ message: "You can't send a request to yourself." });
  }

  try {
    const user = await User.findById(userId);
    const toUser = await User.findById(toUserId);

    if (!user || !toUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.friends.includes(toUserId)) {
      return res.status(400).json({ message: "You are already friends." });
    }

    if (user.friendRequestsSent.includes(toUserId)) {
      return res.status(400).json({ message: "Friend request already sent." });
    }

    // Add friend request to both users
    user.friendRequestsSent.push(toUserId);
    toUser.friendRequestsReceived.push(userId);

    await user.save();
    await toUser.save();

    res.json({ message: "Friend request sent successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error sending friend request.", error });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  const userId = req.user._id; // Authenticated user (receiver of the request)
  const { fromUserId } = req.params; // Sender of the friend request

  try {
    const user = await User.findById(userId);
    const fromUser = await User.findById(fromUserId);

    if (!user || !fromUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if a request actually exists
    if (!user.friendRequestsReceived.includes(fromUserId)) {
      return res.status(400).json({ message: "No friend request found." });
    }

    // Remove from friend requests
    user.friendRequestsReceived = user.friendRequestsReceived.filter(
      (id) => id.toString() !== fromUserId
    );
    fromUser.friendRequestsSent = fromUser.friendRequestsSent.filter(
      (id) => id.toString() !== userId
    );

    // Add to friends list
    user.friends.push(fromUserId);
    fromUser.friends.push(userId);

    await user.save();
    await fromUser.save();

    res.json({ message: "Friend request accepted." });
  } catch (error) {
    res.status(500).json({ message: "Error accepting friend request.", error });
  }
};

exports.declineFriendRequest = async (req, res) => {
  const { userId } = req.user; // Authenticated user (receiver of the request)
  const { fromUserId } = req.params; // Sender of the friend request

  try {
    const user = await User.findById(userId);
    const fromUser = await User.findById(fromUserId);

    if (!user || !fromUser) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if a request actually exists
    if (!user.friendRequestsReceived.includes(fromUserId)) {
      return res.status(400).json({ message: "No friend request found." });
    }

    // Remove from friend request lists
    user.friendRequestsReceived = user.friendRequestsReceived.filter(
      (id) => id.toString() !== fromUserId
    );
    fromUser.friendRequestsSent = fromUser.friendRequestsSent.filter(
      (id) => id.toString() !== userId
    );

    await user.save();
    await fromUser.save();

    res.json({ message: "Friend request declined." });
  } catch (error) {
    res.status(500).json({ message: "Error declining friend request.", error });
  }
};

exports.unfriendUser = async (req, res) => {
  const { userId } = req.user; // Authenticated user
  const { friendId } = req.params; // The friend being removed

  try {
    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check if they are actually friends
    if (!user.friends.includes(friendId)) {
      return res
        .status(400)
        .json({ message: "This user is not in your friends list." });
    }

    // Remove each other from the friends list
    user.friends = user.friends.filter((id) => id.toString() !== friendId);
    friend.friends = friend.friends.filter((id) => id.toString() !== userId);

    await user.save();
    await friend.save();

    res.json({ message: "User unfriended successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error unfriending user.", error });
  }
};
  
exports.searchUsers = async (req, res) => {
  try {
    const searchQuery = req.query.q;
    if (!searchQuery) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Search users by name (excluding the logged-in user)
    const users = await User.find({
      $or: [
        { username: { $regex: searchQuery, $options: "i" } }, // Case-insensitive search
      ],
      _id: { $ne: req.user.id } // Exclude the logged-in user
    }).select("username email profilePicture");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error searching for users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
