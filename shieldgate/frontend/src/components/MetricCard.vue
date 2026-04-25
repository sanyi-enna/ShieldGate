<template>
  <div :class="['metric-card', tone]">
    <div class="head">
      <span>{{ label }}</span>
      <Icon v-if="icon" :name="icon" :size="16" class="icon" />
    </div>
    <div class="value">{{ display }}</div>
    <div class="foot">
      <span>{{ foot }}</span>
      <span v-if="delta" :class="deltaCls">{{ delta }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  label: String,
  value: { type: [Number, String], default: 0 },
  foot: { type: String, default: '' },
  delta: { type: String, default: '' },
  deltaUp: { type: Boolean, default: false },
  tone: { type: String, default: 'neutral' },
  icon: String,
});

const display = computed(() => {
  if (typeof props.value === 'number') return props.value.toLocaleString();
  return props.value ?? '-';
});
const deltaCls = computed(() => (props.deltaUp ? 'delta-up' : 'delta-down'));
</script>
