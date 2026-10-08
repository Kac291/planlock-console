<script setup lang="ts">
import type { DriftVerdict } from "@server/types";
import { VERDICT_HINT, VERDICT_LABEL } from "../lib/verdict";
defineProps<{ verdict: DriftVerdict | null; showCode?: boolean }>();
</script>

<template>
  <span v-if="verdict" class="pill" :class="`v-${verdict}`" :title="VERDICT_HINT[verdict]">
    <i />{{ VERDICT_LABEL[verdict] }}<span v-if="showCode" class="code">{{ verdict }}</span>
  </span>
  <span v-else class="pill v-none" title="还没有已解析的计划，只记录了调用">未比对</span>
</template>

<style scoped>
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px 2px 7px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.code { font-family: var(--mono); font-size: 11px; opacity: 0.7; font-weight: 400; }
.v-match { color: var(--v-match); background: var(--v-match-bg); }
.v-partial { color: var(--v-partial); background: var(--v-partial-bg); }
.v-skip-ahead { color: var(--v-skip); background: var(--v-skip-bg); }
.v-out-of-scope { color: var(--v-out); background: var(--v-out-bg); }
.v-extra { color: var(--v-extra); background: var(--v-extra-bg); }
.v-neutral, .v-none { color: var(--v-neutral); background: var(--v-neutral-bg); }
</style>
