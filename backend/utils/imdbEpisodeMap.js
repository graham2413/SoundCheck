// utils/imdbEpisodeMap.js
//
// Per-episode IMDb ratings - "Option A" from the plan (see repo memory
// /memories/repo/tv-episode-imdb-ratings-plan.md for the full background/
// numbers). Deliberately does NOT bulk-sync IMDb's title.episode.tsv.gz
// (9.87M rows, unsorted by parent show) into MongoDB - that was measured to
// cost ~880MB, blowing the entire 512MB Atlas free-tier cap on its own (see
// memory doc). Instead:
//   - MongoDB's existing ImdbRating collection (tconst -> averageRating/
//     numVotes) is reused as-is for episode tconsts too - no schema change.
//   - Redis stores ONLY the show -> episode-tconst mapping (never ratings),
//     one key per show, bounded + TTL'd, never extended on read.
//   - A show's episode map is only ever built by actually streaming the
//     IMDb file (gunzip + readline, same zero-disk pattern as
//     imdbRatingsSync.js) filtered to that one parentTconst - either lazily
//     on first request, or during the bounded nightly/user-action prewarm.
const axios = require("axios");
const zlib = require("zlib");
const readline = require("readline");
const redis = require("./redisClient");
const ImdbRating = require("../models/ImdbRating");
const CinemaItem = require("../models/CinemaItem");

const DATASET_URL = "https://datasets.imdbws.com/title.episode.tsv.gz";

const EPISODE_MAP_KEY_PREFIX = "imdb:episodesByParent:";
const LOCK_KEY_PREFIX = "lock:imdb:episodesByParent:";

const LOCK_TTL_SECONDS = 8 * 60; // 5-10 min per plan - mid-point, covers a slow cold scan
const EMPTY_RESULT_TTL_SECONDS = 18 * 60 * 60; // 12-24h per plan

// Adaptive TTLs (seconds) - see plan doc for the reasoning per bucket. Ratings
// freshness itself is unaffected by this TTL (that's the daily Mongo sync's
// job) - this only controls how long we trust a show's episode *list* is
// still complete, which mainly matters for currently-airing shows.
const TTL_SECONDS = {
  ended: 30 * 24 * 60 * 60,
  ongoing: 5 * 24 * 60 * 60,
  coldFallback: 5 * 24 * 60 * 60,
  recent: 10 * 24 * 60 * 60,
  unknown: 5 * 24 * 60 * 60,
};

const MAX_EPISODES_PER_SHOW = 2000;
const PAYLOAD_WARN_BYTES = 250 * 1024;
const PAYLOAD_HARD_LIMIT_BYTES = 500 * 1024;
const MAX_PREWARM_SHOWS_PER_RUN = 200; // bounded per plan (100-250)

function episodeMapKey(parentTconst) {
  return `${EPISODE_MAP_KEY_PREFIX}${parentTconst}`;
}

function lockKey(parentTconst) {
  return `${LOCK_KEY_PREFIX}${parentTconst}`;
}

function resolveTtlSeconds(showStatus, cacheSource) {
  if (cacheSource === "coldFallback") return TTL_SECONDS.coldFallback;
  if (cacheSource === "recent" || cacheSource === "userAction") return TTL_SECONDS.recent;
  if (showStatus === "ended") return TTL_SECONDS.ended;
  if (showStatus === "ongoing") return TTL_SECONDS.ongoing;
  return TTL_SECONDS.unknown;
}

// Atomic SET NX EX - only one caller ever wins the lock for a given show.
async function acquireScanLock(parentTconst) {
  const result = await redis.safeSet(lockKey(parentTconst), "1", "EX", LOCK_TTL_SECONDS, "NX");
  return result === "OK";
}

async function releaseScanLock(parentTconst) {
  await redis.safeDel(lockKey(parentTconst));
}

