const dotenv = require("dotenv");
if (process.env.NODE_ENV === "development") {
    dotenv.config({ path: ".env.development" });
  } else {
    dotenv.config(); // defaults to .env (production)
  }
  
const express = require("express");
const connectDB = require("./config/db");
require('ssl-root-cas').inject();
const cors = require("cors");
const session = require("express-session");
const passport = require("./config/passport");
const googleAuthRoutes = require('./auth/google');
const cron = require("node-cron");
const spotifyController = require("./controllers/spotifyController");

// Import route files
const userRoutes = require("./routes/userRoutes");
const mainSearchRoutes = require("./routes/mainSearchRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const spotifyRoutes = require("./routes/spotifyRoutes");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json()); // Parses incoming JSON requests

const allowedOrigins = [
  "http://localhost:4200",
  "http://soundcheck-frontend-bucket.s3-website-us-east-1.amazonaws.com"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    }
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
app.use("/api/spotify", spotifyRoutes);

// Run updatePopularAlbums every Friday at noon
cron.schedule("0 12 * * 5", async () => {
    await spotifyController.setAlbumImages();
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
