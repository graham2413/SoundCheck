const Redis = require('ioredis');
const fs = require('fs');
const zlib = require('zlib');

// Below this size, gzip's own header/footer overhead (~20 bytes) can make a
// value BIGGER than it started - not worth compressing tiny values like the
// "1" flags used for locks/dedupe.
const GZIP_MIN_BYTES = 256;

function maybeGzip(value) {
  if (typeof value !== 'string') return value; // numbers/Buffers passed straight through as-is
  const buf = Buffer.from(value, 'utf8');
  if (buf.length < GZIP_MIN_BYTES) return buf;
  return zlib.gzipSync(buf);
}

// Every value written by safeSet is gzip-magic-checked on read rather than
// tagged with a custom prefix - this doubles as the fallback for values
// already sitting in Redis from before this compression was added (and for
// the small values maybeGzip deliberately left uncompressed), with no
// separate migration/versioning needed.
function maybeGunzip(buf) {
  if (!buf) return null;
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buf).toString('utf8');
    } catch (err) {
      console.error('Redis value had gzip magic bytes but failed to decompress:', err.message);
      // fall through - treat as plain instead of losing the value entirely
    }
  }
  return buf.toString('utf8');
}

const isProd = process.env.NODE_ENV === 'production';
// Not every Redis provider's endpoint requires (or even supports) TLS on
// their free/lower tiers - default to on since that's what our prior
// provider required, but allow it to be switched off per-environment via
// REDIS_TLS=false for providers that only offer a plain endpoint.
const useTls = process.env.REDIS_TLS !== 'false';

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: useTls ? {} : undefined,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  },
  reconnectOnError(err) {
    return (
      err.code === 'ECONNRESET' ||
      err.message.includes('READONLY') ||
      err.message.includes('ECONNREFUSED')
    );
  },
};

// Optionally load local TLS cert in non-production
if (!isProd && useTls) {
  try {
    redisOptions.tls = {
      ca: fs.existsSync('cacert.pem') ? fs.readFileSync('cacert.pem') : undefined,
    };
    console.log('Loaded local Redis TLS cert.');
  } catch (err) {
    console.warn('Local Redis TLS cert not found. Proceeding without TLS.', err);
  }
}

// Mock in test mode
if (process.env.NODE_ENV === 'test') {
  module.exports = {
    on: () => {},
    get: async () => null,
    set: async () => {},
    del: async () => {},
    safeGet: async () => null,
    safeSet: async () => null,
    safeDel: async () => null,
    safeMget: async (keys) => keys.map(() => null),
    safeExpire: async () => null,
  };
} else {
  const redis = new Redis(redisOptions);
  redis.on('error', (err) => console.error('❌ Redis connection error:', err));
  redis.on('connect', () => console.log('✅ Redis connected'));

  // Fail-safe wrappers - catch and log instead of throwing, so a transient
  // Redis outage or a provider quota rejection degrades to a cache-miss/
  // no-op instead of taking down the request that called it.
  //
  // Values above GZIP_MIN_BYTES are transparently gzip-compressed before
  // writing and decompressed after reading (via the *Buffer command variants,
  // since compressed data is binary and would get mangled by ioredis's
  // default utf8 string decoding) - this was added after a few large cached
  // TMDb detail payloads (TV shows' full-cast lists especially) pushed a
  // free-tier Redis instance close to its storage cap. See maybeGzip/
  // maybeGunzip above for the compression + backward-compatible decode logic.
  redis.safeGet = async (key) => {
    try {
      return maybeGunzip(await redis.getBuffer(key));
    } catch (err) {
      console.error(`Redis GET failed for key "${key}":`, err.message);
      return null;
    }
  };

  redis.safeSet = async (...args) => {
    try {
      const [key, value, ...rest] = args;
      return await redis.set(key, maybeGzip(value), ...rest);
    } catch (err) {
      console.error(`Redis SET failed for key "${args[0]}":`, err.message);
      return null;
    }
  };

  redis.safeDel = async (...args) => {
    try {
      return await redis.del(...args);
    } catch (err) {
      console.error(`Redis DEL failed for key(s) "${args.join(', ')}":`, err.message);
      return null;
    }
  };

  // Refreshes a key's TTL without touching its value - used for sliding-
  // expiration caches (e.g. the per-episode IMDb tconst cache), where every
  // read should push the key's expiry back out rather than leaving it on a
  // fixed countdown from when it was written.
  redis.safeExpire = async (key, seconds) => {
    try {
      return await redis.expire(key, seconds);
    } catch (err) {
      console.error(`Redis EXPIRE failed for key "${key}":`, err.message);
      return null;
    }
  };

  // Batched read - one MGET is a single round-trip/command, unlike
  // pipelining N GETs. Use this whenever a caller needs several keys
  // it already knows up front instead of looping safeGet.
  redis.safeMget = async (keys) => {
    if (!keys.length) return [];
    try {
      const buffers = await redis.mgetBuffer(keys);
      return buffers.map(maybeGunzip);
    } catch (err) {
      console.error(`Redis MGET failed for ${keys.length} key(s):`, err.message);
      return keys.map(() => null);
    }
  };

  module.exports = redis;
}
