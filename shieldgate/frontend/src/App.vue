<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#4a9eff', colorBgBase: '#0b0e14' } }">
    <div class="sg-layout">
      <aside class="sg-sider">
        <div class="sg-brand">
          <img src="/favicon.svg" alt="logo" />
          <div>
            <div class="name">ShieldGate</div>
            <div class="sub">盾门 · WAF</div>
          </div>
        </div>

        <div class="sg-workspace">
          <div class="ws-name">
            <span>{{ workspace }}</span>
            <Icon name="caret" :size="14" class="ws-arrow" />
          </div>
          <div class="ws-meta">{{ stats?.total ?? 0 }} 请求 · 主工作区</div>
        </div>

        <nav class="sg-nav">
          <router-link
            v-for="item in nav"
            :key="item.path"
            :to="item.path"
            custom
            v-slot="{ isActive, navigate }"
          >
            <div :class="['sg-nav-item', isActive && 'active']" @click="navigate">
              <Icon :name="item.icon" class="icon" />
              <span>{{ item.label }}</span>
              <span v-if="item.badge" class="badge">{{ item.badge }}</span>
            </div>
          </router-link>
        </nav>

        <div class="sg-sider-bottom">
          <div class="sg-nav-item">
            <Icon name="settings" class="icon" />
            <span>设置</span>
          </div>
          <div class="sg-user">
            <div class="avatar">S</div>
            <div class="info">
              <div class="nm">SecOps</div>
              <div class="role">管理员</div>
            </div>
          </div>
        </div>
      </aside>

      <main class="sg-main">
        <header class="sg-pageheader">
          <div class="sg-pagetitle">
            <div class="t">{{ pageTitle }}</div>
            <div class="s">
              <span :class="['live-dot', wsConnected ? '' : 'off']"></span>
              <span>{{ pageSub }}</span>
            </div>
          </div>
          <div class="sg-actions">
            <input class="sg-search" placeholder="搜索 IP、规则、攻击类型…" v-model="searchKeyword" />
            <button class="sg-iconbtn has-dot" title="告警"><Icon name="bell" :size="16" /></button>
            <button class="sg-iconbtn" title="刷新" @click="refresh"><Icon name="refresh" :size="16" /></button>
          </div>
        </header>
        <div class="sg-page">
          <router-view :search="searchKeyword" />
        </div>
      </main>
    </div>
  </a-config-provider>
</template>

<script setup>
import { provide, computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './components/Icon.vue';
import { useWebSocket } from './composables/useWebSocket';

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
const ws = useWebSocket(wsUrl);
const { connected: wsConnected, stats } = ws;
provide('shieldgate-ws', ws);

const route = useRoute();
const searchKeyword = ref('');

const workspace = '127.0.0.1:8080';

const nav = computed(() => [
  { path: '/dashboard', label: '监控大屏', icon: 'dashboard' },
  { path: '/rules', label: '规则配置', icon: 'rules' },
  { path: '/bans', label: '封禁管理', icon: 'ban', badge: stats.value?.banned ? Math.min(stats.value.banned, 99) : null },
  { path: '/attacks', label: '攻击事件', icon: 'flood' },
]);

const pageTitle = computed(() => {
  const map = {
    '/dashboard': '防护态势总览',
    '/rules': '规则配置',
    '/bans': '封禁管理',
    '/attacks': '攻击事件',
  };
  return map[route.path] || 'ShieldGate';
});

const pageSub = computed(() => {
  if (!wsConnected.value) return `${workspace} · 实时连接已断开`;
  return `${workspace} · 实时监控中`;
});

function refresh() { location.reload(); }
</script>
