// src/lib/reconcile.ts — Banking Step 6: reconcile a bank / card account to its statement; account history (migration 20260983).

import { supabase } from "./supabase";

const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "Something went wrong.";

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errText(error));
  return data as T;
}

export interface RecItem {
  entry_id: string; transaction_number: string; transaction_date: string; description: string; source_type: string;
  /** + money in (or less owed on a card), - money out. */
  amount: number; ticked: boolean; on_statement: boolean;
}
export interface RecState {
  id: string; status: "open" | "done"; statement_date: string; statement_balance: number; opening_balance: number;
  cleared_balance: number; difference: number; lines_to_review: number; items: RecItem[]; finished_at: string | null;
}
export interface RecSummary { id: string; bank_account_id: string; statement_date: string; statement_balance: number; status: "open" | "done"; finished_at: string | null }

export async function fetchReconciliations(bankAccountId: string): Promise<RecSummary[]> {
  const { data, error } = await supabase.from("bank_reconciliations")
    .select("id, bank_account_id, statement_date, statement_balance, status, finished_at")
    .eq("bank_account_id", bankAccountId).order("statement_date", { ascending: false });
  if (error) throw new Error(errText(error));
  return ((data || []) as RecSummary[]).map((r) => ({ ...r, statement_balance: Number(r.statement_balance) }));
}

export const startReconcile = (bankId: string, date: string, balance: number) =>
  call<string>("reconcile_start", { p_bank: bankId, p_statement_date: date, p_statement_balance: balance });

export async function fetchRecState(recId: string): Promise<RecState> {
  const d = await call<RecState>("reconcile_items", { p_rec: recId });
  const n = (v: unknown) => Number(v ?? 0);
  return {
    ...d, statement_balance: n(d.statement_balance), opening_balance: n(d.opening_balance), cleared_balance: n(d.cleared_balance),
    difference: n(d.difference), lines_to_review: n(d.lines_to_review), items: (d.items || []).map((i) => ({ ...i, amount: n(i.amount) })),
  };
}

export const tickEntries = (recId: string, entryIds: string[], on: boolean) => call<void>("reconcile_tick", { p_rec: recId, p_entries: entryIds, p_on: on });
export const finishReconcile = (recId: string) => call<void>("reconcile_finish", { p_rec: recId });
export const cancelReconcile = (recId: string) => call<void>("reconcile_cancel", { p_rec: recId });
export const undoReconcile = (recId: string) => call<void>("reconcile_undo", { p_rec: recId });

export interface HistoryRow {
  transaction_date: string; transaction_number: string; description: string; source_type: string; status: string; reference: string | null;
  debit: number; credit: number; reconciled: boolean; project: string | null; balance: number;
}
export interface AccountHistory {
  account: { id: string; code: string; name: string; type: string; current_balance: number | null };
  opening: number; closing: number; rows: HistoryRow[];
}

export async function fetchAccountHistory(accountId: string, from: string, to: string): Promise<AccountHistory> {
  const d = await call<AccountHistory>("account_history", { p_account: accountId, p_from: from, p_to: to });
  return {
    ...d, opening: Number(d.opening), closing: Number(d.closing),
    rows: (d.rows || []).map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), balance: Number(r.balance) })),
  };
}
