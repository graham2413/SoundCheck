const Redis = require('ioredis');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {},
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
if (!isProd) {
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
  };
} else {
  const redis = new Redis(redisOptions);
  redis.on('error', (err) => console.error('❌ Redis connection error:', err));
  redis.on('connect', () => console.log('✅ Redis connected'));

  // Fail-safe wrappers - catch and log instead of throwing, so a transient
  // Redis outage or a quota rejection (e.g. free-tier command cap) degrades
  // to a cache-miss/no-op instead of taking down the request that called it.
  redis.safeGet = async (key) => {
    try {
      return await redis.get(key);
    } catch (err) {
      console.error(`Redis GET failed for key "${key}":`, err.message);
      return null;
    }
  };

  redis.safeSet = async (...args) => {
    try {
      return await redis.set(...args);
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

  module.exports = redis;
}
