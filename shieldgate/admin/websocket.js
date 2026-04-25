const WebSocket = require('ws');
const Redis = require('ioredis');

const redis = require('../gateway/utils/redis');
const stats = require('../gateway/utils/stats');
const ruleStats = require('../gateway/utils/ruleStats');
const { parseToken } = require('./auth/middleware');
const { verify } = require('./auth/jwt');

const SUB_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function broadcast(wss, payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

async function buildSnapshotPayload() {
  const [snapStr, banHistory, rules] = await Promise.all([
    redis.get(stats.SNAPSHOT_KEY),
    redis.lrange('ban:history', 0, 19),
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

function setupWebSocket(server) {
  // 在 upgrade 阶段校验 cookie / Authorization 中的 JWT，未通过直接 401 关闭
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws' && !req.url?.startsWith('/ws?')) {
      socket.destroy();
      return;
    }
    const token = parseToken(req);
    const payload = token ? verify(token) : null;
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = payload;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws) => {
    try {
      const initial = await buildSnapshotPayload();
      ws.send(JSON.stringify(initial));
    } catch (_) {}
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
