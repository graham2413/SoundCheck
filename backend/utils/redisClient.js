const Redis = require('ioredis');
const fs = require('fs');

const isLocal = process.env.NODE_ENV === 'development'; // or use !isProd if clearer

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
};

//  Only use TLS with cert locally
if (isLocal) {
  try {
    redisOptions.tls = { ca: fs.readFileSync('cacert.pem') };
    console.log('🔐 Loaded local Redis TLS cert.');
  } catch (err) {
    console.warn('⚠️ Local Redis TLS cert not found. Proceeding without TLS.', err);
  }
}

const redis = new Redis(redisOptions);

redis.on('error', (err) => console.error('❌ Redis connection error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

module.exports = redis;
