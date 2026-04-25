const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = require('./config');
const stats = require('./utils/stats');
const getIP = require('./utils/getIP');

const blacklistCheck = require('./middleware/blacklistCheck');
const uaCheck = require('./middleware/uaCheck');
const connectionLimit = require('./middleware/connectionLimit');
const slowlorisDetect = require('./middleware/slowlorisDetect');
const rateLimiter = require('./middleware/rateLimiter');

const PORT = Number(process.env.PORT || 8080);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, _res, next) => {
  stats.record();
  req._startTime = Date.now();
  next();
});

app.use(blacklistCheck);
app.use(uaCheck);
app.use(connectionLimit);
app.use(slowlorisDetect);
app.use(rateLimiter);

app.get('/__shieldgate/health', (req, res) => {
  res.json({
    ok: true,
    ip: getIP(req),
    backend: config.BACKEND_URL,
    rules: {
      RATE_LIMIT: config.RATE_LIMIT,
      RATE_WINDOW_MS: config.RATE_WINDOW_MS,
      MAX_CONNECTIONS: config.MAX_CONNECTIONS,
      SLOWLORIS_TIMEOUT_MS: config.SLOWLORIS_TIMEOUT_MS,
    },
  });
});

const proxy = createProxyMiddleware({
  target: config.BACKEND_URL,
  changeOrigin: true,
  xfwd: true,
  ws: false,
  logLevel: 'warn',
  onError(err, _req, res) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Bad Gateway', detail: err.message }));
  },
});
app.use('/', proxy);

const server = app.listen(PORT, () => {
  console.log(`[shieldgate] gateway listening on :${PORT} → ${config.BACKEND_URL}`);
});

server.headersTimeout = Math.max(config.SLOWLORIS_TIMEOUT_MS + 5000, 30000);
server.requestTimeout = 0;

config.startAutoRefresh();

setInterval(() => stats.tick(), 1000);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
