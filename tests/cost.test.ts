import { describe, expect, it } from "vitest";
import { familyOf, parseUsageLog, summarize, turnsFromTranscript } from "../server/cost.js";

const pricing = { source: "test", byFamily: { haiku: { input: 1, output: 5 }, sonnet: { input: 3, output: 15 }, opus: { input: 15, output: 75 } } };

describe("turnsFromTranscript", () => {
  it("dedupes content-block lines that share a message id and prices cache tokens", () => {
    const usage = { input_tokens: 1000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000, output_tokens: 1000 };
    const line = { type: "assistant", timestamp: "t1", message: { id: "m1", model: "claude-sonnet-4-6", usage } };
    const turns = turnsFromTranscript([line, line, { type: "user" }], pricing, "main");
    expect(turns).toHaveLength(1);
    // 1000*3 + 1000*3*1.25 + 10000*3*0.1 + 1000*15 = 24750 per M
    expect(turns[0].costUsd).toBeCloseTo(0.02475, 6);
  });

  it("tags sidechain lines as subagent and skips synthetic stubs", () => {
    const turns = turnsFromTranscript(
      [
        { type: "assistant", isSidechain: true, message: { id: "a", model: "claude-haiku-4-5", usage: { output_tokens: 10 } } },
        { type: "assistant", message: { id: "b", model: "<synthetic>", usage: { output_tokens: 10 } } },
      ],
      pricing,
      "main",
    );
    expect(turns).toEqual([expect.objectContaining({ source: "subagent", model: "claude-haiku-4-5" })]);
  });
});

it("summarize totals per model", () => {
  const t = turnsFromTranscript(
    [
      { type: "assistant", timestamp: "2", message: { id: "x", model: "claude-opus-4-6", usage: { output_tokens: 1000 } } },
      { type: "assistant", timestamp: "1", message: { id: "y", model: "claude-haiku-4-5", usage: { output_tokens: 1000 } } },
    ],
    pricing,
    "main",
  );
  const s = summarize("sid", t, null, "test");
  expect(s.turns[0].model).toBe("claude-haiku-4-5");
  expect(s.byModel[0].model).toBe("claude-opus-4-6");
  expect(s.totals.costUsd).toBeCloseTo(0.08, 6);
});

it("parseUsageLog counts ClaudeThrottle routing per session", () => {
  const log = [
    "2026-04-16T10:00:00|abc|agent|haiku|ok|120",
    "2026-04-16T10:01:00|abc|agent|opus|BLOCKED|300",
    "2026-04-16T10:02:00|abc|agent|opus|BOOSTED|300",
    "2026-04-16T10:03:00|zzz|agent|sonnet|ok|90",
  ].join("\n");
  expect(parseUsageLog(log, "abc")).toEqual({ haiku: 1, sonnet: 0, opus: 1, opusBlocked: 1 });
  expect(parseUsageLog(log).sonnet).toBe(1);
});

it("familyOf", () => {
  expect(familyOf("claude-3-5-haiku-20241022")).toBe("haiku");
  expect(familyOf("claude-opus-4-6")).toBe("opus");
});
