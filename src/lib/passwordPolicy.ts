// The password rules for STAFF accounts (Supabase Auth): signup on /login, /reset-password and /accept-invite.
// They mirror the project's Authentication -> Sign In / Providers -> Email -> Password settings. If those settings change, change them here too:
// the rules shown under the field and the check before submitting come from this one place.
// (Client-portal passwords are separate: they live in the client-portal edge functions and are not covered by this file.)
// Pure logic, no browser or Supabase: tested by `npm run test:password`.

export interface PasswordPolicy {
  minLength: number;
  requireSymbol: boolean;
}

// Supabase: at least 8 characters, with lowercase, uppercase letters and digits. Set requireSymbol to true if "symbols" is switched on in the dashboard.
export const PASSWORD_POLICY: PasswordPolicy = { minLength: 8, requireSymbol: false };

// The symbols Supabase counts: !@#$%^&*()_+-=[]{};':"\|<>?,./`~
const SYMBOL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

export interface PasswordRule { id: "length" | "lower" | "upper" | "digit" | "symbol"; label: string; met: boolean }

export function passwordRules(password: string, policy: PasswordPolicy = PASSWORD_POLICY): PasswordRule[] {
  const pw = password ?? "";
  const rules: PasswordRule[] = [
    { id: "length", label: `At least ${policy.minLength} characters`, met: pw.length >= policy.minLength },
    { id: "lower", label: "A lowercase letter (a-z)", met: /[a-z]/.test(pw) },
    { id: "upper", label: "An uppercase letter (A-Z)", met: /[A-Z]/.test(pw) },
    { id: "digit", label: "A number (0-9)", met: /[0-9]/.test(pw) },
  ];
  if (policy.requireSymbol) rules.push({ id: "symbol", label: "A symbol (for example ! @ # $ %)", met: SYMBOL.test(pw) });
  return rules;
}

// null when the password is acceptable, otherwise one clear sentence saying what is still missing.
export function validatePassword(password: string, policy: PasswordPolicy = PASSWORD_POLICY): string | null {
  if (!password) return "Enter a password.";
  const missing = passwordRules(password, policy).filter((r) => !r.met).map((r) => r.label.replace(/^At least/, "at least").replace(/^An? /, (m) => m.toLowerCase()));
  if (missing.length === 0) return null;
  return `Password is too weak. It still needs: ${missing.join(", ")}.`;
}

// A short sentence that describes the whole policy (for hints and error messages).
export function passwordPolicySentence(policy: PasswordPolicy = PASSWORD_POLICY): string {
  const parts = ["a lowercase letter", "an uppercase letter", "a number"];
  if (policy.requireSymbol) parts.push("a symbol");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `at least ${policy.minLength} characters, with ${list}`;
}

// Supabase can still refuse a password the page accepted (a changed setting, or the "leaked password" check). Its error has code "weak_password"
// and, in supabase-js, a `reasons` list: "length", "characters", "pwned". Returns a message for the screen, or null when the error is about something else.
export function passwordErrorMessage(error: unknown, policy: PasswordPolicy = PASSWORD_POLICY): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: unknown; message?: unknown; reasons?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  const reasons = Array.isArray(e.reasons) ? e.reasons.map(String) : [];
  const weak = e.code === "weak_password" || reasons.length > 0 || /weak[ _]password|password should (be at least|contain)|password is known to be weak|data breach|pwned/i.test(message);
  if (!weak) return null;

  const pwned = reasons.includes("pwned") || /pwned|data breach|known to be weak/i.test(message);
  if (pwned && reasons.every((r) => r === "pwned")) return "This password has appeared in a known data breach, so it cannot be used. Please choose a different one.";
  const policyText = `A password needs ${passwordPolicySentence(policy)}.`;
  return pwned
    ? `This password was not accepted. ${policyText} It must also not be one that has appeared in a data breach.`
    : `This password was not accepted because it is too weak. ${policyText}`;
}
