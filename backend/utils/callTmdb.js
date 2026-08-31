// utils/callTmdb.js
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const redis = require("./redisClient");

const TMDB_BASE = "https://api.themoviedb.org/3";

const RATE_LIMIT_KEY = "tmdb-rate-limit";
const RATE_LIMIT_WINDOW_SECONDS = 1;
const RATE_LIMIT_MAX_REQUESTS = 40;
const QUEUE_DELAY_MS = 200;

const DETAILS_CACHE_TTL = 604800; // 7 days
const SEARCH_CACHE_TTL = 7200; // 2 hours

// Caps simultaneous connections to stay under TMDb's ~20 concurrent connections/IP limit
const tmdbAgent = new https.Agent({ maxSockets: 20, keepAlive: true });

// Sliding window limiter (mirrors callDeezer.js) - delays instead of throwing 429
async function waitForRateLimitSlot() {
  const now = Date.now();

  while (true) {
    await redis.zremrangebyscore(RATE_LIMIT_KEY, "-inf", now - RATE_LIMIT_WINDOW_SECONDS * 1000);
    const requests = await redis.zcard(RATE_LIMIT_KEY);

    if (requests < RATE_LIMIT_MAX_REQUESTS) {
      const requestId = `${now}:${crypto.randomUUID()}`;
      await redis.multi()
        .zadd(RATE_LIMIT_KEY, now, requestId)
        .expire(RATE_LIMIT_KEY, RATE_LIMIT_WINDOW_SECONDS)
        .exec();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, QUEUE_DELAY_MS));
  }
}

// Low-level TMDb GET with rate-limit queueing + retry/backoff (mirrors callDeezer.js)
async function callTmdb(path, params = {}) {
  await waitForRateLimitSlot();

  let attempt = 0;
  while (attempt < 5) {
    try {
      const response = await axios.get(`${TMDB_BASE}${path}`, {
        params,
        timeout: 7000,
        httpsAgent: tmdbAgent,
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
          Accept: "application/json",
        },
      });

      return response;
    } catch (error) {
      console.error(
        `TMDb API error [${attempt + 1}/5]:`,
        path,
        error.response?.status,
        error.message
      );

      // Auth/client errors (401/403/404) will never succeed on retry - failing
      // fast avoids wasting ~31s of backoff per item (multiplied across an
      // entire import) when e.g. TMDB_API_KEY is missing/invalid.
      const status = error.response?.status;
      if (status && status !== 429 && status < 500) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000)); // Exponential backoff
      attempt++;
    }
  }

  console.error(`All attempts failed for ${path}`);
  return { data: null };
}

// Cache-aware wrapper: GET /movie/:id or /tv/:id details
async function getTmdbDetails(tmdbId, mediaType = "movie") {
  const cacheKey = `tmdb:details:${tmdbId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb(`/${mediaType}/${tmdbId}`, {
    append_to_response: "watch/providers,credits",
  });

  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", DETAILS_CACHE_TTL);
  }

  return response.data;
}

// Cache-aware wrapper: GET /search/multi?query=...
async function searchTmdb(query) {
  const cacheKey = `tmdb:search:${query}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await callTmdb("/search/multi", { query });

  if (response.data) {
    await redis.set(cacheKey, JSON.stringify(response.data), "EX", SEARCH_CACHE_TTL);
  }

  return response.data;
}

module.exports = { callTmdb, getTmdbDetails, searchTmdb };
