// src/lib/hq/platformAdmin.ts — Magnus HQ (platform owner control room) data calls.
// Platform tables are never read directly: everything goes through SECURITY DEFINER
// functions that check the caller is a platform admin with 2-step login (see migration 20260955).

import { supabase } from "../supabase";

export type PlatformStatus = {
  is_admin: boolean;
  is_owner?: boolean;
  /** True when this session passed 2-step login (aal2). */
  mfa_ok?: boolean;
};

const NOT_ADMIN: PlatformStatus = { is_admin: false };

/** Safe for every signed-in user: non-admins (or a database without HQ yet) just get is_admin=false. */
export async function fetchPlatformStatus(): Promise<PlatformStatus> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return NOT_ADMIN;
    const { data, error } = await supabase.rpc("hq_my_status");
    if (error || !data || typeof data !== "object") return NOT_ADMIN;
    return data as PlatformStatus;
  } catch {
    return NOT_ADMIN;
  }
}

// ─── Admins ───────────────────────────────────────────────────────────────────

export type PlatformAdmin = {
  user_id: string;
  email: string;
  is_owner: boolean;
  added_at: string;
  added_by_email: string | null;
  last_sign_in_at: string | null;
};

export async function listAdmins(): Promise<PlatformAdmin[]> {
  const { data, error } = await supabase.rpc("hq_list_admins");
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformAdmin[];
}

export async function addAdmin(email: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_add_admin", { p_email: email, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

export async function removeAdmin(userId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_remove_admin", { p_user_id: userId, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

// ─── 2-step login (Supabase MFA, authenticator app) ───────────────────────────

export type MfaState = {
  /** The verified authenticator for this account, if one is set up. */
  verifiedFactorId: string | null;
};

export async function getMfaState(): Promise<MfaState> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(error.message);
  const verified = data.totp.find((f) => f.status === "verified");
  return { verifiedFactorId: verified?.id ?? null };
}

export type TotpEnrollment = {
  factorId: string;
  /** Image (data URL) of the QR code to scan with the authenticator app. */
  qrCode: string;
  /** The same key as text, for typing in by hand. */
  secret: string;
};

/** Start setting up the authenticator app. Clears any half-finished set-up first. */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Magnus HQ",
    issuer: "Magnus Boy's System",
  });
  if (error) throw new Error(error.message);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Check a 6-digit code. On success the session is upgraded to 2-step (aal2). */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw new Error(error.message);
}

// ─── Security scan (Health tab) ───────────────────────────────────────────────

export type ScanLevel = "problem" | "warn" | "ok";
export type ScanKind = "rls_off" | "no_policies" | "true_policy" | "definer_search_path";

export type SecurityFinding = {
  level: ScanLevel;
  kind: ScanKind;
  object: string;
  detail: string;
};

export async function runSecurityScan(): Promise<SecurityFinding[]> {
  const { data, error } = await supabase.rpc("hq_security_scan");
  if (error) throw new Error(error.message);
  return (data ?? []) as SecurityFinding[];
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

export type AttentionItem = {
  level: "problem" | "warn" | "info";
  /** HQ tab to open when tapped. */
  tab: string;
  title: string;
  detail: string;
};

export type DailyPoint = { day: string; n: number };

export type HQOverview = {
  generated_at: string;
  companies: { total: number; trial: number; paid: number; past_due: number; no_plan: number; closed: number; new_30d: number };
  numbers: {
    users: number; active_today: number; active_7d: number; workers: number;
    projects: number; projects_active: number; payroll_runs_month: number;
    invoices_month: number; invoices_total: number; files: number; storage_bytes: number;
    income_month: number | null;
  };
  attention: AttentionItem[];
  new_companies_daily: DailyPoint[];
  active_users_daily: DailyPoint[];
};

export async function fetchOverview(): Promise<HQOverview> {
  const { data, error } = await supabase.rpc("hq_overview");
  if (error) throw new Error(error.message);
  return data as HQOverview;
}

// ─── Companies tab ────────────────────────────────────────────────────────────

export type CompanyState = "trial" | "paid" | "past_due" | "no_plan" | "paused" | "closed";

export type HQCompany = {
  id: string;
  name: string;
  created_at: string;
  account_status: "active" | "paused" | "closed";
  status_reason: string | null;
  closed_at: string | null;
  purge_after: string | null;
  is_test: boolean;
  state: CompanyState;
  plan: string | null;
  trial_expires_at: string | null;
  subscription_expires_at: string | null;
  owner_email: string | null;
  users: number;
  workers: number | null;
  projects: number | null;
  clients: number | null;
  payroll_runs: number | null;
  invoices: number | null;
  purchase_orders: number | null;
  receipts: number | null;
  files: number;
  storage_bytes: number;
  last_activity: string | null;
};

export async function listCompanies(): Promise<HQCompany[]> {
  const { data, error } = await supabase.rpc("hq_list_companies");
  if (error) throw new Error(error.message);
  return (data ?? []) as HQCompany[];
}

export type CompanyAction = "extend_trial" | "set_plan" | "pause" | "unpause" | "close" | "reopen" | "mark_test";

export async function companyAction(
  companyId: string,
  action: CompanyAction,
  reason: string,
  args: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc("hq_company_action", {
    p_company: companyId, p_action: action, p_reason: reason, p_args: args,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCompanyNow(companyId: string, reason: string, confirmName: string) {
  const { data, error } = await supabase.rpc("hq_company_delete_now", {
    p_company: companyId, p_reason: reason, p_confirm_name: confirmName,
  });
  if (error) throw new Error(error.message);
  return data as { rows_deleted: number; logins_deleted: number; files_left: number };
}

/** Downloads the company's data as a JSON file (logins, PINs, passwords and tokens left out). */
export async function exportCompany(company: HQCompany, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc("hq_company_export", { p_company: company.id, p_reason: reason });
  if (error) throw new Error(error.message);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = company.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "company";
  a.href = url;
  a.download = `magnus-export-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
