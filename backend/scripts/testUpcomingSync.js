// Manual one-off verification for syncUpcomingReleasesForArtist (see
// controllers/mainSearchController.js) - runs the Spotify+MusicBrainz
// upcoming-release sync for a single artist without waiting for the next
// scheduled 3 AM cron run, and prints what landed in UpcomingRelease.
//
// Usage: node backend/scripts/testUpcomingSync.js <deezerArtistId> <artistName>
// Pick an artist with a publicly announced future album/single (check
// Spotify or MusicBrainz's own site first) so there's something to see.
// Run it twice in a row to confirm the second run doesn't create duplicates
// (the upsert should update existing rows in place).

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
const UpcomingRelease = require("../models/UpcomingRelease");
const { syncUpcomingReleasesForArtist } = require("../controllers/mainSearchController");

if (require.main === module) {
  const connectDB = require("../config/db");

  (async () => {
    const [artistId, artistName] = process.argv.slice(2);
    if (!artistId || !artistName) {
      console.error("Usage: node backend/scripts/testUpcomingSync.js <deezerArtistId> <artistName>");
      process.exit(1);
    }

    await connectDB();
    console.log(`Syncing upcoming releases for ${artistName} (${artistId})...`);
    await syncUpcomingReleasesForArtist(artistId, artistName);

    const rows = await UpcomingRelease.find({ artistId }).lean();
    console.log(`UpcomingRelease rows for ${artistName}: ${rows.length}`);
    for (const r of rows) {
      console.log(`  [${r.source}] ${r.title} - ${r.releaseDate.toISOString().slice(0, 10)} (${r.recordType || "unknown type"})`);
    }

    await mongoose.disconnect();
    process.exit(0);
  })().catch((error) => {
    console.error("testUpcomingSync crashed:", error);
    process.exit(1);
  });
}
