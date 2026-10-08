<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ score: number | null; size?: number }>();
const size = computed(() => props.size ?? 64);
const r = computed(() => size.value / 2 - 5);
const c = computed(() => 2 * Math.PI * r.value);
const color = computed(() => {
  const s = props.score ?? 0;
  if (s < 15) return "var(--v-match)";
  if (s < 40) return "var(--v-partial)";
  return "var(--v-out)";
});
</script>

<template>
  <div class="gauge" :style="{ width: `${size}px`, height: `${size}px` }" title="Drift score：0 = 完全按计划，100 = 严重偏离（与 planlock report 同一公式）">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--panel-2)" stroke-width="6" />
      <circle
        v-if="score !== null"
        :cx="size / 2" :cy="size / 2" :r="r" fill="none" :stroke="color" stroke-width="6" stroke-linecap="round"
        :stroke-dasharray="`${(c * Math.max(score, 1.5)) / 100} ${c}`"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
        style="transition: stroke-dasharray 0.5s ease"
      />
    </svg>
    <div class="val" :style="{ color: score === null ? 'var(--text-3)' : color }">{{ score ?? "—" }}</div>
  </div>
</template>

<style scoped>
.gauge { position: relative; flex: none; }
.val { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 600; font-size: 17px; font-variant-numeric: tabular-nums; }
</style>
