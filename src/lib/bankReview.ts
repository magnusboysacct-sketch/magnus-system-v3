// src/lib/bankReview.ts — Banking Step 5: review bank statement lines (migration 20260982).
// Each line is MATCHED to an entry already in the books, ADDED (bank fees, interest... posted against the bank), or EXCLUDED.

import { supabase } from "./supabase";

const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "Something went wrong.";

export type ReviewAction = "matched" | "added" | "excluded";

export interface BankLine {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  /** true = money in (deposit), false = money out. */
  moneyIn: boolean;
  balance_after: number | null;
  reference_number: string | null;
  review_action: ReviewAction | null;
  notes: string | null;
  entry: { id: string; number: string; description: string } | null;
}

export interface Suggestion {
  id: string; transaction_number: string; transaction_date: string; description: string; source_type: string; amount: number; days_apart: number;
}

export interface ReviewBank { id: string; name: string; chart_account_id: string | null; books_balance: number | null }

export async function fetchReviewBanks(companyId: string): Promise<ReviewBank[]> {
  const { data, error } = await supabase.from("bank_accounts")
    .select("id, account_name, bank_name, account_number_last_4, chart_account_id, chart_of_accounts(current_balance)")
    .eq("company_id", companyId).eq("is_active", true).order("account_name");
  if (error) throw new Error(errText(error));
  type Row = { id: string; account_name: string; bank_name: string | null; account_number_last_4: string | null; chart_account_id: string | null;
    chart_of_accounts: { current_balance: number | null } | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: [r.bank_name, r.account_name].filter(Boolean).join(" - ") + (r.account_number_last_4 ? ` ••${r.account_number_last_4}` : ""),
    chart_account_id: r.chart_account_id,
    books_balance: r.chart_of_accounts ? Number(r.chart_of_accounts.current_balance ?? 0) : null,
  }));
}

export async function fetchBankLines(bankAccountId: string): Promise<BankLine[]> {
  const { data, error } = await supabase.from("bank_transactions")
    .select("id, transaction_date, description, amount, transaction_type, balance_after, reference_number, review_action, notes, gl_transaction_id, gl_transactions(transaction_number, description)")
    .eq("bank_account_id", bankAccountId)
    .order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw new Error(errText(error));
  type Row = { id: string; transaction_date: string; description: string; amount: number; transaction_type: string | null; balance_after: number | null;
    reference_number: string | null; review_action: ReviewAction | null; notes: string | null; gl_transaction_id: string | null;
    gl_transactions: { transaction_number: string; description: string } | null };
  return ((data || []) as unknown as Row[]).map((r) => ({
    id: r.id, transaction_date: r.transaction_date, description: r.description, amount: Math.abs(Number(r.amount)),
    moneyIn: r.transaction_type === "credit" || r.transaction_type === "transfer_in",
    balance_after: r.balance_after == null ? null : Number(r.balance_after), reference_number: r.reference_number,
    review_action: r.review_action, notes: r.notes,
    entry: r.gl_transaction_id && r.gl_transactions
      ? { id: r.gl_transaction_id, number: r.gl_transactions.transaction_number, description: r.gl_transactions.description } : null,
  }));
}

export async function fetchSuggestions(lineId: string): Promise<Suggestion[]> {
  const { data, error } = await supabase.rpc("bank_line_suggestions", { p_line: lineId });
  if (error) throw new Error(errText(error));
  return ((data || []) as Suggestion[]).map((s) => ({ ...s, amount: Number(s.amount) }));
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errText(error));
  return data;
}

export const matchLine = (lineId: string, entryId: string) => call("bank_line_match", { p_line: lineId, p_entry: entryId });
export const addLine = (lineId: string, accountId: string, projectId: string | null, note: string) =>
  call("bank_line_add", { p_line: lineId, p_account: accountId, p_project: projectId, p_note: note.trim() || null });
export const excludeLine = (lineId: string, reason: string) => call("bank_line_exclude", { p_line: lineId, p_reason: reason.trim() || null });
export const undoLine = (lineId: string) => call("bank_line_undo", { p_line: lineId });
export const autoMatch = async (bankAccountId: string): Promise<number> => Number(await call("bank_auto_match", { p_bank_account: bankAccountId }));

export interface PostAccount { id: string; code: string; name: string; type: string }

/** Accounts a bank line can be added to: active, not headings, not receivables / payables. */
export async function fetchPostAccounts(companyId: string): Promise<PostAccount[]> {
  const { data, error } = await supabase.from("chart_of_accounts").select("id, code, name, type, subtype, parent_id, is_active")
    .eq("company_id", companyId).order("code");
  if (error) throw new Error(errText(error));
  const rows = (data || []) as (PostAccount & { subtype: string | null; parent_id: string | null; is_active: boolean | null })[];
  const parents = new Set(rows.filter((r) => r.is_active !== false).map((r) => r.parent_id).filter(Boolean));
  return rows.filter((r) => r.is_active !== false && !parents.has(r.id)
      && !["accounts_receivable", "accounts_payable"].includes(r.subtype || "") && !/(receivable|payable)/i.test(r.name))
    .map(({ id, code, name, type }) => ({ id, code, name, type }));
}
