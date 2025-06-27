const Redis = require('ioredis');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: {}, // Upstash requires TLS for TCP, no cert needed
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 100, 2000); // exponential backoff: 100ms → 2s
  },
  reconnectOnError(err) {
    return (
      err.code === 'ECONNRESET' ||
      err.message.includes('READONLY') ||
      err.message.includes('ECONNREFUSED')
    );
  },
};

// Optionally load a TLS cert locally, if needed
if (!isProd) {
  try {
    redisOptions.tls = { ca: fs.readFileSync('cacert.pem') };
    console.log('Loaded local Redis TLS cert.');
  } catch (err) {
    console.warn('Local Redis TLS cert not found. Proceeding without TLS.', err);
  }
}

if (process.env.NODE_ENV === 'test') {
  console.warn('Skipping Redis connection in test environment.');
  module.exports = {
    on: () => {},
    get: async () => null,
    set: async () => {},
  };
  return;
}

const redis = new Redis(redisOptions);

redis.on('error', (err) => console.error('❌ Redis connection error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

module.exports = redis;
