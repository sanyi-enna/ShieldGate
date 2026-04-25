<template>
  <div>
    <a-spin :spinning="loading">
      <div class="form-grid">
        <div class="form-card">
          <h4>滑动窗口限流（IP 维度）</h4>
          <div class="form-row">
            <label>单 IP 窗口内最大请求数</label>
            <input type="number" v-model.number="form.RATE_LIMIT" min="1" max="10000" />
            <div class="hint">超过即触发 HTTP Flood 封禁；可疑 UA 自动 ×0.6</div>
          </div>
          <div class="form-row">
            <label>窗口大小（毫秒）</label>
            <input type="number" v-model.number="form.RATE_WINDOW_MS" min="100" max="60000" step="100" />
            <div class="hint">例：50 / 1000 表示每 IP 每秒最多 50 次</div>
          </div>
        </div>

        <div class="form-card">
          <h4>CC 攻击防护（IP + 路径）</h4>
          <div class="form-row">
            <label>同一路径窗口内最大请求数</label>
            <input type="number" v-model.number="form.CC_LIMIT" min="1" max="10000" />
            <div class="hint">同一 IP 反复请求同一资源（绕 CDN 缓存）即触发</div>
          </div>
          <div class="form-row">
            <label>窗口大小（毫秒）</label>
            <input type="number" v-model.number="form.CC_WINDOW_MS" min="100" max="60000" step="100" />
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
            <label>请求头 / Body 接收超时（毫秒）</label>
            <input type="number" v-model.number="form.SLOWLORIS_TIMEOUT_MS" min="1000" max="60000" step="500" />
            <div class="hint">socket + body 双计时器，覆盖 Slowloris / RUDY 变种</div>
          </div>
        </div>

        <div class="form-card">
          <h4>请求体大小限制</h4>
          <div class="form-row">
            <label>最大 Body 字节数</label>
            <input type="number" v-model.number="form.MAX_BODY_BYTES" min="1024" max="104857600" step="1024" />
            <div class="hint">超出 Content-Length 直接 413；流式累计超限会断连 + 封禁</div>
          </div>
        </div>

        <div class="form-card">
          <h4>封禁时长（递进式）</h4>
          <div class="form-row">
            <label>HTTP Flood 基础时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_FLOOD" min="10" max="86400" />
          </div>
          <div class="form-row">
            <label>Slowloris 基础时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_SLOWLORIS" min="10" max="86400" />
          </div>
          <div class="form-row">
            <label>手动封禁默认时长（秒）</label>
            <input type="number" v-model.number="form.BAN_TTL_MANUAL" min="10" max="86400" />
            <div class="hint">同 IP 反复触发：第 2 次 ×2，第 3 次 ×6，第 4 次 ×12，封顶 24h</div>
          </div>
        </div>

        <div class="form-card">
          <h4>GeoIP 阻断 / 观察列表</h4>
          <div class="form-row">
            <label>阻断国家（ISO 国家代码，逗号分隔）</label>
            <input type="text" v-model="geoBlockText" placeholder="例如 KP,IR" />
            <div class="hint">命中即 403 + 自动封禁；空 = 不启用</div>
          </div>
          <div class="form-row">
            <label>观察国家（仅打标签，不直接封禁）</label>
            <input type="text" v-model="geoWatchText" placeholder="例如 RU" />
            <div class="hint">需安装 geoip-lite 才会生效</div>
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
        <span class="muted" style="margin-left: auto;">网关进程每 10 秒同步一次 Redis 配置</span>
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
  CC_LIMIT: 20,
  CC_WINDOW_MS: 1000,
  MAX_CONNECTIONS: 20,
  SLOWLORIS_TIMEOUT_MS: 10000,
  MAX_BODY_BYTES: 1048576,
  BAN_TTL_FLOOD: 300,
  BAN_TTL_SLOWLORIS: 300,
  BAN_TTL_MANUAL: 3600,
});

const geoBlockText = ref('');
const geoWatchText = ref('');

const pretty = computed(() => JSON.stringify(raw.value, null, 2));

async function loadConfig() {
  loading.value = true;
  try {
    const data = await api.getConfig();
    raw.value = data;
    Object.keys(form).forEach((k) => {
      if (data[k] !== undefined) form[k] = data[k];
    });
    geoBlockText.value = (data.GEO_BLOCK || []).join(',');
    geoWatchText.value = (data.GEO_WATCH || []).join(',');
  } catch (err) {
    message.error('读取配置失败：' + err.message);
  } finally {
    loading.value = false;
  }
}

function parseList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

async function onSave() {
  saving.value = true;
  try {
    const patch = { ...form };
    patch.GEO_BLOCK = parseList(geoBlockText.value);
    patch.GEO_WATCH = parseList(geoWatchText.value);
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
