#!/usr/bin/env node
// Drives the REAL planlock CLI with scripted Claude Code hook payloads, so the
// console has a live session to show. Nothing here writes planlock events
// directly — every event comes from planlock's own capture-plan / match-tool.
//
//   npm run demo                       # live: one tool call every 1.5 s
//   npm run demo -- --delay 400        # faster
//   npm run demo -- --mode strict      # watch out-of-scope calls get blocked
//   PLANLOCK_CLI=path/to/planlock/dist/cli.js npm run demo
//
// The planlock CLI is located via --cli, $PLANLOCK_CLI, ../planlock/dist/cli.js,
// or `planlock` on PATH, in that order.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const outDir = path.resolve(ROOT, arg("out", "demo-workspace"));
const projectName = arg("name", "game-config-tool");
const delay = Number(arg("delay", "1500"));
const mode = arg("mode", "warn");
const sessionId = arg("session", `demo-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`);

function resolveCli() {
  const candidates = [arg("cli"), process.env.PLANLOCK_CLI, path.resolve(ROOT, "..", "planlock", "dist", "cli.js")];
  for (const c of candidates) if (c && existsSync(c)) return { cmd: process.execPath, pre: [c] };
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["planlock"], { encoding: "utf8" });
  if (probe.status === 0) return { cmd: "planlock", pre: [], shell: process.platform === "win32" };
  console.error(
    "找不到 planlock CLI。请先在 planlock 仓库里 `pnpm build`，然后用 --cli <path/to/dist/cli.js> 或 PLANLOCK_CLI 指定。",
  );
  process.exit(1);
}

const cli = resolveCli();
const project = path.join(outDir, projectName);
const plansDir = path.join(outDir, "plans");

function run(sub, payload) {
  const r = spawnSync(cli.cmd, [...cli.pre, sub], {
    cwd: project,
    input: payload ? JSON.stringify(payload) : undefined,
    encoding: "utf8",
    shell: cli.shell ?? false,
  });
  return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abs = (rel) => path.join(project, rel);

// ---- 1. fresh sandbox project with planlock installed ----
if (!existsSync(project)) mkdirSync(project, { recursive: true });
mkdirSync(plansDir, { recursive: true });
if (!existsSync(path.join(project, ".planlock"))) run("init");

// Point Claude Code's plansDirectory at our sandbox so capture-plan finds the plan.
const settingsFile = path.join(project, ".claude", "settings.local.json");
const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, "utf8")) : {};
settings.plansDirectory = plansDir;
mkdirSync(path.dirname(settingsFile), { recursive: true });
writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
writeFileSync(path.join(project, ".planlock", "config.yaml"), `mode: ${mode}\nthresholds:\n  match: 0.7\n  partial: 0.4\nignoreMinorExtras: true\n`);

rmSync(path.join(project, ".planlock", "sessions", sessionId), { recursive: true, force: true });
copyFileSync(path.join(ROOT, "scripts", "demo-plan.md"), path.join(plansDir, "plan.md"));

const base = { session_id: sessionId, cwd: project, hook_event_name: "PreToolUse" };

// ---- 2. user approves the plan (ExitPlanMode) ----
console.log(`planlock demo  session=${sessionId}  mode=${mode}`);
const cap = run("capture-plan", { ...base, tool_name: "ExitPlanMode", tool_input: {} });
console.log(`  ${cap.out || cap.err}`);
await sleep(delay);

// ---- 3. the agent works, sometimes drifting off plan ----
const script = [
  ["Read", { file_path: abs("tools/config_check/schema.ts") }, "先读现有 schema"],
  ["Edit", { file_path: abs("tools/config_check/schema.ts"), old_string: "…", new_string: "…" }, "按计划改 schema"],
  ["Grep", { pattern: "critRate", path: abs("tools") }, "搜索字段引用"],
  ["Write", { file_path: abs("tools/config_check/rules.test.ts"), content: "…" }, "跳过第 2 步，先写测试"],
  ["Write", { file_path: abs("tools/config_check/rules.ts"), content: "…" }, "回头补数值规则"],
  ["Edit", { file_path: abs("src/battle/damage.ts"), old_string: "…", new_string: "…" }, "顺手改了战斗公式 —— 计划外"],
  ["Bash", { command: "pnpm test", description: "Run tests" }, "跑测试"],
  ["Bash", { command: "git push origin main", description: "Push" }, "计划里没有的推送"],
];

for (const [tool, input, note] of script) {
  const r = run("match-tool", { ...base, tool_name: tool, tool_input: input });
  const flag = r.code === 2 ? "  ⛔ BLOCKED" : "";
  console.log(`  ${tool.padEnd(5)} ${note}${flag}${r.err ? `\n        ${r.err.split("\n")[0]}` : ""}`);
  await sleep(delay);
}

run("report", { session_id: sessionId, cwd: project });
console.log(`done. report: ${path.join(project, ".planlock", "sessions", sessionId, "report.md")}`);
