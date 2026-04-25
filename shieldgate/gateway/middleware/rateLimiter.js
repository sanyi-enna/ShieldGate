const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const { evalLimit } = require('../utils/rateLimiterLua');
const config = require('../config');
const stats = require('../utils/stats');
const ruleStats = require('../utils/ruleStats');

function shortPath(req) {
  // 限流的路径维度：忽略 query string，截断过长 path 防止 key 爆炸
  const u = (req.url || '/').split('?')[0];
  return u.length > 64 ? u.slice(0, 64) : u;
}

async function rateLimiter(req, res, next) {
  if (req.isWhitelisted) return next();

  const ip = getIP(req);
  const now = Date.now();

  const ipKey = `rate:ip:${ip}`;
  const ipLimit = req.isSuspiciousUA
    ? Math.max(1, Math.floor(config.RATE_LIMIT * config.SUSPICIOUS_UA_RATE_FACTOR))
    : config.RATE_LIMIT;

  try {
    // —— 1. IP 维度限流 ——
    const ipCount = await evalLimit(redis, ipKey, now, config.RATE_WINDOW_MS, ipLimit, ipLimit * 4);
    if (ipCount > ipLimit) {
      ruleStats.bump('rateLimit');
      const result = await banIP(
        ip,
        req.isSuspiciousUA ? 'HTTP Flood (suspicious UA)' : 'HTTP Flood',
        config.BAN_TTL_FLOOD,
      );
      stats.recordBlocked({
        ip,
        type: req.isSuspiciousUA ? 'HTTP Flood (suspicious UA)' : 'HTTP Flood',
        reason: `${ipCount} req in ${config.RATE_WINDOW_MS}ms (limit=${ipLimit})${result.level ? ` · L${result.level}` : ''}`,
        time: Date.now(),
      });
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: result.ttl || config.BAN_TTL_FLOOD,
      });
    }

    // —— 2. CC 维度限流：同一 IP + 同一路径 ——
    const path = shortPath(req);
    const ccKey = `rate:cc:${ip}:${path}`;
    const ccLimit = config.CC_LIMIT;
    const ccCount = await evalLimit(redis, ccKey, now, config.CC_WINDOW_MS, ccLimit, ccLimit * 4);
    if (ccCount > ccLimit) {
      ruleStats.bump('ccProtect');
      const result = await banIP(ip, 'CC Attack', config.BAN_TTL_FLOOD);
      stats.recordBlocked({
        ip,
        type: 'CC Attack',
        reason: `${ccCount} hits on ${path} in ${config.CC_WINDOW_MS}ms (limit=${ccLimit})${result.level ? ` · L${result.level}` : ''}`,
        time: Date.now(),
      });
      return res.status(429).json({
        error: 'CC attack detected',
        retryAfter: result.ttl || config.BAN_TTL_FLOOD,
      });
    }

    // —— 3. 软阈值挑战：未达封禁但超过 70% 软上限的可疑 UA → 返回挑战页 ——
    if (req.isSuspiciousUA && ipCount > Math.floor(ipLimit * 0.7)) {
      req.shouldChallenge = true;
    }
  } catch (err) {
    console.error('[rateLimiter] redis error:', err.message);
  }

  next();
}

module.exports = rateLimiter;
