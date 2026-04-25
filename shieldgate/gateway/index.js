const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = require('./config');
const stats = require('./utils/stats');
const ruleStats = require('./utils/ruleStats');
const getIP = require('./utils/getIP');
const { banIP } = require('./utils/banIP');

const whitelistCheck = require('./middleware/whitelistCheck');
const blacklistCheck = require('./middleware/blacklistCheck');
const uaCheck = require('./middleware/uaCheck');
const geoTag = require('./middleware/geoTag');
const connectionLimit = require('./middleware/connectionLimit');
const slowlorisDetect = require('./middleware/slowlorisDetect');
const bodySizeLimit = require('./middleware/bodySizeLimit');
const rateLimiter = require('./middleware/rateLimiter');
const challengePage = require('./middleware/challengePage');

const PORT = Number(process.env.PORT || 8080);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// —— 入口埋点：所有请求计数 ——
app.use((req, _res, next) => {
  stats.record();
  req._startTime = Date.now();
  next();
});

// —— 中间件链（按代价升序）——
app.use(whitelistCheck);     // 0. 白名单：标 isWhitelisted，放过后续所有规则
app.use(blacklistCheck);     // 1. 黑名单：O(1) Redis GET
app.use(uaCheck);            // 2. UA 辅助：本地字符串匹配
app.use(geoTag);             // 3. GeoIP：本地查表
app.use((req, res, next) => {
  // GeoIP 硬阻断（仅 country in GEO_BLOCK 时触发）
  if (req.isGeoBlocked) {
    ruleStats.bump('geo');
    stats.recordBlocked({
      ip: getIP(req),
      type: 'GeoBlock',
      reason: `country=${req.geo?.country || '?'}`,
      time: Date.now(),
    });
    banIP(getIP(req), 'GeoBlock', config.BAN_TTL_FLOOD).catch(() => {});
    return res.status(403).json({ error: 'Geo blocked', country: req.geo?.country });
  }
  next();
});
app.use(connectionLimit);    // 4. 并发连接：内存 Map 同步检查
app.use(slowlorisDetect);    // 5. Slowloris：socket + body 双计时器
app.use(bodySizeLimit);      // 6. body 大小：静态 Content-Length + 流式累计
app.use(rateLimiter);        // 7. 限流（IP + CC 双维度）
app.use(challengePage);      // 8. 挑战页：仅在 req.shouldChallenge 时拦下

// —— 健康检查 ——
app.get('/__shieldgate/health', (req, res) => {
  res.json({
    ok: true,
    ip: getIP(req),
    backend: config.BACKEND_URL,
    rules: {
      RATE_LIMIT: config.RATE_LIMIT,
      RATE_WINDOW_MS: config.RATE_WINDOW_MS,
      CC_LIMIT: config.CC_LIMIT,
      CC_WINDOW_MS: config.CC_WINDOW_MS,
      MAX_CONNECTIONS: config.MAX_CONNECTIONS,
      SLOWLORIS_TIMEOUT_MS: config.SLOWLORIS_TIMEOUT_MS,
      MAX_BODY_BYTES: config.MAX_BODY_BYTES,
      GEO_BLOCK: config.GEO_BLOCK,
      GEO_WATCH: config.GEO_WATCH,
    },
  });
});

// —— 反向代理 ——
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

// —— 启动 ——
const server = app.listen(PORT, () => {
  console.log(`[shieldgate] gateway listening on :${PORT} → ${config.BACKEND_URL}`);
});

// 头部限制：超大头部直接 431 拒绝
server.maxHeadersCount = config.MAX_HEADERS_COUNT;
server.headersTimeout = Math.max(config.SLOWLORIS_TIMEOUT_MS + 5000, 30000);
server.requestTimeout = 0;

// Node 18+ 支持 maxHeaderSize（每连接）
if (typeof server.setMaxListeners === 'function' && process.versions?.node) {
  // 通过环境变量也可以传 --max-http-header-size=N（KB）
  // 这里仅做软提醒
}

config.startAutoRefresh();

setInterval(() => stats.tick(), 1000);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
