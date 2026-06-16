// src/pages/ClientLoginPage.tsx — Dedicated client login portal
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

async function hashPassword(p: string): Promise<string> {
  const data = new TextEncoder().encode(p + "magnus_portal_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function ClientLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login"|"setup"|null>(null);
  const [client, setClient] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [step, setStep] = useState<"email"|"password"|"forgot">("email");
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    supabase.from("company_settings").select("company_name,logo_url").limit(1).maybeSingle()
      .then(({data}) => setCompany(data));
  }, []);

  async function findClient() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      const {data} = await supabase.from("clients")
        .select("id,name,contact_name,email,portal_email,portal_password_hash,portal_activated_at,portal_enabled")
        .or(`email.eq.${email.trim()},portal_email.eq.${email.trim()}`)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (!data) { setError("No account found with that email. Contact your contractor."); setLoading(false); return; }
      setClient(data);
      setMode(data.portal_activated_at ? "login" : "setup");
      setStep("password");
    } catch { setError("Something went wrong. Please try again."); }
    setLoading(false);
  }

  async function handleSetup() {
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      const hash = await hashPassword(password);
      const tok = crypto.randomUUID();
      await supabase.from("clients").update({
        portal_email: email.trim(),
        portal_password_hash: hash,
        portal_activated_at: new Date().toISOString()
      }).eq("id", client.id);
      await supabase.from("client_portal_sessions").insert({
        client_id: client.id, session_token: tok,
        device_info: navigator.userAgent.slice(0, 200)
      });
      localStorage.setItem("portal_" + client.id, tok);
      localStorage.setItem("client_portal_client_id", client.id);
      nav("/client-portal/" + client.id);
    } catch { setError("Failed to set up account."); }
    setLoading(false);
  }

  async function handleLogin() {
    if (!password) { setError("Please enter your password."); return; }
    setLoading(true); setError("");
    try {
      const hash = await hashPassword(password);
      if (hash !== client.portal_password_hash) { setError("Incorrect password. Please try again."); setLoading(false); return; }
      const tok = crypto.randomUUID();
      await supabase.from("client_portal_sessions").insert({
        client_id: client.id, session_token: tok,
        device_info: navigator.userAgent.slice(0, 200)
      });
      localStorage.setItem("portal_" + client.id, tok);
      localStorage.setItem("client_portal_client_id", client.id);
      nav("/client-portal/" + client.id);
    } catch { setError("Login failed. Please try again."); }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      const {data} = await supabase.from("clients")
        .select("id,name,contact_name")
        .or(`email.eq.${email.trim()},portal_email.eq.${email.trim()}`)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (!data) { setError("No account found with that email."); setLoading(false); return; }
      await supabase.from("clients").update({
        portal_password_hash: null,
        portal_activated_at: null
      }).eq("id", data.id);
      setResetDone(true);
    } catch { setError("Something went wrong. Please try again."); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#080b10] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {company?.logo_url && (
            <img src={company.logo_url} className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2 border-white/10"/>
          )}
          <div className="text-lg font-bold text-slate-100">{company?.company_name || "Magnus Boys Construction"}</div>
          <div className="text-xs text-slate-500 mt-1">Client Portal</div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl p-6 space-y-4">

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">{error}</div>
          )}

          {step === "email" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-100">Sign in to your account</div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&findClient()}
                  placeholder="your@email.com" autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
              </div>
              <button onClick={findClient} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Looking up account…" : "Continue"}
              </button>
              <button onClick={()=>{setStep("forgot");setError("");}}
                className="w-full text-xs text-cyan-600 hover:text-cyan-400 transition text-center">
                Forgot password?
              </button>
            </div>
          )}

          {step === "password" && mode === "setup" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-100">Set up your account</div>
                <div className="text-xs text-slate-500 mt-1">{client?.contact_name || client?.name}</div>
              </div>
              <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-2 text-xs text-cyan-300">
                First time here! Create a password for your account.
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Min 6 characters" autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Confirm Password</label>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleSetup()}
                  placeholder="Repeat password"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
              </div>
              <button onClick={handleSetup} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Setting up…" : "Create Account & Sign In"}
              </button>
              <button onClick={()=>{setStep("email");setError("");}}
                className="w-full text-xs text-slate-600 hover:text-slate-400 transition text-center">
                Back
              </button>
            </div>
          )}

          {step === "password" && mode === "login" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-100">Welcome back</div>
                <div className="text-xs text-slate-500 mt-1">{client?.contact_name || client?.name}</div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                  placeholder="Your password" autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
              </div>
              <button onClick={handleLogin} disabled={loading}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition disabled:opacity-50">
                {loading ? "Signing in…" : "Sign In"}
              </button>
              <button onClick={()=>{setStep("forgot");setEmail(email);setError("");}}
                className="w-full text-xs text-cyan-600 hover:text-cyan-400 transition text-center">
                Forgot password?
              </button>
              <button onClick={()=>{setStep("email");setError("");}}
                className="w-full text-xs text-slate-600 hover:text-slate-400 transition text-center">
                Use different email
              </button>
            </div>
          )}

          {step === "forgot" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-sm font-bold text-slate-100">Reset Password</div>
              </div>
              {resetDone ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-3 text-xs text-emerald-300 text-center">
                    Password reset! You can now set a new password when you sign in.
                  </div>
                  <button onClick={()=>{setStep("email");setPassword("");setResetDone(false);setError("");}}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition">
                    Back to Login
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300">
                    Enter your email — your password will be cleared so you can create a new one.
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1.5">Email Address</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                      placeholder="your@email.com" autoFocus
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"/>
                  </div>
                  <button onClick={handleForgotPassword} disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition disabled:opacity-50">
                    {loading ? "Resetting…" : "Reset Password"}
                  </button>
                  <button onClick={()=>{setStep("email");setError("");}}
                    className="w-full text-xs text-slate-600 hover:text-slate-400 transition text-center">
                    Back to Login
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="text-center mt-6 text-[10px] text-slate-700">
          {company?.company_name} · Client Portal · Powered by Magnus ERP
        </div>
      </div>
    </div>
  );
}