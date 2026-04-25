const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const stats = require('../utils/stats');
const ruleStats = require('../utils/ruleStats');

async function blacklistCheck(req, res, next) {
  if (req.isWhitelisted) return next();
  const ip = getIP(req);
  try {
    const reason = await redis.get(`ban:${ip}`);
    if (reason) {
      const ttl = await redis.ttl(`ban:${ip}`);
      ruleStats.bump('blacklist');
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
