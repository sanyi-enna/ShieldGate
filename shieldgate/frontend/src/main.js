import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import './styles.css';

import App from './App.vue';
import Dashboard from './views/Dashboard.vue';
import Rules from './views/Rules.vue';
import Bans from './views/Bans.vue';
import Attacks from './views/Attacks.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard, meta: { title: '监控大屏' } },
    { path: '/rules', component: Rules, meta: { title: '规则配置' } },
    { path: '/bans', component: Bans, meta: { title: '封禁管理' } },
    { path: '/attacks', component: Attacks, meta: { title: '攻击事件' } },
  ],
});

createApp(App).use(router).use(Antd).mount('#app');
