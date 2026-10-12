// Posting an approved expense to the General Ledger as one balanced two-line journal entry:
//   debit  the ledger account linked to the expense's CATEGORY   (expense_categories.chart_account_id)
//   credit the account the expense was PAID FROM                 (expenses.paid_from_account_id)
// built with the proven draft -> entries -> post sequence (accounting.ts createGLTransaction / postGLTransaction), so the database's own
// posting checks and the account-balance trigger run exactly as they do for every other posting.
//
// Nothing here ever blocks or undoes the expense itself: when it can't be posted yet (no linked account, no paid-from account, a project
// is required, ...) the result says exactly why and the expense stays as it is, to be posted later. Posting is idempotent: an expense
// that already has a ledger transaction is never posted twice.
import { supabase } from "./supabase";
import { createGLTransaction, postGLTransaction } from "./accounting";

export const POSTABLE_STATUSES = ["approved", "reimbursed"];

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  parent_id?: string | null;
  is_active?: boolean | null;
  is_project_linkable?: boolean | null;
  company_id?: string | null;
}

export interface PostableExpense {
  id?: string;
  company_id?: string | null;
  status?: string | null;
  amount?: number | string | null;
  project_id?: string | null;
  category_id?: string | null;
  // The expense account (from the Chart of Accounts) this expense is charged to. Older expenses only have category_id.
  chart_account_id?: string | null;
  paid_from_account_id?: string | null;
  gl_transaction_id?: string | null;
}

export interface PostableCategory {
  id?: string;
  name?: string | null;
  chart_account_id?: string | null;
}

export type NotPostedCode =
  | "not_approved" | "bad_amount" | "no_category" | "no_category_account" | "no_paid_from" | "account_missing" | "account_inactive"
  | "same_account" | "project_required" | "other_company" | "draft_exists" | "bad_paid_from_type";

export type PlanResult =
  | { ok: true; debitAccount: LedgerAccount; creditAccount: LedgerAccount; amount: number }
  | { ok: false; code: NotPostedCode; reason: string };

const label = (a: LedgerAccount) => `${a.code} ${a.name}`;

// Which accounts an expense can be paid FROM: money accounts (bank, cash, petty cash: any asset) and accounts for money OWED (accounts payable,
// accrued/reimbursement and credit-card / line-of-credit liabilities). Long-term debt and deferred revenue (client advances) are not.
const NOT_PAID_FROM_LIABILITY_SUBTYPES = ["long_term_liability", "deferred_revenue"];
export function isPaidFromAccount(a: { type: string; subtype?: string | null }): boolean {
  if (a.type === "asset") return true;
  return a.type === "liability" && !NOT_PAID_FROM_LIABILITY_SUBTYPES.includes(String(a.subtype ?? ""));
}

// The chart has no currency column, so an account in another currency is recognised by its name ("Savings Account USD"). Returns the
// currency code, or null when the name doesn't look foreign-currency. The ledger records every expense in JMD, with no conversion.
export function detectNonJmdCurrency(name: string | null | undefined): string | null {
  const n = String(name ?? "");
  if (/(^|[^A-Za-z])(USD|US\$|U\.S\.|US\s+dollars?)(?![A-Za-z])/i.test(n) || /US\s?\$/i.test(n)) return "USD";
  const m = /(^|[^A-Za-z])(GBP|CAD|EUR)(?![A-Za-z])/i.exec(n);
  return m ? m[2].toUpperCase() : null;
}

