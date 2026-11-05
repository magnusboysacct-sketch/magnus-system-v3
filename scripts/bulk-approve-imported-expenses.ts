// scripts/bulk-approve-imported-expenses.ts
//
// One-time bulk status update: the 1,558 expenses bulk-imported from Zoho
// Books CSV (all created in a single 24-second window, 2026-08-15
// 15:16:14-15:16:38 UTC — confirmed via live investigation, not assumed)
// all defaulted to status='pending' on import, since the source CSV had
// no historical approval data. These are old, already-happened
// historical expenses, already posted to the GL in this session's Phase 2
// work (scripts/post-expenses.ts) — leaving them 'pending' misrepresents
// them as an active approval backlog. This marks them 'approved' with a
// real approver/timestamp — a status/workflow change only. Does NOT touch
// gl_transactions/gl_entries and does not create any new GL entries.
//
// Same dry-run-first, --confirm-gated, one-row-at-a-time-with-try/catch,
// halt-on-first-failure shape as scripts/cleanup-duplicate-field-
// payments.ts and every prior posting script this session.
//
// Usage:
//   npx tsx scripts/bulk-approve-imported-expenses.ts            (dry run)
//   npx tsx scripts/bulk-approve-imported-expenses.ts --confirm  (updates)
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same as
// every prior script — not importing src/lib/supabase.ts directly since
// it depends on import.meta.env, which doesn't exist outside the Vite
// build). COMPANY_ID and APPROVER_ID are hardcoded below rather than read
// from env — this is a targeted one-off cleanup for this one company and
// this one approver, not a reusable importer, same reasoning as
// cleanup-duplicate-field-payments.ts's own hardcoded COMPANY_ID.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const COMPANY_ID = "813ffe22-b75c-49c5-b41e-3ab185e2724c";
const APPROVER_ID = "631c5f0c-3d3d-41ab-811d-e8d717dd7001"; // Veron Williams

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXPECTED_ROW_COUNT = 1558;

interface PendingExpense {
  id: string;
  description: string | null;
  amount: number;
  expense_date: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
}

// PostgREST's row-return cap (default 1000) can silently truncate this
// exact 1558-row set — the same cap that produced a real bug in
// ExpensesPage.tsx's own summary cards/tab counts earlier this session. A
// paginated loop, not a single .range(0, 1999) call — a .range() window
// only requests a slice, it can't force the server past its own
// configured ceiling; looping until a short page comes back works
// regardless of what that ceiling actually is.
async function getPendingExpenses(): Promise<PendingExpense[]> {
  const PAGE = 1000;
  let all: PendingExpense[] = [];
  let from = 0;
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await supabase
      .from("expenses")
      .select("id, description, amount, expense_date, status, approved_by, approved_at")
      .eq("company_id", COMPANY_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat((data as PendingExpense[]) || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function validate(rows: PendingExpense[]): number {
  console.log(`\n--- VALIDATION ---`);
  console.log(`Rows returned: ${rows.length}`);

  if (rows.length !== EXPECTED_ROW_COUNT) {
    throw new Error(
      `STOP: Expected ${EXPECTED_ROW_COUNT} rows but got ${rows.length}. Data may have changed since investigation. Do not proceed.`
    );
  }

  // Sanity check — never overwrite a row that's already been through this
  // (or any other) approval process.
  const alreadyProcessed = rows.filter(r => r.approved_by !== null || r.approved_at !== null);
  if (alreadyProcessed.length > 0) {
    console.error("Rows that already have approved_by or approved_at set:", alreadyProcessed);
    throw new Error(`STOP: ${alreadyProcessed.length} rows already show approval data. Do not proceed.`);
  }

  // Not hard-asserted against a hardcoded expected total — unlike the
  // field_payments cleanup, this figure was never independently verified
  // to the cent, only eyeballed against the UI's JMD 8,997,686.37. Printed
  // for review instead of gating on it.
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  console.log(`Total amount: ${total.toFixed(2)} (expected around 8,997,686.37 — not hard-asserted, review this value)`);
  console.log("All validations passed.\n");
  return total;
}

function printDryRun(rows: PendingExpense[], total: number) {
  console.log("\n--- DRY RUN: ROWS THAT WOULD BE APPROVED ---\n");
  console.log(`Total rows: ${rows.length}`);
  console.log(`Total amount: JMD ${total.toFixed(2)}`);
  console.log(`Approver: ${APPROVER_ID} (Veron Williams)`);

  console.log("\nFirst 10 rows:");
  console.table(rows.slice(0, 10).map(r => ({ id: r.id, description: r.description, amount: r.amount, expense_date: r.expense_date })));

  console.log("\nLast 10 rows:");
  console.table(rows.slice(-10).map(r => ({ id: r.id, description: r.description, amount: r.amount, expense_date: r.expense_date })));

  console.log(`\nThis was a DRY RUN. No data was changed.`);
  console.log(`To actually approve, run: npx tsx scripts/bulk-approve-imported-expenses.ts --confirm\n`);
}

async function performUpdate(rows: PendingExpense[]) {
  console.log("\n--- LIVE UPDATE STARTING ---\n");

  const succeeded: string[] = [];
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ status: "approved", approved_by: APPROVER_ID, approved_at: nowIso })
        .eq("id", row.id);
      if (error) throw error;
      succeeded.push(row.id);
      console.log(`OK: ${row.description || "(no description)"} | ${row.expense_date} | ${row.amount} | ${row.id}`);
    } catch (err: any) {
      console.error(`FAILED: ${row.description || "(no description)"} | ${row.id} | ${err.message || err}`);
      console.error("\nSTOPPING due to failure. Do not re-run blindly.");
      console.error(`Succeeded so far (${succeeded.length}):`, succeeded);
      console.error(`Remaining/not attempted:`, rows.slice(succeeded.length + 1).map(r => r.id));
      process.exit(1);
    }
  }

  console.log(`\nAll ${succeeded.length} rows processed successfully.`);

  const { count: pendingCount, error: pendErr } = await supabase
    .from("expenses")
    .select("*", { count: "exact", head: true })
    .eq("company_id", COMPANY_ID)
    .eq("status", "pending");
  if (pendErr) console.error("Final pending-count check failed:", pendErr.message);
  console.log(`\nFinal check — pending count (expected 0): ${pendingCount}`);

  const { count: approvedCount, error: apprErr } = await supabase
    .from("expenses")
    .select("*", { count: "exact", head: true })
    .eq("company_id", COMPANY_ID)
    .eq("status", "approved");
  if (apprErr) console.error("Final approved-count check failed:", apprErr.message);
  console.log(`Final check — approved count (expected ${EXPECTED_ROW_COUNT}): ${approvedCount}`);
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  const rows = await getPendingExpenses();
  const total = validate(rows);

  if (!confirm) {
    printDryRun(rows, total);
    return;
  }

  console.log("\n--confirm flag detected. Re-fetching and re-validating fresh before update...\n");
  const freshRows = await getPendingExpenses();
  validate(freshRows);

  await performUpdate(freshRows);
}

main().catch(err => {
  console.error("\nSCRIPT ABORTED:", err.message);
  process.exit(1);
});
