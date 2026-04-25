const getIP = require('../utils/getIP');
const config = require('../config');
const stats = require('../utils/stats');

const connections = new Map();

function connectionLimit(req, res, next) {
  const ip = getIP(req);

  const limit = req.isSuspiciousUA
    ? Math.max(1, Math.floor(config.MAX_CONNECTIONS * config.SUSPICIOUS_UA_CONN_FACTOR))
    : config.MAX_CONNECTIONS;

  const count = connections.get(ip) || 0;

  if (count >= limit) {
    stats.recordBlocked({
      ip,
      type: 'ConnectionLimit',
      reason: `concurrent>${limit}`,
      time: Date.now(),
    });
    return res.status(429).json({ error: 'Too many concurrent connections', limit });
  }

  connections.set(ip, count + 1);

  const release = () => {
    const current = connections.get(ip);
    if (current === undefined) return;
    if (current <= 1) connections.delete(ip);
    else connections.set(ip, current - 1);
  };

  res.on('finish', release);
  res.on('close', release);

  next();
}

connectionLimit._connections = connections;
module.exports = connectionLimit;
