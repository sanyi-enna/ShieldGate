const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const stats = require('../utils/stats');

async function blacklistCheck(req, res, next) {
  const ip = getIP(req);
  try {
    const reason = await redis.get(`ban:${ip}`);
    if (reason) {
      const ttl = await redis.ttl(`ban:${ip}`);
      stats.recordBlocked({ ip, type: 'Blacklist', reason, time: Date.now() });
      return res.status(403).json({
        error: 'Forbidden',
        reason,
        retryAfter: ttl,
      });
    }
  } catch (err) {
    console.error('[blacklistCheck] redis error:', err.message);
  }
  next();
}

module.exports = blacklistCheck;
