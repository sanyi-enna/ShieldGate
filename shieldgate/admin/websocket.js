const WebSocket = require('ws');
const Redis = require('ioredis');

const redis = require('../gateway/utils/redis');
const stats = require('../gateway/utils/stats');
const ruleStats = require('../gateway/utils/ruleStats');
const { parseToken } = require('./auth/middleware');
const { verify } = require('./auth/jwt');

const SUB_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// —— 安全策略 ——
// 允许的 Origin。逗号分隔；为空表示"仅同源"（只放行 Origin === Host）。
const ALLOWED_ORIGINS = String(process.env.SG_WS_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
// 单 IP 最大并发连接数
const MAX_CONNS_PER_IP = Number(process.env.SG_WS_MAX_CONNS_PER_IP || 8);
// 入站帧最大字节
const MAX_PAYLOAD = 4 * 1024;
// 心跳周期
const HEARTBEAT_MS = 30 * 1000;
// JWT 过期复检周期
const REVERIFY_MS = 60 * 1000;

const connsPerIp = new Map(); // ip -> count

function getClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || 'unknown';
}

function isLoopbackHost(h) {
  if (!h) return false;
  const hostname = h.replace(/^\[/, '').split(']')[0].split(':')[0].toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function originAllowed(req) {
  const origin = req.headers.origin;
  // 没有 Origin 头通常是非浏览器客户端（curl / 服务端探测）— 一律拒绝以收紧攻击面
  if (!origin) return false;
  let originHost;
  try { originHost = new URL(origin).host; } catch { return false; }
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.some((o) => {
    try { return new URL(o).host === originHost; } catch { return o === originHost; }
  });
  // 同源放行
  if (originHost === req.headers.host) return true;
  // 开发场景：Vite 代理会把 Host 改成 127.0.0.1:8081，但浏览器 Origin 仍是 localhost:5173
  // 只要双方都是回环地址就放行（生产中不会同时走回环）
  if (isLoopbackHost(originHost) && isLoopbackHost(req.headers.host)) return true;
  return false;
}

function broadcast(wss, payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

async function buildSnapshotPayload() {
  const [snapStr, banHistory, rules] = await Promise.all([
    redis.get(stats.SNAPSHOT_KEY),
    redis.lrange('ban:history', 0, 99),
    ruleStats.snapshot(),
  ]);

  const snapshot = snapStr ? safeParse(snapStr) : emptySnapshot();
  const recentBans = banHistory.map(safeParse).filter(Boolean);

  return {
    type: 'stats',
    data: { ...snapshot, recentBans, ruleHits: rules },
  };
}

function emptySnapshot() {
  return {
    total: 0,
    blocked: 0,
    banned: 0,
    currentRPS: 0,
    currentBlockedRPS: 0,
    history: new Array(60).fill(0),
    blockedHistory: new Array(60).fill(0),
    recentAttacks: [],
    ts: Date.now(),
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return null; }
}

function rejectUpgrade(socket, code, reason) {
  socket.write(`HTTP/1.1 ${code} ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function setupWebSocket(server) {
  // 在 upgrade 阶段校验：路径 / Origin / JWT / 单 IP 连接数；任一失败立即关闭
  const wss = new WebSocket.Server({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', (req, socket, head) => {
    const ip = getClientIp(req);

    if (req.url !== '/ws' && !req.url?.startsWith('/ws?')) {
      return rejectUpgrade(socket, 404, 'Not Found');
    }
    if (!originAllowed(req)) {
      console.warn(`[ws] reject bad origin ip=${ip} origin=${req.headers.origin || '-'} host=${req.headers.host || '-'}`);
      return rejectUpgrade(socket, 403, 'Forbidden');
    }
    const token = parseToken(req);
    const payload = token ? verify(token) : null;
    if (!payload) {
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }
    const cur = connsPerIp.get(ip) || 0;
    if (cur >= MAX_CONNS_PER_IP) {
      console.warn(`[ws] reject too-many-conns ip=${ip} cur=${cur}`);
      return rejectUpgrade(socket, 429, 'Too Many Requests');
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = payload;
      ws.ip = ip;
      ws.connectedAt = Date.now();
      ws.isAlive = true;
      connsPerIp.set(ip, cur + 1);
      console.log(`[ws] connect user=${payload.sub || payload.username || '?'} ip=${ip} conns=${cur + 1}`);
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws) => {
    // 读-only：忽略一切入站消息（仅响应 pong）
    ws.on('message', () => { /* noop, server doesn't accept input */ });
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      const left = (connsPerIp.get(ws.ip) || 1) - 1;
      if (left <= 0) connsPerIp.delete(ws.ip); else connsPerIp.set(ws.ip, left);
      console.log(`[ws] close user=${ws.user?.sub || '?'} ip=${ws.ip} dur=${Math.floor((Date.now() - ws.connectedAt) / 1000)}s`);
    });

    try {
      const initial = await buildSnapshotPayload();
      ws.send(JSON.stringify(initial));
    } catch (_) {}
  });

  // 心跳：每 30s ping，未响应则 terminate
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {}
    });
  }, HEARTBEAT_MS);

  // JWT 过期复检：每 60s 扫描一次，过期的连接断开
  const reverify = setInterval(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    wss.clients.forEach((ws) => {
      const exp = ws.user?.exp;
      if (typeof exp === 'number' && exp < nowSec) {
        console.log(`[ws] token expired user=${ws.user?.sub || '?'} ip=${ws.ip}`);
        try { ws.close(4401, 'token expired'); } catch (_) { ws.terminate(); }
      }
    });
  }, REVERIFY_MS);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(reverify);
  });

  setInterval(async () => {
    try {
      if (wss.clients.size === 0) return;
      const payload = await buildSnapshotPayload();
      broadcast(wss, payload);
    } catch (err) {
      console.error('[ws] tick error:', err.message);
    }
  }, 1000);

  const subscriber = new Redis(SUB_URL);
  subscriber.subscribe(stats.ATTACK_CHANNEL).catch((err) =>
    console.error('[ws] subscribe error:', err.message),
  );
  subscriber.on('message', (_channel, message) => {
    const data = safeParse(message);
    if (!data) return;
    broadcast(wss, { type: 'attack', data });
  });

  return wss;
}

module.exports = setupWebSocket;
