import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSteps, buildTimeline, computeDriftScore, describeTarget, policyFor } from "../server/analyze.js";
import { loadProjects, sessionDetail } from "../server/store.js";
import type { AnyEvent, Step } from "../server/types.js";

const cwd = "/repo";
const ev = (e: Partial<AnyEvent> & { type: AnyEvent["type"] }) =>
  ({ timestamp: "2026-01-01T00:00:00Z", sessionId: "s", cwd, ...e }) as AnyEvent;

describe("buildTimeline", () => {
  it("pairs each tool-call with the drift event that follows it", () => {
    const events = [
      ev({ type: "tool-call", toolName: "Edit", toolInput: { file_path: "/repo/src/a.ts" } }),
      ev({ type: "drift", toolName: "Edit", verdict: "match", stepId: "s1", score: 0.9, paths: ["/repo/src/a.ts"], reason: "ok" }),
      ev({ type: "tool-call", toolName: "Read", toolInput: { file_path: "/repo/src/b.ts" } }),
      ev({ type: "drift", toolName: "Read", verdict: "neutral", stepId: null, score: 0, paths: [], reason: "read-only tool" }),
    ];
    const t = buildTimeline(events, "warn");
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ index: 0, toolName: "Edit", target: "src/a.ts", verdict: "match", stepId: "s1" });
    expect(t[1]).toMatchObject({ index: 1, verdict: "neutral", surfaced: false });
  });

  it("keeps tool calls that have no drift event (no plan yet)", () => {
    const t = buildTimeline([ev({ type: "tool-call", toolName: "Bash", toolInput: { command: "ls" } })], "observe");
    expect(t).toEqual([expect.objectContaining({ toolName: "Bash", target: "ls", verdict: null })]);
  });
});

describe("policyFor mirrors planlock policy.ts", () => {
  it.each([
    ["observe", "partial", false, false],
    ["observe", "extra", true, false],
    ["warn", "partial", true, false],
    ["strict", "out-of-scope", true, true],
    ["strict", "skip-ahead", true, false],
  ] as const)("%s / %s", (mode, verdict, surfaced, blocked) => {
    expect(policyFor(mode, verdict)).toEqual({ surfaced, blocked });
  });
});

describe("buildSteps", () => {
  const steps: Step[] = ["s1", "s2", "s3"].map((id) => ({
    id,
    summary: id,
    scope: { files: [], commands: [], operations: [] },
    dependencies: [],
  }));
  it("marks done / partial / open and records skip-ahead completion", () => {
    const t = buildTimeline(
      [
        ev({ type: "drift", toolName: "Write", verdict: "skip-ahead", stepId: "s2", score: 0.9, paths: [], reason: "" }),
        ev({ type: "drift", toolName: "Edit", verdict: "partial", stepId: "s1", score: 0.5, paths: [], reason: "" }),
      ],
      "warn",
    );
    const v = buildSteps(steps, t);
    expect(v.map((s) => s.status)).toEqual(["partial", "done", "open"]);
    expect(v[1]).toMatchObject({ skippedAhead: true, completedBy: 0 });
  });
});

describe("computeDriftScore matches planlock report.ts", () => {
  it("weights skipped steps, out-of-scope and extra", () => {
    expect(computeDriftScore(4, 0, 1, 1)).toBe(12);
    expect(computeDriftScore(4, 4, 10, 10)).toBe(100);
    expect(computeDriftScore(0, 0, 3, 3)).toBe(0);
  });
});

describe("describeTarget", () => {
  it("relativizes Windows paths against cwd", () => {
    expect(describeTarget({ file_path: "C:\\work\\game\\src\\a.ts" }, "C:\\work\\game")).toBe("src/a.ts");
  });
});

describe("fixture produced by the real planlock CLI", () => {
  it("agrees with planlock's own report.md (drift score 12, s3 skipped ahead)", () => {
    const [p] = loadProjects([path.join(__dirname, "..", "fixtures", "demo-warn")]);
    const d = sessionDetail(p, "sess-demo-fixture");
    expect(d).not.toBeNull();
    expect(d?.driftScore).toBe(12);
    expect(d?.plan.steps.map((s) => s.status)).toEqual(["done", "done", "done", "done"]);
    expect(d?.plan.steps.find((s) => s.id === "s3")?.skippedAhead).toBe(true);
    expect(d?.counts["out-of-scope"]).toBe(1);
    expect(d?.timeline).toHaveLength(8);
  });

  it("rejects path traversal in session ids", () => {
    const [p] = loadProjects([path.join(__dirname, "..", "fixtures", "demo-warn")]);
    expect(sessionDetail(p, "../../etc")).toBeNull();
  });
});
