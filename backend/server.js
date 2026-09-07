const dotenv = require("dotenv");
if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.development" });
} else {
  dotenv.config(); // defaults to .env (production)
}

const express = require("express");
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.sendStatus(200));

// TMDb requires the v4 "Read Access Token" (a long JWT, starts with "eyJ") sent
// as a Bearer header - the shorter v3 "API Key" will silently 401 every request.
if (!process.env.TMDB_API_KEY) {
  console.warn("⚠️  TMDB_API_KEY is not set - cinema cover art/details will fail with 401.");
} else if (!process.env.TMDB_API_KEY.startsWith("eyJ")) {
  console.warn("⚠️  TMDB_API_KEY doesn't look like a TMDb v4 Read Access Token (should start with 'eyJ') - double-check it's not the v3 API key.");
}

const connectDB = require("./config/db");
require("ssl-root-cas").inject();
const cors = require("cors");
const session = require("express-session");
const RedisStore = require("connect-redis")(session);
const redisClient = require("./utils/redisClient");
const passport = require("./config/passport");
const googleAuthRoutes = require("./auth/google");
const cron = require("node-cron");
const spotifyController = require("./controllers/spotifyController");
const { cronSyncAllArtists } = require('./controllers/mainSearchController');
const { syncImdbRatings, logLastSyncedAt } = require('./utils/imdbRatingsSync');
const { prewarmTrackedShowEpisodeMaps } = require('./utils/imdbEpisodeMap');
const { cronRefreshCinemaMetadata, getLocalDayOfWeek } = require('./controllers/cinemaController');

const userRoutes = require("./routes/userRoutes");
const mainSearchRoutes = require("./routes/mainSearchRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const spotifyRoutes = require("./routes/spotifyRoutes");
const cinemaRoutes = require("./routes/cinemaRoutes");

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
    // No insecure fallback - a missing env var should fail loudly at
    // startup, not silently sign sessions with a known, publicly-documented
    // default secret.
    secret: (() => {
      if (!process.env.SESSION_SECRET) {
        throw new Error("SESSION_SECRET environment variable is required but not set.");
      }
      return process.env.SESSION_SECRET;
    })(),
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
app.use("/api/cinema", cinemaRoutes);

// CRON JOBS

// Get new spotify releases every Friday at 6:00am Central
cron.schedule("0 6 * * 5", async () => {
  await spotifyController.setAlbumImages().catch((err) => console.error('Spotify album sync failed:', err));
}, {
  timezone: 'America/Chicago'
});

// Sync IMDb's official daily ratings dataset (~1.7M rows, ~9MB compressed)
// into MongoDB at 11 AM Central. NOT 2 AM (as it was before) - verified live
// that IMDb doesn't actually publish that day's refreshed file until ~7:41 AM
// Central, so the old 2 AM run was always grabbing the *previous* day's file,
// making our data structurally always ~1 extra day stale. 11 AM gives a
// ~3+ hour safety buffer past that observed publish time. IMDb only
// refreshes this dataset once/day, so running more than once/day here
// wouldn't produce fresher data - it would just waste bandwidth/CPU for no
// gain (the syncImdbRatings Last-Modified check already skips the
// download/rewrite entirely on days nothing changed, so this costs nothing
// extra in storage either - it's an upsert into the same collection, not an
// additive one).
cron.schedule('0 11 * * *', async () => {
  console.log('🎥 Starting IMDb ratings dataset sync at 11 AM (local)');
  await syncImdbRatings().catch((err) => console.error('IMDb ratings sync failed:', err));
}, {
  timezone: 'America/Chicago'
});

// Sync all artists albums in DB daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('🔥 Starting daily artist album sync at 3 AM (local)');
  await cronSyncAllArtists().catch((err) => console.error('Daily artist album sync failed:', err));
}, {
  timezone: 'America/Chicago'
});

// Refresh genres/streaming/release info on tracked cinema items daily at 4 AM
// (after the artist sync) - only "unsettled" titles (not yet streaming,
// still-airing shows) get re-checked, except on Sundays where every tracked
// title gets a full recheck as a safety net. See cronRefreshCinemaMetadata
// for the settled/unsettled distinction and per-title dedup across users.
cron.schedule('0 4 * * *', async () => {
  const fullRecheck = getLocalDayOfWeek('America/Chicago') === 'Sun';
  console.log(`🎬 Starting cinema metadata refresh at 4 AM (local) - ${fullRecheck ? 'full recheck' : 'unsettled titles only'}`);
  await cronRefreshCinemaMetadata({ fullRecheck }).catch((err) => console.error('Cinema metadata refresh failed:', err));
}, {
  timezone: 'America/Chicago'
});

// Bounded prewarm (see utils/imdbEpisodeMap.js) so opening Episodes for a
// tracked TV show is a fast Redis hit instead of a multi-second cold scan -
// runs at 4:30 AM, after the cinema metadata refresh above so imdbId/status
// are current for anything just added. Untracked/brand-new shows still work
// via the endpoint's own on-demand fallback - this is a warm-cache
// optimization only, not a correctness requirement.
cron.schedule('30 4 * * *', async () => {
  console.log('🎥 Starting IMDb episode-map prewarm at 4:30 AM (local)');
  await prewarmTrackedShowEpisodeMaps().catch((err) => console.error('IMDb episode-map prewarm failed:', err));
}, {
  timezone: 'America/Chicago'
});

// Below runs the sync every minute for testing purposes
// cron.schedule('* * * * *', async () => {
//   console.log('⏱️ Running test sync: once every minute');
//   await cronSyncAllArtists();
// });

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);

// Surface IMDb ratings freshness on every boot so staleness is visible
// without having to wait for/dig through the next 2 AM cron log.
logLastSyncedAt().catch((err) => console.error('Failed to log IMDb sync freshness:', err));

process.on('SIGTERM', () => {
  console.log("🛑 Caught SIGTERM: shutting down gracefully...");
  server.close(() => {
    console.log("🧹 Closed out remaining connections.");
    process.exit(0);
  });
});
