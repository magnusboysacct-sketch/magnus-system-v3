// api/_lib/health.ts — the public health check for Magnus Boy's System (GET /api/health).
// Point UptimeRobot at it: it answers 200 for ok / warn and 503 for a problem, so a plain HTTP monitor alerts on problems.
// It holds no secrets: it uses the public (anon) key and the get_public_health() database function,
// which returns levels and plain words only (no company data, no table names).
import { previewEnv } from "./sharePreview.js";

export type Level = "ok" | "warn" | "problem";
export type Check = { key: string; label: string; level: Level };
export type Health = { status: Level; checked_at: string; checks: Check[] };

const worst = (checks: Check[]): Level =>
  checks.some((c) => c.level === "problem") ? "problem" : checks.some((c) => c.level === "warn") ? "warn" : "ok";

export async function collectHealth(fetchImpl: typeof fetch = fetch, env = previewEnv()): Promise<Health> {
  const checks: Check[] = [];
  if (!env) {
    checks.push({ key: "config", label: "Server settings", level: "problem" });
    return { status: "problem", checked_at: new Date().toISOString(), checks };
  }

  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" };

  const [db, auth] = await Promise.allSettled([
    fetchImpl(`${env.url}/rest/v1/rpc/get_public_health`, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(6000) }),
    fetchImpl(`${env.url}/auth/v1/health`, { headers: { apikey: env.key }, signal: AbortSignal.timeout(6000) }),
  ]);

  if (db.status === "fulfilled" && db.value.ok) {
    try {
      const body = (await db.value.json()) as { checks?: Check[] };
      for (const c of body.checks ?? []) {
        if (c && typeof c.key === "string" && ["ok", "warn", "problem"].includes(c.level)) {
          checks.push({ key: c.key, label: String(c.label ?? c.key), level: c.level });
        }
      }
    } catch {
      checks.push({ key: "database", label: "Database", level: "problem" });
    }
  } else {
    checks.push({ key: "database", label: "Database", level: "problem" });
  }

  checks.push({ key: "auth", label: "Sign-in", level: auth.status === "fulfilled" && auth.value.ok ? "ok" : "problem" });

  return { status: worst(checks), checked_at: new Date().toISOString(), checks };
}

export async function healthHandler(): Promise<Response> {
  const health = await collectHealth();
  return new Response(JSON.stringify(health), {
    status: health.status === "problem" ? 503 : 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
