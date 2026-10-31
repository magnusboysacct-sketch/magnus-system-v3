// src/pages/hq/HQMfaGate.tsx — 2-step login (authenticator app) before Magnus HQ opens.
// First time: shows a QR code to scan. After that: asks for the 6-digit code.

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Btn, Card, Field, Input, Page, Spinner } from "../../components/ui";
import {
  getMfaState,
  startTotpEnrollment,
  verifyTotpCode,
  type TotpEnrollment,
} from "../../lib/hq/platformAdmin";

type Mode = "loading" | "verify" | "setup-intro" | "setup-scan";

export default function HQMfaGate({
  onVerified,
  onSignOut,
}: {
  onVerified: () => void | Promise<unknown>;
  onSignOut: () => void;
}) {
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMfaState()
      .then((s) => {
        if (!alive) return;
        if (s.verifiedFactorId) { setFactorId(s.verifiedFactorId); setMode("verify"); }
        else setMode("setup-intro");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setMode("setup-intro");
      });
    return () => { alive = false; };
  }, []);

  async function beginSetup() {
    setBusy(true); setError(null);
    try {
      const en = await startTotpEnrollment();
      setEnrollment(en);
      setFactorId(en.factorId);
      setMode("setup-scan");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    if (!factorId) return;
    if (!/^\d{6}$/.test(code.trim())) { setError("Type the 6 numbers from your authenticator app."); return; }
    setBusy(true); setError(null);
    try {
      await verifyTotpCode(factorId, code);
      await onVerified();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/invalid|expired/i.test(msg) ? "That code didn't work. Wait for a new code and try again." : msg);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page className="flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 dark:bg-white/10 text-white flex items-center justify-center mb-3">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Magnus HQ</h1>
          <p className="text-xs text-slate-500 mt-0.5">2-step login</p>
        </div>

        {mode === "loading" && <div className="flex justify-center py-6"><Spinner size={20} /></div>}

        {mode === "setup-intro" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              HQ needs a second step every time you sign in. Install an authenticator app on your phone
              (Google Authenticator, Microsoft Authenticator or Authy), then tap below to get your QR code.
            </p>
            <Btn variant="primary" size="md" className="w-full justify-center" onClick={beginSetup} disabled={busy}>
              {busy ? "Getting QR code..." : "Set up 2-step login"}
            </Btn>
          </div>
        )}

        {mode === "setup-scan" && enrollment && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400">1. In the app, tap <b>+</b> and scan this code.</p>
            <div className="flex justify-center">
              <img src={enrollment.qrCode} alt="QR code for your authenticator app" className="w-48 h-48 bg-white rounded-lg p-2 border border-slate-200" />
            </div>
            <p className="text-[10px] text-slate-500 text-center break-all">
              Can't scan? Type this key: <span className="font-mono select-all">{enrollment.secret}</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">2. Type the 6-digit code the app shows.</p>
          </div>
        )}

        {(mode === "verify" || mode === "setup-scan") && (
          <form className="space-y-3 mt-4" onSubmit={(e) => { e.preventDefault(); void submitCode(); }}>
            {mode === "verify" && (
              <p className="text-xs text-slate-600 dark:text-slate-400">Open your authenticator app and type the 6-digit code for Magnus HQ.</p>
            )}
            <Field label="Code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="text-center tracking-[0.4em] font-mono text-lg"
              />
            </Field>
            <Btn type="submit" variant="primary" size="md" className="w-full justify-center" disabled={busy || code.length !== 6}>
              {busy ? "Checking..." : "Open HQ"}
            </Btn>
          </form>
        )}

        {error && <Alert type="error" className="mt-4">{error}</Alert>}

        <button onClick={onSignOut} className="mt-5 w-full text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          Sign out
        </button>
      </Card>
    </Page>
  );
}
