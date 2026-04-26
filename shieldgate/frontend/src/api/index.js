import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 8000,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'ShieldGate-UI', // CSRF 防护：跨域请求浏览器不会带这个头
  },
});

// 拦截 401 → 跳登录
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(err);
  },
);

export const api = {
  // —— Auth ——
  login: (username, password) => http.post('/auth/login', { username, password }).then((r) => r.data),
  logout: () => http.post('/auth/logout').then((r) => r.data),
  me: () => http.get('/auth/me').then((r) => r.data),
  changePassword: (oldPassword, newPassword) =>
    http.post('/auth/change-password', { oldPassword, newPassword }).then((r) => r.data),

  // —— Stats / events ——
  getStats: () => http.get('/stats').then((r) => r.data),
  getAttacks: () => http.get('/stats/attacks').then((r) => r.data),

  // —— Bans ——
  getBans: () => http.get('/bans').then((r) => r.data),
  banIP: (ip, reason, ttl) => http.post('/bans', { ip, reason, ttl }).then((r) => r.data),
  unbanIP: (ip) => http.delete(`/bans/${encodeURIComponent(ip)}`).then((r) => r.data),

  // —— Config ——
  getConfig: () => http.get('/config').then((r) => r.data),
  updateConfig: (patch) => http.put('/config', patch).then((r) => r.data),
  resetConfig: () => http.post('/config/reset').then((r) => r.data),
  setBackendURL: (url) => http.post('/config/backend-url', { url }).then((r) => r.data),

  // —— Whitelist ——
  getWhitelist: () => http.get('/whitelist').then((r) => r.data),
  addWhitelist: (spec) => http.post('/whitelist', { spec }).then((r) => r.data),
  removeWhitelist: (spec) => http.delete(`/whitelist/${encodeURIComponent(spec)}`).then((r) => r.data),

  // —— Rules ——
  getRuleHits: () => http.get('/rules/hits').then((r) => r.data),
  resetRuleHits: () => http.post('/rules/hits/reset').then((r) => r.data),

  // —— Threat Intelligence ——
  getThreatCVEs: () => http.get('/threat-intel/cves').then((r) => r.data),
  getThreatIOCs: () => http.get('/threat-intel/iocs').then((r) => r.data),
  getThreatSummary: () => http.get('/threat-intel/summary').then((r) => r.data),
};