// Never extends TTL on read (no sliding TTL, per plan) - plain GET only.
async function getCachedEpisodeMap(parentTconst) {
  const raw = await redis.safeGet(episodeMapKey(parentTconst));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Writes one bounded, logged, size-checked Redis key for a single show.
async function cacheEpisodeMap(parentTconst, episodes, { showStatus = "unknown", cacheSource = "coldFallback" } = {}) {
  const trimmed = episodes.slice(0, MAX_EPISODES_PER_SHOW);
  const payload = {
    parentTconst,
    episodes: trimmed,
    sourceLastModified: null,
    cachedAt: new Date().toISOString(),
    showStatus,
    cacheSource,
  };
  const serialized = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(serialized);

  let ttlSeconds = resolveTtlSeconds(showStatus, cacheSource);
  if (payloadBytes > PAYLOAD_HARD_LIMIT_BYTES) {
    console.warn(`imdbEpisodeMap: ${parentTconst} payload ${payloadBytes}B exceeds hard limit - using 1-day TTL.`);
    ttlSeconds = 24 * 60 * 60;
  } else if (payloadBytes > PAYLOAD_WARN_BYTES) {
    console.warn(`imdbEpisodeMap: ${parentTconst} payload ${payloadBytes}B exceeds warning threshold.`);
  }

  console.log(
    `imdbEpisodeMap: caching ${parentTconst} - ${trimmed.length} episodes, ${payloadBytes}B, ttl=${ttlSeconds}s, source=${cacheSource}, status=${showStatus}`
  );

  await redis.safeSet(episodeMapKey(parentTconst), serialized, "EX", ttlSeconds);
  return payload;
}

// Caches a short-lived "nothing found" marker so a show with no IMDb episode
// mapping (or a typo'd/invalid ID) doesn't trigger a fresh multi-second scan
// on every single request.
async function cacheEmptyResult(parentTconst) {
  const payload = {
    parentTconst,
    episodes: [],
    cachedAt: new Date().toISOString(),
    showStatus: "unknown",
    cacheSource: "coldFallback",
  };
  console.log(`imdbEpisodeMap: caching EMPTY result for ${parentTconst}, ttl=${EMPTY_RESULT_TTL_SECONDS}s`);
  await redis.safeSet(episodeMapKey(parentTconst), JSON.stringify(payload), "EX", EMPTY_RESULT_TTL_SECONDS);
  return payload;
}

// Streams IMDb's title.episode.tsv.gz once, collecting only rows for the
// requested parent show(s). No disk write, no full-file in-memory buffering
// - gunzip + readline, same zero-disk pattern as imdbRatingsSync.js.
// `targetParentTconsts` may be a single tconst (on-demand path) or a Set of
// many (nightly prewarm path), so both callers share one scan implementation.
async function scanImdbEpisodeFile(targetParentTconsts) {
  const targets = targetParentTconsts instanceof Set ? targetParentTconsts : new Set([targetParentTconsts]);
  const scanStart = Date.now();

  const response = await axios.get(DATASET_URL, { responseType: "stream", timeout: 30000 });
  const rl = readline.createInterface({ input: response.data.pipe(zlib.createGunzip()) });

  const byParent = new Map(); // parentTconst -> episodes[]
  let isHeaderLine = true;
  let rowsScanned = 0;

  for await (const line of rl) {
    if (isHeaderLine) {
      isHeaderLine = false;
      continue;
    }
    rowsScanned++;

    const [tconst, parentTconst, seasonNumberRaw, episodeNumberRaw] = line.split("\t");
    if (!tconst || !parentTconst || !targets.has(parentTconst)) continue;

    const seasonNumber = Number(seasonNumberRaw);
    const episodeNumber = Number(episodeNumberRaw);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) continue;

    if (!byParent.has(parentTconst)) byParent.set(parentTconst, []);
    byParent.get(parentTconst).push({ tconst, seasonNumber, episodeNumber });
  }

  const scanSec = (Date.now() - scanStart) / 1000;
  console.log(
    `imdbEpisodeMap: scanned ${rowsScanned} rows in ${scanSec.toFixed(1)}s for ${targets.size} target show(s), matched ${byParent.size}.`
  );

  return byParent;
}

