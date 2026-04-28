const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream');
const { LOG_DIR } = require('./auditLog');

// 归档间隔：默认 6 小时扫描一次（启动时也立即扫描一次）
const ARCHIVE_INTERVAL_MS = Number(process.env.AUDIT_ARCHIVE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
// 归档保留天数：超过该天数的 .gz 自动清理；0 表示永久保留
const ARCHIVE_RETAIN_DAYS = process.env.AUDIT_ARCHIVE_RETAIN_DAYS !== undefined
  ? Number(process.env.AUDIT_ARCHIVE_RETAIN_DAYS)
  : 30;

const FILE_RE = /^audit-(\d{4}-\d{2}-\d{2})\.log$/;
const GZ_RE   = /^audit-(\d{4}-\d{2}-\d{2})\.log\.gz$/;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function gzipFile(src, dst) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(src);
    // 写到临时文件再 rename，避免半成品 .gz 留在磁盘
    const tmp = dst + '.tmp';
    const output = fs.createWriteStream(tmp);
    pipeline(input, zlib.createGzip({ level: 9 }), output, (err) => {
      if (err) {
        fs.unlink(tmp, () => reject(err));
        return;
      }
      fs.rename(tmp, dst, (err2) => err2 ? reject(err2) : resolve());
    });
  });
}

async function archiveOnce() {
  if (!fs.existsSync(LOG_DIR)) return { archived: 0, removed: 0 };

  const today = todayStr();
  const files = fs.readdirSync(LOG_DIR);
  let archived = 0;
  let removed = 0;

  // 1. 压缩除今天以外的所有 audit-*.log
  for (const name of files) {
    const m = name.match(FILE_RE);
    if (!m) continue;
    const date = m[1];
    if (date >= today) continue;   // 当天日志正在写，跳过

    const src = path.join(LOG_DIR, name);
    const dst = path.join(LOG_DIR, name + '.gz');

    // 已存在 .gz：删源文件即可（理论上不会发生，防御性处理）
    if (fs.existsSync(dst)) {
      try { fs.unlinkSync(src); } catch (_) {}
      continue;
    }

    try {
      await gzipFile(src, dst);
      fs.unlinkSync(src);
      archived++;
      console.log(`[audit] archived ${name} → ${path.basename(dst)}`);
    } catch (err) {
      console.error(`[audit] archive ${name} failed:`, err.message);
    }
  }

  // 2. 清理超过保留期的 .gz
  if (ARCHIVE_RETAIN_DAYS > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_RETAIN_DAYS);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    for (const name of files) {
      const m = name.match(GZ_RE);
      if (!m) continue;
      if (m[1] >= cutoffStr) continue;
      try {
        fs.unlinkSync(path.join(LOG_DIR, name));
        removed++;
        console.log(`[audit] removed expired ${name}`);
      } catch (err) {
        console.error(`[audit] remove ${name} failed:`, err.message);
      }
    }
  }

  return { archived, removed };
}

let timer = null;

function start() {
  // 启动后延迟 30 秒先跑一次，避免与服务启动抢 IO
  setTimeout(() => {
    archiveOnce().catch((e) => console.error('[audit] archive error:', e.message));
  }, 30 * 1000);

  timer = setInterval(() => {
    archiveOnce().catch((e) => console.error('[audit] archive error:', e.message));
  }, ARCHIVE_INTERVAL_MS);

  // 不阻止进程退出
  if (timer.unref) timer.unref();

  console.log(`[audit] log archiver started (interval=${ARCHIVE_INTERVAL_MS}ms, retain=${ARCHIVE_RETAIN_DAYS}d)`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, archiveOnce };
