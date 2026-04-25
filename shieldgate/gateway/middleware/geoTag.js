const getIP = require('../utils/getIP');
const config = require('../config');
const ruleStats = require('../utils/ruleStats');

let geoip = null;
try {
  // geoip-lite 可选依赖，缺失时模块降级为 no-op
  geoip = require('geoip-lite');
} catch (_) {
  geoip = null;
}

function geoTag(req, _res, next) {
  if (!geoip) return next();
  const ip = getIP(req);
  try {
    const lookup = geoip.lookup(ip);
    if (lookup) {
      req.geo = {
        country: lookup.country,
        region: lookup.region,
        timezone: lookup.timezone,
      };
      const blocked = (config.GEO_BLOCK || []).map((s) => String(s).toUpperCase());
      const watch = (config.GEO_WATCH || []).map((s) => String(s).toUpperCase());

      if (blocked.includes(lookup.country)) {
        req.isGeoBlocked = true;
      } else if (watch.includes(lookup.country)) {
        req.isGeoWatched = true;
      }
      ruleStats.bump('geo', 0); // 仅注册 key
    }
  } catch (_) {}
  next();
}

module.exports = geoTag;
