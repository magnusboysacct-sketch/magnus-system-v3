// scripts/post-supplier-invoices.ts
//
// Phase 2, Bills — post supplier_invoices to the GL. Dry-run by default,
// --commit to write. Same shape as scripts/post-client-invoices.ts (fixed
// Dr/Cr account pair, createDraftGLTransaction + postGLTransaction
// faithfully mirroring postingEngine.ts, one row at a time, per-row
// failure logging) — deliberately not reinvented.
//
// No status-based exclusion — unlike client_invoices (where 'draft' meant
// "not yet committed revenue"), a bill represents a real liability the
// moment it exists regardless of its approval/payment status, per
// Veron's explicit "no exclusions needed" decision. Real data today is
// 9/9 status='paid' anyway, but this doesn't filter by status at all, so
// it stays correct if a 'pending'/'approved'/'partial'/'disputed' bill
// shows up later.
//
// Single account pair for all bills — no per-bill expense category exists
// on this table, so every bill posts against the same account
// (5760 Construction Materials), per Veron's explicit decision, not
// something this script tries to infer.
//
// source_type = 'supplier_invoice' — confirmed already a real, valid
// gl_transactions_source_type_check value via pg_get_constraintdef in the
// handoff, no naming-mismatch risk like post-client-invoices.ts hit.
// Still used as a single SOURCE_TYPE constant, same lesson.
//
// ── Project-linkable accounts — checked at runtime, not assumed ─────────
// Same discipline as every prior script in this series. supplier_invoices
// has its own DIRECT project_id column (unlike client_payments, which
// needed to resolve one indirectly through invoice_id) — if either 5760
// or 2110 turns out project-linkable, this uses the bill's own project_id
// straight, and excludes (with a clear reason) any bill where it's null.
//
// Usage:
//   npx tsx scripts/post-supplier-invoices.ts            (dry run, no writes)
//   npx tsx scripts/post-supplier-invoices.ts --commit    (posts for real)
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID
// (same as every prior script, same reason for not importing
// src/lib/supabase.ts directly — it depends on import.meta.env, which
// doesn't exist outside the Vite/browser build.)

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPANY_ID = process.env.COMPANY_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !COMPANY_ID) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXPENSE_ACCOUNT_CODE = "5760";  // Construction Materials — debited (all bills, no per-bill category)
const PAYABLE_ACCOUNT_CODE = "2110";  // Supplier Payables — credited
// Real, live gl_transactions_source_type_check value, confirmed via
// pg_get_constraintdef — not guessed, per the lesson from the invoices
// script's fix.
const SOURCE_TYPE = "supplier_invoice";

interface BillRow {
  id: string;
  supplier_id: string | null;
  project_id: string | null;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: string;
}

interface PlannedPosting {
  billId: string;
  amount: number;
  date: string;
  description: string;
  projectId: string | null;
}

