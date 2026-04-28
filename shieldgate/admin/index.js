const http = require('http');
const express = require('express');
const cors = require('cors');

const setupWebSocket = require('./websocket');
const statsRouter = require('./routes/stats');
const bansRouter = require('./routes/bans');
const configRouter = require('./routes/config');
const whitelistRouter = require('./routes/whitelist');
const rulesRouter = require('./routes/rules');
const authRouter = require('./routes/auth');
const threatIntelRouter = require('./routes/threat-intel');
const { requireAuth, parseToken } = require('./auth/middleware');
const { verify } = require('./auth/jwt');
const auditLog = require('./utils/auditLog');
const logArchive = require('./utils/logArchive');

const PORT = Number(process.env.PORT || 8081);

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: (origin, cb) => cb(null, true),     // 同源部署时无 origin；如需限制改成白名单
  credentials: true,
}));
app.use(express.json({ limit: '64kb' }));

// /api/auth/me 需要在 requireAuth 之前回填 req.user
app.use((req, _res, next) => {
  const t = parseToken(req);
  if (t) {
    const p = verify(t);
    if (p) req.user = p;
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shieldgate-admin' }));

// 审计日志：在鉴权之后挂载，便于 req.user 已被回填时记录操作者；
// 仅写入后端日志文件（admin/utils/auditLog.js），不向前端暴露任何接口。
app.use(auditLog.middleware);

app.use('/api/auth', authRouter);

// 之后的所有 /api/* 都要登录 + CSRF 校验
app.use('/api', requireAuth);

app.use('/api/stats', statsRouter);
app.use('/api/bans', bansRouter);
app.use('/api/config', configRouter);
app.use('/api/whitelist', whitelistRouter);
app.use('/api/rules', rulesRouter);
app.use('/api/threat-intel', threatIntelRouter);

app.use((err, _req, res, _next) => {
  console.error('[admin] error:', err);
  res.status(500).json({ error: err.message || 'Internal Error' });
});

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[shieldgate] admin listening on :${PORT} (REST + WebSocket)`);
  logArchive.start();
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
