const getIP = require('../utils/getIP');
const whitelist = require('../utils/whitelist');

async function whitelistCheck(req, _res, next) {
  const ip = getIP(req);
  try {
    const matched = await whitelist.isWhitelisted(ip);
    if (matched) {
      req.isWhitelisted = true;
      req.whitelistRule = matched;
    }
  } catch (_) {}
  next();
}

module.exports = whitelistCheck;
