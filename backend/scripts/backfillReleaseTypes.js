// Backfill: fills in `recordType` ("album"/"single"/"ep"/"compile") for
// existing Release rows synced before that field was captured (see
// controllers/mainSearchController.js's syncArtistAlbums). The nightly
// cron's own "recently changed" update path only refreshes releases from the
// last 30 days, so it can't reach older history on its own - this is a
// proper one-time pass over everything, keyed by Deezer albumId (deduped -
// the same album can appear under multiple artistId rows, e.g. a feature/
// collab, so each unique album is only fetched from Deezer once regardless
// of how many Release rows reference it).
//
// Can be run standalone: node backend/scripts/backfillReleaseTypes.js [--force]
// --force re-checks every row, not just ones missing recordType.

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
const Release = require("../models/Release");
const { callDeezer } = require("../utils/callDeezer");
const { fetchWithRetry } = require("../utils/fetchWithRetry");

async function backfillReleaseTypes({ force = false } = {}) {
  const query = force ? {} : { $or: [{ recordType: { $exists: false } }, { recordType: null }] };
  const albumIds = await Release.find(query).distinct("albumId");

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const albumId of albumIds) {
    try {
      const response = await fetchWithRetry(() => callDeezer(`https://api.deezer.com/album/${albumId}`));
      const recordType = response.data?.record_type;

      if (!recordType) {
        skipped++;
        continue;
      }

      const result = await Release.updateMany({ albumId }, { $set: { recordType } });
      updated += result.modifiedCount || 0;
    } catch (error) {
      console.error(`Failed to backfill recordType for albumId ${albumId}:`, error.message);
      failed++;
    }
  }

  return { updated, failed, skipped, totalAlbumIds: albumIds.length };
}

module.exports = { backfillReleaseTypes };

if (require.main === module) {
  const connectDB = require("../config/db");

  (async () => {
    await connectDB();
    const force = process.argv.includes("--force");
    console.log(`Starting recordType backfill${force ? " (force mode - re-checking every row)" : ""}...`);
    const { updated, failed, skipped, totalAlbumIds } = await backfillReleaseTypes({ force });
    console.log(`Unique albums checked: ${totalAlbumIds}`);
    console.log(`Done. Rows updated: ${updated}, Deezer failures: ${failed}, no record_type on record: ${skipped}`);
    await mongoose.disconnect();
    process.exit(0);
  })().catch((error) => {
    console.error("Backfill script crashed:", error);
    process.exit(1);
  });
}