// Everything that can be decided from data already in hand: is this expense ready to post, and if not, what is missing?
export function planExpensePosting(
  expense: PostableExpense,
  category: PostableCategory | null | undefined,
  accountsById: Map<string, LedgerAccount>,
): PlanResult {
  if (!POSTABLE_STATUSES.includes(String(expense.status ?? ""))) {
    return { ok: false, code: "not_approved", reason: "Only approved expenses are posted to the ledger." };
  }
  const amount = Math.round((Number(expense.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return { ok: false, code: "bad_amount", reason: "The amount must be greater than zero." };

  // The account to charge: the expense's own account (picked from the Chart of Accounts), or - for older expenses that only have a
  // category - the account that category is linked to.
  const debitId = expense.chart_account_id || category?.chart_account_id || null;
  if (!debitId) {
    if (expense.category_id && category) {
      return { ok: false, code: "no_category_account", reason: `The category "${category.name || "?"}" isn't linked to a ledger account yet.` };
    }
    return { ok: false, code: "no_category", reason: "No category (expense account) is selected for this expense, so there is nothing to charge it to." };
  }
  if (!expense.paid_from_account_id) {
    return { ok: false, code: "no_paid_from", reason: "No \"Paid from\" account is selected (the bank, cash or petty-cash account the money came out of)." };
  }

  const debit = accountsById.get(debitId);
  const credit = accountsById.get(expense.paid_from_account_id);
  if (!debit) return { ok: false, code: "account_missing", reason: "The expense account selected for this expense could not be found." };
  if (!credit) return { ok: false, code: "account_missing", reason: "The selected \"Paid from\" account could not be found." };
  if (expense.company_id && ((debit.company_id && debit.company_id !== expense.company_id) || (credit.company_id && credit.company_id !== expense.company_id))) {
    return { ok: false, code: "other_company", reason: "A linked account belongs to a different company." };
  }
  if (debit.is_active === false) return { ok: false, code: "account_inactive", reason: `The ledger account ${label(debit)} is inactive.` };
  if (credit.is_active === false) return { ok: false, code: "account_inactive", reason: `The \"Paid from\" account ${label(credit)} is inactive.` };
  if (debit.id === credit.id) {
    return { ok: false, code: "same_account", reason: `The \"Paid from\" account can't be the same account the expense is charged to (${label(debit)}).` };
  }
  if (!isPaidFromAccount(credit)) {
    return { ok: false, code: "bad_paid_from_type", reason: `The \"Paid from\" account ${label(credit)} is ${/^[aeiou]/i.test(credit.type) ? "an" : "a"} ${credit.type} account. Choose a bank, cash, payable or credit-card account.` };
  }
  if (!expense.project_id) {
    const needs = [debit, credit].find((a) => a.is_project_linkable);
    if (needs) {
      return { ok: false, code: "project_required", reason: `The ledger account ${label(needs)} requires a project, but no project is set on this expense.` };
    }
  }
  return { ok: true, debitAccount: debit, creditAccount: credit, amount };
}

export type LedgerState =
  | { state: "posted"; transactionId: string }
  | { state: "not_posted"; code: NotPostedCode; reason: string } // approved/paid but can't be posted yet
  | { state: "ready" }                                            // approved/paid and everything needed is there, just not posted yet
  | { state: "na" };                                              // pending / rejected: not a ledger matter yet

// What to show on an expense row.
export function expenseLedgerState(
  expense: PostableExpense,
  category: PostableCategory | null | undefined,
  accountsById: Map<string, LedgerAccount>,
): LedgerState {
  if (expense.gl_transaction_id) return { state: "posted", transactionId: expense.gl_transaction_id };
  if (!POSTABLE_STATUSES.includes(String(expense.status ?? ""))) return { state: "na" };
  const plan = planExpensePosting(expense, category, accountsById);
  return plan.ok ? { state: "ready" } : { state: "not_posted", code: plan.code, reason: plan.reason };
}

export type PostExpenseResult =
  | { status: "posted"; transactionId: string; transactionNumber?: string; currencyNote?: string }
  | { status: "already_posted"; transactionId: string }
  | { status: "not_posted"; code: NotPostedCode; reason: string }
  | { status: "failed"; reason: string };

// Today in Jamaica (YYYY-MM-DD), used only if an expense has no date.
function jamaicaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica" }).format(new Date());
}

const inFlight = new Set<string>();

export async function postExpenseToLedger(expenseId: string): Promise<PostExpenseResult> {
  if (!expenseId) return { status: "failed", reason: "No expense was given." };
  // A second click while the first is still working must not start a second posting.
  if (inFlight.has(expenseId)) return { status: "failed", reason: "This expense is already being posted. Please wait a moment." };
  inFlight.add(expenseId);
  try {
    return await postOnce(expenseId);
  } catch (e: any) {
    return { status: "failed", reason: e?.message || String(e) };
  } finally {
    inFlight.delete(expenseId);
  }
}

async function postOnce(expenseId: string): Promise<PostExpenseResult> {
  // 1. The expense. Already linked to a ledger transaction = already posted: stop here.
  const { data: expense, error: expError } = await supabase.from("expenses").select("*").eq("id", expenseId).maybeSingle();
  if (expError) return { status: "failed", reason: "Couldn't read the expense: " + expError.message };
  if (!expense) return { status: "failed", reason: "The expense could not be found." };
  if (expense.gl_transaction_id) return { status: "already_posted", transactionId: expense.gl_transaction_id };

  if (!POSTABLE_STATUSES.includes(String(expense.status ?? ""))) {
    return { status: "not_posted", code: "not_approved", reason: "Only approved expenses are posted to the ledger." };
  }

  // 2. A ledger transaction may already exist for this expense without the link being set (e.g. posted earlier by a script).
  const { data: existing, error: existingError } = await supabase
    .from("gl_transactions")
    .select("id, status")
    .eq("company_id", expense.company_id)
    .eq("source_type", "expense")
    .eq("source_id", expenseId);
  if (existingError) return { status: "failed", reason: "Couldn't check the ledger: " + existingError.message };
  const live = (existing || []).filter((t: any) => t.status !== "voided");
  const alreadyPosted = live.find((t: any) => t.status === "posted");
  if (alreadyPosted) {
    await supabase.from("expenses").update({ gl_transaction_id: alreadyPosted.id }).eq("id", expenseId).is("gl_transaction_id", null);
    return { status: "already_posted", transactionId: alreadyPosted.id };
  }
  if (live.length > 0) {
    return { status: "not_posted", code: "draft_exists", reason: "A draft ledger entry already exists for this expense. Finish or delete it in the General Ledger first." };
  }

  // 3. The accounts, and whether everything needed is there.
  // The category is only consulted for older expenses that have no account of their own.
  let category: PostableCategory | null = null;
  if (expense.category_id && !expense.chart_account_id) {
    const { data: cat, error: catError } = await supabase
      .from("expense_categories").select("id, name, chart_account_id").eq("id", expense.category_id).maybeSingle();
    if (catError) return { status: "failed", reason: "Couldn't read the category: " + catError.message };
    category = cat;
  }
  const accountIds = [expense.chart_account_id || category?.chart_account_id, expense.paid_from_account_id].filter(Boolean) as string[];
  const accountsById = new Map<string, LedgerAccount>();
  if (accountIds.length > 0) {
    const { data: accounts, error: acctError } = await supabase
      .from("chart_of_accounts").select("id, code, name, type, subtype, is_active, is_project_linkable, company_id").in("id", accountIds);
    if (acctError) return { status: "failed", reason: "Couldn't read the accounts: " + acctError.message };
    for (const a of accounts || []) accountsById.set(a.id, a as LedgerAccount);
  }
  const plan = planExpensePosting(expense, category, accountsById);
  if (!plan.ok) return { status: "not_posted", code: plan.code, reason: plan.reason };

  // 4. The balanced entry: debit the category's account, credit the paid-from account, for the same amount; the project (if any) on both lines.
  const description = `Expense: ${expense.description || "(no description)"}${expense.vendor ? ` (${expense.vendor})` : ""}`;
  const projectId = expense.project_id || undefined;
  let txn: { id: string } | null = null;
  for (let attempt = 1; attempt <= 4 && !txn; attempt++) {
    try {
      // createGLTransaction removes its own draft header if the lines can't be written, so a failure here leaves nothing behind.
      txn = await createGLTransaction(
        {
          transaction_date: expense.expense_date || jamaicaToday(),
          reference: `EXP-${String(expenseId).slice(0, 8)}`,
          source_type: "expense",
          source_id: expenseId,
          description,
          notes: "Posted automatically when the expense was approved.",
          entries: [
            { account_id: plan.debitAccount.id, debit: plan.amount, description, project_id: projectId },
            { account_id: plan.creditAccount.id, credit: plan.amount, description, project_id: projectId },
          ],
        },
        expense.company_id,
      );
    } catch (e: any) {
      const message = e?.message || String(e);
      // Two postings at the same moment can be handed the same transaction number. Nothing was created, so just try again.
      if (attempt < 4 && /transaction_number/i.test(message) && /duplicate|unique/i.test(message)) {
        await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 100));
        continue;
      }
      // Another session already has a live ledger entry for this expense (the database allows only one): report theirs, never a duplicate.
      if (/duplicate|unique/i.test(message) && /uq_gl_transactions_live_source/i.test(message)) {
        const { data: theirs } = await supabase
          .from("gl_transactions").select("id, status")
          .eq("company_id", expense.company_id).eq("source_type", "expense").eq("source_id", expenseId).neq("status", "voided");
        const posted = (theirs || []).find((t: any) => t.status === "posted");
        if (posted) {
          await supabase.from("expenses").update({ gl_transaction_id: posted.id }).eq("id", expenseId).is("gl_transaction_id", null);
          return { status: "already_posted", transactionId: posted.id };
        }
        return { status: "failed", reason: "This expense is already being posted by another session. Wait a moment and try again." };
      }
      return { status: "failed", reason: "Couldn't create the ledger entry: " + message };
    }
  }
  if (!txn) return { status: "failed", reason: "Couldn't create the ledger entry. Please try again." };
  const draft = txn;

  // 5. Claim the expense for this transaction before posting. If another tab/user got there first, drop ours and report theirs.
  // A draft that turned out not to be needed is VOIDED, not deleted: deleting a transaction deletes its lines, and the database reverses
  // the balance of every deleted line even when the transaction was never posted (so it would subtract money that was never added).
  // A voided draft never touched any balance, and is ignored by the duplicate check above.
  const voidDraft = async (why: string) => {
    await supabase.from("gl_transactions").update({ status: "voided", notes: `Not posted: ${why}` }).eq("id", draft.id).eq("status", "draft");
  };
  const { data: claimed, error: claimError } = await supabase
    .from("expenses").update({ gl_transaction_id: draft.id }).eq("id", expenseId).is("gl_transaction_id", null).select("id");
  if (claimError) {
    await voidDraft("could not link it to the expense");
    return { status: "failed", reason: "Couldn't link the ledger entry to the expense: " + claimError.message };
  }
  if (!claimed || claimed.length === 0) {
    await voidDraft("the expense was posted by another session first");
    const { data: now } = await supabase.from("expenses").select("gl_transaction_id").eq("id", expenseId).maybeSingle();
    return now?.gl_transaction_id
      ? { status: "already_posted", transactionId: now.gl_transaction_id }
      : { status: "failed", reason: "The expense changed while it was being posted. Please try again." };
  }

  // 6. Post: this is the step that applies the balances, and where the database's own rules are enforced.
  try {
    const posted = await postGLTransaction(draft.id);
    // Everything is recorded in JMD as entered. If either account looks like a foreign-currency one, say so (the post still goes through).
    const foreign = [plan.creditAccount, plan.debitAccount].map((a) => ({ a, cur: detectNonJmdCurrency(a.name) })).find((x) => x.cur);
    const currencyNote = foreign
      ? `${label(foreign.a)} looks like a ${foreign.cur} account, but the ledger records this expense in JMD (the amount as entered), with no currency conversion.`
      : undefined;
    return { status: "posted", transactionId: draft.id, transactionNumber: posted?.transaction_number, currencyNote };
  } catch (postError: any) {
    // Roll back: release the claim and void the draft, so nothing half-done stays linked or counted.
    await supabase.from("expenses").update({ gl_transaction_id: null }).eq("id", expenseId).eq("gl_transaction_id", draft.id);
    await voidDraft("the ledger rejected it");
    return { status: "failed", reason: "The ledger rejected the entry: " + (postError?.message || String(postError)) };
  }
}
