// src/lib/support.ts — "Support without spying" (Magnus HQ Step 9).
// A company director / admin lets Magnus support look at their company, read-only, for up to 24 hours.
// Everything support opens is logged and shown back to the company. Without a grant, HQ can't see company records.

import { supabase } from "./supabase";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ─── Company side ─────────────────────────────────────────────────────────────

export type SupportGrant = {
  id: string;
  reason: string;
  granted_at: string;
  expires_at: string;
  ended_at?: string | null;
  granted_by_email: string | null;
};

export type MySupportStatus = {
  can_manage: boolean;
  active?: SupportGrant | null;
  grants?: SupportGrant[];
  log?: { at: string; who: string | null; what: string; grant_id: string | null }[];
};

export const fetchMySupport = () => rpc<MySupportStatus>("my_support_status");
export const grantSupport = (reason: string, hours = 24) => rpc<string>("my_support_grant", { p_reason: reason, p_hours: hours });
export const endSupport = () => rpc<void>("my_support_end");

// ─── HQ side ──────────────────────────────────────────────────────────────────

export type HQSupportGrant = SupportGrant & {
  company_id: string;
  company_name: string;
  active: boolean;
  views: number;
};

export type SupportTables = { company_id: string; expires_at: string; reason: string; tables: { table: string; rows: number }[] };
export type SupportRows = { table: string; total: number; offset: number; limit: number; rows: Record<string, unknown>[] };

export const fetchSupportGrants = () => rpc<HQSupportGrant[]>("hq_support_grants");
export const fetchSupportTables = (companyId: string) => rpc<SupportTables>("hq_support_tables", { p_company: companyId });
export const fetchSupportRows = (companyId: string, table: string, offset = 0, limit = 50) =>
  rpc<SupportRows>("hq_support_read", { p_company: companyId, p_table: table, p_offset: offset, p_limit: limit });

/** "projects" -> "Projects", "client_invoices" -> "Client invoices". */
export const tableLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");

export function timeLeft(expiresAt: string, now = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}
