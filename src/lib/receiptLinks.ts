// src/lib/receiptLinks.ts
// Receipt links: a public, no-login page (/receipt/:token) where the person paid can view, print and save their receipt, and whose WhatsApp preview shows
// the company's own logo and name (get_share_preview, kind "receipt").
//
// Links are created only when someone presses WhatsApp / Copy receipt link / Email (never on save), by create_receipt_link, which reuses the payment's
// active link. Staff can revoke it; a revoked or unknown token shows "This receipt link is not valid." and a plain Magnus preview.
import { supabase } from "./supabase";
import type { PublicReceipt } from "./receiptHtml";

export type ReceiptKind = "field_payment" | "client_payment";

export const RECEIPT_LINK_INVALID = "This receipt link is not valid.";

export const errorMessage = (e: unknown): string => (e instanceof Error && e.message) || "please try again.";

export function receiptUrl(token: string): string {
  return `${window.location.origin}/receipt/${token}`;
}

// Appends the link on its own line at the end of a message / email body.
export function withReceiptLink(message: string, token: string): string {
  return `${message.replace(/\s+$/, "")}\n\n${receiptUrl(token)}`;
}

// The payment's active token (created if there is none yet). Throws with a readable message on failure.
export async function createReceiptLink(kind: ReceiptKind, paymentId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_receipt_link", { p_kind: kind, p_payment_id: paymentId });
  if (error || typeof data !== "string" || !data) throw new Error(error?.message || "Could not create the receipt link.");
  return data;
}

// The payment's active token, or null when it has none (nothing is created). Staff only (row-level security).
export async function findReceiptLink(kind: ReceiptKind, paymentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("receipt_share_links")
    .select("token")
    .eq("kind", kind)
    .eq("payment_id", paymentId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { token: string } | null)?.token ?? null;
}

export async function revokeReceiptLink(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_receipt_link", { p_token: token });
  if (error) throw new Error(error.message);
  return data === true;
}

// The public receipt for a token (no login). null = unknown or revoked.
export async function getPublicReceipt(token: string): Promise<PublicReceipt | null> {
  const { data, error } = await supabase.rpc("get_public_receipt", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as PublicReceipt | null) ?? null;
}

// "Previous advances" on a FINAL payment: the one shared calculation (database function field_payment_previous_advances) used by the public page and
// by both print paths. 0 for any other payment type.
export async function getPreviousAdvances(paymentId: string): Promise<number> {
  const { data, error } = await supabase.rpc("field_payment_previous_advances", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// WhatsApp needs a window opened inside the click (pop-up blockers), but the link is created after an await. So: open a blank tab now, then point it at
// wa.me once the link exists. Closes the tab and rethrows if the link could not be created.
export async function openWhatsApp(phone: string | null | undefined, buildMessage: () => Promise<string>): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const msg = await buildMessage();
    const digits = (phone || "").replace(/\D/g, "");
    const url = `https://wa.me/${digits ? `1${digits}` : ""}?text=${encodeURIComponent(msg)}`;
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
  } catch (e) {
    tab?.close();
    throw e;
  }
}

// mailto: hands over to the mail app without leaving the page, and is not a pop-up, so it can follow the await.
export async function openEmail(subject: string, buildBody: () => Promise<string>, to = ""): Promise<void> {
  const body = await buildBody();
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
