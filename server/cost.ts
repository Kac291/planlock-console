// Per-turn token cost from Claude Code transcripts + ClaudeThrottle routing log.
//
// Transcripts: ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl, one line per
// content block; assistant lines carry message.id, message.model, message.usage.
// Several lines share one message.id (same usage), so we dedupe by id.
//
// ClaudeThrottle usage.log: `timestamp|session|agent|model|status|promptLen`.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseJsonl } from "./analyze.js";
import type {
  CostOverview,
  CostSessionDetail,
  CostSessionSummary,
  RoutingCounts,
  TurnCost,
} from "./types.js";

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface Price {
  input: number; // USD per million tokens
  output: number;
}

export interface Pricing {
  source: string;
  byFamily: Record<string, Price>;
}

/** Fallback copied from ClaudeThrottle/config/models.json; overridden by the installed copy when present. */
const FALLBACK: Record<string, Price> = {
  haiku: { input: 0.8, output: 4 },
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

// Anthropic's cache pricing multipliers relative to base input price.
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;

export function loadPricing(throttleDir: string): Pricing {
  const f = path.join(throttleDir, "config", "models.json");
  try {
    const doc = JSON.parse(readFileSync(f, "utf8")) as {
      models?: Record<string, { input_cost_per_mtok?: number; output_cost_per_mtok?: number }>;
    };
    const byFamily: Record<string, Price> = { ...FALLBACK };
    for (const [family, m] of Object.entries(doc.models ?? {})) {
      if (typeof m.input_cost_per_mtok === "number" && typeof m.output_cost_per_mtok === "number") {
        byFamily[family] = { input: m.input_cost_per_mtok, output: m.output_cost_per_mtok };
      }
    }
    return { source: f, byFamily };
  } catch {
    return { source: "built-in defaults (ClaudeThrottle models.json)", byFamily: { ...FALLBACK } };
  }
}

export function familyOf(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  return "sonnet";
}

interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  message?: { id?: string; model?: string; usage?: Usage };
}

export function turnsFromTranscript(
  lines: TranscriptLine[],
  pricing: Pricing,
  source: "main" | "subagent",
): Omit<TurnCost, "index">[] {
  const byId = new Map<string, Omit<TurnCost, "index">>();
  let anon = 0;
  for (const l of lines) {
    if (l.type !== "assistant" || !l.message?.usage) continue;
    const model = l.message.model ?? "unknown";
    if (model.startsWith("<")) continue; // e.g. "<synthetic>" error stubs
    const u = l.message.usage;
    const inputTokens = u.input_tokens ?? 0;
    const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = u.cache_read_input_tokens ?? 0;
    const outputTokens = u.output_tokens ?? 0;
    if (inputTokens + cacheWriteTokens + cacheReadTokens + outputTokens === 0) continue;
    const price = pricing.byFamily[familyOf(model)] ?? FALLBACK.sonnet;
    const segCostUsd: [number, number, number, number] = [
      (inputTokens * price.input) / 1_000_000,
      (cacheWriteTokens * price.input * CACHE_WRITE_MULT) / 1_000_000,
      (cacheReadTokens * price.input * CACHE_READ_MULT) / 1_000_000,
      (outputTokens * price.output) / 1_000_000,
    ];
    const costUsd = segCostUsd.reduce((a, b) => a + b, 0);
    const key = l.message.id ?? `anon-${anon++}`;
    byId.set(key, {
      timestamp: l.timestamp ?? "",
      model,
      source: l.isSidechain ? "subagent" : source,
      inputTokens,
      cacheWriteTokens,
      cacheReadTokens,
      outputTokens,
      costUsd,
      segCostUsd,
    });
  }
  return [...byId.values()];
}

