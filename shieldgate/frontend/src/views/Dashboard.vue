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
      <div class="panel panel-bans">
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

        <!-- 威胁情报：近期恶意 URL / IOC 轮播 -->
        <div class="ti-feed">
          <div class="ti-feed-head">
            <span class="ti-feed-title">近期恶意 URL / IOC</span>
            <span class="ti-feed-meta" v-if="iocItems.length">
              {{ iocIndex + 1 }} / {{ iocItems.length }} · URLhaus
            </span>
            <span class="ti-feed-meta" v-else>加载中…</span>
          </div>
          <transition name="ti-fade" mode="out-in">
            <div v-if="currentIoc" :key="iocKey(currentIoc)" class="ti-feed-card">
              <div class="ti-feed-row">
                <span class="ti-feed-id mono">{{ currentIoc.host || extractHost(currentIoc.url) }}</span>
                <span class="ti-sev sev-high">{{ currentIoc.threat || 'malware_url' }}</span>
              </div>
              <div class="ti-feed-summary mono" :title="currentIoc.url">{{ currentIoc.url }}</div>
              <div class="ti-feed-tags" v-if="currentIoc.tags?.length || currentIoc.dateadded">
                <span class="ti-feed-time" v-if="currentIoc.dateadded">{{ fmtIocDate(currentIoc.dateadded) }}</span>
                <span v-for="t in (currentIoc.tags || []).slice(0, 3)" :key="t" class="ti-feed-tag">{{ t }}</span>
              </div>
            </div>
            <div v-else class="ti-feed-empty">暂无威胁情报</div>
          </transition>
          <router-link to="/threat-intel" class="ti-feed-more">查看全部 ›</router-link>
        </div>
      </div>

      <div class="panel panel-trend">
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
          <div class="panel-title">规则命中分布</div>
          <div class="panel-extra">实时累计</div>
        </div>
        <RuleHits :hits="ruleHits" />
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
              <td class="mono" style="color:#4a9eff;"><Highlight :text="b.ip" /></td>
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
                <Highlight :text="a.type" /> · <span class="text-mono" style="color:#4a9eff;"><Highlight :text="a.ip" /></span>
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
import { computed, inject, ref, onMounted, onUnmounted } from 'vue';
import MetricCard from '../components/MetricCard.vue';
import RealtimeChart from '../components/RealtimeChart.vue';
import Donut from '../components/Donut.vue';
import Icon from '../components/Icon.vue';
import RuleHits from '../components/RuleHits.vue';
import Highlight from '../components/Highlight.vue';
import { api } from '../api';

const ws = inject('shieldgate-ws');
const search = inject('shieldgate-search', null);
const stats = ws.stats;
const recentBans = ws.recentBans;
const attacks = ws.attacks;
const ruleHits = computed(() => stats.value?.ruleHits || {});

function passSearch(record, fields) {
  if (!search?.filter.value) return true;
  return search.match(record, fields);
}

const totalSeries = computed(() => stats.value?.history || []);
const blockedSeries = computed(() => stats.value?.blockedHistory || []);
const peakRps = computed(() => Math.max(0, ...(stats.value?.history || [0])));

const activeBans = computed(() => recentBans.value.filter((b) => (b.ttl || 0) > 0).length);
// 累计封禁数：用真实计数器 stats.banned，不再被历史列表 100 上限封顶
const totalBans = computed(() => stats.value?.banned ?? recentBans.value.length);

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

const topRiskIps = computed(() => {
  const filtered = search?.filter.value
    ? recentBans.value.filter((b) => search.match(b, [b.ip, b.reason]))
    : recentBans.value;
  return filtered.slice(0, 6);
});

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
  const all = attacks.value || [];
  const filtered = search?.filter.value
    ? all.filter((a) => search.match(a, [a.ip, a.type, a.reason]))
    : all;
  return filtered.slice(0, 6);
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

// —— 威胁情报：近期恶意 URL / IOC 轮播 ——
const iocItems = ref([]);
const iocIndex = ref(0);
const currentIoc = computed(() => iocItems.value[iocIndex.value] || null);
let rotateTimer = null;
let refreshTimer = null;

function iocKey(it) { return (it.url || '') + '|' + (it.dateadded || ''); }
function extractHost(u) { try { return new URL(u).hostname; } catch { return u; } }
function fmtIocDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadIocs() {
  try {
    const r = await api.getThreatIOCs();
    const items = (r.items || []).filter((it) => it.url || it.host);
    if (items.length) {
      iocItems.value = items;
      if (iocIndex.value >= items.length) iocIndex.value = 0;
    }
  } catch (_) { /* 静默失败：不打扰大屏 */ }
}

onMounted(() => {
  loadIocs();
  // 每 5 秒切换一条
  rotateTimer = setInterval(() => {
    if (iocItems.value.length) iocIndex.value = (iocIndex.value + 1) % iocItems.value.length;
  }, 5000);
  // 每 5 分钟刷新一次（后端已做 5 分钟缓存）
  refreshTimer = setInterval(loadIocs, 5 * 60 * 1000);
});
onUnmounted(() => {
  if (rotateTimer) clearInterval(rotateTimer);
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>
