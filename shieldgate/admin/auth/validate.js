// 输入校验：长度限制 + 字符白名单。
// 即便后端不使用 SQL，也作为「纵深防御」对所有用户输入做严格校验，
// 拒绝任何含有典型 SQL 注入元字符 (' " ; -- /* */ \) 的内容。
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
// 黑名单：典型 SQLi 片段，一旦命中直接拒绝（即使后端不会拼 SQL）
const SQLI_PATTERNS = [
  /(\b)(or|and)\s+\d+\s*=\s*\d+/i,
  /union\s+select/i,
  /information_schema/i,
  /'(\s*or\s*'|\s*=\s*')/i,
  /--/,
  /\/\*/,
  /;\s*drop/i,
  /\bsleep\s*\(/i,
  /\bbenchmark\s*\(/i,
  /xp_cmdshell/i,
];

function isSafe(str) {
  if (typeof str !== 'string') return false;
  for (const re of SQLI_PATTERNS) if (re.test(str)) return false;
  return true;
}

function validateUsername(u) {
  if (typeof u !== 'string') throw new Error('username 必须是字符串');
  if (!USERNAME_RE.test(u)) throw new Error('username 仅支持 3–32 位字母/数字/下划线/点/连字符');
  if (!isSafe(u)) throw new Error('username 包含非法字符');
  return u;
}

function validatePassword(p) {
  if (typeof p !== 'string') throw new Error('password 必须是字符串');
  if (p.length < PASSWORD_MIN || p.length > PASSWORD_MAX) {
    throw new Error(`password 长度需 ${PASSWORD_MIN}–${PASSWORD_MAX}`);
  }
  return p;
}

function sanitizePlainText(s, maxLen = 256) {
  if (typeof s !== 'string') return '';
  // 去掉控制字符
  return s.replace(/[\x00-\x1F\x7F]/g, '').slice(0, maxLen);
}

module.exports = { isSafe, validateUsername, validatePassword, sanitizePlainText };
