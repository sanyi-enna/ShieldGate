const router = require('express').Router();
const ruleStats = require('../../gateway/utils/ruleStats');

router.get('/hits', async (_req, res) => {
  res.json(await ruleStats.snapshot());
});

router.post('/hits/reset', async (_req, res) => {
  await ruleStats.reset();
  res.json({ success: true });
});

module.exports = router;
