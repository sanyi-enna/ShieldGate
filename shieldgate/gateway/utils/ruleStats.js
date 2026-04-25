const redis = require('./redis');

const HASH = 'rules:hits';
const RULES = [
  'whitelist',
  'blacklist',
  'ua',
  'connection',
  'slowloris',
  'bodySize',
  'rateLimit',
  'ccProtect',
  'geo',
  'challenge',
];

const local = Object.fromEntries(RULES.map((r) => [r, 0]));

function bump(rule, n = 1) {
  if (!(rule in local)) local[rule] = 0;
  local[rule] += n;
  redis.hincrby(HASH, rule, n).catch(() => {});
}

async function snapshot() {
  const map = await redis.hgetall(HASH);
  const out = {};
  for (const r of RULES) out[r] = Number(map[r] || 0);
  return out;
}

async function reset() {
  await redis.del(HASH);
  for (const r of RULES) local[r] = 0;
}

module.exports = { bump, snapshot, reset, RULES };
