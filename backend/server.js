const express = require("express");
const connectDB = require("./config/db");
require("dotenv").config();
require('ssl-root-cas').inject();
const cors = require("cors");
const session = require("express-session");
const passport = require("./config/passport");
const googleAuthRoutes = require('./auth/google');

// Import route files
const userRoutes = require("./routes/userRoutes");
const mainSearchRoutes = require("./routes/mainSearchRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const playlistRoutes = require("./routes/playlistRoutes");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json()); // Parses incoming JSON requests
app.use(cors()); // Enables communication between frontend and backend

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production" }
}));

app.use('/auth', googleAuthRoutes);

app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth authentication

// Test Route
app.get("/", (req, res) => {
    res.send("✅ API is running...");
});

// Use API routes
app.use("/api/users", userRoutes);
app.use("/api/search", mainSearchRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/playlists", playlistRoutes);

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
