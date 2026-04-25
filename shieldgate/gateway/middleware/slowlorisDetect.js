const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const config = require('../config');
const stats = require('../utils/stats');

function slowlorisDetect(req, _res, next) {
  const ip = getIP(req);

  const timer = setTimeout(async () => {
    try {
      await banIP(ip, 'Slowloris', config.BAN_TTL_SLOWLORIS);
      stats.recordBlocked({
        ip,
        type: 'Slowloris',
        reason: `header timeout > ${config.SLOWLORIS_TIMEOUT_MS}ms`,
        time: Date.now(),
      });
      try {
        req.destroy();
      } catch (_) {}
    } catch (err) {
      console.error('[slowloris] ban failed:', err.message);
    }
  }, config.SLOWLORIS_TIMEOUT_MS);

  const clear = () => clearTimeout(timer);
  req.on('end', clear);
  req.on('close', clear);
  req.on('error', clear);

  next();
}

module.exports = slowlorisDetect;
