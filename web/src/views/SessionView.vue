<script setup lang="ts">
import type { DriftVerdict, SessionDetail } from "@server/types";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import CallFeed from "../components/CallFeed.vue";
import DriftGauge from "../components/DriftGauge.vue";
import StepList from "../components/StepList.vue";
import VerdictPill from "../components/VerdictPill.vue";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { MODE_LABEL, VERDICTS } from "../lib/verdict";

const props = defineProps<{ pid: string; sid: string }>();

const data = ref<SessionDetail | null>(null);
const error = ref<string | null>(null);
const live = ref<"connecting" | "live" | "offline">("connecting");
const fresh = ref(new Set<number>());
const selectedStep = ref<string | null>(null);
const hoveredStep = ref<string | null>(null);
const verdictFilter = ref<DriftVerdict | null>(null);
const showPlan = ref(false);

// Server-Sent Events: the server replays events.jsonl on every change and pushes
// the whole snapshot. We diff only to know which rows to flash.
let es: EventSource | null = null;
function connect() {
  es?.close();
  data.value = null;
  error.value = null;
  live.value = "connecting";
  es = new EventSource(api.streamUrl(props.pid, props.sid));
  es.addEventListener("snapshot", (ev) => {
    const next = JSON.parse((ev as MessageEvent).data) as SessionDetail;
    const prevLen = data.value?.timeline.length ?? next.timeline.length;
    const added = new Set<number>();
    for (let i = prevLen; i < next.timeline.length; i++) added.add(i);
    if (added.size) {
      fresh.value = added;
      setTimeout(() => {
        if (fresh.value === added) fresh.value = new Set();
      }, 1700);
    }
    data.value = next;
    live.value = "live";
  });
  es.onerror = async () => {
    live.value = "offline";
    if (!data.value) {
      try {
        data.value = await api.session(props.pid, props.sid);
      } catch (e) {
        error.value = String(e);
        es?.close();
      }
    }
  };
}
watch(() => [props.pid, props.sid], connect, { immediate: true });
onBeforeUnmount(() => es?.close());

const items = computed(() => {
  const t = data.value?.timeline ?? [];
  return verdictFilter.value ? t.filter((i) => i.verdict === verdictFilter.value) : t;
});
const done = computed(() => data.value?.plan.steps.filter((s) => s.status === "done").length ?? 0);
const visibleVerdicts = computed(() => VERDICTS.filter((v) => (data.value?.counts[v] ?? 0) > 0));
</script>

<template>
  <RouterLink to="/" class="back small">← 全部会话</RouterLink>

  <p v-if="error" class="panel empty">{{ error }}</p>
  <p v-else-if="!data" class="faint">加载中…</p>

  <template v-else>
    <section class="hero panel">
      <DriftGauge :score="data.driftScore" :size="72" />
      <div class="hero-main">
        <div class="eyebrow small faint">{{ data.projectName }}</div>
        <h1 class="mono">{{ data.sessionId }}</h1>
        <div class="facts small">
          <span class="chip">{{ MODE_LABEL[data.mode] }}</span>
          <span class="muted">{{ data.timeline.length }} 次调用</span>
          <span class="muted">计划 {{ done }}/{{ data.plan.steps.length }} 步完成</span>
          <span class="muted">最近活动 {{ timeAgo(data.lastActivity) }}</span>
          <span class="live" :class="live"><i />{{ live === "live" ? "实时" : live === "connecting" ? "连接中" : "已断开" }}</span>
        </div>
      </div>
      <div class="filters">
        <button class="btn" :class="{ active: !verdictFilter }" @click="verdictFilter = null">全部</button>
        <button
          v-for="v in visibleVerdicts"
          :key="v"
          class="btn f"
          :class="{ active: verdictFilter === v }"
          @click="verdictFilter = verdictFilter === v ? null : v"
        >
          <VerdictPill :verdict="v" /><span class="mono">{{ data.counts[v] }}</span>
        </button>
      </div>
    </section>

    <div class="cols">
      <section class="panel">
        <div class="panel-head">
          <h3>批准的计划</h3>
          <button v-if="data.plan.markdown" class="btn small" @click="showPlan = !showPlan">{{ showPlan ? "看步骤" : "看原文" }}</button>
        </div>
        <pre v-if="showPlan" class="plan-md">{{ data.plan.markdown }}</pre>
        <StepList
          v-else-if="data.plan.steps.length"
          :steps="data.plan.steps"
          :selected="selectedStep"
          :hovered="hoveredStep"
          @select="selectedStep = $event"
        />
        <div v-else class="empty small">这个会话还没有已解析的计划（ExitPlanMode 之后才会出现）。</div>
        <p v-if="selectedStep" class="small faint hint">已筛选 {{ selectedStep }} 的调用 · <a href="#" @click.prevent="selectedStep = null">清除</a></p>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>执行轨迹</h3>
          <span class="small faint">每一行 = 一次 PreToolUse，按时间顺序</span>
        </div>
        <CallFeed
          v-if="items.length"
          :items="items"
          :mode="data.mode"
          :fresh="fresh"
          :selected-step="selectedStep"
          @hover-step="hoveredStep = $event"
          @select-step="selectedStep = selectedStep === $event ? null : $event"
        />
        <div v-else class="empty small">还没有工具调用。</div>
      </section>
    </div>

    <section v-if="data.toolBreakdown.length" class="panel tools">
      <div class="panel-head"><h3>工具分布</h3></div>
      <div class="tb">
        <div v-for="t in data.toolBreakdown" :key="t.tool" class="tb-row">
          <span class="mono">{{ t.tool }}</span>
          <span class="tb-bar"><span :style="{ width: `${(100 * t.count) / data.toolBreakdown[0].count}%` }" /></span>
          <span class="mono muted">{{ t.count }}</span>
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; color: var(--text-2); }
.hero { display: flex; gap: 18px; align-items: center; padding: 16px 18px; margin-bottom: 16px; flex-wrap: wrap; }
.hero-main { flex: 1; min-width: 240px; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.06em; }
h1 { font-size: 18px; margin: 2px 0 6px; overflow-wrap: anywhere; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
.live { display: inline-flex; align-items: center; gap: 6px; color: var(--text-3); }
.live i { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
.live.live { color: var(--v-match); }
.live.live i { background: var(--v-match); box-shadow: 0 0 0 0 var(--v-match); animation: pulse 1.8s infinite; }
.live.offline i { background: var(--v-out); }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--v-match) 55%, transparent); } 100% { box-shadow: 0 0 0 8px transparent; } }
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.btn.f { padding: 3px 8px 3px 4px; }
.cols { display: grid; grid-template-columns: minmax(300px, 400px) 1fr; gap: 16px; align-items: start; }
.cols > .panel { overflow: hidden; }
.plan-md { margin: 0; padding: 14px 16px; white-space: pre-wrap; font-family: var(--mono); font-size: 12.5px; color: var(--text-2); max-height: 520px; overflow: auto; }
.hint { padding: 0 16px 12px; margin: 0; }
.tools { margin-top: 16px; }
.tb { padding: 12px 16px; display: grid; gap: 6px; }
.tb-row { display: grid; grid-template-columns: 80px 1fr 30px; gap: 10px; align-items: center; }
.tb-bar { height: 8px; background: var(--panel-2); border-radius: 99px; overflow: hidden; }
.tb-bar span { display: block; height: 100%; background: var(--accent); opacity: 0.75; border-radius: 99px; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
</style>
