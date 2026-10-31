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
