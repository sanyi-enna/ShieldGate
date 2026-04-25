// 简易 IPv4 CIDR 匹配（够用即可，IPv6 仅做精确匹配）。
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function parseCIDR(spec) {
  const [ip, bitsStr] = spec.split('/');
  if (!bitsStr) {
    return { type: 'exact', ip };
  }
  const bits = Number(bitsStr);
  const base = ipv4ToInt(ip);
  if (base === null || Number.isNaN(bits) || bits < 0 || bits > 32) {
    return { type: 'exact', ip };
  }
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { type: 'cidr', base: base & mask, mask };
}

function match(spec, ip) {
  const rule = parseCIDR(spec);
  if (rule.type === 'exact') return rule.ip === ip;
  const target = ipv4ToInt(ip);
  if (target === null) return false;
  return (target & rule.mask) === rule.base;
}

function matchAny(specs, ip) {
  for (const s of specs) {
    if (match(s, ip)) return s;
  }
  return null;
}

module.exports = { match, matchAny, parseCIDR, ipv4ToInt };
