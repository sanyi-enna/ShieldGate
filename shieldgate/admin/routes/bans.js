const router = require('express').Router();
const { banIP, unbanIP, listBans } = require('../../gateway/utils/banIP');
const config = require('../../gateway/config');

router.get('/', async (_req, res) => {
  const bans = await listBans(50);
  res.json(bans);
});

router.post('/', async (req, res) => {
  const { ip, reason = '手动封禁', ttl } = req.body || {};
  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({ error: 'ip is required' });
  }
  const finalTtl = Number(ttl) || config.BAN_TTL_MANUAL;
  await banIP(ip, reason, finalTtl);
  res.json({ success: true, ip, reason, ttl: finalTtl });
});

router.delete('/:ip', async (req, res) => {
  await unbanIP(req.params.ip);
  res.json({ success: true, ip: req.params.ip });
});

module.exports = router;
