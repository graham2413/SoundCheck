// Daily sync of IMDb's official title.ratings.tsv.gz dataset (~1.7M rows,
// ~8.7MB compressed, refreshed by IMDb once a day) into a local MongoDB
// collection, so any title - tracked or freshly searched - gets an instant,
// accurate rating lookup instead of a live per-title OMDb call (which can
// lag real IMDb numbers unpredictably for newer/trending titles).
//
// Deliberately NOT stored in Redis: ~1.7M keys/fields would cost roughly
// 150-250MB of Redis's per-key/field overhead alone (measured: this app's
// entire Upstash free-tier cap is 256MB, and a prior unrelated leak already
// consumed 75% of it once - see redis-daily-check memory notes). MongoDB's
// BSON overhead per tiny document is far cheaper (~100-120MB total), and
// Atlas usage here is currently ~0.3% of its 512MB cap, so there's ample room.
const axios = require("axios");
const zlib = require("zlib");
const readline = require("readline");
const redis = require("./redisClient");
const ImdbRating = require("../models/ImdbRating");

const DATASET_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
const LAST_MODIFIED_CACHE_KEY = "imdb-ratings:last-modified"; // single small key, negligible storage
const LAST_SYNCED_AT_CACHE_KEY = "imdb-ratings:last-synced-at"; // our own clock - separate from IMDb's Last-Modified header, so staleness is always answerable even if IMDb's header is unchanged
const BATCH_SIZE = 5000;
const PROGRESS_LOG_EVERY_N_BATCHES = 20; // ~every 100k rows

// "3h 5m" / "42m" - used in the sync-freshness log line below.
function formatAge(sinceMs) {
  const totalMinutes = Math.floor((Date.now() - sinceMs) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m ago` : `${minutes}m ago`;
}

async function logLastSyncedAt() {
  const lastSyncedAt = await redis.get(LAST_SYNCED_AT_CACHE_KEY);
  if (!lastSyncedAt) {
    console.log("IMDb ratings: no successful sync recorded yet.");
    return;
  }
  console.log(`IMDb ratings last synced: ${new Date(Number(lastSyncedAt)).toISOString()} (${formatAge(Number(lastSyncedAt))})`);
}

async function syncImdbRatings() {
  const jobStart = Date.now();

  // IMDb only refreshes this file once a day - skip the download/parse/bulk-
  // write entirely if we've already synced today's version (e.g. if the cron
  // somehow fires more than once, or the server restarts).
  const head = await axios.head(DATASET_URL);
  const lastModified = head.headers["last-modified"];
  const previouslySynced = await redis.get(LAST_MODIFIED_CACHE_KEY);

  if (previouslySynced && previouslySynced === lastModified) {
    console.log(`IMDb ratings dataset unchanged since last sync (${lastModified}) - skipping.`);
    await logLastSyncedAt();
    return;
  }

  console.log(`Downloading IMDb ratings dataset (last modified: ${lastModified})...`);
  const downloadStart = Date.now();
  const response = await axios.get(DATASET_URL, { responseType: "stream", timeout: 30000 });
  const rl = readline.createInterface({ input: response.data.pipe(zlib.createGunzip()) });
  console.log(`Download/stream started after ${((Date.now() - downloadStart) / 1000).toFixed(1)}s - parsing + upserting...`);

  let batch = [];
  let isHeaderLine = true;
  let total = 0;
  let batchesWritten = 0;
  const parseStart = Date.now();

  for await (const line of rl) {
    if (isHeaderLine) {
      isHeaderLine = false;
      continue;
    }

    const [tconst, averageRating, numVotes] = line.split("\t");
    if (!tconst) continue;

    batch.push({
      updateOne: {
        filter: { _id: tconst },
        update: { $set: { averageRating: parseFloat(averageRating), numVotes: parseInt(numVotes, 10) } },
        upsert: true,
      },
    });

    if (batch.length >= BATCH_SIZE) {
      await ImdbRating.bulkWrite(batch, { ordered: false });
      total += batch.length;
      batch = [];
      batchesWritten++;

      if (batchesWritten % PROGRESS_LOG_EVERY_N_BATCHES === 0) {
        const elapsedSec = (Date.now() - parseStart) / 1000;
        const rowsPerSec = (total / elapsedSec).toFixed(0);
        console.log(`IMDb ratings sync progress: ${total} rows upserted (${elapsedSec.toFixed(0)}s elapsed, ~${rowsPerSec} rows/sec)`);
      }
    }
  }

  if (batch.length) {
    await ImdbRating.bulkWrite(batch, { ordered: false });
    total += batch.length;
  }

  await redis.set(LAST_MODIFIED_CACHE_KEY, lastModified);
  await redis.set(LAST_SYNCED_AT_CACHE_KEY, String(Date.now()));

  const totalSec = (Date.now() - jobStart) / 1000;
  console.log(`IMDb ratings sync complete - ${total} titles upserted in ${totalSec.toFixed(1)}s (${(total / totalSec).toFixed(0)} rows/sec).`);
}

// Instant local lookup used by getImdbStats/getCinemaDetail in place of a
// live OMDb call for rating/vote count.
async function getLocalImdbRating(imdbId) {
  if (!imdbId) return null;
  const doc = await ImdbRating.findById(imdbId).lean();
  if (!doc) return null;
  return { imdbRating: doc.averageRating ?? null, voteCount: doc.numVotes ?? null };
}

module.exports = { syncImdbRatings, getLocalImdbRating, logLastSyncedAt };
