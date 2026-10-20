import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { passwordErrorMessage, validatePassword } from "../lib/passwordPolicy";
import PasswordRules from "../components/PasswordRules";
import { CheckYourEmail, EmailNotConfirmedPanel } from "../components/CheckYourEmail";
import {
  clearPendingSignup, isEmailNotConfirmed, isExistingAccountSignup, readPendingSignup, savePendingSignup, setWelcomeFlag,
  type PendingSignup,
} from "../lib/signupPending";

type Mode = "signin" | "signup";

const REMEMBERED_EMAIL_KEY = "magnus_remembered_email";
function readRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => !!readRememberedEmail());
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

  // Signed up, waiting for the person to click the link in the email. Kept in sessionStorage so a refresh does not lose it.
  const [pending, setPending] = useState<PendingSignup | null>(() => readPendingSignup());
  const [showPending, setShowPending] = useState(() => readPendingSignup() !== null);
  // Tried to sign in before confirming the email.
  const [notConfirmed, setNotConfirmed] = useState<PendingSignup | null>(null);

  // The email link was opened in another tab of this browser: this tab is signed in too, so move on.
  // Only when nobody was signed in to begin with, and only for the address that signed up (a leftover session of someone else must not count).
  const pendingEmail = showPending && pending ? pending.email.trim().toLowerCase() : "";
  useEffect(() => {
    if (!pendingEmail) return;
    let alive = true;
    let sub: { unsubscribe: () => void } | null = null;
    supabase.auth.getSession().then(({ data: current }) => {
      if (!alive || current.session) return;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session && (session.user.email ?? "").toLowerCase() === pendingEmail) {
          clearPendingSignup();
          setWelcomeFlag();
          nav("/", { replace: true });
        }
      });
      sub = data.subscription;
    });
    return () => { alive = false; sub?.unsubscribe(); };
  }, [pendingEmail, nav]);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setErr(null);
    setSuccess(null);
    setNotConfirmed(null);
  }

  function pendingSent(sentAt: number) {
    if (!pending) return;
    const next = { ...pending, lastSentAt: sentAt };
    setPending(next);
    savePendingSignup(next);
  }


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setNotConfirmed(null);
    if (mode === "signup") {
      const weak = validatePassword(password);
      if (weak) { setErr(weak); return; }
    }
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
          if (isEmailNotConfirmed(error)) {
            // an inline panel (not an error line) with the way forward: resend the link
            const mine = readPendingSignup();
            const same = mine && mine.email.trim().toLowerCase() === email.trim().toLowerCase();
            setNotConfirmed({ email: email.trim(), lastSentAt: same ? mine.lastSentAt : 0 });
            return;
          }
          if (error.message.toLowerCase().includes('invalid') && error.message.toLowerCase().includes('credentials')) {
            setErr("Invalid email/password. Check your credentials and try again.");
          } else {
            setErr(error.message);
          }
          return;
        }

        // Local convenience only — never touches the auth call above. A failure here (storage unavailable
        // or blocked) must not stop the user from signing in.
        try {
          if (rememberEmail) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
          else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        } catch {
          // remembering is a convenience only
        }

        clearPendingSignup();
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
          setErr(passwordErrorMessage(error) || error.message);
          return;
        }

        if (isExistingAccountSignup(data)) {
          // Supabase pretends it worked, but nothing is emailed: do not send the person to wait for a message that will not come
          setErr("An account with this email already exists. Sign in instead, or use \"Forgot password?\" if you do not remember the password.");
          return;
        }

        if (data?.user && !data.session) {
          // Email confirmation is on: no session until the link in the email is used. Show the full "check your email" step, which stays until the person acts.
          const p = { email: email.trim(), lastSentAt: Date.now() };
          setPending(p);
          savePendingSignup(p);
          setShowPending(true);
          return;
        }

        if (data?.user) {
          // signed up and already signed in (email confirmation is off)
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div>
            {/* One combined graphic (round badge + "Magnus Boy's ERP System" wordmark), ~4:1 — natural proportions, capped at 56px high */}
            <img
              src="/login-header_icon-and-name.svg"
              alt="Magnus Boy's ERP System"
              className="block h-auto w-auto max-h-14 max-w-full object-contain"
            />
            <div className="text-xs text-slate-500 mt-2">
              {showPending && pending ? "Almost there" : mode === "signin" ? "Sign in to continue" : "Create your account"}
            </div>
          </div>
        </div>

        {showPending && pending ? (
          <CheckYourEmail
            email={pending.email}
            lastSentAt={pending.lastSentAt}
            onSent={pendingSent}
            onBack={() => {
              // back to the signup form with everything typed so far kept
              clearPendingSignup();
              setPending(null);
              setShowPending(false);
              setEmail(pending.email);
              setMode("signup");
              setErr(null);
            }}
            onConfirmed={() => {
              // only now the sign-in form, with the email filled in (the pending note is cleared once the sign-in works)
              setShowPending(false);
              setEmail(pending.email);
              setMode("signin");
              setErr(null);
            }}
          />
        ) : (
        <>
        <div className="flex border-b border-slate-100">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 py-3 text-sm transition ${
              mode === "signin"
                ? "bg-slate-50 border-b-2 border-blue-500 font-medium text-slate-800"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-3 text-sm transition ${
              mode === "signup"
                ? "bg-slate-50 border-b-2 border-blue-500 font-medium text-slate-800"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form className="p-6 space-y-4" onSubmit={onSubmit}>
          {mode === "signup" && (
            <>
              <div>
                <div className="text-xs text-slate-500 mb-1">Full Name</div>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50"
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Company Name</div>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50"
                  placeholder="Your Company Ltd."
                  autoComplete="organization"
                />
              </div>
            </>
          )}

          <div>
            <div className="text-xs text-slate-500 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50"
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
            {mode === "signup" && <PasswordRules password={password} />}
          </div>

          {mode === "signin" && (
            <div className="flex items-center gap-2">
              <input
                id="remember-email"
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500/30"
              />
              <label htmlFor="remember-email" className="text-xs text-slate-500">
                Remember my email on this device
              </label>
            </div>
          )}

          {notConfirmed && (
            <EmailNotConfirmedPanel
              email={notConfirmed.email}
              lastSentAt={notConfirmed.lastSentAt}
              onSent={(t) => {
                setNotConfirmed({ ...notConfirmed, lastSentAt: t });
                const mine = readPendingSignup();
                if (mine && mine.email.trim().toLowerCase() === notConfirmed.email.toLowerCase()) savePendingSignup({ ...mine, lastSentAt: t });
              }}
            />
          )}

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {err}
            </div>
          )}

          {success && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
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
            className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-500 text-white rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50"
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
            <div className="mt-4 pt-4 border-t border-slate-100 text-center space-y-2">
              <button type="button" onClick={()=>{setShowForgot(true);setResetEmail(email);setErr(null);}} className="text-xs text-blue-600 hover:text-blue-700 underline block w-full">Forgot password?</button>
              <p className="text-xs text-slate-500">

                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="underline hover:text-slate-700"
                >
                  Sign up here
                </button>
              </p>
            </div>
          )}

          {mode === "signup" && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className="underline hover:text-slate-700"
                >
                  Sign in here
                </button>
              </p>
            </div>
          )}
        </form>
        {/* a worker who lands here (the staff sign-in) finds the way to the worker portal */}
        <div className="px-6 pb-6">
          <button type="button" onClick={() => nav("/worker")} className="w-full min-h-[48px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition">
            Worker? Sign in here
          </button>
        </div>
        </>
        )}
      </div>
      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-sm font-bold text-slate-800 mb-1">Reset Password</div>
            <div className="text-xs text-slate-500 mb-4">Enter your email and we will send you a reset link.</div>
            {resetSent ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-xs text-emerald-700 text-center">Reset email sent! Check your inbox.</div>
                <button onClick={()=>{setShowForgot(false);setResetSent(false);}} className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm text-slate-700 transition">Close</button>
              </div>
            ) : (
              <div className="space-y-3">
                <input type="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} placeholder="your@email.com" autoFocus className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm outline-none text-slate-800 placeholder-slate-400"/>
                <button onClick={handleForgotPassword} disabled={resetLoading} className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition disabled:opacity-50">{resetLoading ? "Sending..." : "Send Reset Link"}</button>
                <button onClick={()=>{setShowForgot(false);setErr(null);}} className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs transition">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
