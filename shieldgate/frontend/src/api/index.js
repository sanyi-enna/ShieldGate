import axios from 'axios';

const http = axios.create({
  baseURL: '/api',
  timeout: 8000,
});

export const api = {
  getStats: () => http.get('/stats').then((r) => r.data),
  getAttacks: () => http.get('/stats/attacks').then((r) => r.data),

  getBans: () => http.get('/bans').then((r) => r.data),
  banIP: (ip, reason, ttl) => http.post('/bans', { ip, reason, ttl }).then((r) => r.data),
  unbanIP: (ip) => http.delete(`/bans/${encodeURIComponent(ip)}`).then((r) => r.data),

  getConfig: () => http.get('/config').then((r) => r.data),
  updateConfig: (patch) => http.put('/config', patch).then((r) => r.data),
  resetConfig: () => http.post('/config/reset').then((r) => r.data),

  getWhitelist: () => http.get('/whitelist').then((r) => r.data),
  addWhitelist: (spec) => http.post('/whitelist', { spec }).then((r) => r.data),
  removeWhitelist: (spec) => http.delete(`/whitelist/${encodeURIComponent(spec)}`).then((r) => r.data),

  getRuleHits: () => http.get('/rules/hits').then((r) => r.data),
  resetRuleHits: () => http.post('/rules/hits/reset').then((r) => r.data),
};
