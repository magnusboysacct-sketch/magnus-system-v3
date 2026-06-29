// src/pages/ClientResetPasswordPage.tsx — light-themed reset confirmation page
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ClientResetPasswordPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();

  const token = params.get("token") || "";
  const email = params.get("email") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [linkValid, setLinkValid] = useState(true);

  useEffect(() => {
    if (!token || !email) {
      setLinkValid(false);
    }
  }, [token, email]);

  async function handleSubmit() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-password-reset",
        {
          body: { action: "confirm", email, token, newPassword: password },
        }
      );

      if (invokeError) {
        setError(invokeError.message || "Failed to reset password.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(String(data.error));
        setLoading(false);
        return;
      }

      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-6 space-y-4">
          <div className="text-center">
            <div className="text-lg font-bold text-slate-900">Reset your password</div>
            <div className="text-xs text-slate-500 mt-1">Enter a new password for your account.</div>
          </div>

          {!linkValid && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-3 text-sm">
              <div className="font-semibold text-red-700">Link expired or invalid</div>
              <div className="text-red-600 mt-1">
                This reset link is missing required information. Please request a new one.
              </div>
              <a
                href="/client-login"
                className="text-cyan-700 underline text-xs mt-2 inline-block"
              >
                Go back to login
              </a>
            </div>
          )}

          {linkValid && !done && (
            <div className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  autoFocus
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Repeat password"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition disabled:opacity-50"
              >
                {loading ? "Updating…" : "Set password and continue"}
              </button>
            </div>
          )}

          {done && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-sm text-emerald-700 text-center">
                Password updated successfully. You can now sign in.
              </div>
              <button
                onClick={() => nav("/client-login")}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
