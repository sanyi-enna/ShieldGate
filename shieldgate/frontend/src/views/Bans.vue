<template>
  <div>
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header">
        <div class="panel-title">手动封禁</div>
      </div>
      <div class="form-grid" style="grid-template-columns: 1.5fr 2fr 1fr auto; align-items: end; margin-bottom: 0;">
        <div class="form-row" style="margin:0;">
          <label>IP 地址</label>
          <input type="text" v-model="addForm.ip" placeholder="例如 1.2.3.4" />
        </div>
        <div class="form-row" style="margin:0;">
          <label>封禁原因</label>
          <input type="text" v-model="addForm.reason" placeholder="可选" />
        </div>
        <div class="form-row" style="margin:0;">
          <label>时长（秒）</label>
          <input type="number" v-model.number="addForm.ttl" min="10" max="86400" />
        </div>
        <button class="sg-btn sg-btn-primary" @click="onAdd" :disabled="adding">
          <Icon name="plus" :size="14" />
          {{ adding ? '处理中…' : '执行封禁' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          封禁记录
          <span class="muted" style="font-weight:400;font-size:12px;margin-left:8px;">
            {{ collapsed ? `${grouped.length} 个 IP` : `${filteredBans.length} 条历史` }}
            <template v-if="search?.keyword.value">
              · 已过滤「{{ search.keyword.value }}」
            </template>
          </span>
        </div>
        <div style="display:flex; gap:14px; align-items:center;">
          <label class="muted" style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <input type="checkbox" v-model="collapsed" style="cursor:pointer;" />
            按 IP 折叠
          </label>
          <span class="panel-extra" @click="load">{{ loading ? '刷新中…' : '↻ 刷新' }}</span>
        </div>
      </div>

      <!-- ===== 折叠模式：每 IP 一行 ===== -->
      <table v-if="collapsed" class="sg-table">
        <thead>
          <tr>
            <th style="width:40px;"></th>
            <th style="width:160px;">IP</th>
            <th style="width:140px;">最近原因</th>
            <th style="width:80px;">封禁次数</th>
            <th style="width:80px;">升级等级</th>
            <th style="width:140px;">最近一次时间</th>
            <th style="width:120px;">当前 TTL</th>
            <th style="width:90px;">状态</th>
            <th style="width:90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in grouped" :key="g.ip">
            <tr @click="toggleExpand(g.ip)" style="cursor:pointer;">
              <td>
                <Icon :name="expanded[g.ip] ? 'caret' : 'arrow'" :size="12" class="muted" />
              </td>
              <td class="mono" style="color:#4a9eff;"><Highlight :text="g.ip" /></td>
              <td><span :class="['tag', tagFor(g.lastReason)]">{{ g.lastReason }}</span></td>
              <td class="text-mono"><strong style="color:#e6eaf2;">{{ g.count }}</strong> 次</td>
              <td class="text-mono">
                <span v-if="g.maxLevel >= 4" style="color:#f5475b;">L{{ g.maxLevel }}</span>
                <span v-else-if="g.maxLevel >= 2" style="color:#f59e0b;">L{{ g.maxLevel }}</span>
                <span v-else>L{{ g.maxLevel || 1 }}</span>
              </td>
              <td class="muted text-mono" style="font-size:12px;">{{ fmtFull(g.lastTime) }}</td>
              <td class="text-mono">
                <span v-if="g.ttl > 0" style="color:#22c55e;">{{ g.ttl }} 秒</span>
                <span v-else class="muted">已过期</span>
              </td>
              <td>
                <span v-if="g.ttl > 0" class="tag-online tag" style="padding-left:0;">封禁中</span>
                <span v-else class="muted">已释放</span>
              </td>
              <td @click.stop>
                <a-popconfirm
                  v-if="g.ttl > 0"
                  :title="`确定解封 ${g.ip} ?`"
                  @confirm="onUnban(g.ip)"
                >
                  <button class="sg-btn" style="height:28px;padding:0 10px;color:#f5475b;">
                    <Icon name="unlock" :size="13" />
                    解封
                  </button>
                </a-popconfirm>
                <span v-else class="muted">—</span>
              </td>
            </tr>
            <tr v-if="expanded[g.ip]">
              <td colspan="9" style="background:#0b0e14;padding:12px 12px 12px 56px;">
                <div class="muted" style="font-size:11px;margin-bottom:8px;">
                  历史 {{ g.entries.length }} 条 · 最早 {{ fmtFull(g.entries[g.entries.length-1].time) }}
                </div>
                <div class="sub-history">
                  <div v-for="(e, i) in g.entries" :key="i" class="sub-row">
                    <span class="text-mono muted" style="font-size:11px;width:140px;">{{ fmtFull(e.time) }}</span>
                    <span :class="['tag', tagFor(e.reason)]">{{ e.reason }}</span>
                    <span class="text-mono muted" style="font-size:11px;">L{{ e.level || 1 }}</span>
                    <span class="text-mono muted" style="font-size:11px;">封禁 {{ e.ttl }}s</span>
                    <span class="text-mono muted" style="font-size:11px;flex:1;text-align:right;">命中 {{ e.hits || 0 }} 次</span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!grouped.length">
            <td colspan="9" class="muted" style="text-align:center;padding:32px;">暂无封禁记录</td>
          </tr>
        </tbody>
      </table>

      <!-- ===== 展开模式：完整历史 ===== -->
      <table v-else class="sg-table">
        <thead>
          <tr>
            <th style="width:160px;">IP</th>
            <th style="width:140px;">原因</th>
            <th style="width:60px;">等级</th>
            <th style="width:140px;">封禁时间</th>
            <th style="width:120px;">剩余 TTL</th>
            <th style="width:90px;">状态</th>
            <th style="width:90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bans" :key="b.time + b.ip">
            <td class="mono" style="color:#4a9eff;"><Highlight :text="b.ip" /></td>
            <td><span :class="['tag', tagFor(b.reason)]">{{ b.reason }}</span></td>
            <td class="text-mono">L{{ b.level || 1 }}</td>
            <td class="muted text-mono" style="font-size:12px;">{{ fmtFull(b.time) }}</td>
            <td class="text-mono">
              <span v-if="b.ttl > 0" style="color:#22c55e;">{{ b.ttl }} 秒</span>
              <span v-else class="muted">已过期</span>
            </td>
            <td>
              <span v-if="b.ttl > 0" class="tag-online tag" style="padding-left:0;">封禁中</span>
              <span v-else class="muted">已释放</span>
            </td>
            <td>
              <a-popconfirm
                v-if="b.ttl > 0"
                :title="`确定解封 ${b.ip} ?`"
                @confirm="onUnban(b.ip)"
              >
                <button class="sg-btn" style="height:28px;padding:0 10px;color:#f5475b;">
                  <Icon name="unlock" :size="13" />
                  解封
                </button>
              </a-popconfirm>
              <span v-else class="muted">—</span>
            </td>
          </tr>
          <tr v-if="!bans.length">
            <td colspan="7" class="muted" style="text-align:center;padding:32px;">暂无封禁记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, inject, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import Icon from '../components/Icon.vue';
import Highlight from '../components/Highlight.vue';
import { api } from '../api';

const search = inject('shieldgate-search', null);

const bans = ref([]);
const loading = ref(false);
const adding = ref(false);
const collapsed = ref(true);
const expanded = reactive({});
const addForm = reactive({ ip: '', reason: '手动封禁', ttl: 3600 });

let timer = null;

const filteredBans = computed(() => {
  if (!search?.filter.value) return bans.value;
  return bans.value.filter((b) => search.match(b, [b.ip, b.reason, b.level]));
});

const grouped = computed(() => {
  const map = new Map();
  for (const b of filteredBans.value) {
    if (!map.has(b.ip)) {
      map.set(b.ip, {
        ip: b.ip,
        entries: [],
        count: 0,
        maxLevel: 0,
        lastTime: 0,
        lastReason: '',
        ttl: 0,
      });
    }
    const g = map.get(b.ip);
    g.entries.push(b);
    g.count += 1;
    g.maxLevel = Math.max(g.maxLevel, b.level || 1);
    if ((b.time || 0) > g.lastTime) {
      g.lastTime = b.time;
      g.lastReason = b.reason;
      g.ttl = b.ttl;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if ((b.ttl > 0) !== (a.ttl > 0)) return b.ttl > 0 ? 1 : -1;
    return b.lastTime - a.lastTime;
  });
});

function toggleExpand(ip) {
  expanded[ip] = !expanded[ip];
}

async function load() {
  loading.value = true;
  try {
    bans.value = await api.getBans();
  } catch (err) {
    message.error('加载失败：' + err.message);
  } finally {
    loading.value = false;
  }
}

async function onAdd() {
  if (!addForm.ip.trim()) return message.warning('请填写 IP');
  adding.value = true;
  try {
    await api.banIP(addForm.ip.trim(), addForm.reason || '手动封禁', addForm.ttl);
    message.success('已封禁 ' + addForm.ip);
    addForm.ip = '';
    await load();
  } catch (err) {
    message.error('封禁失败：' + err.message);
  } finally {
    adding.value = false;
  }
}

async function onUnban(ip) {
  await api.unbanIP(ip);
  message.success('已解封 ' + ip);
  await load();
}

function tagFor(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('flood')) return 'tag-blocked-flood';
  if (r.includes('cc')) return 'tag-critical';
  if (r.includes('slow')) return 'tag-blocked-slowloris';
  if (r.includes('conn')) return 'tag-blocked-conn';
  if (r.includes('blacklist')) return 'tag-blocked-blacklist';
  if (r.includes('body')) return 'tag-medium';
  if (r.includes('geo')) return 'tag-low';
  if (r.includes('手动') || r.includes('manual')) return 'tag-low';
  return 'tag-info';
}

function fmtFull(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

onMounted(() => {
  load();
  timer = setInterval(load, 5000);
});
onUnmounted(() => timer && clearInterval(timer));
</script>

<style scoped>
.sub-history { display: flex; flex-direction: column; gap: 6px; }
.sub-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 0;
}
</style>
