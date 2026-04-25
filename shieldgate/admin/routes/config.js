const router = require('express').Router();
const config = require('../../gateway/config');

router.get('/', async (_req, res) => {
  await config.refreshFromRedis();
  const view = {};
  for (const k of config.numericKeys) view[k] = config[k];
  view.BACKEND_URL = config.BACKEND_URL;
  view.SUSPICIOUS_UA_RATE_FACTOR = config.SUSPICIOUS_UA_RATE_FACTOR;
  view.SUSPICIOUS_UA_CONN_FACTOR = config.SUSPICIOUS_UA_CONN_FACTOR;
  res.json(view);
});

router.put('/', async (req, res) => {
  const updates = req.body || {};
  const applied = {};
  const errors = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!config.numericKeys.includes(key)) {
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
  res.json({ success: true });
});

module.exports = router;
