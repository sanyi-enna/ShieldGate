# ShieldGate

> 轻量级 Web 应用层抗拒绝服务网关

ShieldGate 是一个面向中小企业 / 高校场景的 HTTP 层抗 DoS 网关。透明反向代理部署，提供 HTTP Flood / Slowloris / 并发耗尽 / CC 攻击 / 大包 / GeoIP 等多维度防护，并通过 WebSocket 推送实时监控大屏 + 通知中心。

详细技术文档见 [`../ShieldGate_技术文档.md`](../ShieldGate_技术文档.md)。

---

## 快速开始

### 0. 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | ≥ 18 |
| Redis | ≥ 6 |
| Python（仅攻击演示需要）| ≥ 3.8 |

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
# 或者直接前台启动
redis-server
```

### 3. 启动三个服务（开发模式）

打开三个终端：

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

浏览器打开 <http://localhost:5173>。

---

## 防护规则

中间件链按代价升序执行，任一中间件命中即短路：

| 顺序 | 中间件 | 作用 | 数据来源 |
|------|--------|------|---------|
| 0 | `whitelistCheck` | 命中即标记 `req.isWhitelisted=true`，跳过后续所有规则 | Redis Set + CIDR 匹配 |
| 1 | `blacklistCheck` | 已封禁 IP 立即返回 403 | Redis GET O(1) |
| 2 | `uaCheck` | 标记可疑 UA（masscan/nmap/sqlmap/curl/python-requests 等 20+ 特征），后续阈值降级 | 本地字符串匹配 |
| 3 | `geoTag` | GeoIP 国家级阻断 / 观察标签 | geoip-lite（可选）|
| 4 | `connectionLimit` | 单 IP 并发连接上限 | 内存 Map（同步）|
| 5 | `slowlorisDetect` | socket + body 双计时器，覆盖 Slowloris / RUDY 变种 | 定时器 |
| 6 | `bodySizeLimit` | Content-Length 静态拦 + 流式累计断连 | header + 流监听 |
| 7 | `rateLimiter` | **IP 维度** + **CC 维度（IP+path）** 双滑动窗口；Lua 脚本原子化 | Redis ZSET + EVAL |
| 8 | `challengePage` | 软阈值 JS Cookie 挑战页，浏览器自动通过、脚本通不过 | HMAC-SHA256 + Redis |

### 递进式封禁

同一 IP 在 24h 内反复触发封禁，时长按 1×/2×/6×/12×/24× 递增（封顶 24h），UI 上显示 `L1`–`L4` 等级。

### 规则命中追踪

10 条规则各自的命中数实时写入 Redis Hash `rules:hits`，前端大屏「规则命中分布」用条形图展示。

---

## 验证防护

```bash
# 正常请求
curl http://127.0.0.1:8080/

# HTTP Flood（IP 维度）
python3 scripts/flood_simple.py http://127.0.0.1:8080 --threads 30 --duration 30

# CC 攻击（同一路径反复请求）
for i in $(seq 1 200); do curl -s -o /dev/null http://127.0.0.1:8080/api/users; done

# Slowloris
python3 scripts/slowloris.py 127.0.0.1 8080 --sockets 150

# Locust 版（更直观）
pip install locust
locust -f scripts/flood.py --host=http://127.0.0.1:8080 \
       --users=200 --spawn-rate=50 --headless -t 30s

# 实时盯封禁状态（每秒刷新）
bash scripts/watch_ban.sh 127.0.0.1
```

监控大屏会在 1 秒内反映流量变化、被封禁 IP、规则命中分布；通知中心实时弹出每条攻击事件。

---

## 管理后台 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 当前统计快照 |
| GET | `/api/stats/attacks` | 持久化攻击事件日志（最近 200 条） |
| GET | `/api/bans` | 封禁记录（含剩余 TTL / level / hits） |
| POST | `/api/bans` | 手动封禁（body: `{ip, reason, ttl}`） |
| DELETE | `/api/bans/:ip` | 解封 |
| GET | `/api/whitelist` | 白名单列表 |
| POST | `/api/whitelist` | 添加（body: `{spec}`，支持 IP / CIDR） |
| DELETE | `/api/whitelist/:spec` | 移除 |
| GET | `/api/rules/hits` | 各规则累计命中数 |
| POST | `/api/rules/hits/reset` | 重置命中计数 |
| GET | `/api/config` | 当前生效配置 |
| PUT | `/api/config` | 热更新配置（10 秒内全节点生效） |
| POST | `/api/config/reset` | 恢复默认配置 |

WebSocket 推送：`ws://host/ws`，每秒推送 `type=stats` 快照（含 `ruleHits` / `recentBans`），攻击瞬间额外推 `type=attack`。