interface SkippedRow {
  billId: string;
  reason: string;
}

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Resolve the two fixed accounts up front — fail fast if either is
  //    missing, and capture is_project_linkable for both fresh (never
  //    assumed from a prior script's run — a different account pair can
  //    behave differently).
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, current_balance, is_project_linkable")
    .eq("company_id", COMPANY_ID)
    .in("code", [EXPENSE_ACCOUNT_CODE, PAYABLE_ACCOUNT_CODE]);
  if (acctErr) throw acctErr;

  const expenseAccount = accounts?.find(a => a.code === EXPENSE_ACCOUNT_CODE);
  const payableAccount = accounts?.find(a => a.code === PAYABLE_ACCOUNT_CODE);
  if (!expenseAccount) throw new Error(`Account code ${EXPENSE_ACCOUNT_CODE} (Construction Materials) not found in chart_of_accounts`);
  if (!payableAccount) throw new Error(`Account code ${PAYABLE_ACCOUNT_CODE} (Supplier Payables) not found in chart_of_accounts`);

  console.log(`Expense account: ${expenseAccount.code} ${expenseAccount.name} (is_project_linkable: ${expenseAccount.is_project_linkable})`);
  console.log(`Payable account: ${payableAccount.code} ${payableAccount.name} (is_project_linkable: ${payableAccount.is_project_linkable})`);

  // 2. Fetch all supplier_invoices for the company, paginated — same
  //    PostgREST 1000-row-cap safeguard as every prior script; only 9
  //    rows exist today, well under it, but this stays correct if that
  //    grows.
  const bills: BillRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data: page, error: pageErr } = await supabase
        .from("supplier_invoices")
        .select("id, supplier_id, project_id, invoice_number, invoice_date, total_amount, status")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      bills.push(...((page as BillRow[]) || []));
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Fetched ${bills.length} live supplier_invoices records`);

  // 3. Idempotency — which bills already have a GL transaction.
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", SOURCE_TYPE);
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} bills already have a GL transaction — will be skipped`);

  // 4. Supplier names for readable descriptions (optional enrichment).
  const supplierIds = Array.from(new Set(bills.map(b => b.supplier_id).filter(Boolean))) as string[];
  const { data: suppliers, error: supplierErr } = supplierIds.length > 0
    ? await supabase.from("suppliers").select("id, supplier_name").in("id", supplierIds)
    : { data: [], error: null };
  if (supplierErr) throw supplierErr;
  // Real column is supplier_name, not name — confirmed via
  // 20260310121055_create_suppliers.sql, not assumed.
  const supplierNameById = new Map((suppliers || []).map(s => [s.id, s.supplier_name]));

  // 5. Build the posting plan — no status filter (see header comment):
  //    every bill is eligible except already-posted ones.
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];
  const needsProject = expenseAccount.is_project_linkable || payableAccount.is_project_linkable;

  for (const bill of bills) {
    if (alreadyPosted.has(bill.id)) continue; // idempotent re-run, not counted as "excluded"

    if (!bill.invoice_date) {
      skipped.push({ billId: bill.id, reason: "no invoice_date — cannot set transaction_date" });
      continue;
    }

    if (needsProject && !bill.project_id) {
      skipped.push({ billId: bill.id, reason: "Construction Materials or Supplier Payables account is project-linkable, but this bill has no project_id" });
      continue;
    }

    const supplierName = bill.supplier_id ? supplierNameById.get(bill.supplier_id) : null;
    planned.push({
      billId: bill.id,
      amount: Number(bill.total_amount) || 0,
      date: bill.invoice_date,
      description: `Bill ${bill.invoice_number}${supplierName ? ` — ${supplierName}` : ""}`,
      projectId: bill.project_id,
    });
  }

  // 6. Report.
  console.log(`\n=== Eligibility ===`);
  console.log(`Will post: ${planned.length}`);
  console.log(`Skipped (needs review): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s.billId}: ${s.reason}`);

  // 7. Projected chart_of_accounts.current_balance impact — same sign
  //    convention as every prior script's projection (asset/expense:
  //    debit-credit; everything else: credit-debit). Construction
  //    Materials (expense) is debited — goes up; Supplier Payables
  //    (liability) is credited — goes up too (a real payable owed),
  //    both by the same amount per bill.
  const totalAmount = planned.reduce((s, p) => s + p.amount, 0);
  const expenseBefore = Number(expenseAccount.current_balance) || 0;
  const payableBefore = Number(payableAccount.current_balance) || 0;
  const expenseDelta = ["asset", "expense"].includes(expenseAccount.type) ? totalAmount : -totalAmount;
  const payableDelta = ["asset", "expense"].includes(payableAccount.type) ? -totalAmount : totalAmount;

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  console.log(`  ${expenseAccount.code} ${expenseAccount.name} (${expenseAccount.type}): ${expenseBefore.toFixed(2)} -> ${(expenseBefore + expenseDelta).toFixed(2)}  (${expenseDelta >= 0 ? "+" : ""}${expenseDelta.toFixed(2)})`);
  console.log(`  ${payableAccount.code} ${payableAccount.name} (${payableAccount.type}): ${payableBefore.toFixed(2)} -> ${(payableBefore + payableDelta).toFixed(2)}  (${payableDelta >= 0 ? "+" : ""}${payableDelta.toFixed(2)})`);

  console.log(`\nTotal debits: ${totalAmount.toFixed(2)}  Total credits: ${totalAmount.toFixed(2)}  (should match — always equal here, one Dr/Cr pair of the same amount per bill)`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 10 planned postings:`);
    for (const p of planned.slice(0, 10)) {
      console.log(`  ${p.date}  ${p.description}  Dr ${EXPENSE_ACCOUNT_CODE} / Cr ${PAYABLE_ACCOUNT_CODE}  ${p.amount.toFixed(2)}`);
    }
    console.log(`\nRe-run with --commit to actually post these.`);
    return;
  }

  // 8. Commit — one transaction at a time, per-row failure logging, same
  //    resilience as every prior script.
  let nextSeq = await getNextSequence();
  let posted = 0;
  const failures: { billId: string; error: string }[] = [];

  for (const p of planned) {
    try {
      const txnId = await createDraftGLTransaction(p, nextSeq++, expenseAccount.id, payableAccount.id);
      await postGLTransaction(txnId);
      posted++;
      if (posted % 10 === 0) console.log(`  ...${posted}/${planned.length} posted`);
    } catch (e: any) {
      failures.push({ billId: p.billId, error: e.message || String(e) });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Posted: ${posted}`);
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.billId}: ${f.error}`);
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

async function createDraftGLTransaction(
  p: PlannedPosting,
  seq: number,
  expenseAccountId: string,
  payableAccountId: string
): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const transactionNumber = `GL-${date}-${String(seq).padStart(4, "0")}`;

  const { data: txn, error: txnErr } = await supabase
    .from("gl_transactions")
    .insert({
      company_id: COMPANY_ID,
      transaction_number: transactionNumber,
      transaction_date: p.date,
      source_type: SOURCE_TYPE,
      source_id: p.billId,
      description: p.description,
      total_amount: p.amount,
      status: "draft",
    })
    .select()
    .single();
  if (txnErr) throw txnErr;

  const entries = [
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: expenseAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular", project_id: p.projectId },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: payableAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular", project_id: p.projectId },
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
