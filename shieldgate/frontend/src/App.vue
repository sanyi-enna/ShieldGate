<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#4a9eff', colorBgBase: '#0b0e14' } }">
    <router-view v-if="$route.meta?.noLayout" />
    <div v-else class="sg-layout">
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
          <div class="sg-nav-item" @click="changePwdOpen = true">
            <Icon name="settings" class="icon" />
            <span>修改密码</span>
          </div>
          <div class="sg-nav-item" @click="onLogout">
            <Icon name="unlock" class="icon" />
            <span>退出登录</span>
          </div>
          <div class="sg-user">
            <div class="avatar">{{ avatarLetter }}</div>
            <div class="info">
              <div class="nm">{{ user?.sub || user?.username || '未登录' }}</div>
              <div class="role">{{ user?.role || '—' }}</div>
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
            <div class="sg-searchbox" ref="searchBoxRef">
              <span class="sg-search-icon">
                <Icon name="search" :size="14" />
              </span>
              <input
                ref="searchInputRef"
                class="sg-search"
                placeholder="搜索 IP / 攻击类型 / 路径 …  按 / 聚焦"
                v-model="search.keyword.value"
                @focus="search.showSuggest.value = true"
                @keydown.esc="search.clear()"
                @keydown.enter="onEnter"
                @keydown.down.prevent="moveSuggest(1)"
                @keydown.up.prevent="moveSuggest(-1)"
              />
              <button
                v-if="search.keyword.value"
                class="sg-search-clear"
                @click="search.clear()"
                title="清除 (Esc)"
              >×</button>

              <div v-if="search.showSuggest.value" class="sg-suggest">
                <template v-if="!search.keyword.value">
                  <div class="sg-suggest-section">快捷命令</div>
                  <div
                    v-for="(s, i) in quickShortcuts"
                    :key="s.path"
                    :class="['sg-suggest-item', activeIdx === i && 'active']"
                    @click="search.jumpTo(s.path)"
                    @mouseenter="activeIdx = i"
                  >
                    <Icon :name="s.icon" :size="14" />
                    <span>{{ s.label }}</span>
                    <span class="desc">{{ s.path }}</span>
                  </div>
                  <div class="sg-suggest-section">搜索语法</div>
                  <div class="sg-suggest-item" style="cursor:default;">
                    <span class="sk">1.2.3.4</span>
                    <span class="desc">直接输入 IP，跳转到该 IP 的封禁记录</span>
                  </div>
                  <div class="sg-suggest-item" style="cursor:default;">
                    <span class="sk">flood / cc / slow / blacklist</span>
                    <span class="desc">按攻击类型过滤当前页面</span>
                  </div>
                </template>
                <template v-else>
                  <div class="sg-suggest-section">建议</div>
                  <div
                    v-for="(s, i) in dynamicSuggestions"
                    :key="s.prefix + s.keyword + s.suffix"
                    :class="['sg-suggest-item', activeIdx === i && 'active']"
                    @click="s.action()"
                    @mouseenter="activeIdx = i"
                  >
                    <Icon :name="s.icon" :size="14" />
                    <span>
                      {{ s.prefix }}<span class="sk">{{ s.keyword }}</span>{{ s.suffix }}
                    </span>
                    <span class="desc">{{ s.desc }}</span>
                  </div>
                  <div v-if="!dynamicSuggestions.length" class="sg-suggest-empty">
                    无匹配。当前正在过滤所有列表。
                  </div>
                </template>
              </div>
            </div>
            <div class="sg-notifybox" ref="notifyBoxRef">
              <button
                :class="['sg-iconbtn', notifications.unread.value > 0 ? 'has-dot' : '']"
                :title="notifications.unread.value > 0 ? `${notifications.unread.value} 条未读` : '通知'"
                @click="toggleNotify"
              >
                <Icon name="bell" :size="16" />
                <span v-if="notifications.unread.value > 0" class="badge">
                  {{ notifications.unread.value > 99 ? '99+' : notifications.unread.value }}
                </span>
              </button>
              <div v-if="notifications.open.value" class="sg-notify-panel">
                <div class="sg-notify-head">
                  <div class="ttl">
                    通知中心
                    <span class="small">
                      {{ notifications.items.value.length }} 条 ·
                      <span style="color:#f5475b">{{ notifications.unread.value }}</span> 未读
                    </span>
                  </div>
                  <div class="actions">
                    <button
                      :class="notifications.muted.value ? 'muted' : ''"
                      :title="notifications.muted.value ? '已静音浏览器通知' : '静音浏览器通知'"
                      @click="notifications.toggleMute()"
                    >{{ notifications.muted.value ? '🔕' : '🔔' }}</button>
                    <button
                      :disabled="!notifications.unread.value"
                      @click="notifications.markAllRead()"
                    >全部已读</button>
                  </div>
                </div>
                <div class="sg-notify-list">
                  <div v-if="!notifications.items.value.length" class="sg-notify-empty">
                    暂无通知。攻击事件、连接异常会实时推送到这里。
                  </div>
                  <div
                    v-for="n in notifications.items.value"
                    :key="n.id"
                    :class="['sg-notify-item', !n.read && 'unread']"
                    @click="onNotifyClick(n)"
                  >
                    <div :class="['sg-notify-icon', n.kind]">
                      <Icon :name="n.icon" :size="14" />
                    </div>
                    <div class="sg-notify-body">
                      <div class="sg-notify-title">{{ n.title }}</div>
                      <div class="sg-notify-desc" :title="n.desc">{{ n.desc }}</div>
                      <div class="sg-notify-time">{{ fmtRel(n.time) }} · {{ fmtFull(n.time) }}</div>
                    </div>
                  </div>
                </div>
                <div class="sg-notify-foot">
                  <span class="link" @click="goAttacks">查看全部攻击事件 ›</span>
                  <button
                    class="clear"
                    :disabled="!notifications.items.value.length"
                    @click="notifications.clearAll()"
                  >清空</button>
                </div>
              </div>
            </div>
            <button class="sg-iconbtn" title="刷新" @click="refresh"><Icon name="refresh" :size="16" /></button>
          </div>
        </header>
        <div class="sg-page">
          <router-view />
        </div>
      </main>

      <a-modal
        v-model:open="changePwdOpen"
        title="修改密码"
        :ok-text="changing ? '提交中…' : '确认修改'"
        cancel-text="取消"
        :confirm-loading="changing"
        @ok="onChangePwd"
      >
        <div class="form-row">
          <label>原密码</label>
          <input type="password" v-model="pwdForm.oldPassword" maxlength="128" />
        </div>
        <div class="form-row">
          <label>新密码（至少 8 位）</label>
          <input type="password" v-model="pwdForm.newPassword" maxlength="128" minlength="8" />
        </div>
        <div class="form-row">
          <label>确认新密码</label>
          <input type="password" v-model="pwdForm.confirm" maxlength="128" />
        </div>
      </a-modal>
    </div>
  </a-config-provider>
