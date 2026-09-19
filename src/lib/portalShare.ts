// src/lib/portalShare.ts
//
// Helpers for the "Send to Client" flow (invoices now; estimates and contracts
// later). Staff-side only. The RPCs share_with_client / withdraw_from_client do
// the real work server-side (company ownership check, shared_at/shared_via/
// shared_by, activity log); these are thin wrappers that throw plain Errors.
import { supabase } from "./supabase";

export type ShareItemType = "invoice" | "contract" | "estimate";
export type ShareVia = "portal" | "link" | "whatsapp" | "email";

export interface ShareClientLike {
  id: string;
  portal_token?: string | null;
  portal_enabled?: boolean | null;
}

// Same rule as PORTAL_BASE in ClientsPage.tsx: always the production domain,
// except when running locally.
const PORTAL_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? window.location.origin
    : "https://app.magnusboys.com";

export function getPortalUrl(client: { portal_token?: string | null } | null | undefined): string | null {
  if (!client?.portal_token) return null;
  return `${PORTAL_BASE}/portal/${client.portal_token}`;
}

export async function shareWithClient(
  type: ShareItemType,
  id: string,
  via: ShareVia,
  snapshot?: Record<string, unknown> | null
): Promise<string> {
  const { data, error } = await supabase.rpc("share_with_client", {
    p_item_type: type,
    p_item_id: id,
    p_via: via,
    p_snapshot: snapshot ?? null,
  });
  if (error) throw new Error(error.message || "Could not send to client.");
  return String(data ?? new Date().toISOString());
}

export async function withdrawFromClient(type: ShareItemType, id: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_from_client", {
    p_item_type: type,
    p_item_id: id,
  });
  if (error) throw new Error(error.message || "Could not withdraw from client.");
}

// Same behavior as the enable branch of togglePortal() in ClientsPage.tsx:
// portal_enabled = true, generating a portal_token when the client has none.
// Unlike togglePortal it surfaces failures (e.g. no permission) as an Error.
export async function enablePortalForClient(
  client: ShareClientLike
): Promise<{ portal_token: string; portal_enabled: boolean }> {
  const token = client.portal_token || crypto.randomUUID();
  const { data, error } = await supabase
    .from("clients")
    .update({ portal_enabled: true, portal_token: token })
    .eq("id", client.id)
    .select("portal_token, portal_enabled")
    .maybeSingle();
  if (error) throw new Error(error.message || "Could not enable the portal.");
  if (!data) throw new Error("Could not enable the portal. You may not have permission to edit this client.");
  return { portal_token: data.portal_token, portal_enabled: !!data.portal_enabled };
}

// Digits only; a bare 10-digit number gets the "1" country prefix, matching the
// existing payment-reminder code in AccountsReceivablePage.tsx.
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function formatJamaicaDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Jamaica",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

export function shareViaLabel(via: string | null | undefined): string {
  switch (via) {
    case "portal": return "portal";
    case "link": return "link";
    case "whatsapp": return "WhatsApp";
    case "email": return "email";
    default: return via || "portal";
  }
}

// The timestamp to treat as "currently shared", or null. Robust to either way
// the DB records a withdrawal (shared_at cleared, or withdrawn_at set later than
// shared_at); a later re-share (newer shared_at) counts as shared again.
export function isSharedNow(
  sharedAt: string | null | undefined,
  withdrawnAt: string | null | undefined
): string | null {
  if (!sharedAt) return null;
  if (withdrawnAt && new Date(withdrawnAt).getTime() >= new Date(sharedAt).getTime()) return null;
  return sharedAt;
}