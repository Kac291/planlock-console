<script setup lang="ts">
import type { TurnCost } from "@server/types";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { clock, tokens, usd } from "../lib/format";

const props = defineProps<{ turns: TurnCost[] }>();

// Stack order bottom → top. Colors are the validated categorical slots 1-4.
type Seg = "input" | "cacheWrite" | "cacheRead" | "output";
const SEGS: Array<{ key: Seg; label: string; color: string }> = [
  { key: "input", label: "输入", color: "var(--c-input)" },
  { key: "cacheWrite", label: "缓存写入", color: "var(--c-cache-write)" },
  { key: "cacheRead", label: "缓存读取", color: "var(--c-cache-read)" },
  { key: "output", label: "输出", color: "var(--c-output)" },
];

const host = ref<HTMLDivElement | null>(null);
const width = ref(800);
const H = 220;
const PAD = { top: 10, right: 8, bottom: 22, left: 52 };
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = Math.max(280, e.contentRect.width)));
  if (host.value) ro.observe(host.value);
});
onBeforeUnmount(() => ro?.disconnect());

const segCosts = computed(() => props.turns.map((t) => t.segCostUsd));
const maxCost = computed(() => Math.max(1e-9, ...props.turns.map((t) => t.costUsd)));

// "Nice" y-axis ticks.
const ticks = computed(() => {
  const raw = maxCost.value / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= maxCost.value + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < maxCost.value) out.push(out[out.length - 1] + step);
  return out;
});
const yMax = computed(() => ticks.value[ticks.value.length - 1]);
const plotW = computed(() => width.value - PAD.left - PAD.right);
const plotH = H - PAD.top - PAD.bottom;
const slot = computed(() => plotW.value / Math.max(1, props.turns.length));
const gap = computed(() => (slot.value > 8 ? 2 : slot.value > 3 ? 1 : 0));
const barW = computed(() => Math.max(1, Math.min(28, slot.value - gap.value)));
const y = (v: number) => PAD.top + plotH - (v / yMax.value) * plotH;

interface Rect { x: number; y: number; w: number; h: number; color: string; top: boolean }
const bars = computed(() =>
  props.turns.map((t, i) => {
    const x = PAD.left + i * slot.value + (slot.value - barW.value) / 2;
    let acc = 0;
    const segs = segCosts.value[i];
    const nonZero = segs.map((c, k) => (c > 0 ? k : -1)).filter((k) => k >= 0);
    const topK = nonZero[nonZero.length - 1];
    const rects: Rect[] = [];
    segs.forEach((c, k) => {
      if (c <= 0) return;
      const y0 = y(acc);
      acc += c;
      const y1 = y(acc);
      // 2px surface gap between stacked segments, when they are tall enough to afford it.
      const sep = k !== nonZero[0] && y0 - y1 > 4 && gap.value > 0 ? 2 : 0;
      rects.push({ x, y: y1, w: barW.value, h: Math.max(0.5, y0 - y1 - sep), color: SEGS[k].color, top: k === topK });
    });
    return { turn: t, x, rects };
  }),
);

const hover = ref<number | null>(null);
function onMove(ev: MouseEvent) {
  const box = (ev.currentTarget as SVGElement).getBoundingClientRect();
  const i = Math.floor((ev.clientX - box.left - PAD.left) / slot.value);
  hover.value = i >= 0 && i < props.turns.length ? i : null;
}
const tip = computed(() => {
  if (hover.value === null) return null;
  const t = props.turns[hover.value];
  const b = bars.value[hover.value];
  const left = Math.min(b.x + barW.value + 10, width.value - 210);
  return { t, segs: segCosts.value[hover.value], left: Math.max(4, left) };
});
const tokenOf = (t: TurnCost, k: Seg) =>
  ({ input: t.inputTokens, cacheWrite: t.cacheWriteTokens, cacheRead: t.cacheReadTokens, output: t.outputTokens })[k];

// Round only the outer data-end of the top segment (4px), keep the baseline square.
function topPath(r: Rect) {
  const rad = Math.min(4, r.w / 2, r.h);
  return `M${r.x},${r.y + r.h} V${r.y + rad} Q${r.x},${r.y} ${r.x + rad},${r.y} H${r.x + r.w - rad} Q${r.x + r.w},${r.y} ${r.x + r.w},${r.y + rad} V${r.y + r.h} Z`;
}
</script>

<template>
  <div>
    <div class="legend small">
      <span v-for="s in SEGS" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }}</span>
      <span class="faint">· 每根柱子 = 一轮模型调用的花费（美元）</span>
    </div>
    <div ref="host" class="host">
      <svg :width="width" :height="H" role="img" aria-label="每轮 token 成本堆叠柱状图" @mousemove="onMove" @mouseleave="hover = null">
        <g>
          <template v-for="v in ticks" :key="v">
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(v)" :y2="y(v)" class="grid" />
            <text :x="PAD.left - 8" :y="y(v) + 4" text-anchor="end" class="axis">{{ usd(v) }}</text>
          </template>
        </g>
        <rect
          v-if="hover !== null"
          :x="PAD.left + hover * slot" :y="PAD.top" :width="slot" :height="plotH" class="hl"
        />
        <g v-for="b in bars" :key="b.turn.index">
          <template v-for="(r, k) in b.rects" :key="k">
            <path v-if="r.top" :d="topPath(r)" :fill="r.color" />
            <rect v-else :x="r.x" :y="r.y" :width="r.w" :height="r.h" :fill="r.color" />
          </template>
        </g>
        <text :x="PAD.left" :y="H - 4" class="axis">第 1 轮</text>
        <text :x="width - PAD.right" :y="H - 4" text-anchor="end" class="axis">第 {{ turns.length }} 轮</text>
      </svg>
      <div v-if="tip" class="tip" :style="{ left: `${tip.left}px` }">
        <div class="tip-h">
          <b>第 {{ tip.t.index + 1 }} 轮</b>
          <span class="faint mono">{{ clock(tip.t.timestamp) }}</span>
        </div>
        <div class="mono small model">{{ tip.t.model }}<span v-if="tip.t.source === 'subagent'" class="sub">subagent</span></div>
        <div v-for="(s, k) in SEGS" :key="s.key" class="tip-row small">
          <i :style="{ background: s.color }" /><span>{{ s.label }}</span>
          <span class="mono faint">{{ tokens(tokenOf(tip.t, s.key)) }}</span>
          <span class="mono">{{ usd(tip.segs[k]) }}</span>
        </div>
        <div class="tip-row total small"><span>合计</span><span /><span /><span class="mono">{{ usd(tip.t.costUsd) }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0 0 8px; color: var(--text-2); }
.legend i, .tip-row i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.host { position: relative; width: 100%; }
svg { display: block; }
.grid { stroke: var(--border); stroke-width: 1; }
.axis { fill: var(--text-3); font-size: 11px; font-family: var(--mono); }
.hl { fill: var(--text); opacity: 0.05; }
.tip { position: absolute; top: 4px; width: 206px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.12); pointer-events: none; }
.tip-h { display: flex; justify-content: space-between; }
.model { color: var(--text-2); margin: 2px 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { margin-left: 6px; color: var(--accent); }
.tip-row { display: grid; grid-template-columns: auto 1fr auto auto; gap: 6px; align-items: center; }
.tip-row.total { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 4px; font-weight: 600; }
</style>
