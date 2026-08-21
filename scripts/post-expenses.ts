// scripts/post-expenses.ts
//
// One-time retroactive GL posting for the 1558 imported Expenses records.
// Dry-run by default — prints the full posting plan, writes nothing.
// Pass --commit to actually post.
//
// Usage:
//   npx tsx scripts/post-expenses.ts --staging-file <path-to-paid-through.csv>
//   npx tsx scripts/post-expenses.ts --staging-file <path> --commit
//
// Required env vars (set in your shell, not committed anywhere):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (service role — this script must bypass
//                                 RLS the same way the SQL Editor scripts
//                                 already do; never use the anon key here)
//   COMPANY_ID
//
// Staging CSV must have a header row with exactly these columns (order
// doesn't matter): expense_date,vendor,amount,paid_through,description
// — expense_date as clean ISO (YYYY-MM-DD), the same data already built
// for the payment_method enrichment round (NOT re-parsed from raw Excel
// serials here — that conversion already happened once, correctly, when
// that staging set was built; re-doing it would just be a second chance
// to get it wrong).
//
// NOTE ON WHY THIS DOESN'T IMPORT postingEngine.ts DIRECTLY:
// src/lib/supabase.ts (which postingEngine.ts's functions call into)
// reads import.meta.env, a Vite-only construct that's undefined outside
// the browser build — importing it here would throw immediately. Rather
// than hack around Vite's env system from a Node script, this file
// constructs its own Supabase client from process.env and includes a
// deliberate, faithful copy of createGLTransaction/postTransaction below
// (same fields, same sequencing, same validation) — flagged clearly as a
// copy, not a reimplementation with different behavior.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const stagingFileIdx = args.indexOf("--staging-file");
if (stagingFileIdx === -1 || !args[stagingFileIdx + 1]) {
  console.error("Usage: tsx scripts/post-expenses.ts --staging-file <path> [--commit]");
  process.exit(1);
}
const stagingFilePath = args[stagingFileIdx + 1];

// ── Env ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPANY_ID = process.env.COMPANY_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !COMPANY_ID) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Shared normalization (mirrors src/lib/import/matching.ts's normalizeKey) ──

