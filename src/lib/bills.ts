// src/lib/bills.ts — Banking Step 4a: supplier / subcontractor bills.
// A bill is a cost you owe. Saved with create_bill() (bill + lines in one step); when APPROVED it goes into the books
// (cost on the job, GCT Input Credit, Supplier Payables, retention held) - see migration 20260975.

import { supabase } from "./supabase";

const errText = (e: unknown): string =>
  e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string" ? (e as { message: string }).message : "Something went wrong.";

export interface SupplierOption { id: string; name: string }
export interface CostAccount { id: string; code: string; name: string; type: string }
export interface NewBillLine { item_name: string; chart_account_id: string; amount: number }
export interface NewBill {
  supplier_id: string; project_id: string | null; invoice_number: string; invoice_date: string; due_date: string;
  tax_amount: number; retention_percent: number; notes: string;
}

export async function fetchSuppliers(companyId: string): Promise<SupplierOption[]> {
  const { data, error } = await supabase.from("suppliers").select("id, supplier_name, is_active")
    .eq("company_id", companyId).order("supplier_name");
  if (error) throw new Error(errText(error));
  return ((data || []) as { id: string; supplier_name: string; is_active: boolean | null }[])
    .filter((s) => s.is_active !== false).map((s) => ({ id: s.id, name: s.supplier_name }));
}

/** Quick add from the bill form (e.g. a mason or subcontractor who bills you). */
export async function addSupplier(companyId: string, name: string, phone: string): Promise<SupplierOption> {
  const { data, error } = await supabase.from("suppliers")
    .insert({ company_id: companyId, supplier_name: name.trim(), phone: phone.trim() || null, is_active: true })
    .select("id, supplier_name").single();
  if (error) throw new Error(errText(error));
  const d = data as { id: string; supplier_name: string };
  return { id: d.id, name: d.supplier_name };
}

/** Accounts a bill line can be charged to: active expense accounts that are not headings. */
export async function fetchCostAccounts(companyId: string): Promise<CostAccount[]> {
  const { data, error } = await supabase.from("chart_of_accounts").select("id, code, name, type, parent_id, is_active")
    .eq("company_id", companyId).eq("type", "expense").order("code");
  if (error) throw new Error(errText(error));
  const rows = (data || []) as (CostAccount & { parent_id: string | null; is_active: boolean | null })[];
  const parents = new Set(rows.map((r) => r.parent_id).filter(Boolean));
  return rows.filter((r) => r.is_active !== false && !parents.has(r.id)).map(({ id, code, name, type }) => ({ id, code, name, type }));
}

export async function createBill(bill: NewBill, lines: NewBillLine[], approve: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("create_bill", { p_bill: bill, p_lines: lines, p_approve: approve });
  if (error) throw new Error(errText(error));
  return data as string;
}

export async function approveBill(id: string): Promise<void> {
  const { error } = await supabase.rpc("approve_bill", { p_id: id });
  if (error) throw new Error(errText(error));
}

export async function disputeBill(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("dispute_bill", { p_id: id, p_reason: reason });
  if (error) throw new Error(errText(error));
}

export const GCT_RATE = 0.15;

// ── Banking Step 4b: paying bills (migration 20260976). Paying: DEBIT Supplier Payables, CREDIT the bank/cash/card.
// Paying out retention: DEBIT Retention Payable, CREDIT the bank/cash/card.

export type PayMethod = "wire" | "cash" | "check" | "credit_card" | "other";
export const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "wire", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Cheque" },
  { value: "credit_card", label: "Card" },
  { value: "other", label: "Other (e.g. Lynk)" },
];

export interface BillPayment {
  id: string;
  payment_number: string | null;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference_number: string | null;
  is_retention_release: boolean;
  paid_from_account_id: string | null;
  gl_transaction_id: string | null;
  ledger_note: string | null;
}

export async function fetchBillPayments(billId: string): Promise<BillPayment[]> {
  const { data, error } = await supabase.from("supplier_payments")
    .select("id, payment_number, payment_date, amount, payment_method, reference_number, is_retention_release, paid_from_account_id, gl_transaction_id, ledger_note")
    .eq("invoice_id", billId).order("payment_date").order("created_at");
  if (error) throw new Error(errText(error));
  return ((data || []) as BillPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function payBill(p: {
  billId: string; amount: number; date: string; paidFrom: string; method: PayMethod; reference: string; retention: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc("pay_bill", {
    p_bill: p.billId, p_amount: p.amount, p_date: p.date, p_paid_from: p.paidFrom,
    p_method: p.method, p_reference: p.reference.trim() || null, p_retention: p.retention,
  });
  if (error) throw new Error(errText(error));
  return data as string;
}

export async function undoBillPayment(id: string): Promise<void> {
  const { error } = await supabase.rpc("undo_bill_payment", { p_id: id });
  if (error) throw new Error(errText(error));
}
