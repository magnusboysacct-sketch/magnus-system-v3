// scripts/post-client-payments.ts
//
// Phase 2, Customer Payments — post client_payments to the GL. Dry-run by
// default, --commit to write. Same shape as scripts/post-client-invoices.ts
// (fixed Dr/Cr account pair, createDraftGLTransaction + postGLTransaction
// faithfully mirroring postingEngine.ts, one row at a time, per-row
// failure logging) — deliberately not reinvented.
//
// This is the first script in this posting series that puts real cash
// into the GL — Expenses/Fund Transfer only moved money out, Invoices only
// created a receivable. Once this runs, Cash Position starts reflecting
// reality.
//
// source_type = 'client_payment' — confirmed already a real, valid
// gl_transactions_source_type_check value via pg_get_constraintdef, no
// migration needed. Learned from post-client-invoices.ts's own fix: always
// verify against the real constraint before choosing a value, never guess
// — used as a single SOURCE_TYPE constant here for the same reason that
// fix was a one-line change instead of a multi-spot find/replace.
//
// No eligibility filter — unlike client_invoices, client_payments has no
// status column at all (confirmed real columns: id, company_id, client_id,
// invoice_id, payment_number, payment_date, amount, payment_method,
// reference_number, notes, created_at, created_by). Every row is eligible
// except ones already posted (idempotency check, same as every prior
// script).
//
// ── Project-linkable accounts — checked at runtime, not assumed ─────────
// Same discipline as post-client-invoices.ts, which correctly caught 4100
// being project-linkable when that wasn't expected — this checks
// is_project_linkable on BOTH 1600 (Undeposited Funds) and 1100 (Accounts
// Receivable) fresh, not assuming either is fine just because 1100 wasn't
// flagged last time (a different pair of entries, on a different account,
// can behave differently). client_payments has no project_id column of
// its own — if either account turns out project-linkable, this resolves a
// project_id via invoice_id -> client_invoices.project_id, and excludes
// (with a specific reason) any payment where that chain doesn't resolve:
// no invoice_id at all, an invoice_id that doesn't match a known invoice,
// or a matched invoice with no project_id of its own.
//
// Usage:
//   npx tsx scripts/post-client-payments.ts            (dry run, no writes)
//   npx tsx scripts/post-client-payments.ts --commit    (posts for real)
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

const UNDEPOSITED_FUNDS_CODE = "1600"; // Undeposited Funds — debited (cash in)
const AR_ACCOUNT_CODE = "1100";        // Accounts Receivable — credited (owed amount goes down)
// Real, live gl_transactions_source_type_check value, confirmed via
// pg_get_constraintdef — not guessed, per the lesson from the invoices
// script's fix.
const SOURCE_TYPE = "client_payment";

interface PaymentRow {
  id: string;
  client_id: string | null;
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
}

