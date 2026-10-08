// Shared API types. The planlock event shapes mirror planlock/src/types.ts (v0.3.1).

export type DriftVerdict = "match" | "partial" | "skip-ahead" | "out-of-scope" | "extra" | "neutral";

export type Mode = "observe" | "warn" | "strict";

export interface StepScope {
  files: string[];
  commands: string[];
  operations: string[];
}

export interface Step {
  id: string;
  summary: string;
  scope: StepScope;
  dependencies: string[];
}

export interface PlanCapturedEvent {
  type: "plan-captured";
  timestamp: string;
  sessionId: string;
  cwd: string;
  planId: string;
  sourcePath: string;
  storedPath: string;
  sourceMtime: string;
}

export interface PlanParsedEvent {
  type: "plan-parsed";
  timestamp: string;
  sessionId: string;
  cwd: string;
  planId: string;
  parsedPath: string;
  stepCount: number;
  strategy: string;
}

export interface ToolCallEvent {
  type: "tool-call";
  timestamp: string;
  sessionId: string;
  cwd: string;
  toolName: string;
  toolInput: unknown;
}

export interface DriftEvent {
  type: "drift";
  timestamp: string;
  sessionId: string;
  cwd: string;
  verdict: DriftVerdict;
  toolName: string;
  paths: string[];
  stepId: string | null;
  score: number;
  reason: string;
}

export type AnyEvent = PlanCapturedEvent | PlanParsedEvent | ToolCallEvent | DriftEvent;

// ---- API payloads ----

export interface ProjectSummary {
  id: string;
  name: string;
  root: string;
  mode: Mode;
  sessions: SessionSummary[];
}

export type VerdictCounts = Record<DriftVerdict, number>;

export interface SessionSummary {
  id: string;
  lastActivity: string | null;
  toolCalls: number;
  stepsTotal: number;
  stepsDone: number;
  driftScore: number | null;
  counts: VerdictCounts;
}

export type StepStatus = "done" | "partial" | "open";

export interface StepView extends Step {
  status: StepStatus;
  /** Index in the timeline of the call that completed this step, if any. */
  completedBy: number | null;
  /** True when the step was completed out of order (skip-ahead). */
  skippedAhead: boolean;
  hits: number;
  partials: number;
}

export interface TimelineItem {
  index: number;
  timestamp: string;
  toolName: string;
  /** One-line human label: file path, command or pattern. */
  target: string | null;
  verdict: DriftVerdict | null;
  stepId: string | null;
  score: number | null;
  reason: string | null;
  /** Under the current mode, would planlock have surfaced / blocked this call? */
  surfaced: boolean;
  blocked: boolean;
}

export interface SessionDetail {
  projectId: string;
  projectName: string;
  sessionId: string;
  mode: Mode;
  plan: {
    planId: string | null;
    capturedAt: string | null;
    sourcePath: string | null;
    markdown: string | null;
    steps: StepView[];
  };
  timeline: TimelineItem[];
  counts: VerdictCounts;
  toolBreakdown: Array<{ tool: string; count: number }>;
  driftScore: number | null;
  lastActivity: string | null;
}

// ---- ClaudeThrottle / transcript cost ----

export interface TurnCost {
  index: number;
  timestamp: string;
  model: string;
  /** "main" = the session's own transcript; "subagent" = a sidechain/subagent transcript. */
  source: "main" | "subagent";
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Cost split as [input, cacheWrite, cacheRead, output], USD. */
  segCostUsd: [number, number, number, number];
}

export interface RoutingCounts {
  haiku: number;
  sonnet: number;
  opus: number;
  opusBlocked: number;
}

export interface CostSessionSummary {
  sessionId: string;
  project: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface CostSessionDetail {
  sessionId: string;
  turns: TurnCost[];
  totals: {
    inputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  byModel: Array<{ model: string; turns: number; costUsd: number }>;
  routing: RoutingCounts | null;
  pricingSource: string;
}

export interface CostOverview {
  throttleDir: string;
  throttleDetected: boolean;
  transcriptsDir: string;
  transcriptsDetected: boolean;
  routingAllTime: RoutingCounts | null;
  sessions: CostSessionSummary[];
}
