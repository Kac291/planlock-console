import type { CostOverview, CostSessionDetail, ProjectSummary, SessionDetail } from "@server/types";

export type * from "@server/types";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`);
  return (await r.json()) as T;
}

export const api = {
  projects: () => get<ProjectSummary[]>("/api/projects"),
  session: (pid: string, sid: string) =>
    get<SessionDetail>(`/api/projects/${encodeURIComponent(pid)}/sessions/${encodeURIComponent(sid)}`),
  streamUrl: (pid: string, sid: string) =>
    `/api/projects/${encodeURIComponent(pid)}/sessions/${encodeURIComponent(sid)}/stream`,
  cost: () => get<CostOverview>("/api/cost"),
  costSession: (sid: string) => get<CostSessionDetail>(`/api/cost/${encodeURIComponent(sid)}`),
};
