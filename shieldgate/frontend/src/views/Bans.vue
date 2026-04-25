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
        <div class="panel-title">封禁记录（最近 50 条）</div>
        <div class="panel-extra" @click="load">{{ loading ? '刷新中…' : '↻ 刷新' }}</div>
      </div>
      <table class="sg-table">
        <thead>
          <tr>
            <th style="width:160px;">IP</th>
            <th style="width:140px;">原因</th>
            <th style="width:140px;">封禁时间</th>
            <th style="width:120px;">剩余 TTL</th>
            <th style="width:90px;">状态</th>
            <th style="width:90px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bans" :key="b.time + b.ip">
            <td class="mono" style="color:#4a9eff;">{{ b.ip }}</td>
            <td><span :class="['tag', tagFor(b.reason)]">{{ b.reason }}</span></td>
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
            <td colspan="6" class="muted" style="text-align:center;padding:32px;">暂无封禁记录</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import Icon from '../components/Icon.vue';
import { api } from '../api';

const bans = ref([]);
const loading = ref(false);
const adding = ref(false);
const addForm = reactive({ ip: '', reason: '手动封禁', ttl: 3600 });

let timer = null;

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
  if (!addForm.ip.trim()) {
    message.warning('请填写 IP');
    return;
  }
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
  if (r.includes('slow')) return 'tag-blocked-slowloris';
  if (r.includes('conn')) return 'tag-blocked-conn';
  if (r.includes('blacklist')) return 'tag-blocked-blacklist';
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
