const router = require('express').Router();
const whitelist = require('../../gateway/utils/whitelist');

router.get('/', async (_req, res) => {
  const items = await whitelist.list();
  res.json(items);
});

router.post('/', async (req, res) => {
  const { spec } = req.body || {};
  if (!spec || typeof spec !== 'string') {
    return res.status(400).json({ error: 'spec is required (IP or CIDR)' });
  }
  await whitelist.add(spec.trim());
  res.json({ success: true, spec: spec.trim() });
});

router.delete('/:spec', async (req, res) => {
  await whitelist.remove(decodeURIComponent(req.params.spec));
  res.json({ success: true });
});

module.exports = router;
