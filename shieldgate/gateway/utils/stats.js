const EventEmitter = require('events');
const redis = require('./redis');

const SNAPSHOT_KEY = 'stats:snapshot';
const ATTACK_CHANNEL = 'events:attack';
const ATTACK_LOG = 'events:attack:log';

class Stats extends EventEmitter {
  constructor() {
    super();
    this.total = 0;
    this.blocked = 0;
    this.banned = 0;
    this.currentRPS = 0;
    this.currentBlockedRPS = 0;
    this.history = [];
    this.blockedHistory = [];
    this.recentAttacks = [];
    this._windowCount = 0;
    this._windowBlocked = 0;
  }

  record() {
    this.total++;
    this._windowCount++;
  }

  recordBlocked(event) {
    this.blocked++;
    this._windowBlocked++;
    if (event) {
      const enriched = { ...event, time: event.time || Date.now() };
      this.recentAttacks.unshift(enriched);
      if (this.recentAttacks.length > 50) this.recentAttacks.pop();
      this.emit('attack', enriched);

      const payload = JSON.stringify(enriched);
      redis.publish(ATTACK_CHANNEL, payload).catch(() => {});
      redis
        .multi()
        .lpush(ATTACK_LOG, payload)
        .ltrim(ATTACK_LOG, 0, 199)
        .exec()
        .catch(() => {});
    }
  }

  tick() {
    this.currentRPS = this._windowCount;
    this.currentBlockedRPS = this._windowBlocked;
    this.history.push(this._windowCount);
    this.blockedHistory.push(this._windowBlocked);
    if (this.history.length > 60) this.history.shift();
    if (this.blockedHistory.length > 60) this.blockedHistory.shift();
    this._windowCount = 0;
    this._windowBlocked = 0;

    const snapshot = this.snapshot();
    redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => {});
  }

  snapshot() {
    return {
      total: this.total,
      blocked: this.blocked,
      banned: this.banned,
      currentRPS: this.currentRPS,
      currentBlockedRPS: this.currentBlockedRPS,
      history: [...this.history],
      blockedHistory: [...this.blockedHistory],
      recentAttacks: this.recentAttacks.slice(0, 20),
      ts: Date.now(),
    };
  }
}

const stats = new Stats();
stats.SNAPSHOT_KEY = SNAPSHOT_KEY;
stats.ATTACK_CHANNEL = ATTACK_CHANNEL;
stats.ATTACK_LOG = ATTACK_LOG;

module.exports = stats;
