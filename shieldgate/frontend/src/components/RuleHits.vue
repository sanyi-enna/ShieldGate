<template>
  <div class="rule-hits">
    <div v-for="r in rows" :key="r.key" class="rule-row">
      <div class="rule-info">
        <span :class="['rule-name', r.cls]">{{ r.label }}</span>
        <span class="muted text-mono" style="font-size:11px;">{{ r.key }}</span>
      </div>
      <div class="rule-bar">
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: pct(r.value) + '%', background: r.color }" />
        </div>
      </div>
      <div class="rule-value text-mono">{{ r.value.toLocaleString() }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  hits: { type: Object, default: () => ({}) },
});

const META = [
  { key: 'whitelist',  label: '白名单放行', color: '#22c55e', cls: 'tag-online' },
  { key: 'blacklist',  label: '黑名单',     color: '#a855f7', cls: 'tag-blocked-blacklist' },
  { key: 'ua',         label: 'UA 标记',    color: '#06b6d4', cls: 'tag-blocked-ua' },
  { key: 'connection', label: '并发连接',   color: '#facc15', cls: 'tag-blocked-conn' },
  { key: 'slowloris',  label: 'Slowloris',  color: '#f59e0b', cls: 'tag-blocked-slowloris' },
  { key: 'bodySize',   label: 'Body 大小',  color: '#ec4899', cls: 'tag-medium' },
  { key: 'rateLimit',  label: '限流封禁',   color: '#f5475b', cls: 'tag-blocked-flood' },
  { key: 'ccProtect',  label: 'CC 攻击',    color: '#fb7185', cls: 'tag-critical' },
  { key: 'geo',        label: 'GeoIP',      color: '#10b981', cls: 'tag-low' },
  { key: 'challenge',  label: '挑战页',     color: '#4a9eff', cls: 'tag-low' },
];

const max = computed(() => {
  let m = 1;
  for (const meta of META) {
    const v = Number(props.hits?.[meta.key] || 0);
    if (v > m) m = v;
  }
  return m;
});

const rows = computed(() =>
  META.map((m) => ({
    ...m,
    value: Number(props.hits?.[m.key] || 0),
  })),
);

function pct(v) {
  return Math.min(100, (v / max.value) * 100);
}
</script>

<style scoped>
.rule-hits { display: flex; flex-direction: column; gap: 11px; }
.rule-row {
  display: grid;
  grid-template-columns: minmax(0, 130px) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}
.rule-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rule-name {
  font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rule-info > span:nth-child(2) {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rule-bar { min-width: 0; }
.bar-track {
  width: 100%; height: 6px;
  background: #1a1f2c;
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width .3s ease;
}
.rule-value {
  font-size: 13px; color: #e6eaf2; text-align: right;
  min-width: 56px; white-space: nowrap;
}
.muted { color: #6b7588; }
</style>
