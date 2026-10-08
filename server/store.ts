import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  buildSteps,
  buildTimeline,
  countVerdicts,
  emptyCounts,
  parseJsonl,
  sessionDriftScore,
  toolBreakdown,
} from "./analyze.js";
import type {
  AnyEvent,
  Mode,
  PlanCapturedEvent,
  PlanParsedEvent,
  ProjectSummary,
  SessionDetail,
  SessionSummary,
  Step,
} from "./types.js";

/** planlock rejects these too (see its session-id traversal e2e scenario). */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface Project {
  id: string;
  name: string;
  root: string;
}

export function projectId(root: string): string {
  return createHash("sha1").update(path.resolve(root)).digest("hex").slice(0, 10);
}

export function loadProjects(roots: string[]): Project[] {
  const seen = new Set<string>();
  const out: Project[] = [];
  for (const r of roots) {
    const root = path.resolve(r);
    const id = projectId(root);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: path.basename(root), root });
  }
  return out;
}

const stateRoot = (p: Project) => path.join(p.root, ".planlock");
const sessionsDir = (p: Project) => path.join(stateRoot(p), "sessions");

export function eventsFile(p: Project, sessionId: string): string | null {
  if (!SAFE_ID.test(sessionId)) return null;
  return path.join(sessionsDir(p), sessionId, "events.jsonl");
}

function readMode(p: Project): Mode {
  const f = path.join(stateRoot(p), "config.yaml");
  try {
    const doc = YAML.parse(readFileSync(f, "utf8")) as { mode?: string } | null;
    if (doc?.mode === "warn" || doc?.mode === "strict" || doc?.mode === "observe") return doc.mode;
  } catch {
    // default
  }
  return "observe";
}

function readEvents(p: Project, sessionId: string): AnyEvent[] {
  const f = eventsFile(p, sessionId);
  if (!f || !existsSync(f)) return [];
  return parseJsonl<AnyEvent>(readFileSync(f, "utf8"));
}

function readSteps(file: string): Step[] | null {
  try {
    const doc = YAML.parse(readFileSync(file, "utf8")) as { steps?: unknown } | null;
    return Array.isArray(doc?.steps) ? (doc.steps as Step[]) : null;
  } catch {
    return null;
  }
}

/** The parsed plan as `.planlock/plans/<id>.parsed.yaml`, resolved inside this project only. */
function parsedPlanFile(p: Project, planId: string): string | null {
  if (!SAFE_ID.test(planId)) return null;
  return path.join(stateRoot(p), "plans", `${planId}.parsed.yaml`);
}

function latestPlanOnDisk(p: Project): { planId: string; steps: Step[] } | null {
  const dir = path.join(stateRoot(p), "plans");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((n) => n.endsWith(".parsed.yaml"))
    .map((n) => ({ n, m: statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const f of files) {
    const steps = readSteps(path.join(dir, f.n));
    if (steps) return { planId: f.n.replace(/\.parsed\.yaml$/, ""), steps };
  }
  return null;
}

/** Which plan applies to a session: its own latest plan-parsed event, else the newest on disk (same fallback as planlock report). */
function resolvePlan(p: Project, events: AnyEvent[]) {
  let parsed: PlanParsedEvent | null = null;
  let captured: PlanCapturedEvent | null = null;
  for (const e of events) {
    if (e.type === "plan-parsed") parsed = e;
    if (e.type === "plan-captured") captured = e;
  }
  let planId: string | null = null;
  let steps: Step[] | null = null;
  if (parsed) {
    const f = parsedPlanFile(p, parsed.planId);
    steps = f ? readSteps(f) : null;
    planId = parsed.planId;
  }
  if (!steps) {
    const latest = latestPlanOnDisk(p);
    if (latest) ({ planId, steps } = latest);
  }
  let markdown: string | null = null;
  if (planId && SAFE_ID.test(planId)) {
    const md = path.join(stateRoot(p), "plans", `${planId}.md`);
    if (existsSync(md)) markdown = readFileSync(md, "utf8");
  }
  return {
    planId,
    steps: steps ?? [],
    capturedAt: captured?.timestamp ?? null,
    sourcePath: captured?.sourcePath ?? null,
    markdown,
  };
}

export function sessionDetail(p: Project, sessionId: string): SessionDetail | null {
  const f = eventsFile(p, sessionId);
  if (!f || !existsSync(f)) return null;
  const events = readEvents(p, sessionId);
  const mode = readMode(p);
  const plan = resolvePlan(p, events);
  const timeline = buildTimeline(events, mode);
  const steps = buildSteps(plan.steps, timeline);
  const counts = countVerdicts(events);
  return {
    projectId: p.id,
    projectName: p.name,
    sessionId,
    mode,
    plan: { ...plan, steps },
    timeline,
    counts,
    toolBreakdown: toolBreakdown(events),
    driftScore: sessionDriftScore(steps, counts),
    lastActivity: events.at(-1)?.timestamp ?? null,
  };
}

export function listSessions(p: Project): SessionSummary[] {
  const dir = sessionsDir(p);
  if (!existsSync(dir)) return [];
  const out: SessionSummary[] = [];
  for (const id of readdirSync(dir)) {
    if (!SAFE_ID.test(id)) continue;
    const d = sessionDetail(p, id);
    if (!d) continue;
    out.push({
      id,
      lastActivity: d.lastActivity,
      toolCalls: d.timeline.length,
      stepsTotal: d.plan.steps.length,
      stepsDone: d.plan.steps.filter((s) => s.status === "done").length,
      driftScore: d.driftScore,
      counts: d.counts ?? emptyCounts(),
    });
  }
  return out.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

export function projectSummary(p: Project): ProjectSummary {
  return { id: p.id, name: p.name, root: p.root, mode: readMode(p), sessions: listSessions(p) };
}
