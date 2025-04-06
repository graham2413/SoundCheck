const User = require("../models/User");
const { cloudinary } = require("../config/cloudinaryConfig");
const bcrypt = require("bcryptjs");
const Review = require("../models/Review");

exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password") // Exclude password
      .populate({
        path: "friends",
        select: "username profilePicture", // Get only essential friend info
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch user's reviews separately
    const reviews = await Review.find({ user: user._id })
      .select("reviewText rating type createdAt albumSongOrArtist")
      .sort({ createdAt: -1 }); // Sort reviews by newest first

    res.json({
      _id: user._id,
      username: user.username,
      profilePicture: user.profilePicture || "assets/user.png",
      friends: user.friends,
      reviews: reviews,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error });
  }
};

exports.getAuthenticatedUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("friendRequestsSent", "username profilePicture")
      .populate("friendRequestsReceived", "username profilePicture")
      .populate("friends", "username profilePicture");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const formattedUser = {
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      createdAt: user.createdAt,
      friendInfo: {
        friends: user.friends.map((friend) => ({
          _id: friend._id,
          username: friend.username,
          profilePicture: friend.profilePicture,
        })),
        friendRequestsSent: user.friendRequestsSent.map((request) => ({
          _id: request._id,
          username: request.username,
          profilePicture: request.profilePicture,
        })),
        friendRequestsReceived: user.friendRequestsReceived.map((request) => ({
          _id: request._id,
          username: request.username,
          profilePicture: request.profilePicture,
        })),
      },
    };

    res.json(formattedUser);
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
      if (user.password) {
        const isSamePassword = await bcrypt.compare(
          req.body.newPassword,
          user.password
        );
        if (isSamePassword) {
          return res.status(400).json({
            message:
              "New password must be different from the current password.",
          });
        }
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
  const userId = req.user._id; // Authenticated user (sender)
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

    if (user.friendRequestsReceived.includes(toUserId)) {
      return res
        .status(400)
        .json({ message: "This user has already sent you a request." });
    }

    if (toUser.friendRequestsSent.includes(userId)) {
      return res.status(400).json({
        message:
          "This user has already sent you a request. You can accept it instead.",
      });
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

    if (
      user.friends.includes(fromUserId) ||
      fromUser.friends.includes(userId)
    ) {
      return res.status(400).json({ message: "You are already friends." });
    }

    const requestReceived = user.friendRequestsReceived.includes(fromUserId);
    const requestSent = fromUser.friendRequestsSent.includes(userId);

    if (!requestReceived || !requestSent) {
      return res
        .status(400)
        .json({ message: "No valid friend request found." });
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
  const userId = req.user._id; // Receiver of the request (ObjectId)
  const { fromUserId } = req.params; // Sender of the friend request (string)

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

    if (
      user.friends.includes(fromUserId) ||
      fromUser.friends.includes(userId)
    ) {
      return res.status(400).json({ message: "You are already friends." });
    }

    // Remove from friend request lists
    user.friendRequestsReceived = user.friendRequestsReceived.filter(
      (id) => id.toString() !== fromUserId
    );

    fromUser.friendRequestsSent = fromUser.friendRequestsSent.filter(
      (id) => !id.equals(userId)
    );

    await user.save();
    await fromUser.save();

    res.json({ message: "Friend request declined." });
  } catch (error) {
    res.status(500).json({ message: "Error declining friend request.", error });
  }
};

exports.unfriendUser = async (req, res) => {
  const userId = req.user._id; // Receiver of the request (ObjectId)
  const { friendId } = req.params; // The friend being removed (string)

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
    friend.friends = friend.friends.filter((id) => !id.equals(userId));

    // Also clean up any residual friend requests (if any)
    user.friendRequestsReceived = user.friendRequestsReceived.filter(
      (id) => id.toString() !== friendId
    );
    user.friendRequestsSent = user.friendRequestsSent.filter(
      (id) => id.toString() !== friendId
    );

    friend.friendRequestsReceived = friend.friendRequestsReceived.filter(
      (id) => id.toString() !== userId
    );
    friend.friendRequestsSent = friend.friendRequestsSent.filter(
      (id) => id.toString() !== userId
    );

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
      _id: { $ne: req.user.id }, // Exclude the logged-in user
    }).select("username email profilePicture");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error searching for users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.deleteUserProfile = async (req, res) => {
  try {
    const userId = req.user._id; // Get authenticated user ID

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Remove the user from their friends' lists
    await User.updateMany({ friends: userId }, { $pull: { friends: userId } });

    // Remove user from friend requests
    await User.updateMany(
      { friendRequestsSent: userId },
      { $pull: { friendRequestsSent: userId } }
    );
    await User.updateMany(
      { friendRequestsReceived: userId },
      { $pull: { friendRequestsReceived: userId } }
    );

    // Delete user's reviews
    await Review.deleteMany({ user: userId });

    // Delete user from database
    await User.findByIdAndDelete(userId);

    res.json({ message: "Your profile has been deleted successfully." });
  } catch (error) {
    console.error("Error deleting profile:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
