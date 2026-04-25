// 用户存储：Redis Hash `auth:users`，密码 bcrypt 哈希。
// 故意不使用任何 SQL —— 从架构上消除 SQL 注入面。
const bcrypt = require('bcryptjs');
const redis = require('../../gateway/utils/redis');

const KEY = 'auth:users';

async function findUser(username) {
  const raw = await redis.hget(KEY, username);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function createUser(username, password, role = 'admin') {
  const hash = await bcrypt.hash(password, 10);
  const user = { username, hash, role, createdAt: Date.now() };
  await redis.hset(KEY, username, JSON.stringify(user));
  return user;
}

async function updatePassword(username, newPassword) {
  const u = await findUser(username);
  if (!u) throw new Error('user not found');
  u.hash = await bcrypt.hash(newPassword, 10);
  u.updatedAt = Date.now();
  await redis.hset(KEY, username, JSON.stringify(u));
}

async function verifyPassword(user, password) {
  if (!user || !user.hash) return false;
  return bcrypt.compare(password, user.hash);
}

async function ensureDefault() {
  const exists = await redis.hexists(KEY, 'admin');
  if (!exists) {
    const pwd = process.env.SG_DEFAULT_PASSWORD || 'shieldgate@2026';
    await createUser('admin', pwd, 'admin');
    console.log(`[auth] 初始账户已创建：admin / ${pwd}（首次登录后请立即修改密码）`);
  }
}

async function listUsers() {
  const all = await redis.hgetall(KEY);
  return Object.values(all).map((s) => {
    try {
      const u = JSON.parse(s);
      delete u.hash;
      return u;
    } catch { return null; }
  }).filter(Boolean);
}

module.exports = { findUser, createUser, updatePassword, verifyPassword, ensureDefault, listUsers };
