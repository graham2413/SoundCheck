// Backfill: fills in cover/genres/duration for CinemaItems (imported from
// Trakt, which never had image/metadata URLs) using TMDb, since the tmdbId
// was already captured at import time but never used until now.
//
// Can be run standalone for all users: node backend/scripts/backfillCinemaCovers.js
// Or imported and called with a filter (e.g. scoped to one user) - see
// cinemaController.js's importTraktExport, which calls this right after import.

// Env vars must load before any other require (callTmdb -> redisClient reads
// them at module-init time), so this has to happen before anything else.
if (require.main === module) {
  const dotenv = require("dotenv");
  const path = require("path");
  // Defaults to development since NODE_ENV isn't set when running this script
  // directly with `node`, unlike npm scripts which set it via cross-env.
  if ((process.env.NODE_ENV || "development") === "development") {
    dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
  } else {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
  }
}

const mongoose = require("mongoose");
const CinemaItem = require("../models/CinemaItem");
const { getTmdbDetails } = require("../utils/callTmdb");

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original"; // matches music's Deezer size=xl (always max available resolution)

// filter lets callers scope this to one user's items instead of the whole DB.
// force re-backfills items that already have a cover (e.g. one-time quality upgrades).
async function backfillCinemaCovers(filter = {}, { force = false } = {}) {
  const items = await CinemaItem.find({
    ...filter,
    tmdbId: { $exists: true, $ne: null },
    ...(force ? {} : { $or: [{ cover: { $exists: false } }, { cover: "" }] }),
  });

  let updated = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const details = await getTmdbDetails(item.tmdbId, item.mediaType);

      if (!details) {
        failed++;
        continue;
      }

      if (details.poster_path) {
        item.cover = `${TMDB_IMAGE_BASE}${details.poster_path}`;
      }

      if (details.genres?.length) {
        item.genres = details.genres.map((g) => g.name);
      }

      if (item.mediaType === "movie" && details.runtime) {
        item.duration = details.runtime * 60; // minutes -> seconds
      } else if (item.mediaType === "tv" && details.episode_run_time?.[0]) {
        item.duration = details.episode_run_time[0] * 60;
      }

      await item.save();
      updated++;
    } catch (error) {
      console.error(`Failed to backfill "${item.title}" (tmdbId ${item.tmdbId}):`, error.message);
      failed++;
    }
  }

  return { updated, failed, total: items.length };
}

module.exports = { backfillCinemaCovers };

// Only run as a standalone script (across all users) when invoked directly,
// e.g. `node backend/scripts/backfillCinemaCovers.js`.
if (require.main === module) {
  const connectDB = require("../config/db");

  (async () => {
    await connectDB();
    const force = process.argv.includes("--force");
    const { updated, failed, total } = await backfillCinemaCovers({}, { force });
    console.log(`Found ${total} item(s) ${force ? "to re-backfill (force mode)" : "missing cover art"}.`);
    console.log(`Done. Updated: ${updated}, Failed: ${failed}, Total: ${total}`);
    await mongoose.disconnect();
    process.exit(0);
  })().catch((error) => {
    console.error("Backfill script crashed:", error);
    process.exit(1);
  });
}
