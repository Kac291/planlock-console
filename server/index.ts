import { existsSync, readFileSync, unwatchFile, watchFile } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { CostStore } from "./cost.js";
import { type Project, eventsFile, loadProjects, projectSummary, sessionDetail } from "./store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- config ----------
// Projects to watch (each must contain a .planlock/ folder), in priority order:
//   1. PLANLOCK_PROJECTS env, separated by ";" on Windows / ":" elsewhere
//   2. console.config.json { "projects": [...] }
//   3. the bundled demo fixtures + demo-workspace (created by `npm run demo`)
function configuredRoots(): string[] {
  const env = process.env.PLANLOCK_PROJECTS;
  if (env) return env.split(path.delimiter).filter(Boolean);
  const cfg = path.join(ROOT, "console.config.json");
  if (existsSync(cfg)) {
    const doc = JSON.parse(readFileSync(cfg, "utf8")) as { projects?: string[] };
    if (doc.projects?.length) return doc.projects.map((p) => path.resolve(ROOT, p));
  }
  return [
    path.join(ROOT, "demo-workspace", "game-config-tool"),
    path.join(ROOT, "fixtures", "demo-warn"),
    path.join(ROOT, "fixtures", "demo-strict"),
  ];
}

const projects: Project[] = loadProjects(configuredRoots());
const cost = new CostStore(
  process.env.CLAUDE_THROTTLE_DIR ?? path.join(homedir(), ".claude", "throttle"),
  process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects"),
);

const findProject = (id: string) => projects.find((p) => p.id === id);

// ---------- server ----------
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "warn" } });

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/projects", async () => projects.map(projectSummary));

app.get<{ Params: { pid: string; sid: string } }>("/api/projects/:pid/sessions/:sid", async (req, reply) => {
  const p = findProject(req.params.pid);
  const d = p ? sessionDetail(p, req.params.sid) : null;
  if (!d) return reply.code(404).send({ error: "session not found" });
  return d;
});

// Live view: push a fresh snapshot whenever events.jsonl grows. The snapshot is
// recomputed by replaying the whole log, so the UI can never drift from the file.
const watchers = new Map<string, Set<() => void>>();

function subscribe(file: string, fn: () => void): () => void {
  let subs = watchers.get(file);
  if (!subs) {
    const created = new Set<() => void>();
    subs = created;
    watchers.set(file, created);
    // watchFile (stat polling) behaves the same on Windows, macOS and Linux,
    // and keeps working when the file does not exist yet.
    watchFile(file, { interval: 400 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) for (const s of created) s();
    });
  }
  subs.add(fn);
  return () => {
    subs.delete(fn);
    if (subs.size === 0) {
      unwatchFile(file);
      watchers.delete(file);
    }
  };
}

app.get<{ Params: { pid: string; sid: string } }>("/api/projects/:pid/sessions/:sid/stream", (req, reply) => {
  const p = findProject(req.params.pid);
  const file = p ? eventsFile(p, req.params.sid) : null;
  if (!p || !file) {
    reply.code(404).send({ error: "session not found" });
    return;
  }
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const push = () => {
    const d = sessionDetail(p, req.params.sid);
    if (d) res.write(`event: snapshot\ndata: ${JSON.stringify(d)}\n\n`);
  };
  push();
  const unsubscribe = subscribe(file, push);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  req.raw.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.get("/api/cost", async () => cost.overview());

app.get<{ Params: { sid: string } }>("/api/cost/:sid", async (req, reply) => {
  const d = cost.session(req.params.sid);
  if (!d) return reply.code(404).send({ error: "transcript not found" });
  return d;
});

// Serve the built frontend when it exists (`npm run build` then `npm start`).
const dist = path.join(ROOT, "dist");
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 5174);
await app.listen({ port, host: "127.0.0.1" });
console.log(`planlock-console API  http://127.0.0.1:${port}`);
for (const p of projects) {
  console.log(`  watching ${p.root}${existsSync(path.join(p.root, ".planlock")) ? "" : "  (no .planlock yet)"}`);
}
