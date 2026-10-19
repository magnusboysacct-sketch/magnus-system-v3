// The password rules, shown under a password field. Ticks as the typed password meets each one (src/lib/passwordPolicy.ts).
import { passwordRules } from "../lib/passwordPolicy";

export default function PasswordRules({ password, className = "" }: { password: string; className?: string }) {
  const rules = passwordRules(password);
  return (
    <ul aria-label="Password rules" className={`mt-1.5 space-y-0.5 text-xs ${className}`}>
      {rules.map((r) => (
        <li key={r.id} className={r.met ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}>
          <span aria-hidden="true" className="inline-block w-4">{r.met ? "✓" : "•"}</span>
          {r.label}
          <span className="sr-only">{r.met ? " (done)" : " (needed)"}</span>
        </li>
      ))}
    </ul>
  );
}
