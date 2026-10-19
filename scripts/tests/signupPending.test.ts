// The "check your email" step after signup (src/lib/signupPending.ts).
// Run:  npm run test:signup
import test from "node:test";
import assert from "node:assert/strict";
import {
  RESEND_SECONDS, clearPendingSignup, isEmailNotConfirmed, isExistingAccountSignup, mailProviderFor, readPendingSignup, resendErrorMessage,
  savePendingSignup, secondsUntilResend, setWelcomeFlag, takeWelcomeFlag,
} from "../../src/lib/signupPending";

function fakeStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m };
}

test("the inbox button: Gmail, Outlook and Yahoo by the address's domain, nothing for anything else", () => {
  assert.deepEqual(mailProviderFor("a@gmail.com"), { name: "Gmail", url: "https://mail.google.com/" });
  assert.equal(mailProviderFor("A@GoogleMail.com")?.name, "Gmail");
  for (const d of ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.jm", "hotmail.co.uk", "live.co.uk"]) assert.equal(mailProviderFor(`x@${d}`)?.name, "Outlook", d);
  assert.equal(mailProviderFor("x@outlook.com")?.url, "https://outlook.live.com/mail/");
  for (const d of ["yahoo.com", "ymail.com", "rocketmail.com", "yahoo.co.uk"]) assert.equal(mailProviderFor(`x@${d}`)?.name, "Yahoo Mail", d);
  assert.equal(mailProviderFor("x@yahoo.com")?.url, "https://mail.yahoo.com/");
  for (const e of ["x@magnusboys.com", "x@company.co.jm", "x@gmail.com.evil.test", "x@notgmail.com", "x@outlook.evil", "", "nope", "x@", "@gmail.com", null, undefined])
    assert.equal(mailProviderFor(e as string), null, String(e));
});

test("the resend countdown: 60 seconds after each send, counting down in whole seconds, 0 when nothing was sent", () => {
  const t = 1_000_000;
  assert.equal(RESEND_SECONDS, 60);
  assert.equal(secondsUntilResend(0, t), 0);
  assert.equal(secondsUntilResend(t, t), 60);
  assert.equal(secondsUntilResend(t, t + 1), 60);
  assert.equal(secondsUntilResend(t, t + 1000), 59);
  assert.equal(secondsUntilResend(t, t + 59_001), 1);
  assert.equal(secondsUntilResend(t, t + 60_000), 0);
  assert.equal(secondsUntilResend(t, t + 600_000), 0);
  assert.equal(secondsUntilResend(t + 5000, t), 60, "a clock that went backwards never shows more than 60");
  assert.equal(secondsUntilResend(NaN, t), 0);
});

test("'Email not confirmed' is recognised by its code or its text", () => {
  assert.equal(isEmailNotConfirmed({ code: "email_not_confirmed", message: "x" }), true);
  assert.equal(isEmailNotConfirmed({ message: "Email not confirmed" }), true);
  assert.equal(isEmailNotConfirmed({ message: "Invalid login credentials", code: "invalid_credentials" }), false);
  for (const e of [null, undefined, "Email not confirmed", 4, {}]) assert.equal(isEmailNotConfirmed(e), false, String(e));
});

test("signing up with an address that already has an account is spotted (Supabase answers success with no identities)", () => {
  assert.equal(isExistingAccountSignup({ user: { identities: [] } }), true);
  assert.equal(isExistingAccountSignup({ user: { identities: [{ id: "1" }] } }), false);
  assert.equal(isExistingAccountSignup({ user: {} }), false);
  assert.equal(isExistingAccountSignup({ user: null }), false);
  assert.equal(isExistingAccountSignup(null), false);
});

test("resend errors: a rate limit is explained, anything else is shown", () => {
  assert.match(resendErrorMessage({ code: "over_email_send_rate_limit", message: "x" }), /wait a minute/);
  assert.match(resendErrorMessage({ status: 429, message: "" }), /wait a minute/);
  assert.match(resendErrorMessage({ message: "For security purposes, you can only request this once every 60 seconds" }), /wait a minute/);
  assert.match(resendErrorMessage({ message: "SMTP down" }), /SMTP down/);
  assert.match(resendErrorMessage(null), /try again/);
});

test("the pending signup survives a refresh (sessionStorage) and is cleared after sign-in", () => {
  const s = fakeStore();
  assert.equal(readPendingSignup(s), null);
  savePendingSignup({ email: "a@gmail.com", lastSentAt: 123 }, s);
  assert.deepEqual(readPendingSignup(s), { email: "a@gmail.com", lastSentAt: 123 });
  savePendingSignup({ email: "a@gmail.com", lastSentAt: 456 }, s);
  assert.equal(readPendingSignup(s)?.lastSentAt, 456);
  clearPendingSignup(s);
  assert.equal(readPendingSignup(s), null);
});

test("a damaged or missing store never breaks the page", () => {
  assert.equal(readPendingSignup(fakeStore({ magnus_pending_signup: "{not json" })), null);
  assert.equal(readPendingSignup(fakeStore({ magnus_pending_signup: JSON.stringify({ email: "  " }) })), null);
  assert.deepEqual(readPendingSignup(fakeStore({ magnus_pending_signup: JSON.stringify({ email: "a@b.co" }) })), { email: "a@b.co", lastSentAt: 0 });
  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(readPendingSignup(throwing), null);
  assert.doesNotThrow(() => { savePendingSignup({ email: "a@b.co", lastSentAt: 1 }, throwing); clearPendingSignup(throwing); setWelcomeFlag(throwing); });
  assert.equal(takeWelcomeFlag(throwing), false);
  assert.equal(readPendingSignup(null), null);
  assert.equal(takeWelcomeFlag(null), false);
});

test("the welcome message after confirming is shown once", () => {
  const s = fakeStore();
  assert.equal(takeWelcomeFlag(s), false);
  setWelcomeFlag(s);
  assert.equal(takeWelcomeFlag(s), true);
  assert.equal(takeWelcomeFlag(s), false);
});
