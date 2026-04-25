// 极简 JWT（HS256）实现，避免引入 jsonwebtoken 依赖。
const crypto = require('crypto');

const SECRET = process.env.SG_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const EXPIRES_SEC = Number(process.env.SG_JWT_TTL || 8 * 3600);

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(input) {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(input.length + (4 - input.length % 4) % 4, '=');
  return Buffer.from(s, 'base64');
}

function sign(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + EXPIRES_SEC };
  const part = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(part).digest();
  return part + '.' + b64url(sig);
}

function verify(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest();
  let provided;
  try { provided = b64urlDecode(sig); } catch { return null; }
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(p).toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

module.exports = { sign, verify, EXPIRES_SEC };
