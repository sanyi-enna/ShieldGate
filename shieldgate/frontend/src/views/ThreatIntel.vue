<template>
  <div>
    <!-- 概要条 -->
    <div class="metric-strip" style="grid-template-columns: repeat(4, 1fr);">
      <MetricCard
        label="最新 CVE"
        :value="summary.cves || 0"
        tone="info"
        icon="alert"
        :foot="cveAge"
      />
      <MetricCard
        label="高危 CVE (≥9.0)"
        :value="summary.critical || 0"
        tone="danger"
        icon="shield"
        foot="CVSS v3 严重等级"
      />
      <MetricCard
        label="近期恶意 URL"
        :value="summary.iocs || 0"
        tone="warning"
        icon="flood"
        :foot="iocAge"
      />
      <MetricCard
        label="情报源"
        value="2"
        tone="success"
        icon="globe"
        foot="CIRCL · abuse.ch"
      />
    </div>

    <!-- 双面板 -->
    <div class="ti-grid">
      <!-- CVE -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            最新 CVE
            <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px;">来源 CIRCL CVE-Search</span>
          </div>
          <div class="panel-extra" @click="reload('cves')">
            <span v-if="loading.cves">刷新中…</span>
            <span v-else>↻ 刷新</span>
          </div>
        </div>
        <div v-if="error.cves" class="ti-error">{{ error.cves }}</div>
        <div v-else-if="!cves.length && !loading.cves" class="ti-empty">暂无数据</div>
        <div v-else class="ti-list">
          <div v-for="c in cves" :key="c.id" class="ti-cve">
            <div class="ti-cve-head">
              <a class="ti-cve-id mono" :href="`https://nvd.nist.gov/vuln/detail/${c.id}`" target="_blank" rel="noreferrer">{{ c.id }}</a>
              <span :class="['ti-sev', `sev-${c.severity}`]">{{ sevLabel(c.severity) }} · {{ c.cvss?.toFixed ? c.cvss.toFixed(1) : c.cvss || '—' }}</span>
              <span class="ti-cve-time">{{ fmtDate(c.published) }}</span>
            </div>
            <div class="ti-cve-summary" :title="c.summary">{{ c.summary || '暂无描述' }}</div>
          </div>
        </div>
      </div>

      <!-- IOC -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            近期恶意 URL / IOC
            <span class="muted" style="font-weight:400;font-size:12px;margin-left:6px;">来源 abuse.ch URLhaus</span>
          </div>
          <div class="panel-extra" @click="reload('iocs')">
            <span v-if="loading.iocs">刷新中…</span>
            <span v-else>↻ 刷新</span>
          </div>
        </div>
        <div v-if="error.iocs" class="ti-error">{{ error.iocs }}</div>
        <div v-else-if="!iocs.length && !loading.iocs" class="ti-empty">暂无数据</div>
        <div v-else class="ti-list">
          <div v-for="(it, i) in iocs" :key="i" class="ti-ioc">
            <div class="ti-ioc-head">
              <span class="ti-ioc-host mono">{{ it.host || extractHost(it.url) }}</span>
              <span class="tag tag-blocked-flood" v-if="it.threat">{{ it.threat }}</span>
              <button class="ti-ioc-block" @click="addBlock(it.host || extractHost(it.url))" title="加入黑名单">封禁</button>
            </div>
            <div class="ti-ioc-url mono" :title="it.url">{{ it.url }}</div>
            <div class="ti-ioc-meta">
              <span>{{ fmtDate(it.dateadded) }}</span>
              <span v-if="it.tags?.length"> · </span>
              <span v-if="it.tags?.length" class="ti-tags">
                <span v-for="t in it.tags.slice(0, 4)" :key="t" class="ti-tag">{{ t }}</span>
              </span>
              <a v-if="it.urlhausLink" :href="it.urlhausLink" target="_blank" rel="noreferrer" class="ti-link">详情 ›</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { api } from '../api';
import MetricCard from '../components/MetricCard.vue';

const cves = ref([]);
const iocs = ref([]);
const summary = reactive({ cves: 0, iocs: 0, critical: 0, cveCachedAt: null, iocCachedAt: null });
const loading = reactive({ cves: false, iocs: false });
const error = reactive({ cves: '', iocs: '' });

const cveAge = computed(() => fmtAge(summary.cveCachedAt));
const iocAge = computed(() => fmtAge(summary.iocCachedAt));

async function loadCVEs() {
  loading.cves = true;
  error.cves = '';
  try {
    const r = await api.getThreatCVEs();
    cves.value = r.items || [];
    summary.cveCachedAt = r.cachedAt;
    summary.cves = cves.value.length;
    summary.critical = cves.value.filter((c) => Number(c.cvss || 0) >= 9).length;
    if (r.stale) error.cves = `已加载缓存（上游异常：${r.error || '未知'}）`;
  } catch (e) {
    error.cves = e.response?.data?.error || e.message || '请求失败';
  } finally {
    loading.cves = false;
  }
}

