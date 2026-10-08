<script setup lang="ts">
import type { CostOverview, CostSessionDetail } from "@server/types";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import CostChart from "../components/CostChart.vue";
import { api } from "../lib/api";
import { shortId, timeAgo, tokens, usd } from "../lib/format";

const props = defineProps<{ sid?: string }>();
const router = useRouter();

const overview = ref<CostOverview | null>(null);
const detail = ref<CostSessionDetail | null>(null);
const loadingDetail = ref(false);
const error = ref<string | null>(null);
const asTable = ref(false);

onMounted(async () => {
  try {
    overview.value = await api.cost();
    if (!props.sid && overview.value.sessions[0]) {
      router.replace({ name: "cost-session", params: { sid: overview.value.sessions[0].sessionId } });
    }
  } catch (e) {
    error.value = String(e);
  }
});

watch(
  () => props.sid,
  async (sid) => {
    detail.value = null;
    if (!sid) return;
    loadingDetail.value = true;
    try {
      detail.value = await api.costSession(sid);
    } catch (e) {
      error.value = String(e);
    } finally {
      loadingDetail.value = false;
    }
  },
  { immediate: true },
);

const cacheHit = computed(() => {
  const t = detail.value?.totals;
  if (!t) return null;
  const all = t.inputTokens + t.cacheWriteTokens + t.cacheReadTokens;
  return all ? t.cacheReadTokens / all : null;
});
const total = (r: { haiku: number; sonnet: number; opus: number }) => r.haiku + r.sonnet + r.opus;
// Prefer this session's routing; if ClaudeThrottle never routed in it, fall back to the all-time log so the tile still says something true.
const routing = computed(() => {
  const r = detail.value?.routing;
  if (!r) return null;
  if (total(r) > 0) return { r, scope: "本会话" };
  const all = overview.value?.routingAllTime;
  return all && total(all) > 0 ? { r: all, scope: "本会话未路由 · 全部会话累计" } : { r, scope: "本会话" };
});
const routedCheap = computed(() => {
  const x = routing.value;
  return x && total(x.r) ? x.r.haiku / total(x.r) : null;
});
// "c--Users-hewen-Desktop-unsw----9331-ass" -> "Desktop-unsw…9331-ass" (non-ASCII path chars are encoded as "-")
const projectLabel = (p: string) => p.replace(/^[a-zA-Z]--Users-[^-]+-/, "").replace(/^-home-[^-]+-?/, "").replace(/-{2,}/g, "…") || p;
</script>

