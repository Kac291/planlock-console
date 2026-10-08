<script setup lang="ts">
import type { DriftVerdict, Mode, TimelineItem } from "@server/types";
import { clock } from "../lib/format";
import VerdictPill from "./VerdictPill.vue";

defineProps<{
  items: TimelineItem[];
  mode: Mode;
  fresh: Set<number>;
  selectedStep: string | null;
}>();
const emit = defineEmits<{ hoverStep: [id: string | null]; selectStep: [id: string | null] }>();

function scoreColor(v: DriftVerdict | null) {
  if (v === "match") return "var(--v-match)";
  if (v === "skip-ahead") return "var(--v-skip)";
  if (v === "partial") return "var(--v-partial)";
  return "var(--text-3)";
}
</script>

<template>
  <ol class="feed">
    <li
      v-for="it in items"
      :key="it.index"
      :class="{ flash: fresh.has(it.index), dim: selectedStep && it.stepId !== selectedStep, blocked: it.blocked }"
      @mouseenter="emit('hoverStep', it.stepId)"
      @mouseleave="emit('hoverStep', null)"
    >
      <span class="idx mono faint">#{{ it.index + 1 }}</span>
      <div class="main">
        <div class="row1">
          <span class="tool mono">{{ it.toolName }}</span>
          <span class="target mono" :title="it.target ?? ''">{{ it.target ?? "—" }}</span>
        </div>
        <div v-if="it.reason" class="reason small faint">{{ it.reason }}</div>
      </div>
      <div class="side">
        <div class="tags">
          <span v-if="it.blocked" class="act block">⛔ 已拦截</span>
          <span v-else-if="it.surfaced && mode === 'warn'" class="act warn">已提醒模型</span>
          <VerdictPill :verdict="it.verdict" />
        </div>
        <div class="small meta">
          <button v-if="it.stepId" class="step mono" @click="emit('selectStep', it.stepId)">{{ it.stepId }}</button>
          <span v-if="it.score !== null && it.verdict !== 'neutral'" class="score" :title="`匹配分 ${it.score}（match ≥ 0.7，partial ≥ 0.4）`">
            <span class="bar"><span :style="{ width: `${it.score * 100}%`, background: scoreColor(it.verdict) }" /></span>
            <span class="mono faint">{{ it.score.toFixed(2) }}</span>
          </span>
          <span class="faint mono">{{ clock(it.timestamp) }}</span>
        </div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.feed { list-style: none; margin: 0; padding: 0; }
li { display: flex; gap: 12px; align-items: flex-start; padding: 11px 16px; border-bottom: 1px solid var(--border); transition: opacity 0.2s; }
li:last-child { border-bottom: 0; }
li.dim { opacity: 0.35; }
li.blocked { box-shadow: inset 3px 0 0 var(--v-out); }
.idx { width: 26px; flex: none; padding-top: 2px; }
.main { flex: 1; min-width: 0; }
.row1 { display: flex; gap: 10px; align-items: baseline; min-width: 0; }
.tool { font-weight: 600; flex: none; }
.target { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reason { margin-top: 2px; overflow-wrap: anywhere; }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex: none; }
.tags { display: flex; gap: 6px; align-items: center; }
.act { font-size: 11.5px; padding: 2px 8px; border-radius: 99px; font-weight: 500; }
.act.block { color: #fff; background: var(--v-out); }
.act.warn { color: var(--v-partial); border: 1px solid var(--v-partial); }
.meta { display: flex; gap: 10px; align-items: center; }
.step { border: 0; background: var(--panel-2); color: var(--accent); border-radius: 5px; padding: 0 6px; cursor: pointer; font-size: 11.5px; }
.score { display: inline-flex; align-items: center; gap: 5px; }
.bar { display: inline-block; width: 46px; height: 4px; border-radius: 99px; background: var(--panel-2); overflow: hidden; }
.bar span { display: block; height: 100%; }
@media (max-width: 640px) {
  li { flex-wrap: wrap; }
  .side { align-items: flex-start; width: 100%; padding-left: 38px; }
}
</style>
