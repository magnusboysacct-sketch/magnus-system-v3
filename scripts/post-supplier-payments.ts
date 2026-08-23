// scripts/post-supplier-payments.ts
//
// Phase 2, Supplier Payments — final entity. Posts supplier_payments to
// the GL. Dry-run by default, --commit to write. Same shape as
// scripts/post-client-payments.ts (nullable supplier_id/invoice_id, no
// status column) — deliberately not reinvented, except for the split
// design below, which the flat single-design version genuinely got wrong.
//
// ── Corrected design — two different postings, branched on invoice_id ───
// The original flat "Dr 2110 / Cr 1710 for every row" design was wrong.
// Confirmed via direct query: of 40 real supplier_payments, 18 have a real
// invoice_id (summing exactly $1,332,320.00 — matching the 9 posted Bills
// dollar-for-dollar) and 22 have invoice_id = NULL, summing $1,617,420.00,
// all carrying the identical note "Zoho Payment Status: Paid | Migrated
// from Zoho Vendor_Payment.csv import" — real payments to real suppliers,
// but their Bills were never imported into supplier_invoices. Crediting
// 2110 for those 22 would have reduced a liability that was never
// actually recorded for them, driving 2110 to -$1,617,420 instead of
// ~$0.00.
//
//   LINKED   (invoice_id IS NOT NULL, 18 rows, $1,332,320.00):
//            Dr 2110 Supplier Payables / Cr 1710 Current Account JMD.
//            Settles a real recorded liability — unchanged from the
//            original design. Should bring 2110 to ~$0.00 given it
//            exactly matches the 9 posted Bills.
//   UNLINKED (invoice_id IS NULL, 22 rows, $1,617,420.00):
//            Dr 5760 Construction Materials / Cr 1710 Current Account
//            JMD. Treated as a direct expense, same account
//            post-supplier-invoices.ts already uses for Bills — no
//            liability account touched at all, since none was ever
//            recorded for these.
//
// source_type = 'supplier_payment' for both groups — confirmed already a
// real, valid gl_transactions_source_type_check value via
// pg_get_constraintdef, no naming-mismatch risk. Single SOURCE_TYPE
// constant regardless, same lesson as every prior script.
//
// No eligibility filter beyond the linked/unlinked branch itself —
// supplier_payments has no status column. Every row is a candidate except
// already-posted ones (idempotency check).
//
// ── Project-linkable accounts — checked at runtime, on all THREE
// accounts now (2110, 5760, 1710), not assumed from any prior script's
// results ──────────────────────────────────────────────────────────────
// Linked rows can resolve a project via invoice_id -> supplier_invoices.
// project_id (a real, direct column there) if 2110 or 1710 is flagged.
// Unlinked rows have no invoice_id at all — no possible resolution path —
// so if 5760 or 1710 turns out project-linkable, EVERY unlinked row is
// excluded, not just some; this is reported as a distinct, visible group
// in the dry-run output rather than folded into a generic skip count.
//
// Usage:
//   npx tsx scripts/post-supplier-payments.ts            (dry run, no writes)
//   npx tsx scripts/post-supplier-payments.ts --commit    (posts for real)
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

const PAYABLE_ACCOUNT_CODE = "2110";  // Supplier Payables — debited, LINKED rows only
const EXPENSE_ACCOUNT_CODE = "5760";  // Construction Materials — debited, UNLINKED rows only
const CASH_ACCOUNT_CODE = "1710";     // Current Account JMD — credited, BOTH groups
// Real, live gl_transactions_source_type_check value, confirmed via
// pg_get_constraintdef — not guessed.
const SOURCE_TYPE = "supplier_payment";

interface PaymentRow {
  id: string;
  supplier_id: string | null;
  invoice_id: string | null;
  payment_number: string;
  payment_date: string;
  amount: number;
  reference_number: string | null;
}

interface PlannedPosting {
  paymentId: string;
  amount: number;
  date: string;
  description: string;
  projectId: string | null;
  debitAccountId: string;
  debitAccountCode: string;
  linked: boolean;
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
    .in("code", [PAYABLE_ACCOUNT_CODE, EXPENSE_ACCOUNT_CODE, CASH_ACCOUNT_CODE]);
  if (acctErr) throw acctErr;

  const payableAccount = accounts?.find(a => a.code === PAYABLE_ACCOUNT_CODE);
  const expenseAccount = accounts?.find(a => a.code === EXPENSE_ACCOUNT_CODE);
  const cashAccount = accounts?.find(a => a.code === CASH_ACCOUNT_CODE);
  if (!payableAccount) throw new Error(`Account code ${PAYABLE_ACCOUNT_CODE} (Supplier Payables) not found in chart_of_accounts`);
  if (!expenseAccount) throw new Error(`Account code ${EXPENSE_ACCOUNT_CODE} (Construction Materials) not found in chart_of_accounts`);
  if (!cashAccount) throw new Error(`Account code ${CASH_ACCOUNT_CODE} (Current Account JMD) not found in chart_of_accounts`);

