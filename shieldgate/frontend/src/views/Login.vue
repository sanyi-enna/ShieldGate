<template>
  <div class="login-bg">
    <div class="login-card">
      <div class="login-brand">
        <img src="/favicon.svg" alt="logo" />
        <div>
          <div class="t">ShieldGate</div>
          <div class="s">Web 应用层抗 DoS 网关</div>
        </div>
      </div>

      <form @submit.prevent="onSubmit" class="login-form" autocomplete="off">
        <div class="form-row">
          <label>用户名</label>
          <input
            type="text"
            v-model.trim="form.username"
            autocomplete="username"
            maxlength="32"
            required
          />
        </div>

        <div class="form-row">
          <label>密码</label>
          <input
            type="password"
            v-model="form.password"
            autocomplete="current-password"
            maxlength="128"
            minlength="8"
            required
          />
        </div>

        <div v-if="error" class="login-error">
          <Icon name="alert" :size="14" /> {{ error }}
        </div>

        <button class="sg-btn sg-btn-primary login-submit" :disabled="loading">
          {{ loading ? '验证中…' : '登录' }}
        </button>
      </form>

      <div class="login-foot">
        <div>
          <span class="dot ok"></span> 登录失败 5 次 / 10 分钟将临时锁定账号
        </div>
        <div>
          <span class="dot warn"></span> 单 IP 失败 20 次将由 ShieldGate 自动封禁
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { message } from 'ant-design-vue';
import Icon from '../components/Icon.vue';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const route = useRoute();
const { login, refresh, user } = useAuth();

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const error = ref('');

// 已登录直接跳走
onMounted(async () => {
  await refresh();
  if (user.value) router.replace(route.query.redirect || '/dashboard');
});

// 前端先做一次输入校验（与后端 validate.js 对齐）
const SQLI_RE = /(\b(or|and)\s+\d+\s*=\s*\d+|union\s+select|--|\/\*|;\s*drop)/i;

async function onSubmit() {
  error.value = '';
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(form.username)) {
    error.value = '用户名仅支持 3–32 位字母 / 数字 / 下划线 / 点 / 连字符';
    return;
  }
  if (form.password.length < 8) {
    error.value = '密码至少 8 位';
    return;
  }
  if (SQLI_RE.test(form.username) || SQLI_RE.test(form.password)) {
    error.value = '输入包含非法字符';
    return;
  }

  loading.value = true;
  try {
    const r = await login(form.username, form.password);
    message.success('登录成功，欢迎回来 ' + r.user.username);
    router.replace(route.query.redirect || '/dashboard');
  } catch (err) {
    const data = err.response?.data || {};
    if (data.code === 'LOCKED') {
      error.value = `${data.error}（${data.retryAfter}s 后解除）`;
    } else if (data.code === 'BAD_CREDENTIALS') {
      const left = data.attemptsLeft;
      error.value = `用户名或密码错误${left !== undefined ? `，剩余尝试 ${left} 次` : ''}`;
    } else {
      error.value = data.error || '登录失败';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-bg {
  min-height: 100vh;
  background:
    radial-gradient(ellipse at top, rgba(74,158,255,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at bottom, rgba(245,71,91,0.05) 0%, transparent 50%),
    #0b0e14;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #11161f;
  border: 1px solid #1f2633;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid #1f2633;
}
.login-brand img { width: 40px; height: 40px; }
.login-brand .t { font-size: 20px; font-weight: 600; color: #e6eaf2; }
.login-brand .s { font-size: 12px; color: #6b7588; margin-top: 2px; }

.login-form .form-row { margin-bottom: 16px; }
.login-form label { display: block; color: #8a93a6; font-size: 12px; margin-bottom: 6px; }
.login-form input {
  width: 100%;
  background: #0b0e14;
  border: 1px solid #1f2633;
  border-radius: 6px;
  padding: 10px 14px;
  color: #e6eaf2;
  font-size: 14px;
  outline: none;
  font-family: inherit;
  transition: border-color .15s;
}
.login-form input:focus { border-color: #4a9eff; }

.login-error {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(245,71,91,0.08);
  border: 1px solid rgba(245,71,91,0.25);
  color: #ff8e9b;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 14px;
}

.login-submit {
  width: 100%;
  height: 40px;
  font-size: 14px;
  justify-content: center;
}
.login-submit:disabled { opacity: 0.6; cursor: not-allowed; }

.login-foot {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #1f2633;
  color: #6b7588;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.login-foot .dot {
  display: inline-block;
  width: 6px; height: 6px; border-radius: 50%;
  margin-right: 6px;
}
.login-foot .dot.ok   { background: #22c55e; }
.login-foot .dot.warn { background: #f59e0b; }
</style>
