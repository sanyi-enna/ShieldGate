// 模拟后端业务服务（端口 3000），仅用于演示。
const http = require('http');

const PORT = Number(process.env.PORT || 3000);

const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>真实业务 (mock)</title>
<style>
body{font-family:system-ui;margin:0;padding:40px;background:#f6fafd;color:#0a1628;}
.box{max-width:680px;margin:auto;padding:32px;background:white;border-radius:8px;box-shadow:0 4px 16px rgba(20,40,80,.1);}
code{background:#eef4fa;padding:2px 6px;border-radius:3px;}
</style></head>
<body><div class="box">
<h1>📦 真实业务后端</h1>
<p>这是一个被 ShieldGate 网关保护的虚拟业务站点。</p>
<p>正常用户访问 <code>http://gateway:8080/</code> 会被透明转发到这里 (<code>:3000</code>)。</p>
<p>当前时间：<b id="t"></b></p>
<script>document.getElementById('t').textContent=new Date().toLocaleString();</script>
</div></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/api/users') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ]));
  }
  if (req.url?.startsWith('/api/search')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ results: [], elapsed_ms: 12 }));
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'mock-backend' }));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`[mock-backend] listening on :${PORT}`);
});
