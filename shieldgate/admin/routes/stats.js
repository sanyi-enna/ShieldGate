const router = require('express').Router();
const redis = require('../../gateway/utils/redis');
const stats = require('../../gateway/utils/stats');

router.get('/', async (_req, res) => {
  const raw = await redis.get(stats.SNAPSHOT_KEY);
  if (!raw) {
    return res.json({
      total: 0,
      blocked: 0,
      banned: 0,
      currentRPS: 0,
      history: [],
      blockedHistory: [],
      recentAttacks: [],
    });
  }
  try {
    res.json(JSON.parse(raw));
  } catch (_) {
    res.json({});
  }
});

router.get('/attacks', async (_req, res) => {
  const log = await redis.lrange(stats.ATTACK_LOG, 0, 99);
  const items = log
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  res.json(items);
});

module.exports = router;