---

## 前端功能

| 页面 | 说明 |
|------|------|
| `/dashboard` 监控大屏 | 5 张指标卡 + 流量趋势图 + 封禁圆环 + 规则命中条形图 + 高风险 IP 表 + 最近事件时间线 |
| `/rules` 规则配置 | 7 张配置卡（限流 / CC / 并发 / Slowloris / Body / 封禁时长 / GeoIP），所有阈值 Redis 热更新 |
| `/bans` 封禁管理 | 默认按 IP 折叠（显示封禁次数 / L 级 / 当前 TTL），可展开查看完整历史；可切换原始时间线视图 |
| `/whitelist` 白名单 | IP / CIDR 添加 / 移除（5 秒内生效） |
| `/attacks` 攻击事件 | 完整事件流，合并 WS 实时推送和 Redis 持久化日志 |

### 顶部工具栏

- **全局搜索框**（按 `/` 聚焦）
  - 输入 IP → 下拉建议 3 项跳转（封禁 / 攻击 / 白名单）
  - 输入 `flood` / `cc` / `slow` / `blacklist` / `body` / `geo` / `ua` 等关键词 → 跳过滤
  - 自由文本 → 当前页面内行内过滤 + 命中段高亮
  - `Esc` 清空，`↑↓` + `Enter` 选建议
- **通知中心**（铃铛图标）
  - 未读数红色 badge，攻击事件 / 连接断开实时入队
  - 已读状态 localStorage 持久化（刷新页面不丢失）
  - 静音开关、全部已读、清空、点击跳转
  - 可选浏览器原生通知（首次点击静音开关时请求授权）

---

## 生产部署

