const router = require('express').Router();
const { findUser, verifyPassword, ensureDefault, updatePassword, listUsers } = require('../auth/users');
const { sign, EXPIRES_SEC } = require('../auth/jwt');
const { COOKIE_NAME } = require('../auth/middleware');
const { checkLocks, recordFailure, clearFailures } = require('../auth/loginGuard');
const { validateUsername, validatePassword, isSafe } = require('../auth/validate');
const getIP = require('../../gateway/utils/getIP');

ensureDefault().catch((e) => console.error('[auth] ensureDefault failed:', e.message));

function setCookie(res, token) {
  // HttpOnly：JS 读不到 → 防 XSS 偷 token
  // SameSite=Lax：阻断绝大多数 CSRF
  // Secure：上线 HTTPS 后开启（这里通过 NODE_ENV 自动判断）
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${EXPIRES_SEC}${secure}`,
  );
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function sleep(ms) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

router.post('/login', async (req, res) => {
  const ip = getIP(req);
  const body = req.body || {};

  // —— 1. 输入校验（拒绝典型 SQLi 字符 + 长度限制）——
  let username, password;
  try {
    username = validateUsername(body.username);
    password = validatePassword(body.password);
  } catch (e) {
    return res.status(400).json({ error: e.message, code: 'INVALID_INPUT' });
  }

  // —— 2. 锁定检查（防暴力枚举）——
  const lock = await checkLocks(username, ip);
  if (lock.locked) {
    return res.status(429).json({
      error: lock.scope === 'user' ? '账户已临时锁定，请稍后再试' : 'IP 已被风控锁定',
      code: 'LOCKED',
      retryAfter: lock.ttl,
    });
  }

  // —— 3. 查用户 + 验证密码（恒定时间比较由 bcrypt 内部完成）——
  const user = await findUser(username);
  const ok = user && (await verifyPassword(user, password));
  if (!ok) {
    const { userFails, ipFails, slowDownMs } = await recordFailure(username, ip);
    // 故意延迟，让爆破速率不可控
    await sleep(slowDownMs);
    return res.status(401).json({
      error: '用户名或密码错误',
      code: 'BAD_CREDENTIALS',
      // 不区分「用户不存在」与「密码错误」，避免用户名枚举
      attemptsLeft: Math.max(0, 5 - userFails),
    });
  }

  // —— 4. 成功：清空失败计数，签发 JWT 写入 HttpOnly Cookie ——
  await clearFailures(username, ip);
  const token = sign({ sub: username, role: user.role });
  setCookie(res, token);
  res.json({ success: true, user: { username, role: user.role }, expiresIn: EXPIRES_SEC });
});

router.post('/logout', (_req, res) => {
  clearCookie(res);
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (req.user) {
    return res.json({ authenticated: true, user: req.user });
  }
  // 未登录：返回 200，避免前端误把网络错误当登录态
  res.json({ authenticated: false });
});

router.post('/change-password', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const { oldPassword, newPassword } = req.body || {};
  let oldP, newP;
  try {
    oldP = validatePassword(oldPassword);
    newP = validatePassword(newPassword);
  } catch (e) { return res.status(400).json({ error: e.message }); }

  const user = await findUser(req.user.sub);
  const ok = await verifyPassword(user, oldP);
  if (!ok) return res.status(401).json({ error: '原密码错误' });
  if (oldP === newP) return res.status(400).json({ error: '新密码不能与旧密码相同' });
  await updatePassword(req.user.sub, newP);
  res.json({ success: true });
});

router.get('/users', async (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  res.json(await listUsers());
});

module.exports = router;