export function summarize(
  sessionId: string,
  rawTurns: Omit<TurnCost, "index">[],
  routing: RoutingCounts | null,
  pricingSource: string,
): CostSessionDetail {
  const turns = rawTurns
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((t, index) => ({ ...t, index }));
  const totals = { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0, costUsd: 0 };
  const models = new Map<string, { turns: number; costUsd: number }>();
  for (const t of turns) {
    totals.inputTokens += t.inputTokens;
    totals.cacheWriteTokens += t.cacheWriteTokens;
    totals.cacheReadTokens += t.cacheReadTokens;
    totals.outputTokens += t.outputTokens;
    totals.costUsd += t.costUsd;
    const m = models.get(t.model) ?? { turns: 0, costUsd: 0 };
    m.turns += 1;
    m.costUsd += t.costUsd;
    models.set(t.model, m);
  }
  const byModel = [...models.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.costUsd - a.costUsd);
  return { sessionId, turns, totals, byModel, routing, pricingSource };
}

export function parseUsageLog(text: string, sessionId?: string): RoutingCounts {
  const c: RoutingCounts = { haiku: 0, sonnet: 0, opus: 0, opusBlocked: 0 };
  for (const raw of text.split("\n")) {
    const parts = raw.trim().split("|");
    if (parts.length < 5 || parts[2] !== "agent") continue;
    if (sessionId && parts[1] !== sessionId) continue;
    const model = parts[3];
    const status = parts[4];
    if (model === "opus" && status === "BLOCKED") c.opusBlocked += 1;
    else if (model === "haiku" || model === "sonnet" || model === "opus") c[model] += 1;
  }
  return c;
}

export class CostStore {
  readonly pricing: Pricing;
  constructor(
    readonly throttleDir: string,
    readonly transcriptsDir: string,
  ) {
    this.pricing = loadPricing(throttleDir);
  }

  private usageLog(): string | null {
    const f = path.join(this.throttleDir, "logs", "usage.log");
    return existsSync(f) ? readFileSync(f, "utf8") : null;
  }

  private findTranscript(sessionId: string): string | null {
    if (!SAFE_ID.test(sessionId) || !existsSync(this.transcriptsDir)) return null;
    for (const proj of readdirSync(this.transcriptsDir)) {
      const f = path.join(this.transcriptsDir, proj, `${sessionId}.jsonl`);
      if (existsSync(f)) return f;
    }
    return null;
  }

  overview(limit = 60): CostOverview {
    const sessions: CostSessionSummary[] = [];
    const detected = existsSync(this.transcriptsDir);
    if (detected) {
      for (const proj of readdirSync(this.transcriptsDir)) {
        const dir = path.join(this.transcriptsDir, proj);
        let names: string[];
        try {
          if (!statSync(dir).isDirectory()) continue;
          names = readdirSync(dir);
        } catch {
          continue;
        }
        for (const n of names) {
          if (!n.endsWith(".jsonl")) continue;
          const id = n.slice(0, -".jsonl".length);
          if (!SAFE_ID.test(id)) continue;
          const st = statSync(path.join(dir, n));
          sessions.push({ sessionId: id, project: proj, updatedAt: st.mtime.toISOString(), sizeBytes: st.size });
        }
      }
    }
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const log = this.usageLog();
    return {
      throttleDir: this.throttleDir,
      throttleDetected: log !== null,
      transcriptsDir: this.transcriptsDir,
      transcriptsDetected: detected,
      routingAllTime: log === null ? null : parseUsageLog(log),
      sessions: sessions.slice(0, limit),
    };
  }

  session(sessionId: string): CostSessionDetail | null {
    const f = this.findTranscript(sessionId);
    if (!f) return null;
    const turns = turnsFromTranscript(parseJsonl<TranscriptLine>(readFileSync(f, "utf8")), this.pricing, "main");
    // Newer Claude Code versions keep subagent transcripts next to the session file.
    const subDir = path.join(path.dirname(f), sessionId, "subagents");
    if (existsSync(subDir)) {
      for (const n of readdirSync(subDir)) {
        if (!n.endsWith(".jsonl")) continue;
        const lines = parseJsonl<TranscriptLine>(readFileSync(path.join(subDir, n), "utf8"));
        turns.push(...turnsFromTranscript(lines, this.pricing, "subagent"));
      }
    }
    const log = this.usageLog();
    return summarize(sessionId, turns, log === null ? null : parseUsageLog(log, sessionId), this.pricing.source);
  }
}
