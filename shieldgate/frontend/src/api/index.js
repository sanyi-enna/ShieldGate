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
};
