// What /auth/confirm does with the link in an auth email (Confirm signup, Magic link, Change email, Reset password, Invite).
// The email links point at our own domain - {{ .SiteURL }}/auth/confirm?token_hash=...&type=...&next=... - instead of <project>.supabase.co,
// so mail providers do not flag them. Pure logic, no browser or Supabase, so it can be tested (npm run test:authconfirm).

export type ConfirmType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";
const TYPES: readonly ConfirmType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export type ConfirmPlan =
  | { kind: "error"; message: string }
  // verify the token here (signup, magiclink, email, email_change), then go to `next`
  | { kind: "verify"; tokenHash: string; type: ConfirmType; next: string }
  // recovery and invite: the one-time token is spent by the page that needs it (it sets the password), so it is passed on, not used here
  | { kind: "forward"; to: string };

// `next` is only ever a path inside this app. Anything that could leave the site (https://evil, //evil, /\evil, javascript:) or loop back here becomes the fallback.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  const v = String(next ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f\u007f]/.test(v)) return fallback;
  if (/^\/auth\/confirm(\/|\?|#|$)/.test(v)) return fallback;
  return v;
}

export function planConfirm(search: string): ConfirmPlan {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tokenHash = (p.get("token_hash") || "").trim();
  const type = (p.get("type") || "").trim() as ConfirmType;
  if (!tokenHash) return { kind: "error", message: "This link is incomplete. Please use the link from your most recent email, or request a new one." };
  if (!TYPES.includes(type)) return { kind: "error", message: "This link is not valid. Please request a new one." };

  const q = `token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  if (type === "recovery") return { kind: "forward", to: `/reset-password?${q}` };
  if (type === "invite") return { kind: "forward", to: `/accept-invite?${q}` };
  return { kind: "verify", tokenHash, type, next: safeNext(p.get("next")) };
}
