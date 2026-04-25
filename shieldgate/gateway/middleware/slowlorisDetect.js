const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const config = require('../config');
const stats = require('../utils/stats');
const ruleStats = require('../utils/ruleStats');

// Slowloris：连接已建立但请求头/请求体迟迟收不完。
// 这里在请求进入中间件前，已经收完一次完整请求头（Express 的 req 此时可读），
// 但请求体可能仍在持续到来；我们对 body 接收阶段也加超时，覆盖 RUDY 变种。
function slowlorisDetect(req, _res, next) {
  if (req.isWhitelisted) return next();

  const ip = getIP(req);
  const socket = req.socket;
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  let triggered = false;
  const trigger = async (kind) => {
    if (triggered) return;
    triggered = true;
    try {
      const result = await banIP(ip, 'Slowloris', config.BAN_TTL_SLOWLORIS);
      ruleStats.bump('slowloris');
      stats.recordBlocked({
        ip,
        type: 'Slowloris',
        reason: `${kind} timeout > ${config.SLOWLORIS_TIMEOUT_MS}ms${result.level ? ` · L${result.level}` : ''}`,
        time: Date.now(),
      });
    } catch (_) {}
    try { req.destroy(); } catch (_) {}
    try { socket?.destroy(); } catch (_) {}
  };

  // —— socket 级超时：covers idle 客户端不发任何字节 ——
  if (socket && !socket._sgTimeoutBound) {
    socket._sgTimeoutBound = true;
    socket.setTimeout(config.SLOWLORIS_TIMEOUT_MS, () => trigger('socket'));
  }

  // —— body 接收超时：每次新数据到来重置计时器 ——
  if (hasBody) {
    let timer = setTimeout(() => trigger('body'), config.SLOWLORIS_TIMEOUT_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => trigger('body'), config.SLOWLORIS_TIMEOUT_MS);
    };
    const stop = () => clearTimeout(timer);
    req.on('data', reset);
    req.on('end', stop);
    req.on('close', stop);
    req.on('error', stop);
  }

  next();
}

module.exports = slowlorisDetect;