</template>

<script setup>
import { provide, computed, ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import Icon from './components/Icon.vue';
import { useWebSocket } from './composables/useWebSocket';
import { createSearch } from './composables/useSearch';
import { createNotifications } from './composables/useNotifications';
import { useAuth } from './composables/useAuth';

const { user, logout } = useAuth();
const avatarLetter = computed(() => (user.value?.sub || user.value?.username || 'S').slice(0, 1).toUpperCase());

const changePwdOpen = ref(false);
const changing = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirm: '' });

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
const ws = useWebSocket(wsUrl);
const { connected: wsConnected, stats } = ws;
provide('shieldgate-ws', ws);

const route = useRoute();
const router = useRouter();
const search = createSearch(router);
provide('shieldgate-search', search);

const notifications = createNotifications(ws);
provide('shieldgate-notifications', notifications);

const workspace = computed(() => {
  if (typeof location === 'undefined') return '—';
  const host = location.host || '';
  // 当前是 hash 路由，如果通过反代进来 host 就是真实访问域名 / IP
  return host || location.hostname || '—';
});

const nav = computed(() => [
  { path: '/dashboard', label: '监控大屏', icon: 'dashboard' },
  { path: '/rules', label: '规则配置', icon: 'rules' },
  { path: '/bans', label: '封禁管理', icon: 'ban', badge: stats.value?.banned ? Math.min(stats.value.banned, 99) : null },
  { path: '/whitelist', label: '白名单', icon: 'shield' },
  { path: '/attacks', label: '攻击事件', icon: 'flood' },
  { path: '/threat-intel', label: '威胁情报', icon: 'globe' },
]);

const pageTitle = computed(() => {
  const map = {
    '/dashboard': '防护态势总览',
    '/rules': '规则配置',
    '/bans': '封禁管理',
    '/whitelist': '白名单',
    '/attacks': '攻击事件',
    '/threat-intel': '威胁情报',
  };
  return map[route.path] || 'ShieldGate';
});

const pageSub = computed(() => {
  if (!wsConnected.value) return `${workspace.value} · 实时连接已断开`;
  if (search.keyword.value) return `${workspace.value} · 搜索中："${search.keyword.value}"`;
  return `${workspace.value} · 实时监控中`;
});

const quickShortcuts = [
  { path: '/dashboard', label: '监控大屏', icon: 'dashboard' },
  { path: '/bans', label: '封禁管理', icon: 'ban' },
  { path: '/attacks', label: '攻击事件', icon: 'flood' },
  { path: '/whitelist', label: '白名单', icon: 'shield' },
  { path: '/rules', label: '规则配置', icon: 'rules' },
];

