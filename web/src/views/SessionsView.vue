<script setup lang="ts">
import type { ProjectSummary } from "@server/types";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import DriftGauge from "../components/DriftGauge.vue";
import { api } from "../lib/api";
import { shortId, timeAgo } from "../lib/format";
import { MODE_LABEL } from "../lib/verdict";

const router = useRouter();
const projects = ref<ProjectSummary[] | null>(null);
const error = ref<string | null>(null);

async function load() {
  try {
    projects.value = await api.projects();
    error.value = null;
  } catch (e) {
    error.value = String(e);
  }
}

// The list is cheap to rebuild; poll so a session started by `npm run demo` shows up on its own.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  load();
  timer = setInterval(load, 3000);
});
onBeforeUnmount(() => clearInterval(timer));

const open = (pid: string, sid: string) => router.push({ name: "session", params: { pid, sid } });
</script>

<template>
  <section class="intro">
    <h1>Agent 有没有按计划做事？</h1>
    <p class="muted">
      planlock 在每次工具调用前，把实际动作和用户批准的计划逐条比对。这里把它的 JSONL 审计日志回放成可视化：
      步骤完成情况、每次调用的判定、以及跳步 / 越界 / 计划外的工作。
    </p>
  </section>

  <p v-if="error" class="panel empty">连不上 API：{{ error }}<br /><span class="small">确认 <code>npm run dev</code> 正在运行。</span></p>
  <p v-else-if="!projects" class="faint">加载中…</p>

  <section v-for="p in projects ?? []" :key="p.id" class="panel project">
    <div class="panel-head">
      <div class="title">
        <h2>{{ p.name }}</h2>
        <span class="faint small mono path">{{ p.root }}</span>
      </div>
      <span class="chip">{{ MODE_LABEL[p.mode] }}</span>
    </div>

    <div v-if="p.sessions.length === 0" class="empty small">
      还没有会话。运行 <code>npm run demo</code> 生成一个实时演示会话，或在项目里 <code>planlock init</code> 后正常使用 Claude Code。
    </div>

    <table v-else class="grid">
      <thead>
        <tr>
          <th>会话</th>
          <th>最近活动</th>
          <th class="num">调用</th>
          <th>计划步骤</th>
          <th class="num">跳步</th>
          <th class="num">越界</th>
          <th class="num">计划外</th>
          <th class="num">Drift</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in p.sessions" :key="s.id" @click="open(p.id, s.id)">
          <td><a class="mono" :href="`/p/${p.id}/s/${s.id}`" @click.prevent="open(p.id, s.id)">{{ shortId(s.id) }}</a></td>
          <td class="muted">{{ timeAgo(s.lastActivity) }}</td>
          <td class="num">{{ s.toolCalls }}</td>
          <td>
            <div v-if="s.stepsTotal" class="progress" :title="`${s.stepsDone}/${s.stepsTotal} 步已完成`">
              <div class="track"><div class="fill" :style="{ width: `${(100 * s.stepsDone) / s.stepsTotal}%` }" /></div>
              <span class="small muted">{{ s.stepsDone }}/{{ s.stepsTotal }}</span>
            </div>
            <span v-else class="faint small">无计划</span>
          </td>
          <td class="num" :class="{ hot: s.counts['skip-ahead'] }">{{ s.counts["skip-ahead"] }}</td>
          <td class="num" :class="{ hot: s.counts['out-of-scope'] }">{{ s.counts["out-of-scope"] }}</td>
          <td class="num" :class="{ hot: s.counts.extra }">{{ s.counts.extra }}</td>
          <td class="num"><DriftGauge :score="s.driftScore" :size="38" class="g" /></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.intro { margin-bottom: 22px; max-width: 760px; }
.intro h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.01em; }
.intro p { margin: 0; }
.project { margin-bottom: 18px; overflow: hidden; }
.title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress { display: flex; align-items: center; gap: 8px; min-width: 120px; }
.track { flex: 1; height: 6px; background: var(--panel-2); border-radius: 99px; overflow: hidden; }
.fill { height: 100%; background: var(--v-match); border-radius: 99px; transition: width 0.4s; }
.hot { color: var(--v-out); font-weight: 600; }
.g { display: inline-block; vertical-align: middle; }
.g :deep(.val) { font-size: 12px; }
@media (max-width: 760px) {
  table.grid th:nth-child(2), table.grid td:nth-child(2),
  table.grid th:nth-child(5), table.grid td:nth-child(5),
  table.grid th:nth-child(7), table.grid td:nth-child(7) { display: none; }
  table.grid th, table.grid td { padding: 10px; }
}
</style>
