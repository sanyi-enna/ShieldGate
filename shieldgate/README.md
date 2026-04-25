# ShieldGate

> 轻量级 Web 应用层抗拒绝服务网关 

ShieldGate 是一个面向中小企业和高校场景的 HTTP 层抗 DoS 网关。透明反向代理部署，提供 HTTP Flood / Slowloris / 并发耗尽 / CC 攻击的多维度防护，并通过 WebSocket 推送实时监控大屏。

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
# 后端
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

或一条命令并发启动（需先 `npm install`）：

```bash
npm run dev:all
```

### 4. 启动前端开发服务器

```bash
npm --prefix frontend run dev
```

浏览器打开 <http://localhost:5173>，进入 **监控大屏 / 规则配置 / 封禁管理** 三个页面。

---

## 验证防护

```bash
# 正常请求（被网关转发到 :3000）
curl http://127.0.0.1:8080/

# 高频请求触发限流封禁
for i in $(seq 1 200); do curl -s -o /dev/null http://127.0.0.1:8080/ ; done

# Slowloris 模拟（150 个慢速连接）
python3 scripts/slowloris.py 127.0.0.1 8080 --sockets 150

# HTTP Flood 简易版（无依赖）
python3 scripts/flood_simple.py http://127.0.0.1:8080 --threads 30 --duration 30

# HTTP Flood Locust 版（更直观的压测）
pip install locust
locust -f scripts/flood.py --host=http://127.0.0.1:8080 \
       --users=200 --spawn-rate=50 --headless -t 30s
```

监控大屏会在 1 秒内反映流量变化与被封禁的 IP。

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
├── gateway/                # 网关核心（:8080）
│   ├── index.js           # 入口 + 中间件链 + 反向代理
│   ├── config.js          # 配置（含 Redis 热加载）
│   ├── middleware/        # 5 个拦截器
│   └── utils/             # redis / getIP / stats / banIP
├── admin/                  # 管理后台（:8081）
│   ├── index.js           # Express + WebSocket 入口
│   ├── routes/            # stats / bans / config 三组 REST API
│   └── websocket.js       # WS 推送 + Redis 订阅
├── frontend/               # Vue3 + Ant Design Vue + Chart.js
│   └── src/{views,components,composables,api}
├── backend/                # 模拟业务（:3000）
├── scripts/                # 攻击模拟脚本
├── ecosystem.config.js     # PM2 配置
├── nginx.conf              # Nginx 模板
└── README.md
```

---

## 关键设计点（信息安全角度）

1. **拦截器链按代价排序**：黑名单 → UA → 并发 → Slowloris → 限流，越廉价的检查越靠前，命中即短路。
2. **滑动窗口而非令牌桶**：用 Redis ZSET 实现严格窗口限流，无突发余量，更贴合 DoS 防护语义。
3. **UA 不独立封禁**：UA 易伪造，仅在请求上打 `isSuspiciousUA` 标记，由后续中间件降低阈值（rate × 0.6，conn × 0.5）。
4. **跨进程统计共享**：网关和管理后台是两个 PM2 进程，统计快照通过 Redis `stats:snapshot` 桥接，攻击事件走 Redis Pub/Sub 实时推送给 WebSocket。
5. **配置热更新**：管理 API 写 Redis `config:*`，网关每 10 秒拉取，无需重启。
6. **X-Forwarded-For 必须由 Nginx 覆盖**：避免攻击者伪造头绕过 IP 限流，参见 `nginx.conf` 中 `proxy_set_header X-Forwarded-For $remote_addr;`。

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
