// src/pages/WorkerLoginPage.tsx — /worker: a worker signs in with their worker number and 6-digit PIN (no email, no Supabase login; see lib/workerPortalApi.ts).
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForceLightPage } from "../hooks/useForceLightPage";
import { clearWorkerToken, fetchHome, getWorkerToken, workerLogin } from "../lib/workerPortalApi";
import { isPinShape } from "../../supabase/functions/_shared/workerPortal";

export default function WorkerLoginPage() {
  useForceLightPage();
  const nav = useNavigate();
  const loc = useLocation();
  const ended = (loc.state as { ended?: boolean } | null)?.ended === true;
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // already signed in on this phone: go straight in
  useEffect(() => {
    const t = getWorkerToken();
    if (!t) { setChecking(false); return; }
    fetchHome(t)
      .then((h) => { if (h) nav("/worker/home", { replace: true }); else { clearWorkerToken(); setChecking(false); } })
      .catch(() => setChecking(false));
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!number.trim() || !isPinShape(pin)) { setErr("Enter your worker number and your 6-digit PIN."); return; }
    setBusy(true);
    const r = await workerLogin(number.trim(), pin);
    setBusy(false);
    if (!r.ok) { setPin(""); setErr(r.error || "Employee number or PIN is wrong."); return; }
    nav("/worker/home", { replace: true });
  }

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-lg">Loading…</div>;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 to-blue-50 text-slate-800">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Magnus Boy&apos;s System</h1>
        <p className="mt-1 text-lg text-slate-600">Worker portal</p>

        {ended && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">Please sign in again.</div>}

        <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
          <label className="block">
            <span className="block text-base font-semibold text-slate-700 mb-1.5">Worker number</span>
            <input
              value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="username" inputMode="text" placeholder="MBW-001"
              className="w-full min-h-[56px] rounded-xl border-2 border-slate-300 bg-white px-4 text-xl font-mono tracking-wide text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600"
            />
          </label>
          <label className="block">
            <span className="block text-base font-semibold text-slate-700 mb-1.5">PIN (6 digits)</span>
            <input
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="current-password" placeholder="••••••"
              className="w-full min-h-[56px] rounded-xl border-2 border-slate-300 bg-white px-4 text-2xl tracking-[0.4em] text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600"
            />
          </label>

          {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">{err}</div>}

          <button type="submit" disabled={busy} className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white text-xl font-semibold transition">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-base text-slate-500">Forgot your PIN? Ask the office to reset it.</p>
      </div>
    </div>
  );
}
