// src/lib/banking.ts — Banking Step 2: moving money between accounts (Transfer), the standard way.
// One posted journal entry per transfer: DEBIT the account the money goes TO, CREDIT the account it comes FROM.
// Saving and undoing happen in the database in one step (migration 20260970: money_transfer / money_transfer_undo),
// so a transfer is never half saved. Undo = a posted reversing entry; the original stays, marked voided.

import { supabase } from "./supabase";

export interface MoneyAccount {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability";
  current_balance: number;
  /** Linked to a bank account on the Bank Accounts page. */
  isBank: boolean;
}

export interface TransferRow {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: "posted" | "voided" | "draft";
  note: string | null;
  description: string;
  fromId: string | null;
  toId: string | null;
  projectId: string | null;
}

const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "Something went wrong.";

/** Accounts money can move between (the standard "Bank" accounts): marked Bank in the chart, linked to a bank account, or
 *  petty cash / cash on hand / undeposited funds; plus credit cards / lines of credit linked to a bank account.
 *  The rule lives in the database (money_accounts / _is_money_account, migration 20260971) so the screen and the save agree. */
export async function fetchMoneyAccounts(): Promise<MoneyAccount[]> {
  const { data, error } = await supabase.rpc("money_accounts");
  if (error) throw new Error(errText(error));
  return ((data || []) as { id: string; code: string; name: string; type: string; current_balance: number | null; is_bank: boolean }[]).map((a) => ({
    id: a.id, code: a.code, name: a.name, type: a.type as MoneyAccount["type"],
    current_balance: Number(a.current_balance ?? 0), isBank: !!a.is_bank,
  }));
}

/** Mark (or unmark) an asset account as a money account ("Bank" in the chart), so it can be used in transfers. */
export async function setMoneyAccount(accountId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from("chart_of_accounts").update({ subtype: on ? "bank" : "current_asset" }).eq("id", accountId).eq("type", "asset");
  if (error) throw new Error(errText(error));
}

export interface OpeningBalance { id: string; amount: number; date: string; number: string }

/** The live opening balance of each bank account (bank account id -> entry). */
export async function fetchOpeningBalances(companyId: string): Promise<Map<string, OpeningBalance>> {
  const { data, error } = await supabase
    .from("gl_transactions")
    .select("id, source_id, total_amount, transaction_date, transaction_number")
    .eq("company_id", companyId)
    .eq("source_type", "opening_balance")
    .eq("status", "posted");
  if (error) throw new Error(errText(error));
  const m = new Map<string, OpeningBalance>();
  for (const r of (data || []) as { id: string; source_id: string | null; total_amount: number; transaction_date: string; transaction_number: string }[]) {
    if (r.source_id) m.set(r.source_id, { id: r.id, amount: Number(r.total_amount), date: r.transaction_date, number: r.transaction_number });
  }
  return m;
}

export async function setOpeningBalance(bankAccountId: string, amount: number, date: string): Promise<string> {
  const { data, error } = await supabase.rpc("bank_account_set_opening_balance", { p_bank: bankAccountId, p_amount: amount, p_date: date });
  if (error) throw new Error(errText(error));
  return (data as { number: string }).number;
}

export async function transferMoney(t: { fromId: string; toId: string; amount: number; date: string; note: string; projectId: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc("money_transfer", {
    p_from: t.fromId, p_to: t.toId, p_amount: t.amount, p_date: t.date, p_note: t.note || null, p_project: t.projectId,
  });
  if (error) throw new Error(errText(error));
  return (data as { number: string }).number;
}

export async function undoTransfer(id: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc("money_transfer_undo", { p_id: id, p_reason: reason });
  if (error) throw new Error(errText(error));
  return (data as { number: string }).number;
}

/** The latest transfers (including ones imported from Zoho), newest first. */
export async function fetchRecentTransfers(companyId: string, limit = 15): Promise<TransferRow[]> {
  const { data, error } = await supabase
    .from("gl_transactions")
    .select("id, transaction_number, transaction_date, description, total_amount, status, notes, gl_entries(account_id, debit, credit, project_id)")
    .eq("company_id", companyId)
    .eq("source_type", "fund_transfer")
    .order("transaction_date", { ascending: false })
    .order("transaction_number", { ascending: false })
    .limit(limit);
  if (error) throw new Error(errText(error));
  type Row = { id: string; transaction_number: string; transaction_date: string; description: string; total_amount: number; status: TransferRow["status"]; notes: string | null;
    gl_entries: { account_id: string; debit: number; credit: number; project_id: string | null }[] | null };
  return ((data || []) as Row[]).map((r) => {
    const lines = r.gl_entries || [];
    return {
      id: r.id, number: r.transaction_number, date: r.transaction_date, amount: Number(r.total_amount), status: r.status,
      note: r.notes, description: r.description,
      toId: lines.find((l) => Number(l.debit) > 0)?.account_id ?? null,
      fromId: lines.find((l) => Number(l.credit) > 0)?.account_id ?? null,
      projectId: lines.find((l) => l.project_id)?.project_id ?? null,
    };
  });
}

/** The chart has no currency column; an account in another currency is recognised by its name ("Savings Account USD"). */
export function looksForeign(name: string): boolean {
  return /(^|[^A-Za-z])(USD|US\$|GBP|CAD|EUR)(?![A-Za-z])/i.test(name);
}
