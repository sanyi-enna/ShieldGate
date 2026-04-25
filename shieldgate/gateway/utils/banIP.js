const redis = require('./redis');
const stats = require('./stats');

// 递进式封禁时长（秒）：第 1 次按 baseTtl，第 2 次 ×2，第 3 次 ×6，第 4 次 ×12，封顶 24h
const ESCALATION = [1, 2, 6, 12, 24];
const MAX_TTL = 86400;

function escalate(baseTtl, level) {
  const factor = ESCALATION[Math.min(level, ESCALATION.length - 1)];
  return Math.min(baseTtl * factor, MAX_TTL);
}

async function banIP(ip, reason, baseTtl = 300) {
  const key = `ban:${ip}`;
  const levelKey = `ban:level:${ip}`;
  const existed = await redis.exists(key);

  if (existed) {
    // 已在封禁窗口内：续期 + hit++，不重复写 history
    await redis.expire(key, baseTtl);
    await redis.hincrby('ban:hits', ip, 1);
    return { banned: false, ttl: baseTtl };
  }

  // 取历史升级层级，递增
  const prevLevel = Number((await redis.get(levelKey)) || 0);
  const ttl = escalate(baseTtl, prevLevel);

  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.setex(key, ttl, reason);
  pipeline.set(levelKey, prevLevel + 1, 'EX', MAX_TTL); // 24h 内不重置层级
  pipeline.lpush(
    'ban:history',
    JSON.stringify({
      ip,
      reason,
      ttl,
      level: prevLevel + 1,
      time: now,
      expireAt: now + ttl * 1000,
    }),
  );
  pipeline.ltrim('ban:history', 0, 99);
  pipeline.hset('ban:hits', ip, 1);
  await pipeline.exec();

  stats.banned++;
  return { banned: true, ttl, level: prevLevel + 1 };
}

async function unbanIP(ip) {
  const pipeline = redis.pipeline();
  pipeline.del(`ban:${ip}`);
  pipeline.del(`ban:level:${ip}`);
  pipeline.hdel('ban:hits', ip);
  await pipeline.exec();
}

async function listBans(limit = 50) {
  const history = await redis.lrange('ban:history', 0, limit - 1);
  const items = await Promise.all(
    history.map(async (item) => {
      try {
        const parsed = JSON.parse(item);
        const [ttl, hits] = await Promise.all([
          redis.ttl(`ban:${parsed.ip}`),
          redis.hget('ban:hits', parsed.ip),
        ]);
        return { ...parsed, ttl, hits: Number(hits) || 0, active: ttl > 0 };
      } catch (_) {
        return null;
      }
    }),
  );
  return items.filter(Boolean);
}

module.exports = { banIP, unbanIP, listBans, escalate };
