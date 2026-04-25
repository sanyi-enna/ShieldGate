// 防暴力枚举：
//  - 用户名维度：10 分钟内累计失败 5 次 → 锁 15 分钟
//  - IP 维度：10 分钟内累计失败 20 次 → 锁定 + 调用 ShieldGate banIP（攻击 IP 进入正常封禁链）
//  - 失败次数 ≥4 时引入递增延迟（500ms / 次，封顶 2s），拖慢自动化爆破
const redis = require('../../gateway/utils/redis');
const { banIP } = require('../../gateway/utils/banIP');

const FAIL = (k) => `auth:fail:${k}`;
const LOCK = (k) => `auth:lock:${k}`;

const WINDOW_SEC = 600;
const MAX_FAILS_USER = 5;
const MAX_FAILS_IP = 20;
const LOCK_SEC = 900;
const SLOW_DOWN_AFTER = 3;

async function isLocked(key) {
  return Boolean(await redis.exists(LOCK(key)));
}

async function checkLocks(username, ip) {
  const [u, i] = await Promise.all([
    isLocked('user:' + username),
    isLocked('ip:' + ip),
  ]);
  if (u) return { locked: true, scope: 'user', ttl: await redis.ttl(LOCK('user:' + username)) };
  if (i) return { locked: true, scope: 'ip',   ttl: await redis.ttl(LOCK('ip:' + ip)) };
  return { locked: false };
}

async function recordFailure(username, ip) {
  const userKey = FAIL('user:' + username);
  const ipKey = FAIL('ip:' + ip);
  const tx = redis.pipeline();
  tx.incr(userKey).expire(userKey, WINDOW_SEC);
  tx.incr(ipKey).expire(ipKey, WINDOW_SEC);
  const r = await tx.exec();
  const userFails = r[0][1];
  const ipFails = r[2][1];

  if (userFails >= MAX_FAILS_USER) {
    await redis.setex(LOCK('user:' + username), LOCK_SEC, '1');
  }
  if (ipFails >= MAX_FAILS_IP) {
    await redis.setex(LOCK('ip:' + ip), LOCK_SEC, '1');
    banIP(ip, 'Brute Force Login', 1800).catch(() => {});
  }

  const slowDownMs = userFails > SLOW_DOWN_AFTER
    ? Math.min(2000, (userFails - SLOW_DOWN_AFTER) * 500)
    : 0;

  return { userFails, ipFails, slowDownMs };
}

async function clearFailures(username, ip) {
  await redis.del(FAIL('user:' + username), FAIL('ip:' + ip));
}

async function currentDelay(username) {
  const n = Number(await redis.get(FAIL('user:' + username))) || 0;
  return n > SLOW_DOWN_AFTER ? Math.min(2000, (n - SLOW_DOWN_AFTER) * 500) : 0;
}

module.exports = { checkLocks, recordFailure, clearFailures, currentDelay };
