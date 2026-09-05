// Backfill: fills in genres/duration/streamingPlatforms/releaseDate for
// existing CinemaItems that are missing them - these fields were never
// captured at add-time (toggleWatchlist only ever stored tmdbId/mediaType/
// title/cover/releaseDate) or can go stale (e.g. an unreleased movie's
// release date not yet confirmed at add-time, confirmed later by TMDb).
//
// Can be run standalone for all users: node backend/scripts/backfillCinemaMetadata.js
// Or imported and called with a filter (e.g. scoped to one user).

if (require.main === module) {
  const dotenv = require("dotenv");
  const path = require("path");
  if ((process.env.NODE_ENV || "development") === "development") {
    dotenv.config({ path: path.resolve(__dirname, "../.env.development") });
  } else {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
  }
}

const mongoose = require("mongoose");
const CinemaItem = require("../models/CinemaItem");
const { getTmdbDetails } = require("../utils/callTmdb");
const { getUsTheatricalRelease, hasTheatricalRelease, getUsDigitalRelease, buildWatchProviders } = require("../controllers/cinemaController");

// filter lets callers scope this to one user's items instead of the whole DB.
// force re-backfills items that already have this data (e.g. one-time quality upgrades).
async function backfillCinemaMetadata(filter = {}, { force = false } = {}) {
  const items = await CinemaItem.find({
    ...filter,
    tmdbId: { $exists: true, $ne: null },
    ...(force
      ? {}
      : {
          $or: [
            { genres: { $exists: false } },
            { genres: { $size: 0 } },
            { duration: { $exists: false } },
            { duration: null },
            { streamingPlatforms: { $exists: false } },
            { streamingPlatforms: { $size: 0 } },
            { releaseDate: { $exists: false } },
            { releaseDate: null },
            { mediaType: "tv", releaseYearRange: { $exists: false } },
            { mediaType: "movie", hadTheatricalRelease: { $exists: false } },
            { mediaType: "movie", digitalReleaseDate: { $exists: false } },
          ],
        }),
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

      if (details.genres?.length) {
        item.genres = details.genres.map((g) => g.name);
      }

      if (item.mediaType === "movie" && details.runtime) {
        item.duration = details.runtime * 60; // minutes -> seconds
      } else if (item.mediaType === "tv" && details.episode_run_time?.[0]) {
        item.duration = details.episode_run_time[0] * 60;
      }

      const releaseDate =
        item.mediaType === "movie"
          ? getUsTheatricalRelease(details).releaseDate
          : details.first_air_date;
      if (releaseDate) {
        item.releaseDate = new Date(releaseDate);
      }

      if (item.mediaType === "movie") {
        item.hadTheatricalRelease = hasTheatricalRelease(details);
        const digitalReleaseDate = getUsDigitalRelease(details);
        item.digitalReleaseDate = digitalReleaseDate ? new Date(digitalReleaseDate) : null;
      }

      // TV only - mirrors searchCinema's "2017-2025"/"2016-Present" display format
      if (item.mediaType === "tv") {
        const startYear = releaseDate ? new Date(releaseDate).getFullYear() : null;
        const endYear = details.last_air_date ? new Date(details.last_air_date).getFullYear() : null;
        const hasEnded = details.status === "Ended" || details.status === "Canceled";

        if (startYear && hasEnded) {
          item.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-${endYear}` : `${startYear}`;
        } else if (startYear) {
          item.releaseYearRange = endYear && endYear !== startYear ? `${startYear}-Present` : `${startYear}`;
        }
      }

      const providers = buildWatchProviders(details["watch/providers"]?.results?.US?.flatrate);
      if (providers.length) {
        item.streamingPlatforms = providers.map((p) => p.name);
      }

      if (!item.imdbId && details.imdb_id) {
        item.imdbId = details.imdb_id;
      }

      await item.save();
      updated++;
    } catch (error) {
      console.error(`Failed to backfill "${item.title}" (tmdbId ${item.tmdbId}):`, error.message);
      failed++;
    }
  }

  console.log(`Backfill complete. Total items checked: ${items.length}, Updated: ${updated}, Failed: ${failed}`);
  return { total: items.length, updated, failed };
}

if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");
    await backfillCinemaMetadata();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((error) => {
    console.error("Backfill script failed:", error);
    process.exit(1);
  });
}

module.exports = { backfillCinemaMetadata };
