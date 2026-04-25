const redis = require('./redis');
const cidr = require('./cidr');

const REDIS_KEY = 'whitelist:cidr';
let cache = [];
let cacheAt = 0;
const TTL_MS = 5000;

async function load() {
  const list = await redis.smembers(REDIS_KEY);
  cache = list;
  cacheAt = Date.now();
  return cache;
}

async function isWhitelisted(ip) {
  if (Date.now() - cacheAt > TTL_MS) await load().catch(() => {});
  if (!cache.length) return null;
  return cidr.matchAny(cache, ip);
}

async function add(spec) {
  await redis.sadd(REDIS_KEY, spec);
  await load();
}

async function remove(spec) {
  await redis.srem(REDIS_KEY, spec);
  await load();
}

async function list() {
  return await redis.smembers(REDIS_KEY);
}

module.exports = { isWhitelisted, add, remove, list, load };
