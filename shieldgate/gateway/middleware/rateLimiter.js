const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const config = require('../config');
const stats = require('../utils/stats');

async function rateLimiter(req, res, next) {
  const ip = getIP(req);
  const now = Date.now();
  const key = `rate:${ip}`;

  const limit = req.isSuspiciousUA
    ? Math.max(1, Math.floor(config.RATE_LIMIT * config.SUSPICIOUS_UA_RATE_FACTOR))
    : config.RATE_LIMIT;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, now - config.RATE_WINDOW_MS);
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(config.RATE_WINDOW_MS / 1000) + 1);

    const results = await pipeline.exec();
    const count = results[2][1];

    if (count > limit) {
      await banIP(ip, 'HTTP Flood', config.BAN_TTL_FLOOD);
      stats.recordBlocked({
        ip,
        type: req.isSuspiciousUA ? 'HTTP Flood (suspicious UA)' : 'HTTP Flood',
        reason: `${count} req in ${config.RATE_WINDOW_MS}ms (limit=${limit})`,
        time: Date.now(),
      });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: config.BAN_TTL_FLOOD,
      });
    }
  } catch (err) {
    console.error('[rateLimiter] redis error:', err.message);
  }

  next();
}

module.exports = rateLimiter;