  console.log(`Payable account: ${payableAccount.code} ${payableAccount.name} (is_project_linkable: ${payableAccount.is_project_linkable})`);
  console.log(`Expense account: ${expenseAccount.code} ${expenseAccount.name} (is_project_linkable: ${expenseAccount.is_project_linkable})`);
  console.log(`Cash account: ${cashAccount.code} ${cashAccount.name} (is_project_linkable: ${cashAccount.is_project_linkable})`);

  // 2. Fetch all supplier_payments for the company, paginated — same
  //    PostgREST 1000-row-cap safeguard as every prior script.
  const payments: PaymentRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data: page, error: pageErr } = await supabase
        .from("supplier_payments")
        .select("id, supplier_id, invoice_id, payment_number, payment_date, amount, reference_number")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      payments.push(...((page as PaymentRow[]) || []));
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Fetched ${payments.length} live supplier_payments records`);

  // 3. Idempotency — which payments already have a GL transaction.
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", SOURCE_TYPE);
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} payments already have a GL transaction — will be skipped`);

  // 4. Supplier names for readable descriptions, and invoice_id ->
  //    project_id for the project-linkable resolution below (fetched
  //    unconditionally since it's cheap; only actually used if needed).
  const supplierIds = Array.from(new Set(payments.map(p => p.supplier_id).filter(Boolean))) as string[];
  const { data: suppliers, error: supplierErr } = supplierIds.length > 0
    ? await supabase.from("suppliers").select("id, supplier_name").in("id", supplierIds)
    : { data: [], error: null };
  if (supplierErr) throw supplierErr;
  const supplierNameById = new Map((suppliers || []).map(s => [s.id, s.supplier_name]));

  const invoiceIds = Array.from(new Set(payments.map(p => p.invoice_id).filter(Boolean))) as string[];
  const { data: bills, error: billErr } = invoiceIds.length > 0
    ? await supabase.from("supplier_invoices").select("id, project_id").in("id", invoiceIds)
    : { data: [], error: null };
  if (billErr) throw billErr;
  const billProjectById = new Map((bills || []).map(b => [b.id, b.project_id as string | null]));

  // 5. Build the posting plan — branched on invoice_id per the corrected
  //    design (see header comment).
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];
  const needsProjectForLinked = payableAccount.is_project_linkable || cashAccount.is_project_linkable;
  const needsProjectForUnlinked = expenseAccount.is_project_linkable || cashAccount.is_project_linkable;

  for (const p of payments) {
    if (alreadyPosted.has(p.id)) continue; // idempotent re-run, not counted as "excluded"

    if (!p.payment_date) {
      skipped.push({ paymentId: p.id, reason: "no payment_date — cannot set transaction_date" });
      continue;
    }

    const linked = !!p.invoice_id;
    let projectId: string | null = null;

    if (linked) {
      if (needsProjectForLinked) {
        if (!billProjectById.has(p.invoice_id!)) {
          skipped.push({ paymentId: p.id, reason: `invoice_id ${p.invoice_id} does not match any known supplier_invoices row` });
          continue;
        }
        const resolvedProjectId = billProjectById.get(p.invoice_id!) ?? null;
        if (!resolvedProjectId) {
          skipped.push({ paymentId: p.id, reason: `linked bill ${p.invoice_id} has no project_id of its own` });
          continue;
        }
        projectId = resolvedProjectId;
      }
    } else {
      if (needsProjectForUnlinked) {
        // No invoice_id at all on an unlinked row — no possible
        // resolution path, unlike a linked row that at least has a bill
        // to check. Every unlinked row hits this if either account is
        // flagged, not just some.
        skipped.push({ paymentId: p.id, reason: "Construction Materials or Current Account is project-linkable, but this payment is unlinked (no invoice_id) and has no other way to resolve a project" });
        continue;
      }
    }

    const supplierName = p.supplier_id ? supplierNameById.get(p.supplier_id) : null;
    const refSuffix = p.reference_number ? ` (ref ${p.reference_number})` : "";
    const label = linked ? "Supplier Payment" : "Supplier Payment (unlinked, direct expense)";
    planned.push({
      paymentId: p.id,
      amount: Number(p.amount) || 0,
      date: p.payment_date,
      description: `${label} ${p.payment_number}${supplierName ? ` — ${supplierName}` : ""}${refSuffix}`,
      projectId,
      debitAccountId: linked ? payableAccount.id : expenseAccount.id,
      debitAccountCode: linked ? PAYABLE_ACCOUNT_CODE : EXPENSE_ACCOUNT_CODE,
      linked,
    });
  }

  // 6. Report — linked and unlinked shown separately, per the ask.
  const linkedPlanned = planned.filter(p => p.linked);
  const unlinkedPlanned = planned.filter(p => !p.linked);
  const linkedTotal = linkedPlanned.reduce((s, p) => s + p.amount, 0);
  const unlinkedTotal = unlinkedPlanned.reduce((s, p) => s + p.amount, 0);

  console.log(`\n=== Eligibility ===`);
  console.log(`LINKED (Dr ${PAYABLE_ACCOUNT_CODE} / Cr ${CASH_ACCOUNT_CODE}): ${linkedPlanned.length} payments, ${linkedTotal.toFixed(2)}`);
  console.log(`UNLINKED (Dr ${EXPENSE_ACCOUNT_CODE} / Cr ${CASH_ACCOUNT_CODE}): ${unlinkedPlanned.length} payments, ${unlinkedTotal.toFixed(2)}`);
  console.log(`Total will post: ${planned.length}, ${(linkedTotal + unlinkedTotal).toFixed(2)}`);
  console.log(`Skipped (needs review): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s.paymentId}: ${s.reason}`);

  // 7. Projected chart_of_accounts.current_balance impact across all
  //    three accounts — same sign convention as every prior script.
  //    2110 only moves from the linked group; 5760 only from the
  //    unlinked group; 1710 is credited by both combined.
  const payableBefore = Number(payableAccount.current_balance) || 0;
  const expenseBefore = Number(expenseAccount.current_balance) || 0;
  const cashBefore = Number(cashAccount.current_balance) || 0;

  const payableDelta = ["asset", "expense"].includes(payableAccount.type) ? linkedTotal : -linkedTotal;
  const expenseDelta = ["asset", "expense"].includes(expenseAccount.type) ? unlinkedTotal : -unlinkedTotal;
  const combinedCashOut = linkedTotal + unlinkedTotal;
  const cashDelta = ["asset", "expense"].includes(cashAccount.type) ? -combinedCashOut : combinedCashOut;

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  console.log(`  ${payableAccount.code} ${payableAccount.name} (${payableAccount.type}): ${payableBefore.toFixed(2)} -> ${(payableBefore + payableDelta).toFixed(2)}  (${payableDelta >= 0 ? "+" : ""}${payableDelta.toFixed(2)})  [from ${linkedPlanned.length} LINKED payments only]`);
  console.log(`  ${expenseAccount.code} ${expenseAccount.name} (${expenseAccount.type}): ${expenseBefore.toFixed(2)} -> ${(expenseBefore + expenseDelta).toFixed(2)}  (${expenseDelta >= 0 ? "+" : ""}${expenseDelta.toFixed(2)})  [from ${unlinkedPlanned.length} UNLINKED payments only]`);
  console.log(`  ${cashAccount.code} ${cashAccount.name} (${cashAccount.type}): ${cashBefore.toFixed(2)} -> ${(cashBefore + cashDelta).toFixed(2)}  (${cashDelta >= 0 ? "+" : ""}${cashDelta.toFixed(2)})  [from BOTH groups combined]`);

  console.log(`\n  NOTE: 2110 should land at (or very close to) $0.00 after posting — scoped now to only the ${linkedPlanned.length} LINKED payments' effect, which exactly match the 9 posted Bills dollar-for-dollar. Verify this in the line above rather than assume it. The unlinked group deliberately never touches 2110 at all.`);

  console.log(`\nTotal debits: ${(linkedTotal + unlinkedTotal).toFixed(2)}  Total credits: ${(linkedTotal + unlinkedTotal).toFixed(2)}  (should match — one Dr/Cr pair of the same amount per payment, regardless of which account is debited)`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 5 LINKED and first 5 UNLINKED planned postings:`);
    for (const p of linkedPlanned.slice(0, 5)) {
      console.log(`  [LINKED]   ${p.date}  ${p.description}  Dr ${p.debitAccountCode} / Cr ${CASH_ACCOUNT_CODE}  ${p.amount.toFixed(2)}`);
    }
    for (const p of unlinkedPlanned.slice(0, 5)) {
      console.log(`  [UNLINKED] ${p.date}  ${p.description}  Dr ${p.debitAccountCode} / Cr ${CASH_ACCOUNT_CODE}  ${p.amount.toFixed(2)}`);
    }
    console.log(`\nRe-run with --commit to actually post these.`);
    return;
  }

  // 8. Commit — one transaction at a time, per-row failure logging, same
  //    resilience as every prior script.
  let nextSeq = await getNextSequence();
  let posted = 0;
  const failures: { paymentId: string; error: string }[] = [];

  for (const p of planned) {
    try {
      const txnId = await createDraftGLTransaction(p, nextSeq++, cashAccount.id);
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
  cashAccountId: string
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
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: p.debitAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular", project_id: p.projectId },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: cashAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular", project_id: p.projectId },
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
