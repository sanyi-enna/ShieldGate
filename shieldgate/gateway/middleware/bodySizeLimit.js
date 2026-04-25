const getIP = require('../utils/getIP');
const config = require('../config');
const stats = require('../utils/stats');
const ruleStats = require('../utils/ruleStats');
const { banIP } = require('../utils/banIP');

function bodySizeLimit(req, res, next) {
  if (req.isWhitelisted) return next();

  const declared = Number(req.headers['content-length'] || 0);

  // —— 1. 静态拦截：Content-Length 超限直接拒 ——
  if (declared && declared > config.MAX_BODY_BYTES) {
    ruleStats.bump('bodySize');
    stats.recordBlocked({
      ip: getIP(req),
      type: 'BodySize',
      reason: `Content-Length ${declared} > ${config.MAX_BODY_BYTES}`,
      time: Date.now(),
    });
    return res.status(413).json({ error: 'Payload Too Large', limit: config.MAX_BODY_BYTES });
  }

  // —— 2. 动态拦截：接收过程中累计字节数超限即断开 + 封禁 ——
  let received = 0;
  const ip = getIP(req);
  const onData = (chunk) => {
    received += chunk.length;
    if (received > config.MAX_BODY_BYTES) {
      ruleStats.bump('bodySize');
      stats.recordBlocked({
        ip,
        type: 'BodySize (streaming)',
        reason: `received ${received} > ${config.MAX_BODY_BYTES}`,
        time: Date.now(),
      });
      banIP(ip, 'BodySize Abuse', config.BAN_TTL_FLOOD).catch(() => {});
      try {
        if (!res.headersSent) res.status(413).json({ error: 'Payload Too Large' });
        req.destroy();
      } catch (_) {}
    }
  };
  const cleanup = () => {
    req.removeListener('data', onData);
  };
  req.on('data', onData);
  req.on('end', cleanup);
  req.on('close', cleanup);
  req.on('error', cleanup);

  next();
}

module.exports = bodySizeLimit;
