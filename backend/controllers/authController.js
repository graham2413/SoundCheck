const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const crypto = require("crypto");

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

exports.forgotPassword = async (req, res) => {
  try {
    const email = req.body.email;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with that email." });
    }
    
    if (!user.password) {
      return res.status(400).json({ message: "This account uses Google sign-in only." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const { error } = await resend.emails.send({
      from: "SoundCheck <onboarding@resend.dev>", // or use your own domain after verification
      to: user.email,
      subject: "Password Reset",
      text: `Hello ${user.username}, you requested a password reset. Click this link to reset your password: ${resetURL}`
    });

    if (error) {
      console.error("❌ Resend error:", error);
      return res.status(500).json({ message: "Email failed to send." });
    }

    return res.status(200).json({ message: "Password reset email sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Find the user by reset token and check token is not expired
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }
    

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: "New password cannot be the same as the current password." });
    }
    
    // Hash the new password before saving
    const saltRounds = 10;
    user.password = await bcrypt.hash(newPassword, saltRounds);
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save();
    
    return res.status(200).json({ message: "Password has been reset successfully." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Server error." });
  }
};