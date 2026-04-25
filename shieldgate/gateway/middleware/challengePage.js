const crypto = require('crypto');
const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const config = require('../config');
const ruleStats = require('../utils/ruleStats');

const COOKIE = 'sg_chal';
const TTL = 600; // pass token 有效 10 分钟

function makeToken(ip) {
  const salt = config.CHALLENGE_SECRET || 'shieldgate';
  return crypto
    .createHmac('sha256', salt)
    .update(ip + ':' + Math.floor(Date.now() / 1000 / 60))
    .digest('hex')
    .slice(0, 24);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((p) => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k] = v.join('=');
  });
  return out;
}

function challengeHTML(token) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Verifying…</title>
<style>body{font-family:system-ui;background:#0b0e14;color:#e6eaf2;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center}.spin{width:32px;height:32px;border:3px solid #1f2633;border-top-color:#4a9eff;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 16px}
@keyframes s{to{transform:rotate(360deg)}}</style></head>
<body><div class="box"><div class="spin"></div><div>正在验证浏览器…</div>
<div style="color:#6b7588;font-size:12px;margin-top:8px">ShieldGate · Challenge</div></div>
<script>
(function(){
  document.cookie="${COOKIE}=${token};path=/;max-age=${TTL};SameSite=Lax";
  setTimeout(function(){ location.reload(); }, 800);
})();
</script></body></html>`;
}

async function challengePage(req, res, next) {
  if (req.isWhitelisted) return next();
  if (!req.shouldChallenge) return next();

  const ip = getIP(req);
  const cookies = parseCookies(req);
  const presented = cookies[COOKIE];

  // 已通过挑战
  if (presented) {
    const ok = await redis.get(`chal:${ip}:${presented}`);
    if (ok) return next();
  }

  // 颁发新 token，写入 Redis 待 cookie 回带验证
  const token = makeToken(ip);
  await redis.setex(`chal:${ip}:${token}`, TTL, '1');
  ruleStats.bump('challenge');

  res.status(503).set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '1',
  });
  res.send(challengeHTML(token));
}

module.exports = challengePage;
