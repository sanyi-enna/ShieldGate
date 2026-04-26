const router = require('express').Router();

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function cachedFetch(key, url, parser, opts = {}) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return { data: hit.data, cachedAt: hit.at, fresh: false };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'ShieldGate-WAF/1.0', Accept: 'application/json' },
      ...opts,
    });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const raw = await resp.json();
    const data = parser(raw);
    cache.set(key, { data, at: now });
    return { data, cachedAt: now, fresh: true };
  } finally {
    clearTimeout(timer);
  }
}

function parseCveRecord(c) {
  // CVE Record v5.x（CIRCL 当前格式）
  const meta = c.cveMetadata || {};
  const cna = c.containers?.cna || {};
  const id = meta.cveId || c.id || '—';
  const published = meta.datePublished || c.Published || c.published || null;
  const modified = meta.dateUpdated || c.Modified || c.modified || null;

  // CVSS 优先级：v3.1 > v4.0 > v3.0 > v2.0
  let cvss = 0;
  const metrics = Array.isArray(cna.metrics) ? cna.metrics : [];
  const pick = (k) => {
    for (const m of metrics) if (m?.[k]?.baseScore != null) return Number(m[k].baseScore);
    return null;
  };
  cvss = pick('cvssV3_1') ?? pick('cvssV4_0') ?? pick('cvssV3_0') ?? pick('cvssV2_0') ?? Number(c.cvss || 0);

  // 描述
  let summary = '';
  const descs = Array.isArray(cna.descriptions) ? cna.descriptions : [];
  const en = descs.find((d) => (d.lang || '').toLowerCase().startsWith('en')) || descs[0];
  summary = en?.value || cna.title || c.summary || c.description || '';
  summary = String(summary).slice(0, 280);

  return {
    id,
    published,
    modified,
    cvss,
    severity:
      cvss >= 9 ? 'critical'
      : cvss >= 7 ? 'high'
      : cvss >= 4 ? 'medium'
      : cvss > 0 ? 'low'
      : 'info',
    summary,
  };
}

// 最近 CVE — CIRCL CVE-Search 公共接口（无需 key）
router.get('/cves', async (_req, res) => {
  try {
    const { data, cachedAt, fresh } = await cachedFetch(
      'cves',
      'https://cve.circl.lu/api/last/30',
      (raw) => {
        const list = Array.isArray(raw) ? raw : (raw?.data || []);
        return list.slice(0, 30).map(parseCveRecord);
      },
    );
    res.json({ source: 'CIRCL CVE-Search', cachedAt, fresh, items: data });
  } catch (err) {
    const stale = cache.get('cves');
    if (stale) return res.json({ source: 'CIRCL CVE-Search', cachedAt: stale.at, fresh: false, items: stale.data, stale: true, error: String(err.message || err) });
    res.status(502).json({ error: '上游不可达：' + (err.message || err), items: [] });
  }
});

// 最近恶意 URL/IOC — abuse.ch URLhaus 公共下载（无需 key）
router.get('/iocs', async (_req, res) => {
  try {
    const { data, cachedAt, fresh } = await cachedFetch(
      'iocs',
      'https://urlhaus.abuse.ch/downloads/json_recent/',
      (raw) => {
        const flat = [];
        // URLhaus 返回 { "id": [ {url, host, threat, tags, dateadded, ...} ] }
        if (raw && typeof raw === 'object') {
          for (const k of Object.keys(raw)) {
            const arr = raw[k];
            if (Array.isArray(arr)) flat.push(...arr);
          }
        }
        return flat.slice(0, 40).map((it) => ({
          host: it.host || '',
          url: it.url || '',
          threat: it.threat || 'unknown',
          tags: Array.isArray(it.tags) ? it.tags : (it.tags ? String(it.tags).split(',') : []),
          dateadded: it.dateadded || null,
          reporter: it.reporter || '',
          urlhausLink: it.urlhaus_reference || '',
        }));
      },
    );
    res.json({ source: 'abuse.ch URLhaus', cachedAt, fresh, items: data });
  } catch (err) {
    const stale = cache.get('iocs');
    if (stale) return res.json({ source: 'abuse.ch URLhaus', cachedAt: stale.at, fresh: false, items: stale.data, stale: true, error: String(err.message || err) });
    res.status(502).json({ error: '上游不可达：' + (err.message || err), items: [] });
  }
});

// 概要（聚合一次拿到）
router.get('/summary', async (_req, res) => {
  const safe = async (fn) => { try { return await fn(); } catch { return null; } };
  const [cves, iocs] = await Promise.all([
    safe(() => cachedFetch('cves', 'https://cve.circl.lu/api/last/30', (raw) => {
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      return list.slice(0, 30).map(parseCveRecord);
    })),
    safe(() => cachedFetch('iocs', 'https://urlhaus.abuse.ch/downloads/json_recent/', (raw) => {
      const flat = [];
      if (raw && typeof raw === 'object') for (const k of Object.keys(raw)) if (Array.isArray(raw[k])) flat.push(...raw[k]);
      return flat;
    })),
  ]);
  const cveCnt = cves?.data?.length || 0;
  const iocCnt = iocs?.data?.length || 0;
  const critical = (cves?.data || []).filter((c) => Number(c.cvss || 0) >= 9).length;
  res.json({
    cves: cveCnt,
    iocs: iocCnt,
    critical,
    cveCachedAt: cves?.cachedAt || null,
    iocCachedAt: iocs?.cachedAt || null,
  });
});

module.exports = router;
