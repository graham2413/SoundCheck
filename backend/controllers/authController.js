const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();

// REGISTER (Signup for non spotify registering users)
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error ", error: error });
  }
};

// LOGIN (JWT-based authentication)
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email })
      .populate({
        path: "friends",
        select: "username profilePicture"
      })
      .populate({
        path: "friendRequestsSent",
        select: "username profilePicture"
      })
      .populate({
        path: "friendRequestsReceived",
        select: "username profilePicture"
      });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt,
        friendInfo: {
          friends: user.friends.map(friend => ({
            _id: friend._id,
            username: friend.username,
            profilePicture: friend.profilePicture
          })),
          friendRequestsSent: user.friendRequestsSent.map(request => ({
            _id: request._id,
            username: request.username,
            profilePicture: request.profilePicture
          })),
          friendRequestsReceived: user.friendRequestsReceived.map(request => ({
            _id: request._id,
            username: request.username,
            profilePicture: request.profilePicture
          }))
        }
      }
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// LOGOUT (JWT - Client-side should remove token)
exports.logoutUser = (req, res) => {
  res.json({
    message: "Logged out successfully (JWT-based, client should remove token)",
  });
};

// LOGOUT (Spotify - Session-based logout)
exports.logoutSpotify = (req, res) => {
  req.logout(function (err) {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ message: "Error destroying session" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out from Spotify successfully" });
    });
  });
};

exports.spotifyCallback = async (req, res) => {
  try {
    if (!req.user) {
      console.error("Spotify authentication failed - No user found.");
      return res.status(401).json({ message: "Spotify authentication failed" });
    }

    // Find the user in MongoDB (by Spotify ID)
    let user = await User.findOne({ spotifyId: req.user.spotifyId });

    if (!user) {
      // If user does not exist, create a new one
      user = new User({
        spotifyId: req.user.spotifyId,
        username: req.user.displayName || "Spotify User",
        email: req.user.email || "",
        profilePicture: req.user.profilePicture || "",
        spotifyAccessToken: req.user.spotifyAccessToken,
        spotifyRefreshToken: req.user.spotifyRefreshToken,
      });

      await user.save();
    } else {
      // Update existing user's tokens
      user.spotifyAccessToken = req.user.spotifyAccessToken;
      user.spotifyRefreshToken = req.user.spotifyRefreshToken;
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Redirect user to frontend with token
    res.redirect(`http://localhost:4200/dashboard?token=${token}`);
  } catch (error) {
    console.error("Error in Spotify callback:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
