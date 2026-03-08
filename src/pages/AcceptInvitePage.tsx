// src/pages/AcceptInvitePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AcceptInvitePage() {
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get("token_hash") || "";
  const type = (params.get("type") || "invite") as "invite" | "signup" | "recovery" | "email";
  const next = params.get("next") || "/";

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;

    async function run() {
      if (!tokenHash) {
        setVerifyError("Invite link is missing token_hash.");
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (!active) return;

      if (error) {
        setVerifyError(error.message || "Invite verification failed.");
        setVerified(false);
      } else {
        setVerified(true);
      }

      setVerifying(false);
    }

    run();

    return () => {
      active = false;
    };
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

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      setSaveError(error.message || "Failed to set password.");
      return;
    }

    navigate(next, { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Accept Invite</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set your password to activate your account.
        </p>

        {verifying ? (
          <div className="mt-6 text-sm text-slate-700">Verifying invite…</div>
        ) : verifyError ? (
          <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {verifyError}
          </div>
        ) : verified ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>

            {saveError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {saveError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Set password and continue"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}