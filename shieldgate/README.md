# ShieldGate

> 轻量级 Web 应用层抗拒绝服务（DoS / DDoS）网关

ShieldGate 是面向中小企业 / 高校 / CTF 场景的 HTTP 层防护网关。透明反向代理部署，提供 **HTTP Flood / Slowloris / 并发耗尽 / CC 攻击 / 大包 / GeoIP / 可疑 UA / 黑白名单 / JS 挑战页** 等多维度防护，配套 Vue 3 监控大屏（WebSocket 实时推送）+ 威胁情报订阅（CVE / URLhaus IOC）。

详细技术设计见 [`../ShieldGate_技术文档.md`](../ShieldGate_技术文档.md)。

---

## 目录

- [ShieldGate](#shieldgate)
  - [目录](#目录)
  - [架构概览](#架构概览)
  - [快速开始](#快速开始)
    - [0. 环境要求](#0-环境要求)
    - [1. 安装依赖](#1-安装依赖)
    - [2. 启动 Redis](#2-启动-redis)
    - [3. 启动后端三件套（开发模式）](#3-启动后端三件套开发模式)
    - [4. 启动前端开发服务器](#4-启动前端开发服务器)
  - [防护规则](#防护规则)
    - [递进式封禁](#递进式封禁)
    - [规则命中追踪](#规则命中追踪)
  - [威胁情报](#威胁情报)
    - [前端入口](#前端入口)
    - [后端故障降级](#后端故障降级)
  - [身份认证](#身份认证)
    - [默认账号](#默认账号)
  - [管理后台 API](#管理后台-api)
    - [认证](#认证)
    - [统计与事件](#统计与事件)
    - [封禁与白名单](#封禁与白名单)
    - [配置热更新](#配置热更新)
    - [威胁情报](#威胁情报-1)
  - [WebSocket 协议](#websocket-协议)
    - [安全策略（生产必看）](#安全策略生产必看)
    - [推送格式](#推送格式)
  - [前端功能](#前端功能)
    - [顶部工具栏](#顶部工具栏)
    - [暗色主题](#暗色主题)
  - [配置与环境变量](#配置与环境变量)
  - [生产部署](#生产部署)
    - [1. 构建前端](#1-构建前端)
    - [2. 部署到 Nginx](#2-部署到-nginx)
    - [3. PM2 后端](#3-pm2-后端)
    - [4. 修改默认密码](#4-修改默认密码)
  - [目录结构](#目录结构)
  - [攻击演示与验证](#攻击演示与验证)
  - [关键设计点（信息安全角度）](#关键设计点信息安全角度)
  - [端口一览](#端口一览)
  - [常见问题](#常见问题)

---

## 架构概览

```
                    ┌─────────────┐    ┌──────────────┐
                    │   浏览器     │    │ 攻击者 / 脚本 │
                    └──────┬──────┘    └──────┬───────┘
                           │                  │
                           ▼                  ▼
                    ┌─────────────────────────────────┐
                    │      Nginx (:80 / :443)         │
                    │   • 静态前端 dist               │
                    │   • /api → :8081（管理后台）     │
                    │   • /ws  → :8081（WebSocket）   │
                    │   • / →  :8080 （ShieldGate 网关）│
                    └────────┬───────────────┬────────┘
                             │               │
            ┌────────────────▼────┐   ┌──────▼─────────────┐
            │  ShieldGate Gateway │   │  Admin (REST + WS) │
            │  :8080  9 个中间件  │   │  :8081  JWT 鉴权   │
            └─────────┬───────────┘   └────────┬───────────┘
                      │   ┌─────────────────┐  │
                      └──▶│      Redis      │◀─┘
                          │  • 配置热更新    │
                          │  • 限流 ZSET     │
                          │  • 封禁 / 白名单 │
                          │  • Pub/Sub 攻击  │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  Backend (:3000) │
                          │  受保护业务      │
                          └──────────────────┘
```

- **网关进程** 与 **管理后台进程** 可水平扩容多实例，状态全部走 Redis。
- 管理后台同时承载 **REST API** + **WebSocket 推送** + **威胁情报代理**。
- 前端是纯 SPA（Vue 3 + Vite），生产由 Nginx 直出 dist。

---

## 快速开始

### 0. 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | ≥ 18（依赖内置 `fetch`） |
| Redis | ≥ 6 |
| Python（仅攻击演示） | ≥ 3.8 |

### 1. 安装依赖

```bash
# 后端（geoip-lite 为可选依赖，安装失败不影响主流程）
npm install

# 前端
npm install --prefix frontend
```

### 2. 启动 Redis

```bash
# macOS
brew services start redis
# Linux
sudo systemctl start redis-server
# 直接前台
redis-server
```

### 3. 启动后端三件套（开发模式）

打开三个终端，分别执行：

```bash
# 终端 1：模拟业务后端 (:3000)
npm run start:backend

# 终端 2：ShieldGate 网关 (:8080)
npm run start:gateway

# 终端 3：管理后台 API + WebSocket (:8081)
npm run start:admin
```

或一条命令并发启动：

```bash
npm run dev:all
```

### 4. 启动前端开发服务器

```bash
npm --prefix frontend run dev
```

浏览器打开 <http://localhost:5173>，使用默认账号登录：

```
用户名：admin
密码：  ShieldGate@2024
```

> ⚠️ **首次登录后请立刻通过侧边栏「修改密码」改为强密码**，并设置环境变量 `SG_JWT_SECRET` 替换默认随机密钥（详见 [配置与环境变量](#配置与环境变量)）。

---

## 防护规则

中间件链按代价升序执行，任一中间件命中即短路：

| 顺序 | 中间件 | 作用 | 数据来源 |
|------|--------|------|---------|
| 0 | `whitelistCheck` | 命中即标记 `req.isWhitelisted=true`，跳过后续所有规则 | Redis Set + CIDR 匹配 |
| 1 | `blacklistCheck` | 已封禁 IP 立即返回 403 | Redis GET O(1) |
| 2 | `uaCheck` | 标记可疑 UA（masscan/nmap/sqlmap/curl/python-requests 等 20+ 特征），后续阈值降级 | 本地字符串匹配 |
| 3 | `geoTag` | GeoIP 国家级阻断 / 观察标签 | geoip-lite（可选） |
| 4 | `connectionLimit` | 单 IP 并发连接上限 | 内存 Map（同步） |
| 5 | `slowlorisDetect` | socket + body 双计时器，覆盖 Slowloris / RUDY 变种 | 定时器 |
| 6 | `bodySizeLimit` | Content-Length 静态拦 + 流式累计断连 | header + 流监听 |
| 7 | `rateLimiter` | **IP 维度** + **CC 维度（IP+path）** 双滑动窗口；Lua 脚本原子化 | Redis ZSET + EVAL |
| 8 | `challengePage` | 软阈值 JS Cookie 挑战页，浏览器自动通过、脚本通不过 | HMAC-SHA256 + Redis |

### 递进式封禁

同一 IP 在 24h 内反复触发封禁，时长按 1× / 2× / 6× / 12× / 24× 递增（封顶 24h），UI 上显示 `L1`–`L4` 等级。

### 规则命中追踪

10 条规则各自的命中数实时写入 Redis Hash `rules:hits`，前端大屏「规则命中分布」用条形图展示。

---

## 威胁情报

集成两个**免费、无需 API Key** 的公共情报源，后端做代理 + 5 分钟内存缓存（避免上游限速）：

| 数据源 | 内容 | 端点 |
|---|---|---|
| **CIRCL CVE-Search** | 最近 30 条 CVE（v5.x JSON 格式，自动取 CVSS v3.1/v4.0/v3.0/v2.0 优先级） | `cve.circl.lu/api/last/30` |
| **abuse.ch URLhaus** | 最近 ~40 条恶意 URL / IOC（含 host / 标签 / 威胁类型） | `urlhaus.abuse.ch/downloads/json_recent/` |

### 前端入口

- **侧边栏「威胁情报」** → `/threat-intel`：4 张指标卡 + CVE 列表 + IOC 列表（每条带「封禁」按钮，IPv4 IOC 可一键加入黑名单 1h）。
- **大屏「封禁原因分布」面板下方** → IOC 卡片，每 5 秒轮播一条，每 5 分钟刷新。

### 后端故障降级

上游不可达时返回最后一次成功的缓存（`stale: true`），前端展示「已加载缓存」提示，不阻塞页面。

> ⚠️ 如果你的部署环境无法出公网（如纯内网 / CTF 沙盒），访问 `/threat-intel` 会显示「上游不可达」，不影响其它功能。

---

## 身份认证

- **极简自实现 JWT (HS256)**：避免引入 `jsonwebtoken` 依赖，密钥默认随机生成（**生产必须通过 `SG_JWT_SECRET` 设置**），TTL 默认 8h。
- **Cookie + Bearer 双通道**：Cookie 名 `sg_token`，HttpOnly + SameSite=Lax；同时支持 `Authorization: Bearer <token>` 兜底。
- **CSRF 防护**：所有非 GET 请求必须带 `X-Requested-With: ShieldGate-UI` 头，浏览器跨域时不会自动带这个头。
- **密码哈希**：bcrypt 12 轮，存储于 Redis Hash `users:credentials`。
- **修改密码**：侧边栏「修改密码」入口，需提供原密码，新密码至少 8 位。

### 默认账号

```
用户名：admin
密码：  ShieldGate@2024
```

> 强烈建议首次登录后立即修改，并设置 `SG_JWT_SECRET` 为 ≥ 32 字符的随机字符串。

---

## 管理后台 API

所有接口 base path 为 `/api`，除「公开端点」外都要求 JWT 鉴权 + CSRF 头。

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（公开），body: `{username, password}`，成功 set-cookie |
| POST | `/api/auth/logout` | 登出 |
| GET  | `/api/auth/me` | 当前登录用户（公开，未登录返回 `null`） |
| POST | `/api/auth/change-password` | body: `{oldPassword, newPassword}` |

### 统计与事件

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 当前统计快照 |
| GET | `/api/stats/attacks` | 持久化攻击事件日志（最近 100 条） |
| GET | `/api/rules/hits` | 各规则累计命中数 |
| POST | `/api/rules/hits/reset` | 重置命中计数 |

### 封禁与白名单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET    | `/api/bans` | 封禁记录（含剩余 TTL / level / hits） |
| POST   | `/api/bans` | 手动封禁，body: `{ip, reason, ttl}` |
| DELETE | `/api/bans/:ip` | 解封 |
| GET    | `/api/whitelist` | 白名单列表 |
| POST   | `/api/whitelist` | 添加，body: `{spec}`（IP 或 CIDR） |
| DELETE | `/api/whitelist/:spec` | 移除 |

### 配置热更新

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/config` | 当前生效配置 |
| PUT  | `/api/config` | 热更新（10 秒内全节点生效） |
| POST | `/api/config/reset` | 恢复默认 |
| POST | `/api/config/backend-url` | 切换被保护业务 URL |

### 威胁情报

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/threat-intel/cves` | 最近 30 条 CVE（CIRCL） |
| GET | `/api/threat-intel/iocs` | 最近 40 条 IOC（URLhaus） |
| GET | `/api/threat-intel/summary` | 聚合计数（CVE / 高危 / IOC 各自数量 + 缓存时间） |

---

## WebSocket 协议

**端点**：`ws(s)://host/ws`

### 安全策略（生产必看）

| 措施 | 默认行为 | 配置变量 |
|---|---|---|
| **JWT 鉴权** | upgrade 阶段验 cookie / Bearer，未通过 401 关闭 | — |
| **Origin 校验** | 仅同源放行；跨源攻击者直接 403（防 CSWSH 偷数据） | `SG_WS_ALLOWED_ORIGINS=https://a.com,https://b.com` |
| **回环放行** | localhost / 127.0.0.1 / ::1 互通（兼容 Vite dev proxy） | — |
| **JWT 过期复检** | 每 60 秒扫描所有连接，过期者 close `4401` | — |
| **心跳** | 30s ping，未响应 terminate | — |
| **入站静音** | 服务端只下发；最大入站帧 4 KB，message 事件 noop | — |
| **单 IP 连接数上限** | 默认 8 | `SG_WS_MAX_CONNS_PER_IP=8` |
| **审计日志** | connect / close / token expired / reject 全打印 user / ip / 持续秒 | — |

### 推送格式

每秒推 `type=stats`：

```json
{
  "type": "stats",
  "data": {
    "total": 12345, "blocked": 234, "banned": 17,
    "currentRPS": 42, "currentBlockedRPS": 3,
    "history": [/* 60 个 RPS */],
    "blockedHistory": [/* 60 个拦截 RPS */],
    "recentBans": [/* 100 条最新封禁 */],
    "ruleHits": {"flood": 12, "cc": 5, ...}
  }
}
```

攻击事件触发时额外推 `type=attack`：

```json
{ "type": "attack", "data": { "ip": "1.2.3.4", "type": "HTTP Flood", "reason": "...", "time": 1735689600000 } }
```

前端收到 `4401` close code 会停止重连并跳转登录页。

---

## 前端功能

| 页面 | 路由 | 说明 |
|------|------|------|
| 监控大屏 | `/dashboard` | 5 张指标卡 + 流量趋势图（自适应高度） + 封禁圆环 + 规则命中条形图 + 高风险 IP 表 + 最近事件时间线 + 威胁情报轮播 |
| 规则配置 | `/rules` | 7 张配置卡（限流 / CC / 并发 / Slowloris / Body / 封禁时长 / GeoIP），所有阈值 Redis 热更新 |
| 封禁管理 | `/bans` | 默认按 IP 折叠（封禁次数 / L 级 / 当前 TTL），可展开查看完整历史；可切换原始时间线视图；解封需二次确认 |
| 白名单 | `/whitelist` | IP / CIDR 添加 / 移除（5 秒内生效） |
| 攻击事件 | `/attacks` | 完整事件流，合并 WS 实时推送和 Redis 持久化日志 |
| 威胁情报 | `/threat-intel` | CVE 最新 30 条 + URLhaus 最近 40 条 IOC，IOC 可一键封禁 IP |
| 登录 | `/login` | 无侧栏的独立页面 |

### 顶部工具栏

- **工作区指示**：自动取 `location.host`，部署到不同域名 / IP 无需改代码。
- **全局搜索**（按 `/` 聚焦）
  - 输入 IP → 下拉建议 3 项跳转（封禁 / 攻击 / 白名单）
  - 输入 `flood` / `cc` / `slow` / `blacklist` / `body` / `geo` / `ua` 等关键词 → 跳过滤
  - 自由文本 → 当前页面内行内过滤 + 命中段高亮
  - `Esc` 清空，`↑↓` + `Enter` 选建议
- **通知中心**（铃铛图标）
  - 未读数红色 badge，攻击事件 / 连接断开实时入队
  - 已读状态 localStorage 持久化
  - 静音开关、全部已读、清空、点击跳转
  - 可选浏览器原生通知（首次点击静音开关时请求授权）
- **响应式**：浏览器缩放 / 窄屏下顶栏自动换行，搜索框可压缩、通知面板自适应宽度，避免内容溢出。

### 暗色主题

整体 `#0b0e14` 深底配 `#4a9eff` 主色。Ant Design Vue 的 `message` / `popover` / `modal` / `notification` 全局组件已用 CSS 强制覆盖为暗色（这些组件被 `Teleport` 到 body 之外，不在 `<a-config-provider>` 子树里）。

---

## 配置与环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8081`（admin） / `8080`（gateway） / `3000`（backend） | 进程监听端口 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接 URL |
| `SG_JWT_SECRET` | 启动随机 32 字节 | **生产必填**：JWT 签名密钥；不设置时每次重启所有 token 都失效 |
| `SG_JWT_TTL` | `28800`（8h） | JWT 有效期（秒） |
| `SG_WS_ALLOWED_ORIGINS` | 空（仅同源） | WS 跨源白名单，逗号分隔，例：`https://console.shield.com,https://admin.shield.com` |
| `SG_WS_MAX_CONNS_PER_IP` | `8` | 单 IP WebSocket 最大并发连接 |

业务防护阈值（限流 / CC / 并发 / Slowloris / Body / 封禁时长 / GeoIP）**不通过环境变量**，全部走管理后台 `/rules` 页面热更新。

---

## 生产部署

### 1. 构建前端

```bash
npm run build:frontend
```

### 2. 部署到 Nginx

```bash
sudo mkdir -p /var/www/shieldgate
sudo cp -r frontend/dist/* /var/www/shieldgate/
sudo cp nginx.conf /etc/nginx/conf.d/shieldgate.conf
sudo nginx -t && sudo systemctl reload nginx
```

> 反代须透传 `X-Forwarded-For` / `Host` / `Origin` 头，否则 IP 限流和 WS Origin 校验会失效。`nginx.conf` 已包含示例。

### 3. PM2 后端

```bash
npm install -g pm2

# 设置环境（生产必配）
export SG_JWT_SECRET=$(openssl rand -hex 32)
export SG_WS_ALLOWED_ORIGINS=https://your-domain.com

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. 修改默认密码

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Requested-With: ShieldGate-UI' \
  -d '{"username":"admin","password":"ShieldGate@2024"}' -c cookies.txt

curl -X POST https://your-domain.com/api/auth/change-password \
  -H 'Content-Type: application/json' -H 'X-Requested-With: ShieldGate-UI' \
  -b cookies.txt \
  -d '{"oldPassword":"ShieldGate@2024","newPassword":"<your strong password>"}'
```

或直接在 UI 上点侧边栏「修改密码」。

---

## 目录结构

```
shieldgate/
├── gateway/                        # 网关核心（:8080）
│   ├── index.js                   # 入口 + 9 个中间件 + 反向代理
│   ├── config.js                  # 配置（Redis 热加载）
│   ├── middleware/
│   │   ├── whitelistCheck.js
│   │   ├── blacklistCheck.js
│   │   ├── uaCheck.js
│   │   ├── geoTag.js
│   │   ├── connectionLimit.js
│   │   ├── slowlorisDetect.js
│   │   ├── bodySizeLimit.js
│   │   ├── rateLimiter.js         # IP + CC 双桶 + Lua
│   │   └── challengePage.js
│   └── utils/
│       ├── redis.js / getIP.js / cidr.js
│       ├── stats.js               # 跨进程统计
│       ├── ruleStats.js           # 各规则命中计数
│       ├── banIP.js               # 递进式封禁
│       ├── whitelist.js           # CIDR 缓存匹配
│       └── rateLimiterLua.js      # 原子化滑动窗口
├── admin/                          # 管理后台（:8081）
│   ├── index.js
│   ├── auth/
│   │   ├── jwt.js                 # HS256 极简实现
│   │   └── middleware.js          # parseToken + requireAuth + CSRF
│   ├── routes/
│   │   ├── auth.js                # 登录 / 登出 / 改密 / 当前用户
│   │   ├── stats.js / bans.js / config.js
│   │   ├── whitelist.js / rules.js
│   │   └── threat-intel.js        # CVE / IOC 代理 + 5min 缓存
│   └── websocket.js               # WS 推送 + 6 项安全策略
├── frontend/                       # Vue3 + Ant Design Vue + Chart.js
│   └── src/
│       ├── App.vue                # 侧边栏 + 顶栏（搜索 / 通知）
│       ├── main.js                # 路由
│       ├── views/
│       │   ├── Dashboard.vue / Rules.vue / Bans.vue
│       │   ├── Whitelist.vue / Attacks.vue
│       │   ├── ThreatIntel.vue    # CVE + IOC 详情页
│       │   └── Login.vue
│       ├── components/
│       │   ├── MetricCard / RealtimeChart / Donut / RuleHits
│       │   ├── AttackFeed / Highlight / Icon
│       ├── composables/
│       │   ├── useWebSocket.js    # 自动重连 + 4401 跳登录
│       │   ├── useSearch.js
│       │   ├── useNotifications.js
│       │   └── useAuth.js
│       ├── api/index.js           # axios 客户端
│       └── styles.css             # 全局暗色主题 + Antd 覆盖
├── backend/index.js                # 模拟业务（:3000）
├── scripts/
│   ├── flood.py                   # Locust 版 HTTP Flood
│   ├── flood_simple.py            # 零依赖多线程压测
│   ├── slowloris.py               # 慢速连接
│   ├── ddos7.py                   # 综合攻击演示
│   └── watch_ban.sh               # 实时盯封禁状态
├── ecosystem.config.js             # PM2 配置
├── nginx.conf                      # Nginx 模板
├── package.json
└── README.md
```

---

## 攻击演示与验证

```bash
# 正常请求
curl http://127.0.0.1:8080/

# HTTP Flood（IP 维度）
python3 scripts/flood_simple.py http://127.0.0.1:8080 --threads 30 --duration 30

# CC 攻击（同一路径反复请求）
for i in $(seq 1 200); do curl -s -o /dev/null http://127.0.0.1:8080/api/users; done

# Slowloris
python3 scripts/slowloris.py 127.0.0.1 8080 --sockets 150

# Locust 版（更直观的 RPS 仪表）
pip install locust
locust -f scripts/flood.py --host=http://127.0.0.1:8080 \
       --users=200 --spawn-rate=50 --headless -t 30s

# 实时盯封禁状态（每秒刷新）
bash scripts/watch_ban.sh 127.0.0.1
```

监控大屏会在 1 秒内反映流量变化、被封禁 IP、规则命中分布；通知中心实时弹出每条攻击事件。

---

## 关键设计点（信息安全角度）

1. **拦截器链按代价升序** — 廉价检查（白名单 / 黑名单 / UA）在前，昂贵检查（限流 / 挑战页）在后；命中即短路。
2. **滑动窗口而非令牌桶** — 用 Redis ZSET 严格限流，无突发余量；Lua 脚本把清窗 / 写点 / 计数 / 续期合并为一次原子调用，规避竞态。
3. **CC 防护双维度** — IP 维度 + IP×path 维度并行计数，覆盖「同 IP 反复打同一资源绕 CDN 缓存」场景。
4. **UA 不独立封禁** — UA 易伪造，仅打 `isSuspiciousUA` 标记，由限流（×0.6）和并发（×0.5）阈值降级触发。
5. **递进式封禁** — 同 IP 在 24h 内反复触发，时长 1× / 2× / 6× / 12× / 24× 递增；level 持久化。
6. **跨进程统计共享** — 网关 / 管理后台通过 Redis `stats:snapshot` 桥接，攻击事件走 Pub/Sub 实时推 WebSocket。
7. **配置热更新** — 管理 API 写 Redis `config:*`，网关每 10 秒自动同步，无需重启。
8. **挑战页防脚本** — 软阈值触发时返回 JS Cookie 挑战页，HMAC 签名 token，10 分钟有效；浏览器自动 set-cookie 重试通过，纯脚本卡死。
9. **白名单 5s 缓存** — `Redis Set + CIDR 匹配`，命中即跳过后续所有规则；缓存 5 秒平衡延迟和分布式一致性。
10. **`X-Forwarded-For` 必须由 Nginx 覆盖** — 防止攻击者伪造头绕过 IP 限流，参见 `nginx.conf`：`proxy_set_header X-Forwarded-For $remote_addr;`。
11. **WebSocket 防 CSWSH** — 升级阶段强校验 Origin，恶意站点无法跨源借用 cookie 偷取实时统计；JWT 过期主动断连防长会话漂移。
12. **管理后台 CSRF** — 自定义头 `X-Requested-With: ShieldGate-UI` + Cookie SameSite=Lax，跨域无法伪造写请求。

---

## 端口一览

| 端口 | 服务 |
|------|------|
| 80 / 443 | Nginx（前端 + `/api` 反代 + `/ws` 反代） |
| 3000 | 模拟业务后端 |
| 5173 | Vite 前端开发服务器（仅开发期） |
| 6379 | Redis |
| 8080 | ShieldGate 网关（业务流量入口） |
| 8081 | 管理后台 API + WebSocket |

---

## 常见问题

**Q：dashboard 显示拦截，但攻击器还在跑，是不是没生效？**
A：应用层拦截 ≠ 让对方发不出包。每次拦截返回 403/429，攻击器收到后单方面继续重试是它的事。验证：
```bash
curl -i http://127.0.0.1:8080/    # 应该 403 Forbidden
curl http://127.0.0.1:3000/       # 直连后端正常 → 业务被保护
redis-cli ttl ban:127.0.0.1       # 在封禁窗口内是正数
```

**Q：封禁记录里同一 IP 出现多条？**
A：每次「封禁过期 → 再次被攻击 → 重新封禁」就是新的一条历史。封禁页默认按 IP 折叠展示「累计封禁次数 / L 级 / 当前 TTL」，展开看完整时间线。

**Q：本机 127.0.0.1 想测试又不想被封？**
A：白名单页加 `127.0.0.1`（或 `127.0.0.0/8`），命中白名单的 IP 跳过所有规则。

**Q：威胁情报页面显示「上游不可达」？**
A：CIRCL / abuse.ch 是公网 API。如果服务器无法出公网（内网部署 / 防火墙限制），这两个上游会失败；前端显示「已加载缓存」或空数据，不影响其它功能。需要威胁情报功能时确认服务器可访问 `cve.circl.lu` 和 `urlhaus.abuse.ch`。

**Q：浏览器控制台报 WS 403？**
A：默认仅同源放行。如果前端域名和 admin 服务的 Host 不同，设置 `SG_WS_ALLOWED_ORIGINS` 环境变量。Vite 开发场景（`localhost:5173` → `127.0.0.1:8081`）已自动放行所有回环地址组合。

**Q：忘记 admin 密码了？**
A：直接清 Redis 里的凭据，重启 admin 进程会重建默认账号：
```bash
redis-cli HDEL users:credentials admin
npm run start:admin   # 启动时如检测到无 admin，会写入默认密码 ShieldGate@2024
```

**Q：监控大屏「封禁 IP」数字不增长？**
A：之前版本显示的是「最近 20 条封禁历史」长度，已修复为使用真实累计计数器 `stats.banned`，会持续递增到任意大小。

---

