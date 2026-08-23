// scripts/post-client-invoices.ts
//
// Phase 2, Invoices — post client_invoices to the GL. Dry-run by default,
// --commit to write. Same shape as scripts/post-expenses.ts (fixed
// Dr/Cr account pair, createDraftGLTransaction + postGLTransaction
// faithfully mirroring postingEngine.ts, one row at a time, per-row
// failure logging) — deliberately not reinvented.
//
// Eligibility: status NOT IN ('draft', 'cancelled') — built generally
// against those two excluded statuses, not hardcoded to only
// paid/overdue, so it correctly handles 'sent'/'partial' invoices too
// (none exist in current data, but the logic doesn't assume that stays
// true).
//
// No tax-handling logic — real data confirmed 0/19 invoices have any
// tax_amount, so this posts one Dr AR / Cr Revenue pair per invoice using
// total_amount only. The dry-run below still checks subtotal ===
// total_amount for every real row and flags any mismatch rather than
// assuming it — informational only, doesn't change what's posted (always
// total_amount) or exclude the row, since Veron asked to be alerted, not
// to have such rows silently dropped.
//
// ── Project-linkable accounts — found while reading the actual posting
// trigger, not assumed ──────────────────────────────────────────────────
// validate_transaction_posting() (20260329190001_create_general_ledger.sql)
// RAISEs if any gl_entries row touches a chart_of_accounts row with
// is_project_linkable = true but has no project_id of its own. Neither
// 1100 (Accounts Receivable) nor 4100 (Construction Revenue) was
// confirmed either way in the handoff, so this script checks
// is_project_linkable on BOTH at runtime rather than assuming neither is
// flagged. If either turns out to be project-linkable, this uses
// client_invoices.project_id (a real, nullable column) on that entry —
// and any invoice missing project_id for a project-linkable account is
// excluded from the plan with a clear reason, not silently attempted and
// left to fail the trigger at commit time.
//
// Usage:
//   npx tsx scripts/post-client-invoices.ts            (dry run, no writes)
//   npx tsx scripts/post-client-invoices.ts --commit    (posts for real)
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID
// (same as post-expenses.ts/post-fund-transfers.ts, same reason for not
// importing src/lib/supabase.ts directly — it depends on import.meta.env,
// which doesn't exist outside the Vite/browser build.)

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

const AR_ACCOUNT_CODE = "1100";      // Accounts Receivable
const REVENUE_ACCOUNT_CODE = "4100"; // Construction Revenue
// Real, live gl_transactions_source_type_check value (confirmed via
// pg_get_constraintdef) — 'client_invoice' was never a valid value; the
// constraint's real name for this source is 'invoice'.
const SOURCE_TYPE = "invoice";

interface InvoiceRow {
  id: string;
  project_id: string | null;
  client_id: string | null;
  invoice_number: string;
  invoice_date: string;
  subtotal: number;
  total_amount: number;
  status: string;
}

interface PlannedPosting {
  invoiceId: string;
  amount: number;
  date: string;
  description: string;
  projectId: string | null;
}

