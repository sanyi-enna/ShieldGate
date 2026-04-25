<template>
  <div>
    <a-spin :spinning="loading">
      <div class="form-grid">
        <div class="form-card">
          <h4>滑动窗口限流</h4>
          <div class="form-row">
            <label>单 IP 窗口内最大请求数</label>
            <input type="number" v-model.number="form.RATE_LIMIT" min="1" max="10000" />
            <div class="hint">超过此阈值即触发 HTTP Flood 封禁；可疑 UA 自动 ×{{ form.SUSPICIOUS_UA_RATE_FACTOR ?? 0.6 }}</div>
          </div>
          <div class="form-row">
            <label>窗口大小（毫秒）</label>
            <input type="number" v-model.number="form.RATE_WINDOW_MS" min="100" max="60000" step="100" />
            <div class="hint">例：50 / 1000 表示每 IP 每秒最多 50 次</div>
          </div>
        </div>

        <div class="form-card">
          <h4>并发连接限制</h4>
          <div class="form-row">
            <label>单 IP 最大并发连接数</label>
            <input type="number" v-model.number="form.MAX_CONNECTIONS" min="1" max="1000" />
            <div class="hint">使用内存 Map，可疑 UA 上限自动减半</div>
          </div>
        </div>

        <div class="form-card">
          <h4>Slowloris 检测</h4>
          <div class="form-row">
            <label>请求头接收超时（毫秒）</label>
            <input type="number" v-model.number="form.SLOWLORIS_TIMEOUT_MS" min="1000" max="60000" step="500" />
            <div class="hint">推荐：演示 5000 / 生产 10000 / 弱网 15000</div>
          </div>
        </div>

        <div class="form-card">
          <h4>封禁时长</h4>
          <div class="form-row">
            <label>HTTP Flood 封禁时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_FLOOD" min="10" max="86400" />
          </div>
          <div class="form-row">
            <label>Slowloris 封禁时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_SLOWLORIS" min="10" max="86400" />
          </div>
          <div class="form-row">
            <label>手动封禁默认时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_MANUAL" min="10" max="86400" />
          </div>
        </div>
      </div>

      <div class="btn-bar">
        <button class="sg-btn sg-btn-primary" @click="onSave" :disabled="saving">
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
        <button class="sg-btn" @click="loadConfig">重新读取</button>
        <a-popconfirm title="恢复所有阈值为默认值？" @confirm="onReset">
          <button class="sg-btn" style="color:#f5475b;">恢复默认</button>
        </a-popconfirm>
        <span class="muted" style="margin-left: auto;">
          网关进程每 10 秒同步一次 Redis 配置
        </span>
      </div>
    </a-spin>

    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title">当前生效配置（Redis 实时）</div>
      </div>
      <pre class="config-dump">{{ pretty }}</pre>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { api } from '../api';

const loading = ref(false);
const saving = ref(false);
const raw = ref({});
const form = reactive({
  RATE_LIMIT: 50,
  RATE_WINDOW_MS: 1000,
  MAX_CONNECTIONS: 20,
  SLOWLORIS_TIMEOUT_MS: 10000,
  BAN_TTL_FLOOD: 300,
  BAN_TTL_SLOWLORIS: 300,
  BAN_TTL_MANUAL: 3600,
  SUSPICIOUS_UA_RATE_FACTOR: 0.6,
});

const pretty = computed(() => JSON.stringify(raw.value, null, 2));

async function loadConfig() {
  loading.value = true;
  try {
    const data = await api.getConfig();
    raw.value = data;
    Object.keys(form).forEach((k) => {
      if (data[k] !== undefined) form[k] = data[k];
    });
  } catch (err) {
    message.error('读取配置失败：' + err.message);
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    const patch = {};
    ['RATE_LIMIT', 'RATE_WINDOW_MS', 'MAX_CONNECTIONS', 'SLOWLORIS_TIMEOUT_MS',
     'BAN_TTL_FLOOD', 'BAN_TTL_SLOWLORIS', 'BAN_TTL_MANUAL'].forEach((k) => {
      patch[k] = form[k];
    });
    const res = await api.updateConfig(patch);
    if (res.success) message.success(res.message || '配置已更新');
    else message.warning('部分字段未保存：' + JSON.stringify(res.errors));
    await loadConfig();
  } catch (err) {
    message.error('保存失败：' + err.message);
  } finally {
    saving.value = false;
  }
}

async function onReset() {
  await api.resetConfig();
  message.success('已恢复默认配置');
  await loadConfig();
}

onMounted(loadConfig);
</script>