// Merges a show's cached episode->tconst map with live rating values from
// the existing ImdbRating collection - one batched $in query, never one
// query per episode.
async function mergeRatingsIntoEpisodes(episodes) {
  if (!episodes.length) return [];
  const tconsts = episodes.map((e) => e.tconst);
  const ratings = await ImdbRating.find({ _id: { $in: tconsts } }).lean();
  const ratingByTconst = new Map(ratings.map((r) => [r._id, r]));

  return episodes.map((e) => {
    const rating = ratingByTconst.get(e.tconst);
    return {
      tconst: e.tconst,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      averageRating: rating?.averageRating ?? null,
      numVotes: rating?.numVotes ?? null,
    };
  });
}

// TMDb's raw show status string -> our simplified ended/ongoing bucket, same
// distinction the adaptive TTL logic cares about (only ongoing shows can
// gain new episodes before a cache entry's TTL naturally expires).
function mapTmdbStatusToShowStatus(rawStatus) {
  if (rawStatus === "Ended" || rawStatus === "Canceled") return "ended";
  if (rawStatus) return "ongoing";
  return "unknown";
}

// Daily cron entry point (see server.js) - bounded prewarm for currently-
// tracked TV shows only, so the common case (a user opening Episodes for a
// show they actually track) is a fast Redis hit instead of a multi-second
// cold scan. Brand-new/untracked shows still work correctly via the
// endpoint's own on-demand fallback (see cinemaController.getEpisodeImdbRatings)
// - this is purely a warm-cache optimization, not a correctness requirement.
async function prewarmTrackedShowEpisodeMaps() {
  const jobStart = Date.now();

  const tracked = await CinemaItem.aggregate([
    {
      $match: {
        mediaType: "tv",
        imdbId: { $exists: true, $nin: [null, ""] },
        $or: [{ isWatchlist: true }, { isWatched: true }],
      },
    },
    { $group: { _id: "$imdbId", status: { $first: "$status" } } },
    { $limit: MAX_PREWARM_SHOWS_PER_RUN },
  ]);

  if (!tracked.length) {
    console.log("imdbEpisodeMap prewarm: no tracked TV shows with an imdbId - skipping.");
    return { showsTargeted: 0, showsMatched: 0 };
  }

  const statusByParent = new Map(tracked.map((t) => [t._id, mapTmdbStatusToShowStatus(t.status)]));
  const targets = new Set(tracked.map((t) => t._id));

  console.log(`imdbEpisodeMap prewarm: scanning for ${targets.size} tracked show(s)...`);
  const byParent = await scanImdbEpisodeFile(targets);

  for (const [parentTconst, episodes] of byParent.entries()) {
    const showStatus = statusByParent.get(parentTconst) || "unknown";
    if (episodes.length) {
      await cacheEpisodeMap(parentTconst, episodes, { showStatus, cacheSource: "nightlyPrewarm" });
    } else {
      await cacheEmptyResult(parentTconst);
    }
  }

  const totalSec = ((Date.now() - jobStart) / 1000).toFixed(1);
  console.log(
    `imdbEpisodeMap prewarm complete in ${totalSec}s - ${targets.size} targeted, ${byParent.size} matched.`
  );

  return { showsTargeted: targets.size, showsMatched: byParent.size };
}

module.exports = {
  episodeMapKey,
  lockKey,
  acquireScanLock,
  releaseScanLock,
  getCachedEpisodeMap,
  cacheEpisodeMap,
  cacheEmptyResult,
  scanImdbEpisodeFile,
  mergeRatingsIntoEpisodes,
  mapTmdbStatusToShowStatus,
  prewarmTrackedShowEpisodeMaps,
};
