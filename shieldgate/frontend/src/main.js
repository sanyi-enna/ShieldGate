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
import Whitelist from './views/Whitelist.vue';
import Login from './views/Login.vue';
import { setupAuth } from './composables/useAuth';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: Login, meta: { title: '登录', noLayout: true } },
    { path: '/dashboard', component: Dashboard, meta: { title: '监控大屏' } },
    { path: '/rules', component: Rules, meta: { title: '规则配置' } },
    { path: '/bans', component: Bans, meta: { title: '封禁管理' } },
    { path: '/whitelist', component: Whitelist, meta: { title: '白名单' } },
    { path: '/attacks', component: Attacks, meta: { title: '攻击事件' } },
  ],
});

setupAuth(router);

createApp(App).use(router).use(Antd).mount('#app');
