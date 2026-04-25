const redis = require('./utils/redis');

const defaults = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://127.0.0.1:3000',

  RATE_LIMIT: 50,
  RATE_WINDOW_MS: 1000,

  MAX_CONNECTIONS: 20,

  SLOWLORIS_TIMEOUT_MS: 10000,

  BAN_TTL_FLOOD: 300,
  BAN_TTL_SLOWLORIS: 300,
  BAN_TTL_MANUAL: 3600,

  SUSPICIOUS_UA_RATE_FACTOR: 0.6,
  SUSPICIOUS_UA_CONN_FACTOR: 0.5,

  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  CONFIG_REFRESH_MS: 10000,
};

const numericKeys = [
  'RATE_LIMIT',
  'RATE_WINDOW_MS',
  'MAX_CONNECTIONS',
  'SLOWLORIS_TIMEOUT_MS',
  'BAN_TTL_FLOOD',
  'BAN_TTL_SLOWLORIS',
  'BAN_TTL_MANUAL',
];

const config = { ...defaults };

async function refreshFromRedis() {
  try {
    const keys = numericKeys.map((k) => `config:${k}`);
    const values = await redis.mget(keys);
    numericKeys.forEach((k, i) => {
      const v = values[i];
      if (v !== null && v !== undefined && !isNaN(Number(v))) {
        config[k] = Number(v);
      }
    });
  } catch (err) {
    console.error('[config] refresh failed:', err.message);
  }
}

async function setConfig(key, value) {
  if (!numericKeys.includes(key)) {
    throw new Error(`unknown config key: ${key}`);
  }
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error('value must be number');
  await redis.set(`config:${key}`, n);
  config[key] = n;
}

function startAutoRefresh() {
  refreshFromRedis();
  setInterval(refreshFromRedis, config.CONFIG_REFRESH_MS);
}

module.exports = config;
module.exports.refreshFromRedis = refreshFromRedis;
module.exports.setConfig = setConfig;
module.exports.startAutoRefresh = startAutoRefresh;
module.exports.numericKeys = numericKeys;
module.exports.defaults = defaults;
