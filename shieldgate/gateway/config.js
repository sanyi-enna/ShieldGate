const redis = require('./utils/redis');

const defaults = {
  BACKEND_URL: process.env.BACKEND_URL || 'http://127.0.0.1:3000',

  // 滑动窗口限流（IP 维度）
  RATE_LIMIT: 50,
  RATE_WINDOW_MS: 1000,

  // CC 攻击防护（IP + path 维度）
  CC_LIMIT: 20,
  CC_WINDOW_MS: 1000,

  // 并发连接
  MAX_CONNECTIONS: 20,

  // Slowloris 检测
  SLOWLORIS_TIMEOUT_MS: 10000,

  // 大 body 防护
  MAX_BODY_BYTES: 1024 * 1024, // 1 MB

  // Header 限制（在 server 启动时透传）
  MAX_HEADERS_COUNT: 60,
  MAX_HEADER_SIZE_KB: 16,

  // 封禁基础时长（最终时长由递进表放大）
  BAN_TTL_FLOOD: 300,
  BAN_TTL_SLOWLORIS: 300,
  BAN_TTL_MANUAL: 3600,

  // 可疑 UA 阈值因子
  SUSPICIOUS_UA_RATE_FACTOR: 0.6,
  SUSPICIOUS_UA_CONN_FACTOR: 0.5,

  // GeoIP 国家代码
  GEO_BLOCK: [],   // 例：['KP'] 表示直接拦截朝鲜
  GEO_WATCH: [],   // 例：['RU','IR'] 仅打标签，限流阈值降低

  // 挑战页 token 签名密钥（生产应在环境变量里设置）
  CHALLENGE_SECRET: process.env.CHALLENGE_SECRET || 'shieldgate-default',

  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  CONFIG_REFRESH_MS: 10000,
};

const numericKeys = [
  'RATE_LIMIT',
  'RATE_WINDOW_MS',
  'CC_LIMIT',
  'CC_WINDOW_MS',
  'MAX_CONNECTIONS',
  'SLOWLORIS_TIMEOUT_MS',
  'MAX_BODY_BYTES',
  'BAN_TTL_FLOOD',
  'BAN_TTL_SLOWLORIS',
  'BAN_TTL_MANUAL',
];

const arrayKeys = ['GEO_BLOCK', 'GEO_WATCH'];

const config = { ...defaults };

async function refreshFromRedis() {
  try {
    const numKeys = numericKeys.map((k) => `config:${k}`);
    const numVals = await redis.mget(numKeys);
    numericKeys.forEach((k, i) => {
      const v = numVals[i];
      if (v !== null && v !== undefined && !isNaN(Number(v))) {
        config[k] = Number(v);
      }
    });

    for (const k of arrayKeys) {
      const v = await redis.get(`config:${k}`);
      if (v) {
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr)) config[k] = arr;
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[config] refresh failed:', err.message);
  }
}

async function setConfig(key, value) {
  if (numericKeys.includes(key)) {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error('value must be number');
    await redis.set(`config:${key}`, n);
    config[key] = n;
    return;
  }
  if (arrayKeys.includes(key)) {
    if (!Array.isArray(value)) throw new Error('value must be array');
    await redis.set(`config:${key}`, JSON.stringify(value));
    config[key] = value;
    return;
  }
  throw new Error(`unknown config key: ${key}`);
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
module.exports.arrayKeys = arrayKeys;
module.exports.defaults = defaults;
