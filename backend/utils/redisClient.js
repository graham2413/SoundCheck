const Redis = require('ioredis');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  tls: isProd ? {} : { ca: fs.readFileSync('cacert.pem') },
});

redis.on('error', (err) => console.error('❌ Redis connection error:', err));
redis.on('connect', () => console.log('✅ Redis connected'));

module.exports = redis;
