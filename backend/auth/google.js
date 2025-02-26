const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { cloudinary } = require("../config/cloudinaryConfig");
const User = require('../models/User');

const router = express.Router();

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user exists by Google ID
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
            // Check if user exists by email (from normal signup)
            user = await User.findOne({ email: profile.emails[0].value });

            if (user) {
                // If found by email, link Google ID to existing user (prevents duplicate accounts for same email)
                user.googleId = profile.id;
            } else {
                // If no existing account, create new user
                user = new User({
                    googleId: profile.id,
                    username: profile.displayName,
                    email: profile.emails[0].value,
                    profilePicture: profile.photos[0].value
                });
                user.profilePicture = await updateUserProfilePicture(profile.photos[0].value);
            }

            await user.save();
        }

        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));


// Route to Start Google OAuth Login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback Route After Successful Login
router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
        .populate("friendRequestsSent", "username profilePicture")
        .populate("friendRequestsReceived", "username profilePicture")
        .populate("friends", "username profilePicture");

        const formattedUser = {
            _id: user._id,
            username: user.username || user.name, // Use Google name if no username
            email: user.email,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt,
            friendInfo: {
                friends: user.friends?.map(friend => ({
                    _id: friend._id,
                    username: friend.username,
                    profilePicture: friend.profilePicture
                })) || [],
                friendRequestsSent: user.friendRequestsSent?.map(request => ({
                    _id: request._id,
                    username: request.username,
                    profilePicture: request.profilePicture
                })) || [],
                friendRequestsReceived: user.friendRequestsReceived?.map(request => ({
                    _id: request._id,
                    username: request.username,
                    profilePicture: request.profilePicture
                })) || []
            }
        };
        
        // Generate JWT Token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Redirect with full user object
        res.redirect(`${process.env.FRONTEND_URL}/?token=${token}&user=${encodeURIComponent(JSON.stringify(formattedUser))}`);        
    } catch (error) {
        res.status(500).json({ message: 'Google login failed', error: error });
    }
});

// Issue was google image urls would expire, this solves the issue by creating the image in my cloudinary instead
async function updateUserProfilePicture(imageUrl) {
    try {
      const uploadedImage = await cloudinary.uploader.upload(imageUrl, {
        folder: "profile_pictures",
        transformation: [{ width: 300, height: 300, crop: "fill" }],
      });
      return uploadedImage.secure_url;
    } catch (error) {
      console.error("Error uploading image to Cloudinary:", error);
      // If the upload fails, return the original URL as a fallback
      return imageUrl;
    }
  }

module.exports = router;
