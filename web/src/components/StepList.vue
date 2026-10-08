<script setup lang="ts">
import type { StepView } from "@server/types";

defineProps<{ steps: StepView[]; selected: string | null; hovered: string | null }>();
const emit = defineEmits<{ select: [id: string | null] }>();

const STATUS_LABEL = { done: "已完成", partial: "仅部分命中", open: "未开始" } as const;
</script>

<template>
  <ol class="steps">
    <li
      v-for="(s, i) in steps"
      :key="s.id"
      :class="[s.status, { sel: selected === s.id, hov: hovered === s.id }]"
      @click="emit('select', selected === s.id ? null : s.id)"
    >
      <div class="rail">
        <span class="dot" :title="STATUS_LABEL[s.status]">
          <template v-if="s.status === 'done'">✓</template>
        </span>
        <span v-if="i < steps.length - 1" class="line" />
      </div>
      <div class="body">
        <div class="head">
          <span class="sid mono">{{ s.id }}</span>
          <span class="sum">{{ s.summary }}</span>
        </div>
        <div class="scope">
          <span v-for="f in s.scope.files" :key="f" class="chip" title="文件范围">{{ f }}</span>
          <span v-for="c in s.scope.commands" :key="c" class="chip" title="命令">$ {{ c }}</span>
          <span v-for="o in s.scope.operations" :key="o" class="chip op" title="允许的操作">{{ o }}</span>
        </div>
        <div class="meta small">
          <span :class="`st-${s.status}`">{{ STATUS_LABEL[s.status] }}</span>
          <span v-if="s.completedBy !== null" class="faint">· 由调用 #{{ s.completedBy + 1 }} 完成</span>
          <span v-if="s.skippedAhead" class="skip">跳步完成</span>
          <span v-if="s.partials" class="faint">· {{ s.partials }} 次部分命中</span>
        </div>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.steps { list-style: none; margin: 0; padding: 14px 12px 6px; }
li { display: flex; gap: 12px; padding: 6px 8px 12px; border-radius: 8px; cursor: pointer; }
li:hover, li.hov { background: var(--panel-2); }
li.sel { background: var(--accent-soft); }
.rail { position: relative; display: flex; flex-direction: column; align-items: center; width: 22px; flex: none; }
.dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; border: 2px solid var(--border); background: var(--panel); color: #fff; z-index: 1; }
.done .dot { background: var(--v-match); border-color: var(--v-match); }
.partial .dot { border-color: var(--v-partial); background: linear-gradient(90deg, var(--v-partial) 50%, var(--panel) 50%); }
.line { position: absolute; top: 24px; bottom: -18px; width: 2px; background: var(--border); }
.done .line { background: var(--v-match); opacity: 0.45; }
.body { min-width: 0; flex: 1; }
.head { display: flex; gap: 8px; align-items: baseline; }
.sid { color: var(--text-3); }
.sum { font-weight: 500; }
.scope { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px; }
.chip.op { background: transparent; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
.st-done { color: var(--v-match); }
.st-partial { color: var(--v-partial); }
.st-open { color: var(--text-3); }
.skip { color: var(--v-skip); background: var(--v-skip-bg); padding: 0 6px; border-radius: 99px; }
</style>
