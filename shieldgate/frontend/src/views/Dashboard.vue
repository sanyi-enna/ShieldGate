<template>
  <div>
    <!-- Top metric strip -->
    <div class="metric-strip">
      <MetricCard
        label="总请求数"
        :value="stats?.total || 0"
        tone="neutral"
        icon="database"
        :foot="`已拦截 ${stats?.blocked || 0}`"
        :delta="`+${stats?.currentRPS || 0} 当前/秒`"
        delta-up
      />
      <MetricCard
        label="实时拦截"
        :value="stats?.currentBlockedRPS || 0"
        tone="danger"
        icon="alert"
        :foot="`累计 ${stats?.blocked || 0}`"
      />
      <MetricCard
        label="封禁 IP"
        :value="activeBans"
        tone="warning"
        icon="ban"
        :foot="`累计 ${stats?.banned || 0}`"
      />
      <MetricCard
        label="实时 RPS"
        :value="stats?.currentRPS || 0"
        tone="info"
        icon="trend"
        :foot="`60s 峰值 ${peakRps}`"
      />
      <MetricCard
        label="拦截率"
        :value="blockRate"
        tone="success"
        icon="shield"
        :foot="`总流量 ${stats?.total || 0}`"
      />
    </div>

    <!-- Three panels: ban distribution, trend chart, source/state list -->
    <div class="panel-grid">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">封禁原因分布</div>
        </div>
        <div class="donut-wrap">
          <Donut :segments="donutSegments" :center-num="totalBans" center-lab="封禁" />
          <div class="donut-legend">
            <div v-for="seg in donutLegend" :key="seg.label" class="row">
              <span class="dot" :style="{ background: seg.color }"></span>
              <span class="lab">{{ seg.label }}</span>
              <span class="num">{{ seg.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">流量趋势 — 最近 60 秒</div>
          <div class="panel-extra">每秒刷新</div>
        </div>
        <div class="trend-num">
          {{ stats?.currentRPS || 0 }}
          <span style="font-size:13px;color:#6b7588;font-weight:400;"> 请求 / 秒</span>
        </div>
        <RealtimeChart :total="totalSeries" :blocked="blockedSeries" />
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">中间件状态</div>
        </div>
        <div class="src-list">
          <div v-for="m in middlewareStatus" :key="m.name" :class="['src-row', m.cls]">
            <span class="dot"></span>
            <span class="name">{{ m.name }}</span>
            <span :class="['val', m.warn ? 'warn' : '']">{{ m.value }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom: high risk IP table + recent timeline -->
    <div class="bottom-row">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">高风险 IP</div>
          <router-link to="/bans" class="panel-extra">查看全部 ›</router-link>
        </div>
        <table class="sg-table">
          <thead>
            <tr>
              <th>IP / 来源</th>
              <th style="width:130px;">封禁原因</th>
              <th style="width:140px;">触发时间</th>
              <th style="width:90px;">剩余 TTL</th>
              <th style="width:80px;">威胁评分</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in topRiskIps" :key="b.time + b.ip">
              <td class="mono" style="color:#4a9eff;">{{ b.ip }}</td>
              <td>
                <span :class="['tag', tagFor(b.reason)]">{{ b.reason }}</span>
              </td>
              <td class="muted text-mono" style="font-size:12px;">{{ fmtFull(b.time) }}</td>
              <td class="text-mono">
                <span v-if="b.ttl > 0" style="color:#22c55e;">{{ b.ttl }}s</span>
                <span v-else class="muted">已过期</span>
              </td>
              <td>
                <span :class="['score', scoreCls(b.reason)]">{{ scoreFor(b.reason) }}</span>
              </td>
            </tr>
            <tr v-if="!topRiskIps.length">
              <td colspan="5" class="muted" style="text-align:center;padding:32px;">暂无封禁 IP</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">最近事件</div>
          <router-link to="/attacks" class="panel-extra">查看全部 ›</router-link>
        </div>
        <div class="tl">
          <div v-for="(a, i) in recentEvents" :key="i" class="tl-item">
            <div :class="['tl-icon', tlTone(a.type)]">
              <Icon :name="tlIcon(a.type)" :size="14" />
            </div>
            <div class="tl-body">
              <div class="tl-title">
                {{ a.type }} · <span class="text-mono" style="color:#4a9eff;">{{ a.ip }}</span>
              </div>
              <div class="tl-meta">{{ shortReason(a.reason) }} · {{ fmtFull(a.time) }}</div>
            </div>
          </div>
          <div v-if="!recentEvents.length" class="muted" style="text-align:center;padding:32px;">暂无事件</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import MetricCard from '../components/MetricCard.vue';
import RealtimeChart from '../components/RealtimeChart.vue';
import Donut from '../components/Donut.vue';
import Icon from '../components/Icon.vue';

const ws = inject('shieldgate-ws');
const stats = ws.stats;
const recentBans = ws.recentBans;
const attacks = ws.attacks;

const totalSeries = computed(() => stats.value?.history || []);
const blockedSeries = computed(() => stats.value?.blockedHistory || []);
const peakRps = computed(() => Math.max(0, ...(stats.value?.history || [0])));

const activeBans = computed(() => recentBans.value.filter((b) => (b.ttl || 0) > 0).length);
const totalBans = computed(() => recentBans.value.length);

const blockRate = computed(() => {
  const t = stats.value?.total || 0;
  const b = stats.value?.blocked || 0;
  if (!t) return '0.00%';
  return `${((b / t) * 100).toFixed(2)}%`;
});

const donutSegments = computed(() => {
  const counts = countByReason(recentBans.value);
  return [
    { value: counts['HTTP Flood'], color: '#f5475b' },
    { value: counts['Slowloris'], color: '#f59e0b' },
    { value: counts['ConnectionLimit'], color: '#facc15' },
    { value: counts['Blacklist'], color: '#a855f7' },
    { value: counts['Manual'], color: '#4a9eff' },
  ];
});
const donutLegend = computed(() => {
  const counts = countByReason(recentBans.value);
  return [
    { label: 'HTTP Flood', value: counts['HTTP Flood'], color: '#f5475b' },
    { label: 'Slowloris', value: counts['Slowloris'], color: '#f59e0b' },
    { label: '并发耗尽', value: counts['ConnectionLimit'], color: '#facc15' },
    { label: '黑名单', value: counts['Blacklist'], color: '#a855f7' },
    { label: '手动', value: counts['Manual'], color: '#4a9eff' },
  ];
});

function countByReason(bans) {
  const c = { 'HTTP Flood': 0, 'Slowloris': 0, ConnectionLimit: 0, Blacklist: 0, Manual: 0 };
  for (const b of bans) {
    const r = String(b.reason || '');
    if (r.includes('Flood')) c['HTTP Flood']++;
    else if (r.includes('Slowloris')) c['Slowloris']++;
    else if (r.includes('Connection')) c['ConnectionLimit']++;
    else if (r.includes('Blacklist') || r.includes('黑名单')) c['Blacklist']++;
    else if (r.includes('手动') || r.toLowerCase().includes('manual')) c['Manual']++;
    else c['Manual']++;
  }
  return c;
}

const middlewareStatus = computed(() => {
  const blocked = stats.value?.blocked || 0;
  const total = stats.value?.total || 0;
  const ratio = total ? ((blocked / total) * 100).toFixed(2) : '0.00';
  return [
    { name: 'blacklistCheck', value: '运行中', cls: 'ok' },
    { name: 'uaCheck', value: '运行中', cls: 'ok' },
    { name: 'connectionLimit', value: '运行中', cls: 'ok' },
    { name: 'slowlorisDetect', value: '运行中', cls: 'ok' },
    { name: 'rateLimiter', value: `命中率 ${ratio}%`, cls: 'ok', warn: parseFloat(ratio) > 30 },
    { name: 'reverse-proxy', value: '已转发', cls: 'ok' },
  ];
});

const topRiskIps = computed(() => recentBans.value.slice(0, 6));

function shortReason(r) {
  if (!r) return '—';
  return String(r).length > 40 ? String(r).slice(0, 40) + '…' : r;
}
function tagFor(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('flood')) return 'tag-blocked-flood';
  if (r.includes('slow')) return 'tag-blocked-slowloris';
  if (r.includes('conn')) return 'tag-blocked-conn';
  if (r.includes('blacklist')) return 'tag-blocked-blacklist';
  return 'tag-info';
}
function scoreFor(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('flood')) return 92;
  if (r.includes('slow')) return 78;
  if (r.includes('conn')) return 65;
  if (r.includes('blacklist')) return 55;
  return 40;
}
function scoreCls(reason) {
  const s = scoreFor(reason);
  if (s >= 85) return 'crit';
  if (s >= 70) return 'high';
  if (s >= 50) return 'med';
  return 'low';
}

const recentEvents = computed(() => {
  const list = (attacks.value || []).slice(0, 6);
  return list;
});
function tlTone(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('flood')) return 'danger';
  if (t.includes('slow')) return 'warn';
  if (t.includes('conn')) return 'warn';
  if (t.includes('blacklist')) return 'info';
  return 'info';
}
function tlIcon(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('flood')) return 'flood';
  if (t.includes('slow')) return 'slow';
  if (t.includes('conn')) return 'database';
  if (t.includes('blacklist')) return 'ban';
  return 'alert';
}
function fmtFull(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
</script>
