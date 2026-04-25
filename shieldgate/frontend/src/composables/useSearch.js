import { computed, ref, watch } from 'vue';

// 全局搜索状态。App.vue 持有；各 view 通过 inject('shieldgate-search') 取用。
export function createSearch(router) {
  const keyword = ref('');
  const showSuggest = ref(false);

  const trimmed = computed(() => keyword.value.trim());

  // 解析为「过滤器」：检测 IP / 类型关键字 / 数字 / 自由文本
  const filter = computed(() => {
    const k = trimmed.value;
    if (!k) return null;
    const lower = k.toLowerCase();
    const isIP = /^\d{1,3}(\.\d{1,3}){0,3}$|^[0-9a-fA-F:]+$/.test(k);
    return {
      raw: k,
      lower,
      isIP,
      tokens: lower.split(/\s+/).filter(Boolean),
    };
  });

  // 测试一条记录的多个字段是否命中关键字
  function match(record, fields = []) {
    const f = filter.value;
    if (!f) return true;
    for (const v of fields) {
      const s = String(v ?? '').toLowerCase();
      if (s.includes(f.lower)) return true;
    }
    return false;
  }

  // 把字符串切成 [{ text, hit }] 段，由模板渲染（避免 v-html 引发的 XSS 风险）
  function segments(text) {
    const f = filter.value;
    const safe = String(text ?? '');
    if (!f) return [{ text: safe, hit: false }];
    const i = safe.toLowerCase().indexOf(f.lower);
    if (i < 0) return [{ text: safe, hit: false }];
    return [
      { text: safe.slice(0, i), hit: false },
      { text: safe.slice(i, i + f.lower.length), hit: true },
      { text: safe.slice(i + f.lower.length), hit: false },
    ];
  }

  function clear() {
    keyword.value = '';
    showSuggest.value = false;
  }

  function jumpTo(path) {
    if (router) router.push(path);
    showSuggest.value = false;
  }

  return { keyword, showSuggest, filter, match, segments, clear, jumpTo };
}
