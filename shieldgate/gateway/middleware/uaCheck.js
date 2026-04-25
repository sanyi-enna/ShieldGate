const ruleStats = require('../utils/ruleStats');

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
  'masscan',
  'nmap',
  'sqlmap',
  'nikto',
  'wpscan',
  'fuzz',
  'gobuster',
];

const BROWSER_SIGNALS = ['mozilla', 'webkit', 'gecko', 'chrome', 'safari', 'firefox', 'edge', 'opera'];

function uaCheck(req, _res, next) {
  if (req.isWhitelisted) return next();

  const raw = req.headers['user-agent'] || '';
  const ua = raw.toLowerCase();

  if (!ua) {
    req.isSuspiciousUA = true;
    req.uaReason = 'empty_ua';
    ruleStats.bump('ua');
    return next();
  }

  const matched = SUSPICIOUS_PATTERNS.find((p) => ua.includes(p));
  if (matched) {
    req.isSuspiciousUA = true;
    req.uaReason = `matched:${matched}`;
    ruleStats.bump('ua');
    return next();
  }

  const hasBrowserSignal = BROWSER_SIGNALS.some((s) => ua.includes(s));
  if (!hasBrowserSignal) {
    req.isSuspiciousUA = true;
    req.uaReason = 'no_browser_signal';
    ruleStats.bump('ua');
    return next();
  }

  req.isSuspiciousUA = false;
  next();
}

module.exports = uaCheck;
module.exports.SUSPICIOUS_PATTERNS = SUSPICIOUS_PATTERNS;
module.exports.BROWSER_SIGNALS = BROWSER_SIGNALS;