function normalizeKey(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function amountKey(n: number): string {
  return n.toFixed(2);
}

// ── Account mapping tables (per the confirmed design) ─────────────────────

const PAID_THROUGH_TO_ACCOUNT_CODE: Record<string, string> = {
  "Petty Cash": "1610",
  "Enron Petty Cash": "1620",
  "Veron Petty Cash": "1640",
  "Current Account JMD": "1710",
  "Undeposited Funds": "1600",
  "Enron Reimbursement": "2580",
};

const FALLBACK_ACCOUNT_CODE = "1000"; // Cash and Cash Equivalents — 150 unenriched rows only
const DEFAULT_EXPENSE_ACCOUNT_CODE = "5720"; // Other Expenses — the 3 confirmed exceptions
const CATEGORY_EXCEPTIONS = new Set(["Office Supplies", "Firearm License", "Property"]);

// ── CSV parsing (minimal, dependency-free — handles quoted fields with
//    embedded commas/escaped quotes, which is all this format needs) ──────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

interface StagingRow {
  expense_date: string;
  vendor: string;
  amount: number;
  paid_through: string;
  description: string;
}

function loadStaging(path: string): StagingRow[] {
  const text = readFileSync(path, "utf-8");
  const raw = parseCsv(text);
  return raw.map(r => ({
    expense_date: r.expense_date,
    vendor: r.vendor,
    amount: Number(r.amount),
    paid_through: r.paid_through,
    description: r.description || "",
  }));
}

// key -> candidate staging rows sharing (expense_date, norm_vendor, amount)
function buildStagingIndex(rows: StagingRow[]): Map<string, StagingRow[]> {
  const index = new Map<string, StagingRow[]>();
  for (const r of rows) {
    const key = `${r.expense_date}|${normalizeKey(r.vendor)}|${amountKey(r.amount)}`;
    const list = index.get(key) || [];
    list.push(r);
    index.set(key, list);
  }
  return index;
}

// ── Types for the live data ───────────────────────────────────────────────

interface ExpenseRow {
  id: string;
  expense_date: string;
  vendor: string | null;
  amount: number;
  description: string;
  category_id: string | null;
  payment_method: string | null;
}

interface PlannedPosting {
  expenseId: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  date: string;
  description: string;
  usedFallback: boolean; // true = 150-unenriched-row fallback, flagged in output
}

interface SkippedRow {
  expenseId: string;
  reason: string;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Load staging data
  const stagingRows = loadStaging(stagingFilePath);
  console.log(`Loaded ${stagingRows.length} staging rows from ${stagingFilePath}`);
  const stagingIndex = buildStagingIndex(stagingRows);

  // 2. Fetch chart_of_accounts (company-scoped) and index by code + by name
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type")
    .eq("company_id", COMPANY_ID);
  if (acctErr) throw acctErr;
  const accountByCode = new Map(accounts!.map(a => [a.code, a]));
  const accountByName = new Map(accounts!.map(a => [a.name, a]));

  // Resolve the fixed-code accounts up front — fail fast if any are missing
  // rather than discovering it mid-run.
  const paidThroughAccountId: Record<string, string> = {};
  for (const [paidThrough, code] of Object.entries(PAID_THROUGH_TO_ACCOUNT_CODE)) {
    const acct = accountByCode.get(code);
    if (!acct) throw new Error(`Account code ${code} (for "${paidThrough}") not found in chart_of_accounts`);
    paidThroughAccountId[paidThrough] = acct.id;
  }
  const fallbackAccount = accountByCode.get(FALLBACK_ACCOUNT_CODE);
  if (!fallbackAccount) throw new Error(`Fallback account code ${FALLBACK_ACCOUNT_CODE} not found`);
  const defaultExpenseAccount = accountByCode.get(DEFAULT_EXPENSE_ACCOUNT_CODE);
  if (!defaultExpenseAccount) throw new Error(`Default expense account code ${DEFAULT_EXPENSE_ACCOUNT_CODE} not found`);

  // 3. Fetch expense_categories and build category -> debit account map via
  //    exact name match, falling back to the 3 confirmed exceptions.
  const { data: categories, error: catErr } = await supabase
    .from("expense_categories")
    .select("id, name")
    .eq("company_id", COMPANY_ID);
  if (catErr) throw catErr;

  const categoryToAccountId = new Map<string, string>();
  const unresolvedCategories: string[] = [];
  for (const cat of categories!) {
    const exact = accountByName.get(cat.name);
    if (exact && exact.type === "expense") {
      categoryToAccountId.set(cat.id, exact.id);
    } else if (CATEGORY_EXCEPTIONS.has(cat.name)) {
      categoryToAccountId.set(cat.id, defaultExpenseAccount.id);
    } else {
      unresolvedCategories.push(cat.name);
    }
  }
  if (unresolvedCategories.length > 0) {
    console.warn(`WARNING: ${unresolvedCategories.length} categories matched neither an exact COA name nor a known exception — expenses in these categories will be skipped, not guessed: ${unresolvedCategories.join(", ")}`);
  }

  // 4. Fetch all expenses for the company. PostgREST's max-rows cap
  //    (default 1000) is a hard server-side limit — a single .select()
  //    with no .range() silently truncates to it with no error (same
  //    bug already found and fixed this session in ExpensesPage.tsx,
  //    ClientsPage.tsx, WorkersPage.tsx, RatesPage.tsx, ProjectContext.tsx
  //    — this script was never given the same fix). Genuine fix: loop in
  //    windows, requiring .order() for a stable, non-overlapping sequence
  //    across requests, until a page comes back shorter than requested —
  //    that's the real end of the data, regardless of the server's actual
  //    cap value. Mirrors ExpensesPage.tsx's loadExpenses() exactly.
  const expenses: ExpenseRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) { // 200 * 1000 = 200,000 rows, safety stop only
      const { data: page, error: pageErr } = await supabase
        .from("expenses")
        .select("id, expense_date, vendor, amount, description, category_id, payment_method")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      expenses.push(...(page as ExpenseRow[] || []));
      if (!page || page.length < PAGE) break; // short page — reached the actual end
      from += PAGE;
    }
  }
  console.log(`Fetched ${expenses.length} live expense records`);

  // 5. Idempotency — which expenses already have a posted GL transaction
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", "expense");
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} expenses already have a GL transaction — will be skipped`);

  // 6. Build the posting plan
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];

  for (const exp of expenses) {
    if (alreadyPosted.has(exp.id)) continue; // idempotent re-run

    // Debit side: category -> account
    const debitAccountId = exp.category_id ? categoryToAccountId.get(exp.category_id) : undefined;
    if (!debitAccountId) {
      skipped.push({ expenseId: exp.id, reason: "no resolvable expense category account" });
      continue;
    }

    // Credit side
    let creditAccountId: string | undefined;
    let usedFallback = false;

    if (!exp.payment_method) {
      // 150 genuinely-unenriched rows — no paid_through signal at all.
      creditAccountId = fallbackAccount.id;
      usedFallback = true;
    } else {
      // Every enriched row (cash, bank_transfer, other) needs its ORIGINAL
      // paid_through re-derived from staging — payment_method alone
      // collapses 3 different cash-fund accounts to 'cash' and 2 different
      // liability/asset accounts to 'other'.
      const key = `${exp.expense_date}|${normalizeKey(exp.vendor)}|${amountKey(exp.amount)}`;
      const candidates = stagingIndex.get(key) || [];

      let resolved: StagingRow | undefined;
      if (candidates.length === 1) {
        resolved = candidates[0];
      } else if (candidates.length > 1) {
        const descMatches = candidates.filter(
          c => normalizeKey(c.description) === normalizeKey(exp.description)
        );
        if (descMatches.length === 1) resolved = descMatches[0];
      }

      if (!resolved) {
        skipped.push({
          expenseId: exp.id,
          reason: candidates.length === 0
            ? "enriched but no staging match found — cannot re-derive paid_through"
            : `ambiguous staging match (${candidates.length} candidates), not resolved by description`,
        });
        continue;
      }

      const acctId = paidThroughAccountId[resolved.paid_through];
      if (!acctId) {
        skipped.push({ expenseId: exp.id, reason: `unrecognized paid_through value from staging: "${resolved.paid_through}"` });
        continue;
      }
      creditAccountId = acctId;
    }

    planned.push({
      expenseId: exp.id,
      debitAccountId,
      creditAccountId: creditAccountId!,
      amount: exp.amount,
      date: exp.expense_date,
      description: exp.description,
      usedFallback,
    });
  }

  // 7. Report
  console.log(`\n=== Posting plan ===`);
  console.log(`Will post: ${planned.length}`);
  console.log(`  of which fallback (unenriched, credited to ${FALLBACK_ACCOUNT_CODE}): ${planned.filter(p => p.usedFallback).length}`);
  console.log(`Skipped (needs manual resolution): ${skipped.length}`);
  const skipReasons = new Map<string, number>();
  for (const s of skipped) skipReasons.set(s.reason, (skipReasons.get(s.reason) || 0) + 1);
  for (const [reason, count] of skipReasons) console.log(`  - ${reason}: ${count}`);

  const totalAmount = planned.reduce((sum, p) => sum + p.amount, 0);
  console.log(`Total amount to post: ${totalAmount.toFixed(2)}`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 10 planned postings:`);
    for (const p of planned.slice(0, 10)) {
      console.log(`  ${p.date}  Dr ${p.debitAccountId} / Cr ${p.creditAccountId}  ${p.amount.toFixed(2)}${p.usedFallback ? "  [FALLBACK]" : ""}`);
    }
    if (skipped.length > 0) {
      console.log(`\nAll skipped rows (review before running --commit):`);
      for (const s of skipped) console.log(`  ${s.expenseId}: ${s.reason}`);
    }
    return;
  }

  // 8. Commit — sequential, one at a time, per-row failure logging
  let nextSeq = await getNextSequence();
  let posted = 0;
  const failures: { expenseId: string; error: string }[] = [];

  for (const p of planned) {
    try {
      const txnId = await createDraftGLTransaction(p, nextSeq++);
      await postGLTransaction(txnId);
      posted++;
      if (posted % 100 === 0) console.log(`  ...${posted}/${planned.length} posted`);
    } catch (e: any) {
      failures.push({ expenseId: p.expenseId, error: e.message || String(e) });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Posted: ${posted}`);
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.expenseId}: ${f.error}`);
}

