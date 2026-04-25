const Redis = require('ioredis');

const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redis = new Redis(url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => console.log(`[redis] connected ${url}`));
redis.on('error', (err) => console.error('[redis] error:', err.message));

module.exports = redis;
