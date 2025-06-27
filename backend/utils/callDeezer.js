// utils/callDeezer.js
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const redis = require("./redisClient");

async function callDeezer(url) {
  const key = `deezer-rate-limit`;
  const now = Math.floor(Date.now() / 1000);
  let retries = 0;

  while (true) {
    await redis.zremrangebyscore(key, "-inf", now - 5);
    const requests = await redis.zcard(key);

    if (requests < 50) {
      // Atomically add request and set expiration if needed
      const requestId = `${now}:${crypto.randomUUID()}`;
      await redis.multi().zadd(key, now, requestId).expire(key, 5).exec();

      break;
    }

    if (retries >= 10) {
      console.error(`Max retries reached, dropping request: ${url}`);
      return { data: { data: [] } };
    }

    const waitTime = (retries + 1) * 500; // Increasing wait time (500ms, 1s, 1.5s, ...)
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    retries++;
  }

  // HTTPS agent
  let agent;

  if (process.env.NODE_ENV === "production") {
    agent = new https.Agent();
  } else {
    agent = new https.Agent({
      ca: fs.readFileSync("cacert.pem"),
    });
  }

  let attempt = 0;
  while (attempt < 5) {
    try {
      const response = await axios.get(url, {
        httpsAgent: agent,
        timeout: 7000, // 7 seconds or whatever you prefer
      });

      // Handle Deezer Quota Limit (Code 4)
      if (response.data?.error?.code === 4) {
        if (attempt === 0) console.warn(`⚠️ Deezer quota hit. Retrying...`);
        await new Promise((resolve) =>
          setTimeout(resolve, 2 ** attempt * 1000)
        ); // Exponential backoff
        attempt++;
        continue; // Retry again
      }

      if (!response.data) {
        console.error(
          `⚠️ Invalid response from Deezer: ${JSON.stringify(response.data)}`
        );
        return { data: { data: [] } };
      }

      return response;
    } catch (error) {
      console.error(
        `Deezer API error [${attempt + 1}/5]:`,
        url,
        error.response?.status,
        error.message,
        error?.stack
      );
      await new Promise((res) => setTimeout(res, 2 ** attempt * 1000)); // Exponential backoff
      attempt++;
    }
  }

  console.error(`All attempts failed for ${url}`);
  return { data: { data: [] } };
}

module.exports = { callDeezer };
