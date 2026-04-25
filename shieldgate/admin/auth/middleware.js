const cookie = require('cookie');
const { verify } = require('./jwt');

const COOKIE_NAME = 'sg_token';

function parseToken(req) {
  // 1. Cookie 优先（HttpOnly，安全）
  const raw = req.headers.cookie || '';
  if (raw) {
    try {
      const c = cookie.parse(raw);
      if (c[COOKIE_NAME]) return c[COOKIE_NAME];
    } catch (_) {}
  }
  // 2. Authorization Bearer 兜底（API 客户端调用）
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// 公开端点（不要求登录）
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/me',          // GET：未登录时返回 null，前端用它判断登录态
]);

function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();

  const token = parseToken(req);
  const payload = token ? verify(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', code: 'AUTH_REQUIRED' });
  }
  req.user = payload;

  // CSRF 防护：所有非 GET 请求必须带 X-Requested-With（浏览器跨域时不会自动带）
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['x-requested-with'] !== 'ShieldGate-UI') {
      return res.status(403).json({ error: 'csrf check failed', code: 'CSRF' });
    }
  }
  next();
}

module.exports = { requireAuth, parseToken, COOKIE_NAME };
