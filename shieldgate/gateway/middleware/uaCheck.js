const SUSPICIOUS_PATTERNS = [
  'python-requests',
  'python-urllib',
  'go-http-client',
  'curl/',
  'wget/',
  'locust',
  'apache-httpclient',
  'okhttp',
  'httpie',
  'scrapy',
  'java/',
  'node-fetch',
  'axios/',
];

const BROWSER_SIGNALS = ['mozilla', 'webkit', 'gecko', 'chrome', 'safari', 'firefox', 'edge', 'opera'];

function uaCheck(req, _res, next) {
  const raw = req.headers['user-agent'] || '';
  const ua = raw.toLowerCase();

  if (!ua) {
    req.isSuspiciousUA = true;
    req.uaReason = 'empty_ua';
    return next();
  }

  const matched = SUSPICIOUS_PATTERNS.find((p) => ua.includes(p));
  if (matched) {
    req.isSuspiciousUA = true;
    req.uaReason = `matched:${matched}`;
    return next();
  }

  const hasBrowserSignal = BROWSER_SIGNALS.some((s) => ua.includes(s));
  if (!hasBrowserSignal) {
    req.isSuspiciousUA = true;
    req.uaReason = 'no_browser_signal';
    return next();
  }

  req.isSuspiciousUA = false;
  next();
}

module.exports = uaCheck;
module.exports.SUSPICIOUS_PATTERNS = SUSPICIOUS_PATTERNS;
module.exports.BROWSER_SIGNALS = BROWSER_SIGNALS;