async function loadIOCs() {
  loading.iocs = true;
  error.iocs = '';
  try {
    const r = await api.getThreatIOCs();
    iocs.value = r.items || [];
    summary.iocCachedAt = r.cachedAt;
    summary.iocs = iocs.value.length;
    if (r.stale) error.iocs = `已加载缓存（上游异常：${r.error || '未知'}）`;
  } catch (e) {
    error.iocs = e.response?.data?.error || e.message || '请求失败';
  } finally {
    loading.iocs = false;
  }
}

function reload(kind) {
  if (kind === 'cves') loadCVEs();
  if (kind === 'iocs') loadIOCs();
}

async function addBlock(host) {
  const ip = (host || '').trim();
  if (!ip) { message.warning('无可用地址'); return; }
  // 仅当看起来像 IP 时直接封禁；否则提示用户去白名单/黑名单页面
  const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.includes(':');
  if (!isIP) {
    message.info(`"${ip}" 是域名，请到「封禁管理」按域名解析后封禁`);
    return;
  }
  try {
    await api.banIP(ip, '威胁情报：URLhaus IOC', 3600);
    message.success(`已封禁 ${ip} · 1h`);
  } catch (e) {
    message.error(e.response?.data?.error || '封禁失败');
  }
}

function sevLabel(s) {
  return ({ critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息' })[s] || s;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts).slice(0, 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtAge(ts) {
  if (!ts) return '尚未加载';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `更新于 ${sec}s 前`;
  if (sec < 3600) return `更新于 ${Math.floor(sec / 60)} 分钟前`;
  return `更新于 ${Math.floor(sec / 3600)} 小时前`;
}
function extractHost(u) {
  try { return new URL(u).hostname; } catch { return u; }
}

onMounted(() => {
  loadCVEs();
  loadIOCs();
});
</script>

<style scoped>
.ti-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
}
@media (max-width: 1100px) {
  .ti-grid { grid-template-columns: minmax(0, 1fr); }
}
.ti-list { display: flex; flex-direction: column; max-height: 640px; overflow-y: auto; padding-right: 4px; }
.ti-list::-webkit-scrollbar { width: 6px; }
.ti-list::-webkit-scrollbar-track { background: transparent; }
.ti-list::-webkit-scrollbar-thumb { background: #1f2633; border-radius: 3px; }
.ti-empty, .ti-error {
  padding: 30px 12px; text-align: center; color: #6b7588; font-size: 13px;
}
.ti-error { color: #f59e0b; }

.ti-cve { padding: 12px 4px; border-bottom: 1px solid #1a1f2c; }
.ti-cve:last-child { border-bottom: none; }
.ti-cve-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ti-cve-id { color: #4a9eff; font-size: 13px; text-decoration: none; }
.ti-cve-id:hover { text-decoration: underline; }
.ti-cve-time { color: #6b7588; font-size: 11px; margin-left: auto; font-family: 'SF Mono', Menlo, monospace; }
.ti-cve-summary { margin-top: 6px; color: #c1c8d5; font-size: 12px; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.ti-sev { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 500; }
.sev-critical { background: rgba(245,71,91,0.15); color: #f5475b; }
.sev-high     { background: rgba(245,158,11,0.15); color: #f59e0b; }
.sev-medium   { background: rgba(250,204,21,0.15); color: #facc15; }
.sev-low      { background: rgba(74,158,255,0.15); color: #4a9eff; }
.sev-info     { background: rgba(107,117,136,0.15); color: #8a93a6; }

.ti-ioc { padding: 11px 4px; border-bottom: 1px solid #1a1f2c; }
.ti-ioc:last-child { border-bottom: none; }
.ti-ioc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ti-ioc-host { color: #e6eaf2; font-size: 13px; font-weight: 500; }
.ti-ioc-block {
  margin-left: auto; background: transparent; border: 1px solid #2a4570;
  color: #4a9eff; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.ti-ioc-block:hover { background: #15263f; }
.ti-ioc-url {
  margin-top: 4px; color: #8a93a6; font-size: 11px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ti-ioc-meta { margin-top: 4px; color: #6b7588; font-size: 11px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ti-tags { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.ti-tag {
  background: #1a2235; color: #8a93a6; padding: 1px 6px; border-radius: 3px; font-size: 10px;
}
.ti-link { color: #4a9eff; margin-left: auto; text-decoration: none; }
.ti-link:hover { text-decoration: underline; }
</style>
