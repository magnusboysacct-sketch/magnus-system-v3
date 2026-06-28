// src/pages/ResetPasswordPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get("token_hash") || "";
  // Supabase sends type=recovery for password reset emails
  const type = (params.get("type") || "recovery") as "recovery" | "email";

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function run() {
      if (!tokenHash) {
        setVerifyError("Reset link is invalid or has expired. Please request a new one.");
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

      if (!active) return;

      if (error) {
        setVerifyError(error.message || "Reset link is invalid or has expired.");
      } else {
        setVerified(true);
      }
      setVerifying(false);
    }

    run();
    return () => { active = false; };
  }, [tokenHash, type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");

    if (!password || password.length < 6) {
      setSaveError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setSaveError(error.message || "Failed to update password. Please try again.");
      return;
    }

    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 2500);
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter a new password for your account.
          </p>
        </div>

        {verifying && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Verifying link…
          </div>
        )}

        {!verifying && verifyError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
            <p className="font-medium mb-1">Link expired or invalid</p>
            <p>{verifyError}</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-3 text-red-700 dark:text-red-400 underline text-sm"
            >
              Go back to login
            </button>
          </div>
        )}

        {!verifying && verified && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Min. 6 characters"
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Repeat password"
                autoComplete="new-password"
              />
            </div>

            {saveError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {saveError}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 dark:bg-blue-600 text-white py-2.5 font-medium hover:bg-slate-800 dark:hover:bg-blue-500 disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        {done && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-400">
            <p className="font-medium">Password updated!</p>
            <p className="mt-1">Redirecting you to the dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}
