// src/lib/hq/billing.ts — Magnus Boy's System subscriptions (Step 5).
// Every price comes from platform_prices; the Charging switch, trial / grace days and where to pay live in
// platform_settings 'billing'. Companies use my_plan / my_claim_payment; HQ uses the hq_* functions.

import { supabase } from "../supabase";

export type PayMethod = "lynk" | "bank" | "cash" | "card" | "other";
export const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: "lynk", label: "Lynk" },
  { key: "bank", label: "Bank transfer" },
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
];

export type BillLine = { label: string; qty: number; each?: number; amount: number };

export type Bill = {
  id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_jmd: number;
  lines: BillLine[];
  status: "open" | "claimed" | "paid" | "void";
  plan_key: string | null;
};

export type Payment = {
  id: string;
  bill_id: string | null;
  amount_jmd: number;
  method: PayMethod;
  reference: string | null;
  paid_on: string;
  status: "claimed" | "confirmed" | "rejected";
  reject_reason: string | null;
};

export type PlanOption = {
  key: string;
  label: string;
  amount_jmd: number | null;
  included_seats: number | null;
  features: string[];
  description: string | null;
};

export type MyPlan = {
  can_manage: boolean;
  charging_on: boolean;
  billing_locked: boolean;
  company_name?: string;
  grace_days?: number;
  plan_key?: string | null;
  trial_expires_at?: string | null;
  paid_until?: string | null;
  users?: number;
  pay_to?: { lynk_handle: string | null; bank_details: string | null; payment_note: string | null };
  plans?: PlanOption[];
  bills?: Bill[];
  payments?: Payment[];
};

export const FEATURE_LABELS: Record<string, string> = {
  payroll: "Payroll with Jamaican deductions",
  client_portal: "Client & field-officer portals",
  worker_portal: "Worker portal & payslips",
  ocr: "Receipt scanning",
  public_receipts: "Receipts by WhatsApp link",
  ai: "AI assistant",
};

export const jmd = (v: number | null | undefined) =>
  v == null ? "Custom" : `J$${Number(v).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const shortDate = (d: string | null | undefined) =>
  d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-JM", { dateStyle: "medium" }) : "—";

export async function fetchMyPlan(): Promise<MyPlan> {
  const { data, error } = await supabase.rpc("my_plan");
  if (error) throw new Error(error.message);
  return data as MyPlan;
}

export async function claimPayment(billId: string, amount: number, method: PayMethod, reference: string, paidOn: string) {
  const { error } = await supabase.rpc("my_claim_payment", {
    p_bill: billId, p_amount: amount, p_method: method, p_reference: reference, p_paid_on: paidOn || null,
  });
  if (error) throw new Error(error.message);
}

// ─── HQ ───────────────────────────────────────────────────────────────────────

export type BillingSettings = {
  charging_on: boolean;
  trial_days: number;
  grace_days: number;
  default_plan: string;
  lynk_handle: string;
  bank_details: string;
  payment_note: string;
  usd_rate: number;
};

export type Price = {
  key: string;
  label: string;
  per: "company" | "seat" | "worker";
  amount_jmd: number | null;
  included_seats: number | null;
  features: string[];
  description: string | null;
  active: boolean;
  sort: number;
};

export type ClaimToConfirm = {
  id: string;
  company_id: string | null;
  company_name: string;
  amount_jmd: number;
  method: PayMethod;
  reference: string | null;
  paid_on: string;
  claimed_at: string;
  bill_amount: number | null;
  bill_due: string | null;
  claimed_by_email: string | null;
};

export type OpenBill = {
  id: string;
  company_id: string | null;
  company_name: string;
  amount_jmd: number;
  due_date: string;
  status: "open" | "claimed";
  period_start: string;
  period_end: string;
  locked: boolean;
};

export type RecentPayment = {
  id: string;
  company_name: string;
  amount_jmd: number;
  method: PayMethod;
  reference: string | null;
  paid_on: string;
  status: "confirmed" | "rejected";
  source: "company" | "hq";
  reject_reason: string | null;
  decided_at: string | null;
};

export type JobRun = { started_at: string; finished_at: string | null; ok: boolean | null; details: Record<string, unknown> };

export type HQBilling = {
  settings: BillingSettings;
  prices: Price[];
  to_confirm: ClaimToConfirm[];
  open_bills: OpenBill[];
  recent_payments: RecentPayment[];
  money_by_month: { month: string; amount: number }[];
  income_month: number;
  last_job: JobRun | null;
  companies: { id: string; name: string }[];
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchHQBilling = () => rpc<HQBilling>("hq_billing");
export const saveBillingSettings = (settings: Partial<BillingSettings>, reason: string) =>
  rpc<void>("hq_billing_save_settings", { p_settings: settings, p_reason: reason });
export const savePrice = (price: Partial<Price> & { key: string }, reason: string) =>
  rpc<void>("hq_price_save", { p_price: price, p_reason: reason });
export const decidePayment = (paymentId: string, confirm: boolean, reason: string) =>
  rpc<void>("hq_payment_decide", { p_payment: paymentId, p_confirm: confirm, p_reason: reason });
export const recordPayment = (a: { companyId: string; amount: number; method: PayMethod; reference: string; paidOn: string; months: number; reason: string }) =>
  rpc<void>("hq_record_payment", {
    p_company: a.companyId, p_amount: a.amount, p_method: a.method, p_reference: a.reference,
    p_paid_on: a.paidOn || null, p_months: a.months, p_reason: a.reason,
  });
export const voidBill = (billId: string, reason: string) => rpc<void>("hq_bill_void", { p_bill: billId, p_reason: reason });
export const runDailyJob = (reason: string) => rpc<Record<string, unknown>>("hq_run_daily_job", { p_reason: reason });
