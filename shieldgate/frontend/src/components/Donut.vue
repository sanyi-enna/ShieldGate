<template>
  <div class="donut">
    <svg viewBox="0 0 36 36" style="width:100%;height:100%;">
      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#1a2235" stroke-width="3.2" />
      <circle
        v-for="(seg, i) in arcs"
        :key="i"
        cx="18"
        cy="18"
        r="15.915"
        fill="none"
        :stroke="seg.color"
        stroke-width="3.2"
        :stroke-dasharray="`${seg.len} ${100 - seg.len}`"
        :stroke-dashoffset="seg.offset"
        stroke-linecap="butt"
        transform="rotate(-90 18 18)"
      />
    </svg>
    <div class="center">
      <div class="num">{{ centerNum }}</div>
      <div class="lab">{{ centerLab }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  segments: { type: Array, required: true },
  centerNum: [Number, String],
  centerLab: String,
});

const arcs = computed(() => {
  const total = props.segments.reduce((a, b) => a + (b.value || 0), 0) || 1;
  let cursor = 0;
  return props.segments.map((s) => {
    const len = ((s.value || 0) / total) * 100;
    const arc = { len, offset: -cursor, color: s.color };
    cursor += len;
    return arc;
  });
});
</script>
