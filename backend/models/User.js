const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed password for security
    profilePicture: { type: String, default: "" }, // Optional
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
