// Backfill: sets isWatched=true for any existing CinemaItem that already has
// a rating - these are, by definition, already watched, but the isWatched
// field didn't exist yet when they were rated.
//
// Can be run standalone: node backend/scripts/backfillIsWatched.js

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

async function backfillIsWatched(filter = {}) {
  const result = await CinemaItem.updateMany(
    { ...filter, decimalRating: { $ne: null }, isWatched: { $ne: true } },
    { $set: { isWatched: true } }
  );

  console.log(`Backfill complete. Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`);
  return { matched: result.matchedCount, updated: result.modifiedCount };
}

if (require.main === module) {
  (async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");
    await backfillIsWatched();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((error) => {
    console.error("Backfill script failed:", error);
    process.exit(1);
  });
}

module.exports = { backfillIsWatched };
