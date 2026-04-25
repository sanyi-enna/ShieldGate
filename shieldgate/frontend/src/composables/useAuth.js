import { ref } from 'vue';
import { api, setUnauthorizedHandler } from '../api';

const user = ref(null);
const checked = ref(false);
let router = null;

export function setupAuth(_router) {
  router = _router;
  setUnauthorizedHandler(() => {
    user.value = null;
    if (router && router.currentRoute.value.path !== '/login') {
      router.replace({
        path: '/login',
        query: { redirect: router.currentRoute.value.fullPath },
      });
    }
  });

  router.beforeEach(async (to, _from, next) => {
    if (to.path === '/login') return next();
    if (!checked.value) {
      try {
        const r = await api.me();
        if (r.authenticated) user.value = r.user;
      } catch (_) {}
      checked.value = true;
    }
    if (!user.value) {
      return next({ path: '/login', query: { redirect: to.fullPath } });
    }
    next();
  });
}

export function useAuth() {
  async function login(username, password) {
    const r = await api.login(username, password);
    user.value = r.user;
    return r;
  }
  async function logout() {
    try { await api.logout(); } catch (_) {}
    user.value = null;
  }
  async function refresh() {
    try {
      const r = await api.me();
      user.value = r.authenticated ? r.user : null;
    } catch (_) {
      user.value = null;
    }
  }
  return { user, login, logout, refresh };
}