interface SkippedRow {
  paymentId: string;
  reason: string;
}

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Resolve the two fixed accounts up front — fail fast if either is
  //    missing, and capture is_project_linkable for both fresh (see header
  //    comment on why this isn't assumed from the invoices script's run).
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, current_balance, is_project_linkable")
    .eq("company_id", COMPANY_ID)
    .in("code", [UNDEPOSITED_FUNDS_CODE, AR_ACCOUNT_CODE]);
  if (acctErr) throw acctErr;

  const undepositedAccount = accounts?.find(a => a.code === UNDEPOSITED_FUNDS_CODE);
  const arAccount = accounts?.find(a => a.code === AR_ACCOUNT_CODE);
  if (!undepositedAccount) throw new Error(`Account code ${UNDEPOSITED_FUNDS_CODE} (Undeposited Funds) not found in chart_of_accounts`);
  if (!arAccount) throw new Error(`Account code ${AR_ACCOUNT_CODE} (Accounts Receivable) not found in chart_of_accounts`);

  console.log(`Undeposited Funds account: ${undepositedAccount.code} ${undepositedAccount.name} (is_project_linkable: ${undepositedAccount.is_project_linkable})`);
  console.log(`AR account: ${arAccount.code} ${arAccount.name} (is_project_linkable: ${arAccount.is_project_linkable})`);

  // 2. Fetch all client_payments for the company, paginated — same
  //    PostgREST 1000-row-cap safeguard as every prior script; 112 rows
  //    exist today, well under it, but this stays correct if that grows.
  const payments: PaymentRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data: page, error: pageErr } = await supabase
        .from("client_payments")
        .select("id, client_id, invoice_id, payment_number, payment_date, amount, reference_number")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      payments.push(...((page as PaymentRow[]) || []));
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Fetched ${payments.length} live client_payments records`);

  // 3. Idempotency — which payments already have a GL transaction.
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", SOURCE_TYPE);
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} payments already have a GL transaction — will be skipped`);

  // 4. Client names for readable descriptions, and invoice_id ->
  //    project_id for the project-linkable resolution below (only
  //    actually needed if either account turns out flagged, but fetched
  //    unconditionally since it's cheap and keeps the logic simple).
  const clientIds = Array.from(new Set(payments.map(p => p.client_id).filter(Boolean))) as string[];
  const { data: clients, error: clientErr } = clientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", clientIds)
    : { data: [], error: null };
  if (clientErr) throw clientErr;
  const clientNameById = new Map((clients || []).map(c => [c.id, c.name]));

  const invoiceIds = Array.from(new Set(payments.map(p => p.invoice_id).filter(Boolean))) as string[];
  const { data: invoices, error: invErr } = invoiceIds.length > 0
    ? await supabase.from("client_invoices").select("id, project_id").in("id", invoiceIds)
    : { data: [], error: null };
  if (invErr) throw invErr;
  const invoiceProjectById = new Map((invoices || []).map(i => [i.id, i.project_id as string | null]));

  // 5. Build the posting plan.
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];
  const needsProject = undepositedAccount.is_project_linkable || arAccount.is_project_linkable;

  for (const p of payments) {
    if (alreadyPosted.has(p.id)) continue; // idempotent re-run, not counted as "excluded"

    if (!p.payment_date) {
      skipped.push({ paymentId: p.id, reason: "no payment_date — cannot set transaction_date" });
      continue;
    }

    let projectId: string | null = null;
    if (needsProject) {
      if (!p.invoice_id) {
        skipped.push({ paymentId: p.id, reason: "Undeposited Funds or AR account is project-linkable, but this payment has no invoice_id to resolve a project through" });
        continue;
      }
      if (!invoiceProjectById.has(p.invoice_id)) {
        skipped.push({ paymentId: p.id, reason: `invoice_id ${p.invoice_id} does not match any known client_invoices row` });
        continue;
      }
      const resolvedProjectId = invoiceProjectById.get(p.invoice_id) ?? null;
      if (!resolvedProjectId) {
        skipped.push({ paymentId: p.id, reason: `linked invoice ${p.invoice_id} has no project_id of its own` });
        continue;
      }
      projectId = resolvedProjectId;
    }

    const clientName = p.client_id ? clientNameById.get(p.client_id) : null;
    const refSuffix = p.reference_number ? ` (ref ${p.reference_number})` : "";
    planned.push({
      paymentId: p.id,
      amount: Number(p.amount) || 0,
      date: p.payment_date,
      description: `Client Payment ${p.payment_number}${clientName ? ` — ${clientName}` : ""}${refSuffix}`,
      projectId,
    });
  }

  // 6. Report.
  console.log(`\n=== Eligibility ===`);
  console.log(`Will post: ${planned.length}`);
  console.log(`Skipped (needs review): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s.paymentId}: ${s.reason}`);

  // 7. Projected chart_of_accounts.current_balance impact — same sign
  //    convention as every prior script's projection (asset/expense:
  //    debit-credit; everything else: credit-debit). Undeposited Funds
  //    (asset) is debited — goes up; AR (asset) is credited — goes down,
  //    both by the same amount per payment.
  const totalAmount = planned.reduce((s, p) => s + p.amount, 0);
  const undepositedBefore = Number(undepositedAccount.current_balance) || 0;
  const arBefore = Number(arAccount.current_balance) || 0;
  const undepositedDelta = ["asset", "expense"].includes(undepositedAccount.type) ? totalAmount : -totalAmount;
  const arDelta = ["asset", "expense"].includes(arAccount.type) ? -totalAmount : totalAmount;

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  console.log(`  ${undepositedAccount.code} ${undepositedAccount.name} (${undepositedAccount.type}): ${undepositedBefore.toFixed(2)} -> ${(undepositedBefore + undepositedDelta).toFixed(2)}  (${undepositedDelta >= 0 ? "+" : ""}${undepositedDelta.toFixed(2)})`);
  console.log(`  ${arAccount.code} ${arAccount.name} (${arAccount.type}): ${arBefore.toFixed(2)} -> ${(arBefore + arDelta).toFixed(2)}  (${arDelta >= 0 ? "+" : ""}${arDelta.toFixed(2)})`);

  console.log(`\nTotal debits: ${totalAmount.toFixed(2)}  Total credits: ${totalAmount.toFixed(2)}  (should match — always equal here, one Dr/Cr pair of the same amount per payment)`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 10 planned postings:`);
    for (const p of planned.slice(0, 10)) {
      console.log(`  ${p.date}  ${p.description}  Dr ${UNDEPOSITED_FUNDS_CODE} / Cr ${AR_ACCOUNT_CODE}  ${p.amount.toFixed(2)}`);
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
      const txnId = await createDraftGLTransaction(p, nextSeq++, undepositedAccount.id, arAccount.id);
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
  undepositedAccountId: string,
  arAccountId: string
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
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: undepositedAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular", project_id: p.projectId },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: arAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular", project_id: p.projectId },
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
