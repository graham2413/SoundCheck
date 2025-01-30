const express = require("express");
const connectDB = require("./config/db"); // Import the MongoDB connection function
require("dotenv").config();
const cors = require("cors");
const passport = require("./config/passport");

// Import route files
const userRoutes = require("./routes/userRoutes");
const artistRoutes = require("./routes/artistRoutes");
const albumRoutes = require("./routes/albumRoutes");
const songRoutes = require("./routes/songRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json()); // Parses incoming JSON requests
app.use(cors()); // Enables communication between frontend and backend
app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth authentication


// Test Route
app.get("/", (req, res) => {
    res.send("✅ API is running...");
});

// Use API routes
app.use("/api/users", userRoutes);
app.use("/api/artists", artistRoutes);
app.use("/api/albums", albumRoutes);
app.use("/api/songs", songRoutes);
app.use("/api/reviews", reviewRoutes);

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
