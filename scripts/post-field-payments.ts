// scripts/post-field-payments.ts
//
// Phase 2, Field Payments — final entity. Posts field_payments to the GL.
// Dry-run by default, --commit to write. Same shape as every prior
// script in this series (fixed Dr account, payment-method-branched Cr
// account, createDraftGLTransaction + postGLTransaction faithfully
// mirroring postingEngine.ts, one row at a time, per-row failure
// logging) — deliberately not reinvented.
//
// ── source_type — no dedicated value exists, closest real one used ──────
// No live pg_constraint query access from this environment (only the
// Supabase CLI's functions/secrets management, no arbitrary SQL) — this
// relies on the constraint list Veron has already confirmed via
// pg_get_constraintdef and repeated consistently across all 6 prior
// scripts this session: manual, client_payment, supplier_payment,
// expense, payroll, invoice, procurement, bank_transfer, adjustment,
// opening_balance, supplier_invoice, fund_transfer. There is no
// dedicated 'field_payment' value. 'payroll' is used instead — field
// payments are labor payments to individual workers, a payroll concept,
// not a generic 'expense' (already the Expenses script's own value, a
// different category — materials/services) or the catch-all 'manual'.
// Confirmed via a source grep that 'payroll' isn't already in active use
// as a gl_transactions source_type anywhere in this codebase — staff
// payroll (staff_payroll_runs) doesn't post to the GL at all yet, so
// there's no existing conflict. Worth remembering if staff payroll GL
// posting is ever built later — it would need a different real value, or
// this reasoning revisited, to avoid conflating two different real-world
// entities (office staff salaries vs. field labor payments) under one
// source_type.
//
// No status-based exclusion — real data confirmed 313/313 status=
// 'completed', and Veron's decision was "no exclusions needed on
// status", same as Bills. This does NOT filter by status at all.
//
// Credit account branches on payment_method: cash -> 1610 Petty Cash,
// bank_transfer -> 1710 Current Account JMD. Real data is 234 cash /
// 79 bank_transfer, no check/other — but the mapping handles check/other
// gracefully (excluded with a clear reason, not a crash) rather than
// assuming they'll never appear.
//
// ── Project-linkable accounts — checked at runtime, on all THREE
// accounts (6120, 1610, 1710), not assumed from any prior script ───────
//
// NOTE: originally 5200 Direct Labor Cost — the first real dry run
// correctly caught that 5200 is project-linkable, and all 313 field
// payments have no project_id at all (100% excluded, not a partial gap
// like the invoices case — manually linking 313 records isn't
// realistic). Switched to 6120 Salaries - Field (subtype payroll_expense,
// confirmed is_project_linkable: false) per Veron's decision — a real,
// existing account specifically for field labor. Still checked at
// runtime below, not hardcoded from this one confirmation, same
// discipline as every prior script.
// field_payments has its own DIRECT project_id column (nullable) — no
// indirection needed, simpler than the Customer/Supplier Payments
// scripts' invoice_id chains. Any payment missing project_id when it's
// actually needed is excluded with a clear reason.
//
// Usage:
//   npx tsx scripts/post-field-payments.ts            (dry run, no writes)
//   npx tsx scripts/post-field-payments.ts --commit    (posts for real)
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

const LABOR_ACCOUNT_CODE = "6120";     // Salaries - Field — debited, every payment
const PETTY_CASH_ACCOUNT_CODE = "1610"; // Petty Cash — credited, payment_method='cash'
const BANK_ACCOUNT_CODE = "1710";       // Current Account JMD — credited, payment_method='bank_transfer'
// Closest real gl_transactions_source_type_check value — see header
// comment for why 'payroll', not a guessed dedicated value.
const SOURCE_TYPE = "payroll";

interface FieldPaymentRow {
  id: string;
  project_id: string | null;
  worker_name: string;
  work_date: string;
  payment_method: string | null;
  total_amount: number;
}

interface PlannedPosting {
  paymentId: string;
  amount: number;
  date: string;
  description: string;
  projectId: string | null;
  creditAccountId: string;
  creditAccountCode: string;
}

