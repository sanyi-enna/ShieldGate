<template>
  <div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">攻击事件流</div>
        <div class="panel-extra" @click="load">↻ 刷新</div>
      </div>
      <table class="sg-table">
        <thead>
          <tr>
            <th style="width:160px;">时间</th>
            <th style="width:180px;">攻击类型</th>
            <th style="width:160px;">来源 IP</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(a, i) in list" :key="i">
            <td class="muted text-mono" style="font-size:12px;">{{ fmtFull(a.time) }}</td>
            <td><span :class="['tag', tagFor(a.type)]">{{ a.type }}</span></td>
            <td class="mono" style="color:#4a9eff;">{{ a.ip }}</td>
            <td class="muted">{{ a.reason || '—' }}</td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="4" class="muted" style="text-align:center;padding:32px;">暂无攻击事件</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, inject, onMounted, computed } from 'vue';
import { api } from '../api';

const ws = inject('shieldgate-ws');
const wsAttacks = ws.attacks;
const persistAttacks = ref([]);

const list = computed(() => {
  // 合并 WebSocket 实时流与后端持久化日志，去重
  const map = new Map();
  for (const a of wsAttacks.value) map.set(`${a.time}-${a.ip}-${a.type}`, a);
  for (const a of persistAttacks.value) {
    const k = `${a.time}-${a.ip}-${a.type}`;
    if (!map.has(k)) map.set(k, a);
  }
  return Array.from(map.values()).sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 200);
});

async function load() {
  try {
    persistAttacks.value = await api.getAttacks();
  } catch (_) {}
}

function tagFor(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('flood')) return 'tag-blocked-flood';
  if (t.includes('slow')) return 'tag-blocked-slowloris';
  if (t.includes('conn')) return 'tag-blocked-conn';
  if (t.includes('blacklist')) return 'tag-blocked-blacklist';
  return 'tag-info';
}

function fmtFull(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

onMounted(load);
</script>
