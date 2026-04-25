<template>
  <div>
    <div class="panel" style="margin-bottom: 14px;">
      <div class="panel-header">
        <div class="panel-title">添加白名单</div>
        <div class="panel-extra">支持单 IP 或 CIDR（如 192.168.1.0/24）</div>
      </div>
      <div class="form-grid" style="grid-template-columns: 2fr 3fr auto; align-items: end; margin-bottom: 0;">
        <div class="form-row" style="margin: 0;">
          <label>IP / CIDR</label>
          <input type="text" v-model="addForm.spec" placeholder="例如 10.0.0.0/8 或 1.2.3.4" />
        </div>
        <div class="form-row" style="margin: 0;">
          <label>备注（仅记录用）</label>
          <input type="text" v-model="addForm.note" placeholder="可选" />
        </div>
        <button class="sg-btn sg-btn-primary" @click="onAdd" :disabled="adding">
          <Icon name="plus" :size="14" />
          {{ adding ? '处理中…' : '加入白名单' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">白名单列表</div>
        <div class="panel-extra" @click="load">↻ 刷新</div>
      </div>
      <table class="sg-table">
        <thead>
          <tr>
            <th style="width:40%;">IP / CIDR</th>
            <th>类型</th>
            <th>状态</th>
            <th style="width:120px;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spec in filtered" :key="spec">
            <td class="mono" style="color:#22c55e;"><Highlight :text="spec" /></td>
            <td>
              <span class="tag" :class="spec.includes('/') ? 'tag-stack' : 'tag-low'">
                {{ spec.includes('/') ? 'CIDR' : 'EXACT' }}
              </span>
            </td>
            <td><span class="tag tag-online" style="padding-left:0;">放行</span></td>
            <td>
              <a-popconfirm :title="`移除白名单 ${spec} ?`" @confirm="onRemove(spec)">
                <button class="sg-btn" style="height:28px;padding:0 10px;color:#f5475b;">移除</button>
              </a-popconfirm>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="4" class="muted" style="text-align:center;padding:32px;">
              {{ items.length ? '无匹配结果' : '暂无白名单。建议添加运维 IP / 监控 IP / 内网 CIDR。' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px;">
      <div class="panel-header">
        <div class="panel-title">说明</div>
      </div>
      <div class="muted" style="line-height: 1.7;">
        <p style="margin-top:0;">命中白名单的 IP 会被标记为 <span class="text-mono" style="color:#22c55e;">isWhitelisted=true</span>，
        跳过所有后续防护规则（黑名单 / UA / 限流 / Slowloris / Body / GeoIP / 挑战页）。</p>
        <p>白名单缓存 5 秒，新增/删除会在 5 秒内全节点生效。建议至少加入：</p>
        <ul style="margin: 6px 0 0 18px;">
          <li>运维跳板机 IP</li>
          <li>内部监控 / 健康检查源（如 <span class="text-mono" style="color:#4a9eff;">127.0.0.1</span>）</li>
          <li>合作方推送回调 IP</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, inject, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import Icon from '../components/Icon.vue';
import Highlight from '../components/Highlight.vue';
import { api } from '../api';

const search = inject('shieldgate-search', null);

const items = ref([]);
const adding = ref(false);
const addForm = reactive({ spec: '', note: '' });

const filtered = computed(() => {
  if (!search?.filter.value) return items.value;
  return items.value.filter((s) => search.match({ s }, [s]));
});

async function load() {
  try {
    items.value = await api.getWhitelist();
  } catch (err) {
    message.error('加载失败：' + err.message);
  }
}

async function onAdd() {
  const spec = addForm.spec.trim();
  if (!spec) return message.warning('请填写 IP 或 CIDR');
  adding.value = true;
  try {
    await api.addWhitelist(spec);
    message.success('已添加 ' + spec);
    addForm.spec = '';
    addForm.note = '';
    await load();
  } catch (err) {
    message.error('添加失败：' + err.message);
  } finally {
    adding.value = false;
  }
}

async function onRemove(spec) {
  await api.removeWhitelist(spec);
  message.success('已移除 ' + spec);
  await load();
}

onMounted(load);
</script>
