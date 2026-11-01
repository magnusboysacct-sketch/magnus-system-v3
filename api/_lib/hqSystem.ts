// api/_lib/hqSystem.ts — Magnus HQ System tab data (GET /api/hq-system).
// Only for a platform admin whose session passed 2-step login: the caller's own token is checked with hq_my_status().
// Anyone else gets 404, exactly like an unknown address. Optional tokens are read from SERVER env vars only
// (never VITE_*): VERCEL_TOKEN (+ VERCEL_PROJECT_ID or VERCEL_PROJECT_NAME, VERCEL_TEAM_ID), GITHUB_TOKEN (+ GITHUB_REPO),
// SUPABASE_ACCESS_TOKEN (Supabase management API, for backups). Without them the tab says how to add them.
import { previewEnv } from "./sharePreview.js";

type Json = Record<string, unknown>;

const DOMAIN = () => process.env.HQ_DOMAIN || "magnusboys.com";
const REPO = () => process.env.GITHUB_REPO || "magnusboysacct-sketch/magnus-system-v3";

async function getJson(url: string, headers: Record<string, string> = {}): Promise<Json | Json[] | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "magnus-hq", ...headers }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return (await res.json()) as Json | Json[];
  } catch {
    return null;
  }
}

async function isHqAdmin(request: Request): Promise<boolean> {
  const env = previewEnv();
  const auth = request.headers.get("authorization") || "";
  if (!env || !/^Bearer\s+\S+/i.test(auth)) return false;
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/hq_my_status`, {
      method: "POST",
      headers: { apikey: env.key, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const s = (await res.json()) as { is_admin?: boolean; mfa_ok?: boolean };
    return !!s.is_admin && !!s.mfa_ok;
  } catch {
    return false;
  }
}

async function serviceStatus(name: string, url: string, page: string) {
  const j = (await getJson(url)) as { status?: { indicator?: string; description?: string } } | null;
  return { name, page, indicator: j?.status?.indicator ?? "unknown", description: j?.status?.description ?? "Could not check" };
}

async function domainExpiry() {
  const d = DOMAIN();
  const j = (await getJson(`https://rdap.verisign.com/com/v1/domain/${encodeURIComponent(d)}`)) as
    { events?: { eventAction?: string; eventDate?: string }[] } | null;
  const exp = j?.events?.find((e) => e.eventAction === "expiration")?.eventDate ?? null;
  return { domain: d, expires_at: exp };
}

async function vercelDeploys() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { configured: false as const };
  const q = new URLSearchParams({ limit: "6" });
  if (process.env.VERCEL_PROJECT_ID) q.set("projectId", process.env.VERCEL_PROJECT_ID);
  else q.set("app", process.env.VERCEL_PROJECT_NAME || "magnus-system-v3");
  if (process.env.VERCEL_TEAM_ID) q.set("teamId", process.env.VERCEL_TEAM_ID);
  const j = (await getJson(`https://api.vercel.com/v6/deployments?${q}`, { Authorization: `Bearer ${token}` })) as
    { deployments?: Json[] } | null;
  if (!j) return { configured: true as const, error: "Vercel did not answer (check the token)." };
  return {
    configured: true as const,
    deployments: (j.deployments ?? []).map((d) => {
      const meta = (d.meta ?? {}) as Json;
      return {
        url: d.url ? `https://${String(d.url)}` : null,
        state: d.state ?? d.readyState ?? null,
        target: d.target ?? "preview",
        created: d.created ?? d.createdAt ?? null,
        branch: meta.githubCommitRef ?? null,
        message: meta.githubCommitMessage ?? null,
      };
    }),
  };
}

async function githubCommits() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { configured: false as const, repo: REPO() };
  const j = (await getJson(`https://api.github.com/repos/${REPO()}/commits?per_page=6`, {
    Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28",
  })) as Json[] | null;
  if (!Array.isArray(j)) return { configured: true as const, repo: REPO(), error: "GitHub did not answer (check the token)." };
  return {
    configured: true as const,
    repo: REPO(),
    commits: j.map((c) => {
      const commit = (c.commit ?? {}) as { message?: string; author?: { name?: string; date?: string } };
      return {
        sha: String(c.sha ?? "").slice(0, 7),
        message: String(commit.message ?? "").split("\n")[0].slice(0, 140),
        author: commit.author?.name ?? null,
        date: commit.author?.date ?? null,
        url: c.html_url ?? null,
      };
    }),
  };
}

async function supabaseBackups() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const env = previewEnv();
  const ref = env ? new URL(env.url).hostname.split(".")[0] : null;
  if (!token || !ref) return { configured: false as const, project_ref: ref };
  const j = (await getJson(`https://api.supabase.com/v1/projects/${ref}/database/backups`, { Authorization: `Bearer ${token}` })) as
    { pitr_enabled?: boolean; walg_enabled?: boolean; backups?: { inserted_at?: string; status?: string; is_physical_backup?: boolean }[] } | null;
  if (!j) return { configured: true as const, project_ref: ref, error: "Supabase did not answer (check the token)." };
  const list = (j.backups ?? []).slice().sort((a, b) => String(b.inserted_at).localeCompare(String(a.inserted_at)));
  return { configured: true as const, project_ref: ref, pitr_enabled: !!j.pitr_enabled, count: list.length, latest: list[0] ?? null };
}

export async function hqSystemHandler(request: Request): Promise<Response> {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (!(await isHqAdmin(request))) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

  const [supabase, vercel, github, domain, deploys, commits, backups] = await Promise.all([
    serviceStatus("Supabase", "https://status.supabase.com/api/v2/status.json", "https://status.supabase.com"),
    serviceStatus("Vercel", "https://www.vercel-status.com/api/v2/status.json", "https://www.vercel-status.com"),
    serviceStatus("GitHub", "https://www.githubstatus.com/api/v2/status.json", "https://www.githubstatus.com"),
    domainExpiry(),
    vercelDeploys(),
    githubCommits(),
    supabaseBackups(),
  ]);

  return new Response(JSON.stringify({
    checked_at: new Date().toISOString(),
    version: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    services: [supabase, vercel, github],
    domain,
    deploys,
    commits,
    backups,
  }), { status: 200, headers });
}
