// scripts/tests/health.test.ts — /api/health turns the database + sign-in answers into ok / warn / problem.
import test from "node:test";
import assert from "node:assert/strict";
import { collectHealth } from "../../api/_lib/health.ts";

const env = { url: "https://x.supabase.co", key: "anon" };
const fake = (db: unknown, dbOk = true, authOk = true) => (async (url: string | URL | Request) => {
  const u = String(url);
  if (u.includes("/auth/v1/health")) return new Response("{}", { status: authOk ? 200 : 503 });
  return new Response(JSON.stringify(db), { status: dbOk ? 200 : 500 });
}) as typeof fetch;

test("all ok", async () => {
  const h = await collectHealth(fake({ checks: [{ key: "database", label: "Database", level: "ok" }] }), env);
  assert.equal(h.status, "ok");
  assert.equal(h.checks.find((c) => c.key === "auth")?.level, "ok");
});

test("a warning stays a warning", async () => {
  const h = await collectHealth(fake({ checks: [{ key: "daily_job", label: "Daily job", level: "warn" }] }), env);
  assert.equal(h.status, "warn");
});

test("database down is a problem", async () => {
  const h = await collectHealth(fake({}, false), env);
  assert.equal(h.status, "problem");
});

test("sign-in down is a problem", async () => {
  const h = await collectHealth(fake({ checks: [] }, true, false), env);
  assert.equal(h.status, "problem");
});

test("no settings is a problem, not a crash", async () => {
  const h = await collectHealth(fake({}), null);
  assert.equal(h.status, "problem");
});
