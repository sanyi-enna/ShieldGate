// 原子化滑动窗口限流：单次 EVAL 完成 清窗 + 写点 + 计数 + 续期，
// 避免应用进程在并发下产生竞态。返回当前窗口内请求数。
//
// KEYS[1] = ZSET 桶 key
// ARGV[1] = now（毫秒时间戳）
// ARGV[2] = window 大小（毫秒）
// ARGV[3] = 软上限（>= softLimit 即返回，但仍计入）
// ARGV[4] = 硬上限（> hardLimit 时不再 zadd，避免 ZSET 暴涨）
//
// 返回：current_count
const SCRIPT = `
local key   = KEYS[1]
local now   = tonumber(ARGV[1])
local win   = tonumber(ARGV[2])
local soft  = tonumber(ARGV[3])
local hard  = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, now - win)
local count = redis.call('ZCARD', key)
if count <= hard then
  redis.call('ZADD', key, now, now .. ':' .. math.random(1, 1e9))
  count = count + 1
end
redis.call('PEXPIRE', key, win + 1000)
return count
`;

let sha = null;

async function evalLimit(redis, key, now, windowMs, softLimit, hardLimit) {
  try {
    if (!sha) {
      sha = await redis.script('load', SCRIPT);
    }
    return await redis.evalsha(sha, 1, key, now, windowMs, softLimit, hardLimit);
  } catch (err) {
    if (String(err.message).includes('NOSCRIPT')) {
      sha = null;
      return await redis.eval(SCRIPT, 1, key, now, windowMs, softLimit, hardLimit);
    }
    throw err;
  }
}

module.exports = { evalLimit };
