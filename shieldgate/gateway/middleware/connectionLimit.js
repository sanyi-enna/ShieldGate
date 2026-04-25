const getIP = require('../utils/getIP');
const config = require('../config');
const stats = require('../utils/stats');
const ruleStats = require('../utils/ruleStats');

// 内存计数器；同步操作避免高并发竞态。多实例部署时需迁移到 Redis（参考文档 10.2）。
const connections = new Map();

function getCount(ip) {
  return connections.get(ip) || 0;
}

function inc(ip) {
  connections.set(ip, getCount(ip) + 1);
}

function dec(ip) {
  const c = getCount(ip);
  if (c <= 1) connections.delete(ip);
  else connections.set(ip, c - 1);
}

function connectionLimit(req, res, next) {
  if (req.isWhitelisted) return next();

  const ip = getIP(req);
  const limit = req.isSuspiciousUA
    ? Math.max(1, Math.floor(config.MAX_CONNECTIONS * config.SUSPICIOUS_UA_CONN_FACTOR))
    : config.MAX_CONNECTIONS;

  const count = getCount(ip);
  if (count >= limit) {
    ruleStats.bump('connection');
    stats.recordBlocked({
      ip,
      type: 'ConnectionLimit',
      reason: `concurrent ${count} >= ${limit}`,
      time: Date.now(),
    });
    return res.status(429).json({ error: 'Too many concurrent connections', limit });
  }

  inc(ip);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    dec(ip);
  };

  res.on('finish', release);
  res.on('close', release);
  req.on('aborted', release);

  next();
}

connectionLimit._connections = connections;
module.exports = connectionLimit;
