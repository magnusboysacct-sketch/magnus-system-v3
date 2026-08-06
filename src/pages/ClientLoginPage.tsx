// src/pages/ClientLoginPage.tsx — Dedicated client login portal (light theme)
//
// Lookup/setup/login all go through the client-portal-login edge function
// now, instead of querying `clients` directly with the anon key — that
// direct query used to select portal_password_hash into client-side state
// so it could be compared in the browser, which meant the hash was
// readable by anyone who could read the network response, independent of
// any RLS row-level policy (RLS can't restrict columns). The edge function
// does the lookup and the hash comparison server-side with the service-role
// key and only ever returns a session token — see
// supabase/functions/client-portal-login/index.ts.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ClientLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login"|"setup"|null>(null);
  const [client, setClient] = useState<{displayName: string}|null>(null);
  const [company, setCompany] = useState<any>(null);
  const [step, setStep] = useState<"email"|"password"|"forgot">("email");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.from("company_settings").select("company_name,logo_url").limit(1).maybeSingle()
      .then(({data}) => setCompany(data));
  }, []);

  async function findClient() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-portal-login",
        { body: { action: "lookup", email: email.trim() } }
      );
      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "No account found with that email. Contact your contractor.");
        setLoading(false);
        return;
      }
      setClient({ displayName: data.displayName });
      setMode(data.mode);
      setStep("password");
    } catch { setError("Something went wrong. Please try again."); }
    setLoading(false);
  }

  async function handleSetup() {
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-portal-login",
        { body: { action: "setup", email: email.trim(), password } }
      );
      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "Failed to set up account.");
        setLoading(false);
        return;
      }
      nav("/client-portal/session/" + data.sessionToken);
    } catch { setError("Failed to set up account."); }
    setLoading(false);
  }

  async function handleLogin() {
    if (!password) { setError("Please enter your password."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-portal-login",
        { body: { action: "login", email: email.trim(), password } }
      );
      if (invokeError || data?.error) {
        setError(data?.error || invokeError?.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }
      nav("/client-portal/session/" + data.sessionToken);
    } catch { setError("Login failed. Please try again."); }
    setLoading(false);
  }

  // Forgot password now sends a real, verified reset link via email
  // instead of immediately clearing the password hash. The password
  // stays valid until the client actually clicks the emailed link and
  // sets a new one, closing the no-verification gap from before.
  async function handleForgotPassword() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "client-password-reset",
        { body: { action: "request", email: email.trim() } }
      );

      if (invokeError) {
        setError(invokeError.message || "Failed to send reset email.");
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(String(data.error));
        setLoading(false);
        return;
      }

      setResetSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {company?.logo_url && (
            <img src={company.logo_url} className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2 border-slate-200"/>
          )}
          <div className="text-lg font-bold text-slate-900">{company?.company_name || "Magnus Boys Construction"}</div>
          <div className="text-xs text-slate-500 mt-1">Client Portal</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-6 space-y-4">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {step === "email" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-900">Sign in to your account</div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&findClient()}
                  placeholder="your@email.com" autoFocus
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"/>
              </div>
              <button onClick={findClient} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Looking up account…" : "Continue"}
              </button>
              <button onClick={()=>{setStep("forgot");setError("");setResetSent(false);}}
                className="w-full text-xs text-cyan-700 hover:text-cyan-800 transition text-center">
                Forgot password?
              </button>
            </div>
          )}

          {step === "password" && mode === "setup" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-900">Set up your account</div>
                <div className="text-xs text-slate-500 mt-1">{client?.displayName}</div>
              </div>
              <div className="rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2 text-xs text-cyan-800">
                First time here! Create a password for your account.
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Min 6 characters" autoFocus
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Confirm Password</label>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleSetup()}
                  placeholder="Repeat password"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"/>
              </div>
              <button onClick={handleSetup} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Setting up…" : "Create Account & Sign In"}
              </button>
              <button onClick={()=>{setStep("email");setError("");}}
                className="w-full text-xs text-slate-500 hover:text-slate-700 transition text-center">
                Back
              </button>
            </div>
          )}

          {step === "password" && mode === "login" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-900">Welcome back</div>
                <div className="text-xs text-slate-500 mt-1">{client?.displayName}</div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                  placeholder="Your password" autoFocus
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"/>
              </div>
              <button onClick={handleLogin} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Signing in…" : "Sign In"}
              </button>
              <button onClick={()=>{setStep("forgot");setEmail(email);setError("");setResetSent(false);}}
                className="w-full text-xs text-cyan-700 hover:text-cyan-800 transition text-center">
                Forgot password?
              </button>
              <button onClick={()=>{setStep("email");setError("");}}
                className="w-full text-xs text-slate-500 hover:text-slate-700 transition text-center">
                Use different email
              </button>
            </div>
          )}

          {step === "forgot" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-900">Reset Password</div>
              </div>
              {resetSent ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-xs text-emerald-700 text-center">
                    If an account exists for that email, a reset link has been sent. Check your inbox and click the link to set a new password.
                  </div>
                  <button onClick={()=>{setStep("email");setPassword("");setResetSent(false);setError("");}}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-sm transition">
                    Back to Login
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    Enter your email — we'll send you a link to set a new password. Your current password keeps working until you do.
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&handleForgotPassword()}
                      placeholder="your@email.com" autoFocus
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"/>
                  </div>
                  <button onClick={handleForgotPassword} disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition disabled:opacity-50">
                    {loading ? "Sending…" : "Send Reset Link"}
                  </button>
                  <button onClick={()=>{setStep("email");setError("");}}
                    className="w-full text-xs text-slate-500 hover:text-slate-700 transition text-center">
                    Back to Login
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="text-center mt-6 text-[10px] text-slate-400">
          {company?.company_name} · Client Portal · Powered by Magnus ERP
        </div>
      </div>
    </div>
  );
}
