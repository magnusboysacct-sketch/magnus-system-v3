// Proposes a registered worker for every existing field payment (by the typed worker_name) and writes scripts/field-payment-worker-matches.csv.
// READ ONLY: it runs SELECTs on the linked project with `supabase db query --linked` and changes nothing anywhere.
//
//   npx tsx scripts/match-field-payment-workers.ts
//
// The CSV has personal data (names, amounts): it is not committed. To apply the matches you approve, see supabase/scripts/backfill-field-payment-workers.sql.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultWorkerPrefix, formatWorkerNumber } from "../src/lib/workerNumber";
import { matchWorkerName, workerFullName, type MatchType, type WorkerLite } from "../src/lib/workerNameMatch";

const OUR_COMPANY = "813ffe22-b75c-49c5-b41e-3ab185e2724c";   // gets the prefix MBW (migration 20260951000000)

function query<T>(sql: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "fpmatch-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, sql);
  try {
    const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", file, "-o", "json"], { encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    return json.rows as T[];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

interface Worker extends WorkerLite { company_id: string; created_at: string | null; status: string | null; employee_id: string | null }
interface Payment { id: string; company_id: string; work_date: string | null; created_at: string | null; total_amount: number | null; advance_amount: number | null; payment_type: string | null; project_id: string | null; project_name: string | null; worker_name: string | null }

const workers = query<Worker>("select id, company_id, first_name, last_name, created_at, status, employee_id from public.workers order by company_id, created_at nulls last, id");
const payments = query<Payment>("select id, company_id, work_date, created_at, total_amount, advance_amount, payment_type, project_id, project_name, worker_name from public.field_payments order by work_date nulls last, created_at, id");
const projects = new Map(query<{ id: string; name: string }>("select id, name from public.projects").map((p) => [p.id, p.name]));
const companyNames = new Map(query<{ company_id: string; n: string }>("select c.id as company_id, coalesce(nullif(btrim(cs.company_name), ''), c.name) as n from public.companies c left join public.company_settings cs on cs.company_id = c.id").map((c) => [c.company_id, c.n]));
const livePrefix = new Map<string, string>();
try { for (const r of query<{ company_id: string; p: string }>("select company_id, worker_number_prefix as p from public.company_settings where worker_number_prefix is not null")) livePrefix.set(r.company_id, r.p); } catch { /* the migration is not applied yet: the planned prefixes are used */ }

// the number each worker has, or will get from the migration (oldest first per company)
const numberOf = new Map<string, string>();
const perCompany = new Map<string, Worker[]>();
for (const w of workers) { if (!perCompany.has(w.company_id)) perCompany.set(w.company_id, []); perCompany.get(w.company_id)!.push(w); }
for (const [co, list] of perCompany) {
  const prefix = livePrefix.get(co) ?? (co === OUR_COMPANY ? "MBW" : defaultWorkerPrefix(companyNames.get(co)));
  list.forEach((w, i) => numberOf.set(w.id, w.employee_id?.trim() || formatWorkerNumber(prefix, i + 1)));
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rows: string[] = [["payment_id", "date", "amount", "project", "worker_name", "proposed_worker", "employee_number", "match_type", "confidence", "notes"].join(",")];
const counts: Record<MatchType, number> = { exact: 0, normalized: 0, reordered: 0, fuzzy: 0, ambiguous: 0, none: 0 };
const byName: Record<MatchType, Map<string, number>> = { exact: new Map(), normalized: new Map(), reordered: new Map(), fuzzy: new Map(), ambiguous: new Map(), none: new Map() };
const byId = new Map(workers.map((w) => [w.id, w]));

for (const p of payments) {
  const m = matchWorkerName(p.worker_name, perCompany.get(p.company_id) ?? []);
  counts[m.type]++;
  const key = (p.worker_name ?? "").trim() || "(blank)";
  byName[m.type].set(key, (byName[m.type].get(key) ?? 0) + 1);
  const w = m.workerId ? byId.get(m.workerId) : null;
  const amount = p.payment_type === "advance" && Number(p.advance_amount) > 0 ? p.advance_amount : p.total_amount;
  const notes = [m.note, m.type === "ambiguous" || m.type === "none" ? m.candidates.map((id) => `${workerFullName(byId.get(id)!)} (${numberOf.get(id)})`).join(" / ") : ""].filter(Boolean).join(" | ");
  rows.push([
    p.id, p.work_date ?? (p.created_at ?? "").slice(0, 10), amount, p.project_name || projects.get(p.project_id ?? "") || "", p.worker_name ?? "",
    w ? workerFullName(w) : "", w ? numberOf.get(w.id) : "", m.type, m.confidence.toFixed(2), notes,
  ].map(csvCell).join(","));
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "field-payment-worker-matches.csv"), "﻿" + rows.join("\r\n") + "\r\n", "utf8");

const names = (t: MatchType) => [...byName[t].entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} (${c})`).join(", ") || "-";
console.log(`field payments: ${payments.length}   registered workers: ${workers.length}   (planned employee numbers are shown until the migration is applied)`);
console.log(`exact: ${counts.exact}   normalized: ${counts.normalized}   reordered: ${counts.reordered}   fuzzy: ${counts.fuzzy}   ambiguous: ${counts.ambiguous}   no match: ${counts.none}`);
console.log(`distinct names - exact: ${byName.exact.size}, normalized: ${byName.normalized.size}, reordered: ${byName.reordered.size}, fuzzy: ${byName.fuzzy.size}, ambiguous: ${byName.ambiguous.size}, no match: ${byName.none.size}`);
console.log("\nfuzzy:", names("fuzzy"));
console.log("\nambiguous:", names("ambiguous"));
console.log("\nno match:", names("none"));
console.log("\nwritten: scripts/field-payment-worker-matches.csv");
