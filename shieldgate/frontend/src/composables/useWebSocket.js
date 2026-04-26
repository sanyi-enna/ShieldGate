import { ref, onUnmounted } from 'vue';

export function useWebSocket(url) {
  const stats = ref(null);
  const recentBans = ref([]);
  const attacks = ref([]);
  const connected = ref(false);
  let ws = null;
  let reconnectTimer = null;
  let manuallyClosed = false;

  function connect() {
    try {
      ws = new WebSocket(url);
    } catch (_) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected.value = true;
    };

    ws.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const { type, data } = payload;
      if (type === 'stats') {
        stats.value = data;
        if (data?.recentBans) recentBans.value = data.recentBans;
        if (data?.recentAttacks) attacks.value = data.recentAttacks;
      } else if (type === 'attack') {
        attacks.value = [data, ...attacks.value].slice(0, 50);
      }
    };

    ws.onclose = (ev) => {
      connected.value = false;
      // 4401 = 服务器告知 token 过期/未授权，停止自动重连，跳登录
      if (ev?.code === 4401) {
        manuallyClosed = true;
        if (typeof window !== 'undefined') {
          // 清除可能存在的本地登录态并跳登录
          window.location.hash = '#/login';
        }
        return;
      }
      if (!manuallyClosed) scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch (_) {}
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  connect();

  onUnmounted(() => {
    manuallyClosed = true;
    try { ws?.close(); } catch (_) {}
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });

  return { stats, recentBans, attacks, connected };
}
