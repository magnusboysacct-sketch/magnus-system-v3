// scripts/post-fund-transfers.ts
//
// One-time posting of the Fund Transfer transactions created (with their
// gl_entries) during the Transfer Fund import but never advanced past
// status='draft' — discovered while investigating why Owner Draws showed
// zero. Of the original 237 transactions, 52 turned out stuck in draft
// (total $6,806,500.98 debits/credits, confirmed balanced); root cause
// was chart_of_accounts_check/check1 wrongly forbidding negative equity/
// liability balances, fixed by 20260822020000_allow_negative_equity_
// liability_balances.sql. One of the 52 (8b4c42a5-4862-43da-8be5-
// 9495d923a36d) was posted manually as a live test after that fix landed
// and confirmed working end to end — this script queries status='draft'
// directly, so that transaction naturally drops out on its own; no
// filtering logic needed to account for it. This run targets whatever's
// left (51, as of writing this).
//
// Unlike scripts/post-expenses.ts, this does NOT create any new
// gl_transactions/gl_entries rows — the transactions and their entries
// already exist from the original import. This only flips status from
// 'draft' to 'posted', one row at a time, reusing the exact mechanism
// postingEngine.ts's postTransaction() already uses (a plain UPDATE ...
// SET status='posted' on gl_transactions). Confirmed via
// apply_balance_updates_on_transaction_posted() (added earlier this
// session, applied and confirmed live) that this UPDATE correctly
// triggers a chart_of_accounts.current_balance update for every entry on
// each transaction, walking gl_entries fresh per row; opening_balance is
// deliberately NOT touched by that trigger — it's a static starting
// point, not something that moves as transactions post.
//
// Deliberately one UPDATE per transaction, not one bulk UPDATE matching
// every draft row at once: validate_transaction_posting() (a pre-
// existing BEFORE UPDATE trigger) can RAISE EXCEPTION for a row that
// fails its own checks (fewer than 2 entries, no debit+credit both
// present, an inactive account, a project-linkable account missing
// project_id) — a single bulk UPDATE statement is all-or-nothing, so one
// bad row would silently roll back the whole batch. Posting one row at a
// time means a bad row fails and is logged, the rest still succeed.
//
// Usage:
//   npx tsx scripts/post-fund-transfers.ts            (dry run, no writes)
//   npx tsx scripts/post-fund-transfers.ts --commit    (posts for real)
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPANY_ID
// (same as scripts/post-expenses.ts, same reason for not importing
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

async function main() {
  console.log(`Mode: ${commit ? "COMMIT (will write to the database)" : "DRY RUN (no writes)"}`);

  // 1. Every draft Fund Transfer transaction for this company.
  const { data: draftTxns, error: txnErr } = await supabase
    .from("gl_transactions")
    .select("id, transaction_number, transaction_date, total_amount")
    .eq("company_id", COMPANY_ID)
    .eq("source_type", "fund_transfer")
    .eq("status", "draft");
  if (txnErr) throw txnErr;

  const transactions = draftTxns || [];
  console.log(`Found ${transactions.length} draft Fund Transfer transactions`);
  if (transactions.length === 0) {
    console.log("Nothing to post.");
    return;
  }

  // 2. Every entry belonging to those transactions, plus the accounts
  // they touch (type + current_balance, needed to project the impact).
  const transactionIds = transactions.map(t => t.id);
  const { data: entries, error: entriesErr } = await supabase
    .from("gl_entries")
    .select("transaction_id, account_id, debit, credit")
    .in("transaction_id", transactionIds);
  if (entriesErr) throw entriesErr;

  const accountIds = Array.from(new Set((entries || []).map(e => e.account_id)));
  const { data: accounts, error: acctErr } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name, type, current_balance")
    .in("id", accountIds);
  if (acctErr) throw acctErr;
  const accountById = new Map((accounts || []).map(a => [a.id, a]));

  // 3. Project the balance impact per account — same sign convention as
  // apply_balance_updates_on_transaction_posted() (asset/expense:
  // debit-credit; everything else: credit-debit). This is a PROJECTION
  // computed here in the script for reporting purposes only — the real
  // trigger does this same math server-side once --commit actually flips
  // a row's status; this doesn't write anything itself.
  const projectedDelta = new Map<string, number>();
  for (const e of entries || []) {
    const acct = accountById.get((e as any).account_id);
    if (!acct) continue;
    const debit = Number((e as any).debit) || 0;
    const credit = Number((e as any).credit) || 0;
    const signed = ["asset", "expense"].includes(acct.type) ? debit - credit : credit - debit;
    projectedDelta.set(acct.id, (projectedDelta.get(acct.id) || 0) + signed);
  }

  console.log(`\n=== Projected chart_of_accounts.current_balance changes ===`);
  const rows = Array.from(projectedDelta.entries())
    .map(([accountId, delta]) => {
      const acct = accountById.get(accountId)!;
      const before = Number(acct.current_balance) || 0;
      return { code: acct.code, name: acct.name, type: acct.type, before, delta, after: before + delta };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  for (const r of rows) {
    console.log(`  ${r.code} ${r.name} (${r.type}): ${r.before.toFixed(2)} -> ${r.after.toFixed(2)}  (${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)})`);
  }

  const totalDebits = (entries || []).reduce((s, e: any) => s + (Number(e.debit) || 0), 0);
  const totalCredits = (entries || []).reduce((s, e: any) => s + (Number(e.credit) || 0), 0);
  console.log(`\nTotal debits: ${totalDebits.toFixed(2)}  Total credits: ${totalCredits.toFixed(2)}  (should match)`);
  console.log(`Transactions to post: ${transactions.length}, entries to apply: ${(entries || []).length}`);

  if (!commit) {
    console.log(`\nDry run — nothing written. Re-run with --commit to actually post these.`);
    return;
  }

  // 4. Commit — one UPDATE per transaction, sequential, matching
  // postingEngine.ts's postTransaction() (same status/posted_at fields,
  // same single-row-at-a-time approach) — never a bulk UPDATE, see the
  // header comment for why.
  let posted = 0;
  const failures: { id: string; error: string }[] = [];
  for (const t of transactions) {
    try {
      const { error } = await supabase
        .from("gl_transactions")
        .update({ status: "posted", posted_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) throw error;
      posted++;
      if (posted % 50 === 0) console.log(`  ...${posted}/${transactions.length} posted`);
    } catch (e: any) {
      failures.push({ id: t.id, error: e.message || String(e) });
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Posted: ${posted}`);
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
