// SSRF 防护：用户/管理员可控的 URL 必须经过此函数。
// 1. 协议白名单：只允许 http/https
// 2. 主机名解析后，所有 IP 不在私有/保留段
// 3. 端口白名单（可选）：常见开放服务端口
const dns = require('dns').promises;

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function isPrivateIPv4(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const p = ip.split('.').map(Number);
  if (p[0] === 10) return true;                                 // 10.0.0.0/8
  if (p[0] === 127) return true;                                // 127.0.0.0/8
  if (p[0] === 0) return true;                                  // 0.0.0.0/8
  if (p[0] === 169 && p[1] === 254) return true;                // 169.254/16 link-local + cloud metadata
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;    // 172.16/12
  if (p[0] === 192 && p[1] === 168) return true;                // 192.168/16
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;   // CGNAT 100.64/10
  if (p[0] >= 224) return true;                                 // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fc') || s.startsWith('fd')) return true;    // unique local
  if (s.startsWith('fe80')) return true;                        // link-local
  if (s.startsWith('::ffff:')) return isPrivateIPv4(s.slice(7));
  return false;
}

function isPrivateIP(ip) {
  return isPrivateIPv4(ip) || isPrivateIPv6(ip);
}

// allowLoopback=true 时允许 127.0.0.1（ShieldGate 反代后端就是它）
async function validateURL(input, { allowLoopback = false } = {}) {
  let url;
  try { url = new URL(input); } catch { throw new Error('invalid URL'); }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`protocol not allowed: ${url.protocol}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) throw new Error('missing hostname');

  // 用户传入的可能就是 IP，先直接判断
  let addrs = [];
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    addrs = [{ address: hostname }];
  } else {
    try { addrs = await dns.lookup(hostname, { all: true }); }
    catch { throw new Error(`dns lookup failed: ${hostname}`); }
  }

  for (const a of addrs) {
    if (isPrivateIP(a.address)) {
      if (allowLoopback && (a.address === '127.0.0.1' || a.address === '::1')) continue;
      throw new Error(`hostname resolves to private IP: ${a.address}`);
    }
  }
  return { url, addrs };
}

module.exports = { validateURL, isPrivateIP, isPrivateIPv4, isPrivateIPv6 };
