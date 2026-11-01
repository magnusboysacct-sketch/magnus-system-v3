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
export type ScanKind = "rls_off" | "no_policies" | "true_policy" | "definer_search_path" | "no_company_guard";

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
  /** Optional outside link, e.g. a service's billing page ("Pay now"). */
  link?: string | null;
  link_label?: string | null;
};

export type DailyPoint = { day: string; n: number };

export type HQOverview = {
  generated_at: string;
  companies: { total: number; trial: number; paid: number; past_due: number; free?: number; paused?: number; no_plan: number; closed: number; new_30d: number };
  numbers: {
    users: number; active_today: number; active_7d: number; workers: number;
    projects: number; projects_active: number; payroll_runs_month: number;
    invoices_month: number; invoices_total: number; files: number; storage_bytes: number;
    income_month: number | null;
    charging_on?: boolean;
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

export type CompanyState = "trial" | "paid" | "past_due" | "free" | "no_plan" | "paused" | "closed";

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

// ─── Health, errors, traffic, system (Step 6) ─────────────────────────────────

export type Level = "ok" | "warn" | "problem";

export type HealthCheck = {
  key: string;
  level: Level;
  label: string;
  text: string;
  used_bytes?: number;
  limit_mb?: number;
  pct?: number;
  last_run?: string;
};

export type HQHealth = {
  status: Level;
  checked_at: string;
  checks: HealthCheck[];
  limits: { db_mb: number; storage_mb: number; plan?: string } | null;
};

export async function fetchHealth(): Promise<HQHealth> {
  const { data, error } = await supabase.rpc("hq_health");
  if (error) throw new Error(error.message);
  return data as HQHealth;
}

export async function saveLimits(dbMb: number, storageMb: number, plan: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_limits_save", { p_db_mb: dbMb, p_storage_mb: storageMb, p_plan: plan, p_reason: reason });
  if (error) throw new Error(error.message);
}

export type AppErrorGroup = {
  fingerprint: string;
  message: string;
  stack: string | null;
  screen: string | null;
  first_seen: string;
  last_seen: string;
  total: number;
  users: number;
  anon: number;
  device: string | null;
  version: string | null;
  status: "open" | "fixed" | "ignored";
  fixed_at: string | null;
  reopened_count: number;
  note: string | null;
  last_24h: number;
};

export async function fetchErrors(): Promise<AppErrorGroup[]> {
  const { data, error } = await supabase.rpc("hq_errors");
  if (error) throw new Error(error.message);
  return (data ?? []) as AppErrorGroup[];
}

export async function setErrorStatus(fingerprint: string, status: AppErrorGroup["status"], note: string): Promise<void> {
  const { error } = await supabase.rpc("hq_error_set", { p_fingerprint: fingerprint, p_status: status, p_note: note || null });
  if (error) throw new Error(error.message);
}

export type HQTraffic = {
  by_hour: { hour: string; views: number; signed_in: number }[];
  by_section: { section: string; views: number }[];
  visitors_daily: { day: string; signed_in: number; visitors: number }[];
};

export async function fetchTraffic(): Promise<HQTraffic> {
  const { data, error } = await supabase.rpc("hq_traffic");
  if (error) throw new Error(error.message);
  return data as HQTraffic;
}

export type ServiceStatus = { name: string; page: string; indicator: string; description: string };

export type HQSystem = {
  checked_at: string;
  version: string | null;
  services: ServiceStatus[];
  domain: { domain: string; expires_at: string | null };
  deploys: { configured: boolean; error?: string; deployments?: { url: string | null; state: string | null; target: string; created: number | null; branch: string | null; message: string | null }[] };
  commits: { configured: boolean; repo: string; error?: string; commits?: { sha: string; message: string; author: string | null; date: string | null; url: string | null }[] };
  backups: { configured: boolean; project_ref: string | null; error?: string; pitr_enabled?: boolean; count?: number; latest?: { inserted_at?: string; status?: string } | null };
};

/** Server-side checks (service status, domain, deploys, backups). The server re-checks that you are an HQ admin. */
export async function fetchSystem(): Promise<HQSystem> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  const res = await fetch("/api/hq-system", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(res.status === 404 ? "System checks aren't available here (they run on the live site)." : `System checks failed (${res.status}).`);
  return (await res.json()) as HQSystem;
}

// ─── Settings & activity (Step 8a) ────────────────────────────────────────────

export async function fetchRawSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_platform_settings");
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

export async function saveSetting(key: string, value: unknown, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_setting_save", { p_key: key, p_value: value, p_reason: reason });
  if (error) throw new Error(error.message);
}

export type CompanyFeatureInfo = { off: string[]; effective: Record<string, boolean> };

export async function fetchCompanyFeatures(): Promise<Record<string, CompanyFeatureInfo>> {
  const { data, error } = await supabase.rpc("hq_company_features_list");
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, CompanyFeatureInfo>;
}

export async function saveCompanyFeatures(companyId: string, off: string[], reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_company_features", { p_company: companyId, p_off: off, p_reason: reason });
  if (error) throw new Error(error.message);
}

export type ActivityRow = {
  id: number; at: string; admin: string; action: string; target: string | null; target_name: string | null; details: Record<string, unknown>;
};

export async function fetchActivity(filters: { action?: string; admin?: string; search?: string }): Promise<ActivityRow[]> {
  const { data, error } = await supabase.rpc("hq_activity", {
    p_action: filters.action || null, p_admin: filters.admin || null, p_search: filters.search || null, p_limit: 300,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivityRow[];
}

// ─── Statutory rates (Step 8b) ────────────────────────────────────────────────

export type StatutoryRateSet = {
  id: string;
  effective_from: string;
  nis_employee_rate: number;
  nis_employer_rate: number;
  nis_annual_ceiling: number | null;
  nht_employee_rate: number;
  nht_employer_rate: number;
  edu_employee_rate: number;
  edu_employer_rate: number;
  heart_rate: number;
  paye_threshold_annual: number;
  paye_rate_band1: number;
  paye_rate_band2: number;
  paye_band1_ceiling: number;
  source_note: string | null;
  sources: { label: string; url: string }[];
  confirmed_at: string | null;
  confirmed_by_email: string | null;
  in_use_now: boolean;
};

export async function fetchStatutoryRateSets(): Promise<StatutoryRateSet[]> {
  const { data, error } = await supabase.rpc("hq_statutory_rates");
  if (error) throw new Error(error.message);
  return (data ?? []) as StatutoryRateSet[];
}

export async function saveStatutoryRateSet(set: Partial<StatutoryRateSet>, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_statutory_rate_save", { p: set, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function confirmStatutoryRateSet(id: string, confirm: boolean, reason: string): Promise<void> {
  const { error } = await supabase.rpc("hq_statutory_rate_confirm", { p_id: id, p_confirm: confirm, p_reason: reason });
  if (error) throw new Error(error.message);
}
