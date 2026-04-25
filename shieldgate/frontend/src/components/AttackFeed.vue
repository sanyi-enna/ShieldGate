<template>
  <div class="feed">
    <div v-if="!list.length" class="feed-empty">暂无攻击事件</div>
    <div v-for="(item, i) in list" :key="i" class="feed-item">
      <span :class="['type', toneCls(item.type)]">{{ item.type || '-' }}</span>
      <span class="ip">{{ item.ip }}</span>
      <span class="reason" :title="item.reason">{{ item.reason || '—' }}</span>
      <span class="time">{{ fmt(item.time) }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  list: { type: Array, default: () => [] },
});

function toneCls(t = '') {
  const s = String(t).toLowerCase();
  if (s.includes('flood')) return 'tag-blocked-flood';
  if (s.includes('slowloris')) return 'tag-blocked-slowloris';
  if (s.includes('connection')) return 'tag-blocked-conn';
  if (s.includes('blacklist')) return 'tag-blocked-blacklist';
  if (s.includes('ua')) return 'tag-blocked-ua';
  return 'muted';
}

function fmt(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
</script>
