const http = require('http');
const express = require('express');
const cors = require('cors');

const setupWebSocket = require('./websocket');
const statsRouter = require('./routes/stats');
const bansRouter = require('./routes/bans');
const configRouter = require('./routes/config');
const whitelistRouter = require('./routes/whitelist');
const rulesRouter = require('./routes/rules');

const PORT = Number(process.env.PORT || 8081);

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shieldgate-admin' }));

app.use('/api/stats', statsRouter);
app.use('/api/bans', bansRouter);
app.use('/api/config', configRouter);
app.use('/api/whitelist', whitelistRouter);
app.use('/api/rules', rulesRouter);

app.use((err, _req, res, _next) => {
  console.error('[admin] error:', err);
  res.status(500).json({ error: err.message || 'Internal Error' });
});

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[shieldgate] admin listening on :${PORT} (REST + WebSocket)`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
