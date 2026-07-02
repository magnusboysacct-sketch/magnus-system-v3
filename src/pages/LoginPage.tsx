import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const MAGNUS_BRAND = {
  company_name: "Magnus Boys",
  logo_url: "/app-logo-round.svg",
};

type Mode = "signin" | "signup";

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);




  const [fullName, setFullName] = useState("");

  async function handleForgotPassword() {
    if (!resetEmail.trim()) { setErr("Please enter your email address."); return; }
    setResetLoading(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("request-password-reset", {
      body: { email: resetEmail.trim() },
    });
    if (error) {
      setErr(error.message || "Failed to send reset email.");
    } else if (data?.error) {
      setErr(String(data.error));
    } else {
      setResetSent(true);
    }
    setResetLoading(false);
  }
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);


  function switchMode(newMode: Mode) {
    setMode(newMode);
    setErr(null);
    setSuccess(null);
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        console.log("signInWithPassword result:", {
          ok: !!data?.session,
          error: error ? { message: error.message, status: (error as any).status } : null
        });

        if (error) {
          if (error.message.toLowerCase().includes('invalid') && error.message.toLowerCase().includes('credentials')) {
            setErr("Invalid email/password. Check your credentials and try again.");
          } else {
            setErr(error.message);
          }
          return;
        }

        const next = new URLSearchParams(loc.search).get("next") || "/";
        nav(next, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              company_name: companyName.trim(),
            },
          },
        });

        console.log("signUp result:", {
          ok: !!data?.user,
          error: error ? { message: error.message } : null
        });

        if (error) {
          setErr(error.message);
          return;
        }

        if (data?.user) {
          setSuccess("Account created successfully! You can now sign in.");
          setEmail("");
          setPassword("");
          setFullName("");
          setCompanyName("");
          setTimeout(() => {
            setMode("signin");
            setSuccess(null);
          }, 2000);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b1220] text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img
              src={MAGNUS_BRAND.logo_url}
              alt="Magnus Boys Construction"
              className="h-14 w-14 rounded-full object-cover"
            />

            <div>
              <div className="text-lg font-semibold">
                {MAGNUS_BRAND.company_name}
              </div>
              <div className="text-xs opacity-70">
                {mode === "signin" ? "Sign in to continue" : "Create your account"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-white/10">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 py-3 text-sm transition ${
              mode === "signin"
                ? "bg-white/10 border-b-2 border-white/30 font-medium"
                : "opacity-70 hover:opacity-100 hover:bg-white/5"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-3 text-sm transition ${
              mode === "signup"
                ? "bg-white/10 border-b-2 border-white/30 font-medium"
                : "opacity-70 hover:opacity-100 hover:bg-white/5"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={onSubmit}>
          {mode === "signup" && (
            <>
              <div>
                <div className="text-xs opacity-70 mb-1">Full Name</div>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Company Name</div>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="Your Company Ltd."
                  autoComplete="organization"
                />
              </div>
            </>
          )}

          <div>
            <div className="text-xs opacity-70 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {err && (
            <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/20 rounded-md px-3 py-2">
              {err}
            </div>
          )}

          {success && (
            <div className="text-sm text-green-300 bg-green-900/20 border border-green-500/20 rounded-md px-3 py-2">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={
              busy ||
              !email.trim() ||
              !password ||
              (mode === "signup" && (!fullName.trim() || !companyName.trim()))
            }
            className="w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
          >
            {busy
              ? mode === "signin"
                ? "Signing in..."
                : "Creating account..."
              : mode === "signin"
              ? "Sign In"
              : "Sign Up"}
          </button>
          {mode === "signin" && (
            <div className="mt-4 pt-4 border-t border-white/10 text-center space-y-2">
              <button type="button" onClick={()=>{setShowForgot(true);setResetEmail(email);setErr(null);}} className="text-xs text-cyan-400 hover:text-cyan-300 underline block w-full">Forgot password?</button>
              <p className="text-xs opacity-60">

                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="underline hover:opacity-80"
                >
                  Sign up here
                </button>
              </p>
            </div>
          )}

          {mode === "signup" && (
            <div className="mt-4 pt-4 border-t border-white/10 text-center">
              <p className="text-xs opacity-60">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="underline hover:opacity-80"
                >
                  Sign in here
                </button>
              </p>
            </div>
          )}
        </form>
      </div>
      {showForgot && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-sm font-bold text-slate-100 mb-1">Reset Password</div>
            <div className="text-xs text-slate-500 mb-4">Enter your email and we will send you a reset link.</div>
            {resetSent ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-3 text-xs text-emerald-300 text-center">Reset email sent! Check your inbox.</div>
                <button onClick={()=>{setShowForgot(false);setResetSent(false);}} className="w-full py-2 rounded-lg bg-white/10 text-sm text-white transition">Close</button>
              </div>
            ) : (
              <div className="space-y-3">
                <input type="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="your@email.com" autoFocus className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none text-white"/>
                <button onClick={handleForgotPassword} disabled={resetLoading} className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition disabled:opacity-50">{resetLoading ? "Sending..." : "Send Reset Link"}</button>
                <button onClick={()=>{setShowForgot(false);setErr(null);}} className="w-full py-2 rounded-lg bg-white/5 text-slate-400 text-xs transition">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