// 根据当前关键字给出动态建议（IP → 跳封禁页查 IP；类型词 → 跳攻击事件页过滤；其它 → 当前页过滤）
const dynamicSuggestions = computed(() => {
  const k = search.keyword.value.trim();
  if (!k) return [];
  const items = [];
  const f = search.filter.value;

  if (f?.isIP) {
    items.push({
      icon: 'ban',
      prefix: '查看 IP ', keyword: k, suffix: ' 的封禁记录',
      desc: '/bans',
      action: () => { search.jumpTo('/bans'); },
    });
    items.push({
      icon: 'flood',
      prefix: '查看 IP ', keyword: k, suffix: ' 的攻击事件',
      desc: '/attacks',
      action: () => { search.jumpTo('/attacks'); },
    });
    items.push({
      icon: 'shield',
      prefix: '将 ', keyword: k, suffix: ' 加入白名单',
      desc: '/whitelist',
      action: () => { search.jumpTo('/whitelist'); },
    });
    return items;
  }

  const lower = k.toLowerCase();
  const typeMap = [
    { kw: ['flood', 'http flood', '泛洪'],          icon: 'flood',   label: 'HTTP Flood' },
    { kw: ['cc'],                                    icon: 'flood',   label: 'CC Attack' },
    { kw: ['slow', 'slowloris'],                    icon: 'slow',    label: 'Slowloris' },
    { kw: ['conn', 'connection', '并发'],            icon: 'database',label: 'ConnectionLimit' },
    { kw: ['blacklist', '黑名单'],                   icon: 'ban',     label: 'Blacklist' },
    { kw: ['body', '大包'],                          icon: 'rules',   label: 'BodySize' },
    { kw: ['geo', '地区'],                           icon: 'shield',  label: 'GeoBlock' },
    { kw: ['ua', 'agent', '可疑'],                   icon: 'alert',   label: 'UA 标记' },
  ];
  for (const t of typeMap) {
    if (t.kw.some((w) => lower.includes(w))) {
      items.push({
        icon: t.icon,
        prefix: '按攻击类型 ', keyword: t.label, suffix: ' 过滤',
        desc: '/attacks',
        action: () => { search.jumpTo('/attacks'); },
      });
      break;
    }
  }

  items.push({
    icon: 'search',
    prefix: '在当前页面过滤包含 ', keyword: k, suffix: ' 的行',
    desc: route.path,
    action: () => { search.showSuggest.value = false; },
  });

  return items;
});

const activeIdx = ref(0);
function moveSuggest(delta) {
  const list = search.keyword.value ? dynamicSuggestions.value : quickShortcuts;
  if (!list.length) return;
  activeIdx.value = (activeIdx.value + delta + list.length) % list.length;
}
function onEnter() {
  const list = search.keyword.value ? dynamicSuggestions.value : quickShortcuts;
  const item = list[activeIdx.value];
  if (item) {
    if ('action' in item) item.action();
    else if ('path' in item) search.jumpTo(item.path);
  }
}

const searchBoxRef = ref(null);
const searchInputRef = ref(null);
const notifyBoxRef = ref(null);

function toggleNotify() {
  notifications.open.value = !notifications.open.value;
}

function onNotifyClick(n) {
  notifications.readOne(n.id);
  if (n.ip && search) {
    search.keyword.value = n.ip;
  }
  if (n.route) router.push(n.route);
  notifications.open.value = false;
}

function goAttacks() {
  router.push('/attacks');
  notifications.open.value = false;
}

function fmtFull(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtRel(ts) {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return '刚刚';
  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

function onDocClick(e) {
  if (searchBoxRef.value && !searchBoxRef.value.contains(e.target)) {
    search.showSuggest.value = false;
  }
  if (notifyBoxRef.value && !notifyBoxRef.value.contains(e.target)) {
    notifications.open.value = false;
  }
}
function onKey(e) {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault();
    searchInputRef.value?.focus();
  } else if (e.key === 'Escape' && notifications.open.value) {
    notifications.open.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});

function refresh() { location.reload(); }

async function onLogout() {
  await logout();
  router.replace('/login');
}

async function onChangePwd() {
  if (pwdForm.newPassword.length < 8) {
    message.error('新密码至少 8 位');
    return;
  }
  if (pwdForm.newPassword !== pwdForm.confirm) {
    message.error('两次输入的新密码不一致');
    return;
  }
  changing.value = true;
  try {
    const { api } = await import('./api');
    await api.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    message.success('密码已更新，下次登录请使用新密码');
    changePwdOpen.value = false;
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirm = '';
  } catch (err) {
    message.error(err.response?.data?.error || '修改失败');
  } finally {
    changing.value = false;
  }
}
</script>
