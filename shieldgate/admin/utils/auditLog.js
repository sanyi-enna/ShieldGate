const fs = require('fs');
const path = require('path');
const getIP = require('../../gateway/utils/getIP');

const LOG_DIR = process.env.AUDIT_LOG_DIR
  || path.resolve(__dirname, '../../logs');

let currentDate = '';
let currentStream = null;

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStream() {
  const date = todayStr();
  if (date !== currentDate || !currentStream) {
    if (currentStream) {
      try { currentStream.end(); } catch (_) {}
    }
    ensureDir();
    currentDate = date;
    currentStream = fs.createWriteStream(
      path.join(LOG_DIR, `audit-${date}.log`),
      { flags: 'a' },
    );
    currentStream.on('error', (err) => {
      console.error('[audit] log stream error:', err.message);
    });
  }
  return currentStream;
}

function write(entry) {
  try {
    const line = JSON.stringify(entry) + '\n';
    getStream().write(line);
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

// 路径 → 操作语义的映射，便于阅读日志
const ACTION_MAP = [
  { method: 'POST',   re: /^\/api\/auth\/login$/,            action: 'auth.login' },
  { method: 'POST',   re: /^\/api\/auth\/logout$/,           action: 'auth.logout' },
  { method: 'POST',   re: /^\/api\/auth\/change-password$/,  action: 'auth.change_password' },
  { method: 'GET',    re: /^\/api\/auth\/me$/,               action: 'auth.me',           skip: true },
  { method: 'GET',    re: /^\/api\/auth\/users$/,            action: 'auth.list_users' },
  { method: 'GET',    re: /^\/api\/stats/,                   action: 'stats.read',        skip: true },
  { method: 'GET',    re: /^\/api\/bans/,                    action: 'bans.list' },
  { method: 'POST',   re: /^\/api\/bans$/,                   action: 'bans.create' },
  { method: 'DELETE', re: /^\/api\/bans\//,                  action: 'bans.delete' },
  { method: 'GET',    re: /^\/api\/config/,                  action: 'config.read' },
  { method: 'PUT',    re: /^\/api\/config$/,                 action: 'config.update' },
  { method: 'POST',   re: /^\/api\/config\/reset$/,          action: 'config.reset' },
  { method: 'POST',   re: /^\/api\/config\/backend-url$/,    action: 'config.update_backend' },
  { method: 'GET',    re: /^\/api\/whitelist/,               action: 'whitelist.list' },
  { method: 'POST',   re: /^\/api\/whitelist$/,              action: 'whitelist.add' },
  { method: 'DELETE', re: /^\/api\/whitelist\//,             action: 'whitelist.remove' },
  { method: 'GET',    re: /^\/api\/rules\/hits$/,            action: 'rules.read' },
  { method: 'POST',   re: /^\/api\/rules\/hits\/reset$/,     action: 'rules.reset' },
  { method: 'GET',    re: /^\/api\/threat-intel/,            action: 'threat_intel.read', skip: true },
];

function resolveAction(method, urlPath) {
  for (const m of ACTION_MAP) {
    if (m.method === method && m.re.test(urlPath)) return m;
  }
  return null;
}

// 默认对高频只读接口（stats/me/threat-intel）跳过日志，避免被监控大屏的轮询淹没
function middleware(req, res, next) {
  if (req.path === '/api/health') return next();

  const matched = resolveAction(req.method, req.path);
  if (matched && matched.skip) return next();

  const ip = getIP(req);
  const start = Date.now();

  res.on('finish', () => {
    const action = matched ? matched.action : `${req.method.toLowerCase()}:${req.path}`;
    const user = req.user ? req.user.sub : null;
    write({
      time: new Date().toISOString(),
      ip,
      user,
      action,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ua: req.headers['user-agent'] || '',
    });
  });

  next();
}

// 显式审计事件（登录成功/失败等结构化事件，单独打点）
function event(type, req, extra = {}) {
  write({
    time: new Date().toISOString(),
    ip: req ? getIP(req) : null,
    user: extra.user || (req && req.user ? req.user.sub : null),
    action: type,
    ...extra,
    ua: req ? (req.headers['user-agent'] || '') : '',
  });
}

module.exports = { middleware, event, write };