// ── Faithful mirror of postingEngine.ts's createGLTransaction + postTransaction
//    (can't import that file directly — see note at top of this file) ─────

async function getNextSequence(): Promise<number> {
  const date = new Date().toISOString().split("T")[0];
  const prefix = `GL-${date}`;
  const { data, error } = await supabase
    .from("gl_transactions")
    .select("transaction_number")
    .eq("company_id", COMPANY_ID)
    .like("transaction_number", `${prefix}%`)
    .order("transaction_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    const last = parseInt(data[0].transaction_number.split("-").pop() || "0");
    return last + 1;
  }
  return 1;
}

async function createDraftGLTransaction(p: PlannedPosting, seq: number): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const transactionNumber = `GL-${date}-${String(seq).padStart(4, "0")}`;

  const { data: txn, error: txnErr } = await supabase
    .from("gl_transactions")
    .insert({
      company_id: COMPANY_ID,
      transaction_number: transactionNumber,
      transaction_date: p.date,
      source_type: "expense",
      source_id: p.expenseId,
      description: `Expense: ${p.description}`,
      total_amount: p.amount,
      status: "draft",
      notes: p.usedFallback
        ? "Payment source unknown — no paid_through signal recovered; credited to Cash and Cash Equivalents as fallback."
        : null,
    })
    .select()
    .single();
  if (txnErr) throw txnErr;

  const entries = [
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: p.debitAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular" },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: p.creditAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular" },
  ];
  const { error: entryErr } = await supabase.from("gl_entries").insert(entries);
  if (entryErr) {
    // Clean up the orphaned header before re-throwing — an entries-insert
    // failure after the header already succeeded would otherwise leave a
    // draft gl_transactions row with no entries at all, permanently
    // orphaned (never posted, never cleaned up, just sitting there).
    await supabase.from("gl_transactions").delete().eq("id", txn.id);
    throw entryErr;
  }

  return txn.id;
}

async function postGLTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from("gl_transactions")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("id", transactionId);
  if (error) throw error;
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
