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

const userRoutes = require("./routes/userRoutes");
const mainSearchRoutes = require("./routes/mainSearchRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const spotifyRoutes = require("./routes/spotifyRoutes");

const app = express();
connectDB();
app.use(express.json());

app.use(cors({
  origin: (origin, callback) => {
    const normalize = str => str?.trim().replace(/\u200B/g, '').replace(/\r?\n|\r/g, '');

    const allowedOrigins = [
      "http://localhost:4200",
      "https://soundcheck-frontend-bucket.s3-website-us-east-1.amazonaws.com",
      "https://di5r6h6unhwwg.cloudfront.net"
    ].map(normalize);

    const cleanedOrigin = normalize(origin);
    console.log("🟡 Incoming origin:", `'${cleanedOrigin}'`);
    console.log("🔐 Allowed origins:", allowedOrigins);

    for (const allowed of allowedOrigins) {
      console.log(`🔍 Compare: '${cleanedOrigin}' === '${allowed}' →`, cleanedOrigin === allowed);
    }

    if (!cleanedOrigin || allowedOrigins.includes(cleanedOrigin)) {
      console.log("✅ CORS allowed:", cleanedOrigin);
      callback(null, cleanedOrigin);
    } else {
      console.warn("❌ CORS BLOCKED:", cleanedOrigin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use('/auth', googleAuthRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("✅ API is running...");
});

// API Routes
app.use("/api/users", userRoutes);
app.use("/api/search", mainSearchRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/spotify", spotifyRoutes);

// Background job
cron.schedule("0 12 * * 5", async () => {
  await spotifyController.setAlbumImages();
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