```bash
# 1. 构建前端
npm run build:frontend

# 2. 部署前端到 Nginx
sudo mkdir -p /var/www/shieldgate
sudo cp -r frontend/dist/* /var/www/shieldgate/
sudo cp nginx.conf /etc/nginx/conf.d/shieldgate.conf
sudo nginx -t && sudo systemctl reload nginx

# 3. PM2 启动后端三件套
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 目录结构

```
shieldgate/
├── gateway/                       # 网关核心（:8080）
│   ├── index.js                  # 入口 + 9 个中间件 + 反向代理
│   ├── config.js                 # 配置（Redis 热加载，含数组型 GEO_BLOCK/WATCH）
│   ├── middleware/
│   │   ├── whitelistCheck.js
│   │   ├── blacklistCheck.js
│   │   ├── uaCheck.js
│   │   ├── geoTag.js
│   │   ├── connectionLimit.js
│   │   ├── slowlorisDetect.js
│   │   ├── bodySizeLimit.js
│   │   ├── rateLimiter.js        # IP + CC 双桶 + Lua
│   │   └── challengePage.js
│   └── utils/
│       ├── redis.js / getIP.js / cidr.js
│       ├── stats.js              # 跨进程统计（Redis 桥接）
│       ├── ruleStats.js          # 各规则命中计数
│       ├── banIP.js              # 递进式封禁
│       ├── whitelist.js          # CIDR 缓存匹配
│       └── rateLimiterLua.js     # 原子化滑动窗口
├── admin/                         # 管理后台（:8081）
│   ├── index.js
│   ├── routes/
│   │   ├── stats.js / bans.js / config.js
│   │   ├── whitelist.js
│   │   └── rules.js
│   └── websocket.js              # WS 推送 + Redis 订阅
├── frontend/                      # Vue3 + Ant Design Vue + Chart.js
│   └── src/
│       ├── App.vue               # 侧边栏 + 顶栏（搜索 / 通知）
│       ├── views/
│       │   ├── Dashboard.vue / Rules.vue / Bans.vue
│       │   ├── Whitelist.vue / Attacks.vue
│       ├── components/
│       │   ├── MetricCard / RealtimeChart / Donut / RuleHits
│       │   ├── AttackFeed / Highlight / Icon
│       └── composables/
│           ├── useWebSocket.js
│           ├── useSearch.js
│           └── useNotifications.js
├── backend/index.js               # 模拟业务（:3000）
├── scripts/
│   ├── flood.py                  # Locust 版 HTTP Flood
│   ├── flood_simple.py           # 零依赖多线程压测
│   ├── slowloris.py              # 慢速连接
│   └── watch_ban.sh              # 实时盯封禁状态
├── ecosystem.config.js            # PM2 配置
├── nginx.conf                     # Nginx 模板
├── package.json
└── README.md
```

---

## 关键设计点（信息安全角度）

1. **拦截器链按代价升序** — 廉价检查（白名单 / 黑名单 / UA）在前，昂贵检查（限流 / 挑战页）在后；命中即短路。
2. **滑动窗口而非令牌桶** — 用 Redis ZSET 严格限流，无突发余量；Lua 脚本把清窗 / 写点 / 计数 / 续期合并为一次原子调用，规避竞态。
3. **CC 防护双维度** — IP 维度 + IP×path 维度并行计数，覆盖「同 IP 反复打同一资源绕 CDN 缓存」场景。
4. **UA 不独立封禁** — UA 易伪造，仅打 `isSuspiciousUA` 标记，由限流（×0.6）和并发（×0.5）阈值降级触发。
5. **递进式封禁** — 同 IP 在 24h 内反复触发，时长 1×/2×/6×/12×/24× 递增；level 持久化，避免「封一次就忘」。
6. **跨进程统计共享** — 网关 / 管理后台是两个 PM2 进程，统计快照通过 Redis `stats:snapshot` 桥接，攻击事件走 Redis Pub/Sub 实时推 WebSocket。
7. **配置热更新** — 管理 API 写 Redis `config:*`，网关每 10 秒自动同步，无需重启。
8. **挑战页防脚本** — 软阈值触发时返回 JS Cookie 挑战页，HMAC 签名 token，10 分钟有效；浏览器自动 set-cookie 重试通过，脚本攻击不实现 JS 直接被卡死。
9. **白名单 5s 缓存** — `Redis Set + CIDR 匹配`，命中即跳过后续所有规则；缓存 5 秒平衡延迟和分布式一致性。
10. **X-Forwarded-For 必须由 Nginx 覆盖** — 防止攻击者伪造头绕过 IP 限流，参见 `nginx.conf` 中 `proxy_set_header X-Forwarded-For $remote_addr;`。

---

## 端口占用一览

| 端口 | 服务 |
|------|------|
| 80   | Nginx（前端 + /api 反代 + /ws 反代）|
| 3000 | 模拟业务后端 |
| 5173 | Vite 前端开发服务器（仅开发期）|
| 6379 | Redis |
| 8080 | ShieldGate 网关（业务流量入口）|
| 8081 | 管理后台 API + WebSocket |

---

## 常见问题

**Q：dashboard 显示拦截，但攻击器还在跑，是不是没生效？**
A：应用层拦截 ≠ 让对方发不出包。每次拦截返回 403/429，攻击器收到后单方面继续重试是它的事。验证步骤：
```bash
curl -i http://127.0.0.1:8080/    # 应该 403 Forbidden
curl http://127.0.0.1:3000/       # 直连后端正常 → 说明业务被保护
redis-cli ttl ban:127.0.0.1       # 在封禁窗口内应该是正数
```

**Q：封禁记录里同一 IP 出现多条？**
A：每次「封禁过期 → 再次被攻击 → 重新封禁」就是新的一条历史。封禁页默认按 IP 折叠展示「累计封禁次数 / L 级 / 当前 TTL」，展开看完整时间线。

**Q：本机 127.0.0.1 想测试又不想被封怎么办？**
A：白名单页加 `127.0.0.1`（或 `127.0.0.0/8`），命中白名单的 IP 跳过所有规则。
