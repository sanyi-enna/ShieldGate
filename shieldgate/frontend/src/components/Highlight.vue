<template>
  <span>
    <template v-for="(seg, i) in segs" :key="i">
      <mark v-if="seg.hit" class="sg-mark">{{ seg.text }}</mark>
      <template v-else>{{ seg.text }}</template>
    </template>
  </span>
</template>

<script setup>
import { computed, inject } from 'vue';

const props = defineProps({
  text: { type: [String, Number], default: '' },
});

const search = inject('shieldgate-search', null);
const segs = computed(() => {
  if (!search) return [{ text: String(props.text ?? ''), hit: false }];
  return search.segments(props.text);
});
</script>
