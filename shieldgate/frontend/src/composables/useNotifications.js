import { ref, watch, computed } from 'vue';

// 监听 WS 推送的攻击事件，转成通知队列；记录已读 / 未读 / 静音状态。
// localStorage key: 'sg_notify_v1'
const STORAGE = 'sg_notify_v1';
const MAX = 50;

export function createNotifications(ws) {
  const items = ref([]);          // [{ id, kind, title, desc, time, read, route }]
  const open = ref(false);
  const muted = ref(false);

  // 恢复持久化状态（已读列表 + 静音）
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    if (Array.isArray(saved.items)) items.value = saved.items.slice(0, MAX);
    muted.value = !!saved.muted;
  } catch (_) {}

  function persist() {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({ items: items.value.slice(0, MAX), muted: muted.value }),
      );
    } catch (_) {}
  }

  function push(notice) {
    const id = `${notice.time}-${notice.kind}-${notice.ip || ''}-${Math.random().toString(36).slice(2, 6)}`;
    items.value = [{ ...notice, id, read: false }, ...items.value].slice(0, MAX);
    persist();
    if (!muted.value && typeof window !== 'undefined' && 'Notification' in window) {
      // 浏览器通知（用户可能没授权，失败静默）
      try {
        if (Notification.permission === 'granted') {
          new Notification(notice.title, { body: notice.desc, tag: 'shieldgate' });
        }
      } catch (_) {}
    }
  }

  function classify(attack) {
    const t = String(attack.type || '').toLowerCase();
    if (t.includes('flood')) return { kind: 'danger', icon: 'flood' };
    if (t.includes('cc'))    return { kind: 'danger', icon: 'flood' };
    if (t.includes('slow'))  return { kind: 'warn',   icon: 'slow' };
    if (t.includes('conn'))  return { kind: 'warn',   icon: 'database' };
    if (t.includes('body'))  return { kind: 'warn',   icon: 'rules' };
    if (t.includes('geo'))   return { kind: 'info',   icon: 'shield' };
    if (t.includes('blacklist')) return { kind: 'info', icon: 'ban' };
    return { kind: 'info', icon: 'alert' };
  }

  // 监听攻击事件流；只在有新增 attack 时推一条
  let lastAttackKey = '';
  watch(
    () => ws.attacks?.value?.[0],
    (a) => {
      if (!a) return;
      const key = `${a.time}-${a.ip}-${a.type}`;
      if (key === lastAttackKey) return;
      lastAttackKey = key;
      const meta = classify(a);
      push({
        kind: meta.kind,
        icon: meta.icon,
        title: `${a.type || '攻击事件'}`,
        desc: `${a.ip || '未知 IP'}${a.reason ? ' · ' + a.reason : ''}`,
        time: a.time || Date.now(),
        route: '/attacks',
        ip: a.ip,
      });
    },
    { immediate: true },
  );

  // 也通过 WS 连接状态推系统消息
  let lastConnState = null;
  watch(
    () => ws.connected?.value,
    (c) => {
      if (lastConnState === null) { lastConnState = c; return; }
      if (c === lastConnState) return;
      lastConnState = c;
      push({
        kind: c ? 'ok' : 'warn',
        icon: c ? 'shield' : 'alert',
        title: c ? '实时连接已恢复' : '实时连接已断开',
        desc: c ? 'WebSocket 重连成功' : '将自动重连…',
        time: Date.now(),
        route: '/dashboard',
      });
    },
  );

  const unread = computed(() => items.value.filter((i) => !i.read).length);

  function markAllRead() {
    items.value = items.value.map((i) => ({ ...i, read: true }));
    persist();
  }
  function readOne(id) {
    items.value = items.value.map((i) => (i.id === id ? { ...i, read: true } : i));
    persist();
  }
  function clearAll() {
    items.value = [];
    persist();
  }
  function toggleMute() {
    muted.value = !muted.value;
    persist();
    if (!muted.value && typeof window !== 'undefined' && 'Notification' in window) {
      try { Notification.requestPermission(); } catch (_) {}
    }
  }

  return { items, open, unread, muted, push, markAllRead, readOne, clearAll, toggleMute };
}