interface SkippedRow {
  invoiceId: string;
  reason: string;
}

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Resolve the two fixed accounts up front — fail fast if either is
  //    missing, and capture is_project_linkable for both since neither was
  //    confirmed in the handoff (see header comment).
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, current_balance, is_project_linkable")
    .eq("company_id", COMPANY_ID)
    .in("code", [AR_ACCOUNT_CODE, REVENUE_ACCOUNT_CODE]);
  if (acctErr) throw acctErr;

  const arAccount = accounts?.find(a => a.code === AR_ACCOUNT_CODE);
  const revenueAccount = accounts?.find(a => a.code === REVENUE_ACCOUNT_CODE);
  if (!arAccount) throw new Error(`Account code ${AR_ACCOUNT_CODE} (Accounts Receivable) not found in chart_of_accounts`);
  if (!revenueAccount) throw new Error(`Account code ${REVENUE_ACCOUNT_CODE} (Construction Revenue) not found in chart_of_accounts`);

  console.log(`AR account: ${arAccount.code} ${arAccount.name} (is_project_linkable: ${arAccount.is_project_linkable})`);
  console.log(`Revenue account: ${revenueAccount.code} ${revenueAccount.name} (is_project_linkable: ${revenueAccount.is_project_linkable})`);

  // 2. Fetch all client_invoices for the company, paginated — PostgREST's
  //    max-rows cap (default 1000) is a hard server-side limit; only 19
  //    rows exist today, but the same robust loop as post-expenses.ts is
  //    used anyway for consistency and to not silently break if that
  //    changes later.
  const invoices: InvoiceRow[] = [];
  {
    const PAGE = 1000;
    let from = 0;
    for (let guard = 0; guard < 200; guard++) {
      const { data: page, error: pageErr } = await supabase
        .from("client_invoices")
        .select("id, project_id, client_id, invoice_number, invoice_date, subtotal, total_amount, status")
        .eq("company_id", COMPANY_ID)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pageErr) throw pageErr;
      invoices.push(...((page as InvoiceRow[]) || []));
      if (!page || page.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`Fetched ${invoices.length} live client_invoices records`);

  // 3. Idempotency — which invoices already have a GL transaction.
  const { data: existingTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("source_id")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", SOURCE_TYPE);
  if (txnErr) throw txnErr;
  const alreadyPosted = new Set((existingTxns || []).map(t => t.source_id));
  console.log(`${alreadyPosted.size} invoices already have a GL transaction — will be skipped`);

  // 4. Client names for readable transaction descriptions (optional
  //    enrichment, not required for correctness).
  const clientIds = Array.from(new Set(invoices.map(i => i.client_id).filter(Boolean))) as string[];
  const { data: clients, error: clientErr } = clientIds.length > 0
    ? await supabase.from("clients").select("id, name").in("id", clientIds)
    : { data: [], error: null };
  if (clientErr) throw clientErr;
  const clientNameById = new Map((clients || []).map(c => [c.id, c.name]));

  // 5. Build the posting plan.
  const planned: PlannedPosting[] = [];
  const skipped: SkippedRow[] = [];
  const excludedByStatus = new Map<string, number>();
  const subtotalMismatches: { invoiceId: string; invoiceNumber: string; subtotal: number; totalAmount: number }[] = [];

  for (const inv of invoices) {
    if (alreadyPosted.has(inv.id)) continue; // idempotent re-run, not counted as "excluded"

    if (inv.status === "draft" || inv.status === "cancelled") {
      excludedByStatus.set(inv.status, (excludedByStatus.get(inv.status) || 0) + 1);
      continue;
    }

    const subtotal = Number(inv.subtotal) || 0;
    const totalAmount = Number(inv.total_amount) || 0;
    if (subtotal !== totalAmount) {
      subtotalMismatches.push({ invoiceId: inv.id, invoiceNumber: inv.invoice_number, subtotal, totalAmount });
    }

    if (!inv.invoice_date) {
      skipped.push({ invoiceId: inv.id, reason: "no invoice_date — cannot set transaction_date" });
      continue;
    }

    // Project-linkable check — only actually required if either account is
    // flagged, but checked generally so this stays correct either way.
    const needsProject = arAccount.is_project_linkable || revenueAccount.is_project_linkable;
    if (needsProject && !inv.project_id) {
      skipped.push({ invoiceId: inv.id, reason: "AR or Revenue account is project-linkable but this invoice has no project_id" });
      continue;
    }

    const clientName = inv.client_id ? clientNameById.get(inv.client_id) : null;
    planned.push({
      invoiceId: inv.id,
      amount: totalAmount,
      date: inv.invoice_date,
      description: `Client Invoice ${inv.invoice_number}${clientName ? ` — ${clientName}` : ""}`,
      projectId: inv.project_id,
    });
  }

  // 6. Report.
  console.log(`\n=== Eligibility ===`);
  console.log(`Will post: ${planned.length}`);
  for (const [status, count] of excludedByStatus) console.log(`  Excluded (status='${status}'): ${count}`);
  console.log(`Skipped (needs review): ${skipped.length}`);
  for (const s of skipped) console.log(`  ${s.invoiceId}: ${s.reason}`);

  if (subtotalMismatches.length > 0) {
    console.log(`\nWARNING: ${subtotalMismatches.length} invoice(s) have subtotal != total_amount (posting uses total_amount regardless — flagging per instruction, not excluding):`);
    for (const m of subtotalMismatches) {
      console.log(`  ${m.invoiceNumber} (${m.invoiceId}): subtotal=${m.subtotal.toFixed(2)}  total_amount=${m.totalAmount.toFixed(2)}`);
    }
  } else {
    console.log(`\nConfirmed: subtotal === total_amount for every row in the posting plan.`);
  }

  // 7. Projected chart_of_accounts.current_balance impact — same sign
  //    convention as post-fund-transfers.ts's projection (asset/expense:
  //    debit-credit; everything else: credit-debit). AR (asset) is
  //    debited, Revenue is credited, both by the same amount per invoice.
  const totalAmount = planned.reduce((s, p) => s + p.amount, 0);
  const arBefore = Number(arAccount.current_balance) || 0;
  const revenueBefore = Number(revenueAccount.current_balance) || 0;
  const arDelta = ["asset", "expense"].includes(arAccount.type) ? totalAmount : -totalAmount;
  const revenueDelta = ["asset", "expense"].includes(revenueAccount.type) ? -totalAmount : totalAmount;

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  console.log(`  ${arAccount.code} ${arAccount.name} (${arAccount.type}): ${arBefore.toFixed(2)} -> ${(arBefore + arDelta).toFixed(2)}  (${arDelta >= 0 ? "+" : ""}${arDelta.toFixed(2)})`);
  console.log(`  ${revenueAccount.code} ${revenueAccount.name} (${revenueAccount.type}): ${revenueBefore.toFixed(2)} -> ${(revenueBefore + revenueDelta).toFixed(2)}  (${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(2)})`);

  console.log(`\nTotal debits: ${totalAmount.toFixed(2)}  Total credits: ${totalAmount.toFixed(2)}  (should match — always equal here, one Dr/Cr pair of the same amount per invoice)`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Sample of first 10 planned postings:`);
    for (const p of planned.slice(0, 10)) {
      console.log(`  ${p.date}  ${p.description}  Dr ${AR_ACCOUNT_CODE} / Cr ${REVENUE_ACCOUNT_CODE}  ${p.amount.toFixed(2)}`);
    }
    console.log(`\nRe-run with --commit to actually post these.`);
    return;
  }

  // 8. Commit — one transaction at a time, per-row failure logging, same
  //    resilience as post-fund-transfers.ts's 52-stuck-transaction lesson:
  //    a bad row fails and is logged, the rest still succeed.
  let nextSeq = await getNextSequence();
  let posted = 0;
  const failures: { invoiceId: string; error: string }[] = [];

  for (const p of planned) {
    try {
      const txnId = await createDraftGLTransaction(p, nextSeq++, arAccount.id, revenueAccount.id);
      await postGLTransaction(txnId);
      posted++;
      if (posted % 10 === 0) console.log(`  ...${posted}/${planned.length} posted`);
    } catch (e: any) {
      failures.push({ invoiceId: p.invoiceId, error: e.message || String(e) });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Posted: ${posted}`);
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.invoiceId}: ${f.error}`);
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
  arAccountId: string,
  revenueAccountId: string
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
      source_id: p.invoiceId,
      description: p.description,
      total_amount: p.amount,
      status: "draft",
    })
    .select()
    .single();
  if (txnErr) throw txnErr;

  const entries = [
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: arAccountId, debit: p.amount, credit: 0, description: p.description, line_number: 1, entry_type: "regular", project_id: p.projectId },
    { transaction_id: txn.id, company_id: COMPANY_ID, account_id: revenueAccountId, debit: 0, credit: p.amount, description: p.description, line_number: 2, entry_type: "regular", project_id: p.projectId },
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