<template>
  <section class="intro">
    <h1>每一轮花了多少钱？</h1>
    <p class="muted">
      直接解析 Claude Code 的会话 transcript（<code>~/.claude/projects/*/&lt;session&gt;.jsonl</code>），按 message 去重后逐轮计价；
      子 Agent 的路由次数来自 ClaudeThrottle 的 <code>usage.log</code>。价格表读取 ClaudeThrottle 的 <code>models.json</code>。
    </p>
  </section>

  <p v-if="error" class="panel empty">{{ error }}</p>
  <p v-else-if="!overview" class="faint">加载中…</p>

  <div v-else-if="!overview.transcriptsDetected || overview.sessions.length === 0" class="panel empty">
    没有在 <code>{{ overview.transcriptsDir }}</code> 找到 Claude Code transcript。<br />
    <span class="small">在本机用过 Claude Code 后这里会自动出现；也可以用 <code>CLAUDE_PROJECTS_DIR</code> 指定目录。</span>
  </div>

  <div v-else class="layout">
    <aside class="panel list">
      <div class="panel-head"><h3>最近会话</h3><span class="small faint">{{ overview.sessions.length }}</span></div>
      <ul>
        <li
          v-for="s in overview.sessions"
          :key="s.sessionId"
          :class="{ on: s.sessionId === sid }"
          @click="router.push({ name: 'cost-session', params: { sid: s.sessionId } })"
        >
          <span class="mono">{{ shortId(s.sessionId) }}</span>
          <span class="small faint row2"><span class="proj" :title="s.project">{{ projectLabel(s.project) }}</span><span class="when">{{ timeAgo(s.updatedAt) }}</span></span>
        </li>
      </ul>
    </aside>

    <section class="right">
      <p v-if="loadingDetail" class="faint">解析 transcript…</p>
      <div v-else-if="detail && detail.turns.length === 0" class="panel empty">这个会话没有带 usage 的模型调用。</div>
      <template v-else-if="detail">
        <div class="tiles">
          <div class="panel tile hero"><span class="small muted">总花费（估算）</span><b>{{ usd(detail.totals.costUsd) }}</b><span class="small faint">{{ detail.turns.length }} 轮</span></div>
          <div class="panel tile"><span class="small muted">输出 tokens</span><b>{{ tokens(detail.totals.outputTokens) }}</b></div>
          <div class="panel tile"><span class="small muted">缓存命中率</span><b>{{ cacheHit === null ? "—" : `${Math.round(cacheHit * 100)}%` }}</b><span class="small faint">读取 / 全部输入</span></div>
          <div class="panel tile">
            <span class="small muted">ClaudeThrottle 路由</span>
            <template v-if="routing">
              <b>{{ routedCheap === null ? "—" : `${Math.round(routedCheap * 100)}%` }}</b>
              <span class="small faint">子 Agent 走 Haiku · H{{ routing.r.haiku }} / S{{ routing.r.sonnet }} / O{{ routing.r.opus }}<template v-if="routing.r.opusBlocked"> · 拦下 Opus {{ routing.r.opusBlocked }}</template></span>
              <span class="small faint">{{ routing.scope }}</span>
            </template>
            <template v-else><b class="faint">未安装</b><span class="small faint">没找到 usage.log</span></template>
          </div>
        </div>

        <div class="panel chart">
          <div class="panel-head">
            <h3>逐轮成本</h3>
            <div class="toggle">
              <button class="btn small" :class="{ active: !asTable }" @click="asTable = false">图</button>
              <button class="btn small" :class="{ active: asTable }" @click="asTable = true">表</button>
            </div>
          </div>
          <div class="pad">
            <CostChart v-if="!asTable" :turns="detail.turns" />
            <div v-else class="scroll">
              <table class="grid compact">
                <thead><tr><th>#</th><th>模型</th><th class="num">输入</th><th class="num">缓存写</th><th class="num">缓存读</th><th class="num">输出</th><th class="num">花费</th></tr></thead>
                <tbody>
                  <tr v-for="t in detail.turns" :key="t.index">
                    <td class="mono faint">{{ t.index + 1 }}</td>
                    <td class="mono small">{{ t.model }}<span v-if="t.source === 'subagent'" class="faint"> · sub</span></td>
                    <td class="num mono">{{ tokens(t.inputTokens) }}</td>
                    <td class="num mono">{{ tokens(t.cacheWriteTokens) }}</td>
                    <td class="num mono">{{ tokens(t.cacheReadTokens) }}</td>
                    <td class="num mono">{{ tokens(t.outputTokens) }}</td>
                    <td class="num mono">{{ usd(t.costUsd) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h3>按模型</h3><span class="small faint mono" :title="detail.pricingSource">价格：{{ detail.pricingSource.split(/[\\/]/).slice(-2).join("/") }}</span></div>
          <table class="grid compact static">
            <thead><tr><th>模型</th><th class="num">轮数</th><th class="num">花费</th><th class="num">占比</th></tr></thead>
            <tbody>
              <tr v-for="m in detail.byModel" :key="m.model">
                <td class="mono">{{ m.model }}</td>
                <td class="num">{{ m.turns }}</td>
                <td class="num mono">{{ usd(m.costUsd) }}</td>
                <td class="num">{{ detail.totals.costUsd ? Math.round((100 * m.costUsd) / detail.totals.costUsd) : 0 }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.intro { margin-bottom: 22px; max-width: 820px; }
.intro h1 { font-size: 22px; margin: 0 0 6px; }
.intro p { margin: 0; }
.intro code { font-size: 12px; }
.layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.list { overflow: hidden; position: sticky; top: 70px; }
.list ul { list-style: none; margin: 0; padding: 6px; max-height: 70vh; overflow: auto; }
.list li { padding: 8px 10px; border-radius: 7px; cursor: pointer; display: flex; flex-direction: column; }
.list li:hover { background: var(--panel-2); }
.list li.on { background: var(--accent-soft); }
.row2 { display: flex; justify-content: space-between; gap: 8px; }
.when { flex: none; white-space: nowrap; }
.proj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { display: grid; gap: 16px; min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.tile { padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile b { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tile.hero b { font-size: 26px; }
.chart { overflow: hidden; }
.pad { padding: 14px 16px; }
.toggle { display: flex; gap: 4px; }
.scroll { max-height: 360px; overflow: auto; }
table.compact th, table.compact td { padding: 6px 10px; }
table.compact tbody tr { cursor: default; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .list { position: static; }
  .list ul { max-height: 220px; }
  .tiles { grid-template-columns: repeat(2, 1fr); }
}
</style>
