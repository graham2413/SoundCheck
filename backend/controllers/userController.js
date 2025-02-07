const User = require("../models/User");
const { cloudinary, upload } = require("../config/cloudinaryConfig");
const bcrypt = require("bcryptjs");

// Public - Get a specific user's profile by ID
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

// Protected - Get logged-in user's profile
exports.getAuthenticatedUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password"); // Exclude password
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
    } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Protected - Allow users to update their own profile
exports.updateUserProfile = async (req, res) => {
    try {
        
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: "Unauthorized. User not found in request." });
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
            const isSamePassword = await bcrypt.compare(req.body.newPassword, user.password);
            if (isSamePassword) {
                return res.status(400).json({ message: "New password must be different from the current password." });
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
