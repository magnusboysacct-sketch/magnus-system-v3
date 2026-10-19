// src/pages/AuthConfirmPage.tsx
// /auth/confirm - the landing page of the links in Supabase's auth emails (see supabase/templates/README.md and src/lib/authConfirmCore.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { planConfirm } from "../lib/authConfirmCore";
import { clearPendingSignup, setWelcomeFlag } from "../lib/signupPending";

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const plan = useMemo(() => planConfirm(window.location.search), []);
  const [error, setError] = useState(plan.kind === "error" ? plan.message : "");
  // A one-time token can be used once: React StrictMode runs effects twice in development, so guard against a second verifyOtp.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (plan.kind === "forward") {
      navigate(plan.to, { replace: true });
      return;
    }
    if (plan.kind !== "verify") return;

    (async () => {
      const { error: err } = await supabase.auth.verifyOtp({ token_hash: plan.tokenHash, type: plan.type });
      if (err) {
        setError(err.message || "This link is invalid or has expired.");
        return;
      }
      if (plan.type === "signup") {
        // the signup link: land on the dashboard with a one-time welcome (WelcomeConfirmedBanner reads the flag)
        setWelcomeFlag();
        clearPendingSignup();
      }
      navigate(plan.next, { replace: true });
    })();
  }, [plan, navigate]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Magnus Boy&apos;s System</h1>

        {!error && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Confirming your link…
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            <p className="font-medium mb-1">Link expired or invalid</p>
            <p>{error}</p>
            <button onClick={() => navigate("/login")} className="mt-3 text-red-700 dark:text-red-400 underline text-sm">
              Go to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
