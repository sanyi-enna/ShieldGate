<template>
  <div class="trend-chart">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

const props = defineProps({
  total: { type: Array, default: () => [] },
  blocked: { type: Array, default: () => [] },
});

const canvas = ref(null);
let chart = null;

function buildLabels(len) {
  return Array.from({ length: len }, (_, i) => `${i - (len - 1)}s`);
}

onMounted(() => {
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: buildLabels(60),
      datasets: [
        {
          label: '总请求/秒',
          data: props.total,
          borderColor: '#4a9eff',
          backgroundColor: (ctx) => {
            const { chart: c } = ctx;
            const { ctx: cv, chartArea } = c;
            if (!chartArea) return 'rgba(74,158,255,0.12)';
            const g = cv.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(74,158,255,0.32)');
            g.addColorStop(1, 'rgba(74,158,255,0.02)');
            return g;
          },
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '拦截/秒',
          data: props.blocked,
          borderColor: '#f5475b',
          backgroundColor: 'rgba(245,71,91,0.12)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          align: 'end',
          labels: { color: '#8a93a6', boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: '#0b0e14',
          borderColor: '#1f2633',
          borderWidth: 1,
          titleColor: '#e6eaf2',
          bodyColor: '#c1c8d5',
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: '#4a5267', maxTicksLimit: 7, font: { size: 10 } },
          grid: { display: false },
          border: { color: '#1f2633' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#4a5267', precision: 0, font: { size: 10 } },
          grid: { color: '#1a1f2c' },
          border: { display: false },
        },
      },
    },
  });
});

watch(
  () => [props.total, props.blocked],
  ([t, b]) => {
    if (!chart) return;
    const len = Math.max(t.length, b.length, 60);
    chart.data.labels = buildLabels(len);
    chart.data.datasets[0].data = t;
    chart.data.datasets[1].data = b;
    chart.update('none');
  },
  { deep: true },
);

onUnmounted(() => chart?.destroy());
</script>
