// src/lib/hq/bills.ts — Magnus HQ Bills: the services the owner pays for to keep Magnus Boy's System running.
// Owner-admin only. Never store passwords, full card numbers or API keys here: the database refuses them too.

import { supabase } from "../supabase";

export type Subscription = {
  id: string;
  service: string;
  purpose: string | null;
  plan: string | null;
  cost: number | null;
  currency: "USD" | "JMD";
  cycle: "monthly" | "yearly";
  next_due: string | null;
  auto_renew: boolean;
  card_last4: string | null;
  login_email: string | null;
  billing_url: string | null;
  dashboard_url: string | null;
  status_url: string | null;
  notes: string | null;
  critical: boolean;
  active: boolean;
  sort: number;
  days_left: number | null;
  monthly_jmd: number;
  last_paid: string | null;
};

export type SubscriptionsData = {
  usd_rate: number;
  services: Subscription[];
  cost_month_jmd: number;
  cost_month_usd: number;
  cost_year_jmd: number;
  cost_year_usd: number;
  income_month_jmd: number;
  income_avg3_jmd: number;
};

export type SubscriptionPayment = {
  id: string;
  paid_on: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  note: string | null;
  due_before: string | null;
  due_after: string | null;
};

/** Green = paid / more than 14 days away, gold = due within 14 days, red = overdue. */
export function billColor(s: Pick<Subscription, "days_left" | "active">): "green" | "gold" | "red" | "none" {
  if (!s.active || s.days_left == null) return "none";
  if (s.days_left < 0) return "red";
  if (s.days_left <= 14) return "gold";
  return "green";
}

export const money = (amount: number | null | undefined, currency: string) =>
  amount == null ? "—" : `${currency === "USD" ? "US$" : "J$"}${Number(amount).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchSubscriptions = () => rpc<SubscriptionsData>("hq_subscriptions");
export const saveSubscription = (sub: Partial<Subscription>, reason: string) =>
  rpc<string>("hq_subscription_save", { p_sub: sub, p_reason: reason });
export const markSubscriptionPaid = (id: string, paidOn: string, amount: number | null, reference: string, note: string) =>
  rpc<string | null>("hq_subscription_paid", { p_id: id, p_paid_on: paidOn || null, p_amount: amount, p_reference: reference, p_note: note });
export const fetchSubscriptionHistory = (id: string) => rpc<SubscriptionPayment[]>("hq_subscription_history", { p_id: id });