interface SkippedRow {
  paymentId: string;
  reason: string;
}

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Resolve all three fixed accounts up front — fail fast if any is
  //    missing, and capture is_project_linkable for all three fresh, none
  //    assumed from any prior script's run.
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, current_balance, is_project_linkable")
    .eq("company_id", COMPANY_ID)
    .in("code", [LABOR_ACCOUNT_CODE, PETTY_CASH_ACCOUNT_CODE, BANK_ACCOUNT_CODE]);
  if (acctErr) throw acctErr;

  const laborAccount = accounts?.find(a => a.code === LABOR_ACCOUNT_CODE);
  const pettyCashAccount = accounts?.find(a => a.code === PETTY_CASH_ACCOUNT_CODE);
  const bankAccount = accounts?.find(a => a.code === BANK_ACCOUNT_CODE);
  if (!laborAccount) throw new Error(`Account code ${LABOR_ACCOUNT_CODE} (Salaries - Field) not found in chart_of_accounts`);
  if (!pettyCashAccount) throw new Error(`Account code ${PETTY_CASH_ACCOUNT_CODE} (Petty Cash) not found in chart_of_accounts`);
  if (!bankAccount) throw new Error(`Account code ${BANK_ACCOUNT_CODE} (Current Account JMD) not found in chart_of_accounts`);

  console.log(`Labor account: ${laborAccount.code} ${laborAccount.name} (is_project_linkable: ${laborAccount.is_project_linkable})`);
  console.log(`Petty Cash account: ${pettyCashAccount.code} ${pettyCashAccount.name} (is_project_linkable: ${pettyCashAccount.is_project_linkable})`);
  console.log(`Bank account: ${bankAccount.code} ${bankAccount.name} (is_project_linkable: ${bankAccount.is_project_linkable})`);

  // 2. Fetch all field_payments for the company, paginated — same
  //    PostgREST 1000-row-cap safeguard as every prior script; 313 rows
  //    exist today, the largest batch yet but still well under it.
  const payments: FieldPaymentRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data: page, error: pageErr } = await supabase
        .from("field_payments")
        .select("id, project_id, worker_name, work_date, payment_method, total_amount")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      payments.push(...((page as FieldPaymentRow[]) || []));
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Fetched ${payments.length} live field_payments records`);

  // 3. Idempotency — which payments already have a GL transaction.
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", SOURCE_TYPE);
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} payments already have a GL transaction (source_type='${SOURCE_TYPE}') — will be skipped`);

  // 4. Build the posting plan — no status filter (see header comment):
  //    every payment is eligible except already-posted ones or an
  //    unrecognized payment_method.
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];
  const needsProject = laborAccount.is_project_linkable || pettyCashAccount.is_project_linkable || bankAccount.is_project_linkable;

  for (const p of payments) {
    if (alreadyPosted.has(p.id)) continue; // idempotent re-run, not counted as "excluded"

    if (!p.work_date) {
      skipped.push({ paymentId: p.id, reason: "no work_date — cannot set transaction_date" });
      continue;
    }

    let creditAccount: typeof pettyCashAccount | typeof bankAccount;
    if (p.payment_method === "cash") {
      creditAccount = pettyCashAccount;
    } else if (p.payment_method === "bank_transfer") {
      creditAccount = bankAccount;
    } else {
      skipped.push({ paymentId: p.id, reason: `unrecognized payment_method "${p.payment_method}" — no account mapping for check/other yet` });
      continue;
    }

    if (needsProject && !p.project_id) {
      skipped.push({ paymentId: p.id, reason: "Salaries - Field, Petty Cash, or Current Account is project-linkable, but this payment has no project_id" });
      continue;
    }

    planned.push({
      paymentId: p.id,
      amount: Number(p.total_amount) || 0,
      date: p.work_date,
      description: `Field Payment — ${p.worker_name}`,
      projectId: p.project_id,
      creditAccountId: creditAccount.id,
      creditAccountCode: creditAccount.code,
    });
  }

  // 5. Report.
  const cashPlanned = planned.filter(p => p.creditAccountCode === PETTY_CASH_ACCOUNT_CODE);
  const bankPlanned = planned.filter(p => p.creditAccountCode === BANK_ACCOUNT_CODE);
  const cashTotal = cashPlanned.reduce((s, p) => s + p.amount, 0);
  const bankTotal = bankPlanned.reduce((s, p) => s + p.amount, 0);

  console.log(`\n=== Eligibility ===`);
  console.log(`CASH (Dr ${LABOR_ACCOUNT_CODE} / Cr ${PETTY_CASH_ACCOUNT_CODE}): ${cashPlanned.length} payments, ${cashTotal.toFixed(2)}`);
  console.log(`BANK_TRANSFER (Dr ${LABOR_ACCOUNT_CODE} / Cr ${BANK_ACCOUNT_CODE}): ${bankPlanned.length} payments, ${bankTotal.toFixed(2)}`);
  console.log(`Total will post: ${planned.length}, ${(cashTotal + bankTotal).toFixed(2)}`);
  console.log(`Skipped (needs review): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s.paymentId}: ${s.reason}`);

  // 6. Projected chart_of_accounts.current_balance impact — same sign
  //    convention as every prior script. Salaries - Field (expense) is
  //    debited by the combined total; Petty Cash and Current Account
  //    (both assets) are each credited by their own group's total.
  const totalAmount = cashTotal + bankTotal;
  const laborBefore = Number(laborAccount.current_balance) || 0;
  const pettyCashBefore = Number(pettyCashAccount.current_balance) || 0;
  const bankBefore = Number(bankAccount.current_balance) || 0;

  const laborDelta = ["asset", "expense"].includes(laborAccount.type) ? totalAmount : -totalAmount;
  const pettyCashDelta = ["asset", "expense"].includes(pettyCashAccount.type) ? -cashTotal : cashTotal;
  const bankDelta = ["asset", "expense"].includes(bankAccount.type) ? -bankTotal : bankTotal;

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  console.log(`  ${laborAccount.code} ${laborAccount.name} (${laborAccount.type}): ${laborBefore.toFixed(2)} -> ${(laborBefore + laborDelta).toFixed(2)}  (${laborDelta >= 0 ? "+" : ""}${laborDelta.toFixed(2)})  [from all ${planned.length} payments]`);
  console.log(`  ${pettyCashAccount.code} ${pettyCashAccount.name} (${pettyCashAccount.type}): ${pettyCashBefore.toFixed(2)} -> ${(pettyCashBefore + pettyCashDelta).toFixed(2)}  (${pettyCashDelta >= 0 ? "+" : ""}${pettyCashDelta.toFixed(2)})  [from ${cashPlanned.length} CASH payments only]`);
  console.log(`  ${bankAccount.code} ${bankAccount.name} (${bankAccount.type}): ${bankBefore.toFixed(2)} -> ${(bankBefore + bankDelta).toFixed(2)}  (${bankDelta >= 0 ? "+" : ""}${bankDelta.toFixed(2)})  [from ${bankPlanned.length} BANK_TRANSFER payments only]`);

  console.log(`\nTotal debits: ${totalAmount.toFixed(2)}  Total credits: ${totalAmount.toFixed(2)}  (should match — one Dr/Cr pair of the same amount per payment)`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 5 CASH and first 5 BANK_TRANSFER planned postings:`);
    for (const p of cashPlanned.slice(0, 5)) {
      console.log(`  [CASH] ${p.date}  ${p.description}  Dr ${LABOR_ACCOUNT_CODE} / Cr ${p.creditAccountCode}  ${p.amount.toFixed(2)}`);
    }
    for (const p of bankPlanned.slice(0, 5)) {
      console.log(`  [BANK] ${p.date}  ${p.description}  Dr ${LABOR_ACCOUNT_CODE} / Cr ${p.creditAccountCode}  ${p.amount.toFixed(2)}`);
    }
    console.log(`\nRe-run with --commit to actually post these.`);
    return;
  }

  // 7. Commit — one transaction at a time, per-row failure logging, same
  //    resilience as every prior script. 313 rows is the largest batch
  //    yet, but progress logging stays at the same "every 10th row"
  //    cadence already used, not scaled up/down for size.
  let nextSeq = await getNextSequence();
  let posted = 0;
  const failures: { paymentId: string; error: string }[] = [];

  for (const p of planned) {
    try {
      const txnId = await createDraftGLTransaction(p, nextSeq++, laborAccount.id);
      await postGLTransaction(txnId);
      posted++;
      if (posted % 10 === 0) console.log(`  ...${posted}/${planned.length} posted`);
    } catch (e: any) {
      failures.push({ paymentId: p.paymentId, error: e.message || String(e) });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Posted: ${posted}`);
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.paymentId}: ${f.error}`);
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
  laborAccountId: string
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
      source_id: p.paymentId,
      description: p.description,
      total_amount: p.amount,
      status: "draft",
    })
    .select()
    .single();
  if (txnErr) throw txnErr;

  const entries = [
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: laborAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular", project_id: p.projectId },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: p.creditAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular", project_id: p.projectId },
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
