// The "check your email" step after signing up (src/pages/LoginPage.tsx, src/components/CheckYourEmail.tsx).
// Pure helpers plus a little sessionStorage, so they can be tested without a browser or Supabase (npm run test:signup).

export const RESEND_SECONDS = 60;

// ── which web inbox to offer ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface MailProvider { name: "Gmail" | "Outlook" | "Yahoo Mail"; url: string }

export function mailProviderFor(email: string): MailProvider | null {
  const m = String(email ?? "").trim().toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  if (!m) return null;
  const domain = m[1];
  if (domain === "gmail.com" || domain === "googlemail.com") return { name: "Gmail", url: "https://mail.google.com/" };
  // the brand, then .com, a country code (outlook.jm) or co.xx / com.xx (hotmail.co.uk)
  const tld = "(com|[a-z]{2}|co\\.[a-z]{2}|com\\.[a-z]{2})";
  if (new RegExp(`^(outlook|hotmail|live|msn)\\.${tld}$`).test(domain)) return { name: "Outlook", url: "https://outlook.live.com/mail/" };
  if (new RegExp(`^(yahoo|ymail|rocketmail)\\.${tld}$`).test(domain)) return { name: "Yahoo Mail", url: "https://mail.yahoo.com/" };
  return null;
}

// ── the resend countdown ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Whole seconds still to wait before another email may be requested (0 = may resend now). lastSentAt is a Date.now() value, 0 = nothing sent yet.
export function secondsUntilResend(lastSentAt: number, now: number, wait = RESEND_SECONDS): number {
  if (!lastSentAt || !Number.isFinite(lastSentAt)) return 0;
  const left = Math.ceil((lastSentAt + wait * 1000 - now) / 1000);
  return Math.max(0, Math.min(wait, left));
}

// ── what Supabase answered ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function isEmailNotConfirmed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return e.code === "email_not_confirmed" || /email not confirmed/i.test(typeof e.message === "string" ? e.message : "");
}

// With email confirmation on, signing up with an address that already has an account does NOT fail: Supabase answers as if it worked (so nobody can probe which
// emails are registered) but returns a user with no identities and no session. Nothing is emailed, so the "check your email" screen would wait for nothing.
export function isExistingAccountSignup(data: { user?: { identities?: unknown[] | null } | null } | null | undefined): boolean {
  const ids = data?.user?.identities;
  return Array.isArray(ids) && ids.length === 0;
}

export function resendErrorMessage(error: unknown): string {
  const e = (error && typeof error === "object" ? error : {}) as { code?: unknown; message?: unknown; status?: unknown };
  const msg = typeof e.message === "string" ? e.message : "";
  if (e.code === "over_email_send_rate_limit" || e.status === 429 || /rate limit|only request this once|security purposes/i.test(msg))
    return "Too many emails were requested. Please wait a minute and try again.";
  return msg ? `We could not send the email: ${msg}` : "We could not send the email. Please try again in a moment.";
}

// ── remembered across a page refresh (this tab only) ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface PendingSignup { email: string; lastSentAt: number }

const PENDING_KEY = "magnus_pending_signup";
const WELCOME_KEY = "magnus_email_confirmed_welcome";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function defaultStore(): Store | null {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; }
}

export function readPendingSignup(store: Store | null = defaultStore()): PendingSignup | null {
  try {
    const raw = store?.getItem(PENDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingSignup>;
    if (typeof v.email !== "string" || !v.email.trim()) return null;
    return { email: v.email, lastSentAt: typeof v.lastSentAt === "number" && Number.isFinite(v.lastSentAt) ? v.lastSentAt : 0 };
  } catch { return null; }
}
export function savePendingSignup(p: PendingSignup, store: Store | null = defaultStore()): void {
  try { store?.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* a convenience only: the screen still works without it */ }
}
export function clearPendingSignup(store: Store | null = defaultStore()): void {
  try { store?.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

// The one-time "Your email is confirmed" message after the link in the email was used.
export function setWelcomeFlag(store: Store | null = defaultStore()): void {
  try { store?.setItem(WELCOME_KEY, "1"); } catch { /* ignore */ }
}
// true once, then false: reading it removes it.
export function takeWelcomeFlag(store: Store | null = defaultStore()): boolean {
  try {
    if (store?.getItem(WELCOME_KEY) !== "1") return false;
    store.removeItem(WELCOME_KEY);
    return true;
  } catch { return false; }
}
