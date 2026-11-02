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

/** Accounts money can move between: active asset accounts, and credit cards / lines of credit linked to a bank account. */
export async function fetchMoneyAccounts(companyId: string): Promise<MoneyAccount[]> {
  const [accts, banks] = await Promise.all([
    supabase.from("chart_of_accounts").select("id, code, name, type, is_active, current_balance")
      .eq("company_id", companyId).in("type", ["asset", "liability"]).order("code"),
    supabase.from("bank_accounts").select("chart_account_id").eq("company_id", companyId),
  ]);
  if (accts.error) throw new Error(errText(accts.error));
  const linked = new Set((banks.data || []).map((b: { chart_account_id: string | null }) => b.chart_account_id).filter(Boolean) as string[]);
  return (accts.data || [])
    .filter((a: { is_active: boolean | null; type: string; id: string }) => a.is_active !== false && (a.type === "asset" || linked.has(a.id)))
    .map((a: { id: string; code: string; name: string; type: string; current_balance: number | null }) => ({
      id: a.id, code: a.code, name: a.name, type: a.type as MoneyAccount["type"],
      current_balance: Number(a.current_balance ?? 0), isBank: linked.has(a.id),
    }));
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
