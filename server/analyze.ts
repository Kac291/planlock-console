// Pure analysis over a planlock event log. No filesystem access here, so it is
// trivially unit-testable. The console never keeps its own state: every view is
// recomputed by replaying events.jsonl, same principle as planlock itself.

import type {
  AnyEvent,
  DriftEvent,
  DriftVerdict,
  Mode,
  Step,
  StepView,
  TimelineItem,
  VerdictCounts,
} from "./types.js";

const OBSERVE_SURFACE = new Set<DriftVerdict>(["out-of-scope", "skip-ahead", "extra"]);
const WARN_SURFACE = new Set<DriftVerdict>(["out-of-scope", "skip-ahead", "extra", "partial"]);
const STRICT_BLOCK = new Set<DriftVerdict>(["out-of-scope"]);

export function emptyCounts(): VerdictCounts {
  return { match: 0, partial: 0, "skip-ahead": 0, "out-of-scope": 0, extra: 0, neutral: 0 };
}

/** Same decision table as planlock/src/match/policy.ts. */
export function policyFor(mode: Mode, verdict: DriftVerdict): { surfaced: boolean; blocked: boolean } {
  if (mode === "strict" && STRICT_BLOCK.has(verdict)) return { surfaced: true, blocked: true };
  const set = mode === "observe" ? OBSERVE_SURFACE : WARN_SURFACE;
  return { surfaced: set.has(verdict), blocked: false };
}

/** Same formula as planlock/src/commands/report.ts so the console and report.md agree. */
export function computeDriftScore(
  totalSteps: number,
  skippedSteps: number,
  outCount: number,
  extraCount: number,
): number {
  if (totalSteps === 0) return 0;
  const raw =
    40 * (skippedSteps / totalSteps) + Math.min(40, outCount * 8) + Math.min(20, extraCount * 4);
  return Math.min(100, Math.round(raw));
}

function pick(input: unknown, key: string): string | null {
  if (!input || typeof input !== "object") return null;
  const v = (input as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function relativize(p: string, cwd: string): string {
  const norm = (s: string) => s.replace(/\\/g, "/").replace(/\/+$/, "");
  const np = norm(p);
  const nc = norm(cwd);
  if (nc && np.toLowerCase().startsWith(`${nc.toLowerCase()}/`)) return np.slice(nc.length + 1);
  return np;
}

/** One-line label for a tool call: the file it touches, the command it runs, or what it searches. */
export function describeTarget(toolInput: unknown, cwd: string): string | null {
  const file = pick(toolInput, "file_path") ?? pick(toolInput, "notebook_path");
  if (file) return relativize(file, cwd);
  const cmd = pick(toolInput, "command");
  if (cmd) return cmd.length > 140 ? `${cmd.slice(0, 137)}…` : cmd;
  const pattern = pick(toolInput, "pattern");
  if (pattern) {
    const where = pick(toolInput, "path");
    return where ? `${pattern}  in ${relativize(where, cwd)}` : pattern;
  }
  return pick(toolInput, "url") ?? pick(toolInput, "description") ?? pick(toolInput, "prompt")?.slice(0, 140) ?? null;
}

/**
 * planlock's match-tool appends a `tool-call` event and, when a parsed plan
 * exists, an immediately following `drift` event for the same call. Pair them
 * into one timeline row.
 */
export function buildTimeline(events: AnyEvent[], mode: Mode): TimelineItem[] {
  const items: TimelineItem[] = [];
  let pending: TimelineItem | null = null;
  const flush = () => {
    if (pending) items.push(pending);
    pending = null;
  };
  for (const e of events) {
    if (e.type === "tool-call") {
      flush();
      pending = {
        index: -1,
        timestamp: e.timestamp,
        toolName: e.toolName,
        target: describeTarget(e.toolInput, e.cwd),
        verdict: null,
        stepId: null,
        score: null,
        reason: null,
        surfaced: false,
        blocked: false,
      };
    } else if (e.type === "drift") {
      const row: TimelineItem =
        pending && pending.toolName === e.toolName
          ? pending
          : {
              index: -1,
              timestamp: e.timestamp,
              toolName: e.toolName,
              target: e.paths[0] ? relativize(e.paths[0], e.cwd) : null,
              verdict: null,
              stepId: null,
              score: null,
              reason: null,
              surfaced: false,
              blocked: false,
            };
      if (row !== pending) flush();
      row.verdict = e.verdict;
      row.stepId = e.stepId;
      row.score = e.score;
      row.reason = e.reason;
      Object.assign(row, policyFor(mode, e.verdict));
      pending = row;
      flush();
    }
  }
  flush();
  items.forEach((it, i) => {
    it.index = i;
  });
  return items;
}

export function buildSteps(steps: Step[], timeline: TimelineItem[]): StepView[] {
  return steps.map((step) => {
    let hits = 0;
    let partials = 0;
    let completedBy: number | null = null;
    let skippedAhead = false;
    for (const it of timeline) {
      if (it.stepId !== step.id) continue;
      if (it.verdict === "match" || it.verdict === "skip-ahead") {
        hits += 1;
        if (completedBy === null) {
          completedBy = it.index;
          skippedAhead = it.verdict === "skip-ahead";
        }
      } else if (it.verdict === "partial") {
        partials += 1;
      }
    }
    const status = hits > 0 ? "done" : partials > 0 ? "partial" : "open";
    return { ...step, status, completedBy, skippedAhead, hits, partials };
  });
}

export function countVerdicts(events: AnyEvent[]): VerdictCounts {
  const c = emptyCounts();
  for (const e of events) if (e.type === "drift") c[(e as DriftEvent).verdict] += 1;
  return c;
}

export function toolBreakdown(events: AnyEvent[]): Array<{ tool: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of events) if (e.type === "tool-call") m.set(e.toolName, (m.get(e.toolName) ?? 0) + 1);
  return [...m.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count);
}

export function sessionDriftScore(stepViews: StepView[], counts: VerdictCounts): number | null {
  if (stepViews.length === 0) return null;
  const skipped = stepViews.filter((s) => s.hits === 0).length;
  return computeDriftScore(stepViews.length, skipped, counts["out-of-scope"], counts.extra);
}

/** Parse JSONL, tolerating a torn last line (process killed mid-append). */
export function parseJsonl<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as T);
    } catch {
      // skip
    }
  }
  return out;
}
