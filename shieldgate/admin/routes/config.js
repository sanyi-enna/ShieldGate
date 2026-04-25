const router = require('express').Router();
const config = require('../../gateway/config');
const { validateURL } = require('../auth/ssrfGuard');
const { sanitizePlainText } = require('../auth/validate');

router.get('/', async (_req, res) => {
  await config.refreshFromRedis();
  const view = {};
  for (const k of config.numericKeys) view[k] = config[k];
  for (const k of config.arrayKeys) view[k] = config[k];
  view.BACKEND_URL = config.BACKEND_URL;
  view.SUSPICIOUS_UA_RATE_FACTOR = config.SUSPICIOUS_UA_RATE_FACTOR;
  view.SUSPICIOUS_UA_CONN_FACTOR = config.SUSPICIOUS_UA_CONN_FACTOR;
  view.MAX_HEADERS_COUNT = config.MAX_HEADERS_COUNT;
  res.json(view);
});

router.put('/', async (req, res) => {
  const updates = req.body || {};
  const applied = {};
  const errors = [];

  const known = new Set([...config.numericKeys, ...config.arrayKeys]);
  for (const [key, value] of Object.entries(updates)) {
    if (!known.has(key)) {
      errors.push({ key, error: 'unknown key' });
      continue;
    }
    try {
      await config.setConfig(key, value);
      applied[key] = config[key];
    } catch (err) {
      errors.push({ key, error: err.message });
    }
  }

  res.json({
    success: errors.length === 0,
    applied,
    errors,
    message: '配置已更新，网关进程 10 秒内自动同步',
  });
});

router.post('/reset', async (_req, res) => {
  const redis = require('../../gateway/utils/redis');
  for (const k of config.numericKeys) {
    await redis.del(`config:${k}`);
    config[k] = config.defaults[k];
  }
  for (const k of config.arrayKeys) {
    await redis.del(`config:${k}`);
    config[k] = config.defaults[k];
  }
  res.json({ success: true });
});

// 受 SSRF 防护的后端地址更新：禁止解析到私有 IP（除 127.0.0.1，那是合法用例）
router.post('/backend-url', async (req, res) => {
  const url = sanitizePlainText(req.body?.url, 512);
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    await validateURL(url, { allowLoopback: true });
  } catch (e) {
    return res.status(400).json({ error: 'SSRF guard rejected: ' + e.message, code: 'SSRF_BLOCKED' });
  }
  const redis = require('../../gateway/utils/redis');
  await redis.set('config:BACKEND_URL', url);
  config.BACKEND_URL = url;
  res.json({ success: true, backendURL: url, message: '已更新（重启网关进程生效）' });
});

module.exports = router;
