import type { DriftVerdict, Mode } from "@server/types";

export const VERDICTS: DriftVerdict[] = ["match", "partial", "skip-ahead", "out-of-scope", "extra", "neutral"];

export const VERDICT_LABEL: Record<DriftVerdict, string> = {
  match: "按计划",
  partial: "部分命中",
  "skip-ahead": "跳步",
  "out-of-scope": "越界",
  extra: "计划外",
  neutral: "只读",
};

export const VERDICT_HINT: Record<DriftVerdict, string> = {
  match: "命中当前应执行的步骤",
  partial: "路径相关，但分数不足以算完成",
  "skip-ahead": "命中了后面的步骤，跳过了前面未完成的",
  "out-of-scope": "改动的文件不属于计划中任何步骤",
  extra: "没有任何步骤认领这次调用",
  neutral: "只读工具，不参与比对",
};

export const MODE_LABEL: Record<Mode, string> = {
  observe: "observe · 只记录",
  warn: "warn · 提醒模型",
  strict: "strict · 拦截越界",
};
