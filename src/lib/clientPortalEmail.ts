// The client portal login email (migration 20260953000000). A client signs in with portal_email, or - when that is empty - with the client's own email.
// Pure helpers for the "Change portal email" action in the client form; scripts/tests/clientPortalEmail.test.ts.

export interface PortalClientLike { email?: string | null; portal_email?: string | null; portal_enabled?: boolean | null; portal_activated_at?: string | null }

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// the address the client types to sign in
export function portalLoginEmail(c: PortalClientLike): string {
  return (c.portal_email || c.email || "").trim();
}

// only a director or admin changes it (the database refuses anyone else too)
export function canChangePortalEmail(role: string | null | undefined): boolean {
  return role === "director" || role === "admin";
}

export function validatePortalEmail(next: string, current: string): string | null {
  const v = next.trim().toLowerCase();
  if (!v) return "Enter the new portal email address.";
  if (v.length > 254 || !EMAIL_RE.test(v)) return "That email address does not look right.";
  if (v === current.trim().toLowerCase()) return "That is already the portal login email.";
  return null;
}

export function changeConfirmation(clientName: string, current: string, next: string): string {
  return `Change the portal login email of ${clientName}?\n\nFrom: ${current || "(none)"}\nTo: ${next.trim().toLowerCase()}\n\nThey must sign in with the new email from now on. Their password stays the same, and they are signed out of the portal. Any password-reset link already sent stops working.`;
}

// readable text for what the database answers
export function portalEmailError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "";
  if (error.code === "42501" || /not allowed/i.test(error.message || "")) return "Only a director or admin can change the portal email.";
  return error.message || "The portal email could not be changed.";
}
