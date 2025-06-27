const https = require("https");
const fs = require("fs");
const fetch = require("node-fetch");

const dotenv = require("dotenv");
if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.development" });
} else {
  dotenv.config(); // defaults to .env (production)
}

const express = require("express");
const app = express();
app.use(express.json());
const connectDB = require("./config/db");
require("ssl-root-cas").inject();
const cors = require("cors");
const session = require("express-session");
const RedisStoreImport = require("connect-redis");
const RedisStore = RedisStoreImport.default;
const redisClient = require("./utils/redisClient");
const passport = require("./config/passport");
const googleAuthRoutes = require("./auth/google");
const cron = require("node-cron");
const spotifyController = require("./controllers/spotifyController");
const { cronSyncAllArtists } = require('./controllers/mainSearchController');

const userRoutes = require("./routes/userRoutes");
const mainSearchRoutes = require("./routes/mainSearchRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const spotifyRoutes = require("./routes/spotifyRoutes");

connectDB();

app.use(
  cors({
    origin: (origin, callback) => {
      const normalize = (str) =>
        str
          ?.trim()
          .replace(/\u200B/g, "")
          .replace(/\r?\n|\r/g, "");

      const allowedOrigins = [
        "http://localhost:4200",
        "https://soundcheck-frontend-bucket.s3-website-us-east-1.amazonaws.com",
        "https://di5r6h6unwhwg.cloudfront.net",
      ].map(normalize);

      const cleanedOrigin = normalize(origin);

      let isAllowed = false;

      for (const allowed of allowedOrigins) {
        const normalizedAllowed = normalize(allowed);
        const match =
          cleanedOrigin?.localeCompare(normalizedAllowed, undefined, {
            sensitivity: "base",
          }) === 0;

        if (match) {
          isAllowed = true;
          break;
        }
      }

      if (isAllowed || !cleanedOrigin) {
        callback(null, cleanedOrigin);
      } else {
        console.warn("❌ CORS BLOCKED:", cleanedOrigin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use("/auth", googleAuthRoutes);

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

// Set up HTTPS agent for production and development
const isProd = process.env.NODE_ENV === "production";
const agent = isProd
  ? new https.Agent()
  : new https.Agent({
    ca: fs.existsSync("cacert.pem") ? fs.readFileSync("cacert.pem") : undefined,
    });


// CRON JOBS

// Get new spotify releases every Friday at 12:00pm
cron.schedule("0 12 * * 5", async () => {

  await spotifyController.setAlbumImages();
});

// Keep-alive ping (every 14 minutes - prevents cold starts)
cron.schedule("*/14 * * * *", async () => {
  try {
    await fetch("https://soundcheck-backend-k7ec.onrender.com/", {
      agent,
    });
    console.log("Keep-alive ping sent");
  } catch (err) {
    console.error("Keep-alive failed:", err.message);
  }
});

// Sync all artists albums in DB daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('🔥 Starting daily artist album sync at 3 AM (local)');
  await cronSyncAllArtists();
}, {
  timezone: 'America/Chicago'
});

// Below runs the sync every minute for testing purposes
// cron.schedule('* * * * *', async () => {
//   console.log('⏱️ Running test sync: once every minute');
//   await cronSyncAllArtists();
// });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
