// src/components/WorkerPortalAccessCard.tsx — "Portal access" on a worker's detail: give the worker access to the worker portal (/worker), reset their PIN, unlock, switch off / on.
// Director, admin and secretary only (the worker-portal-admin edge function checks the role and the company again, and so does the database).
// The temporary PIN is shown ONCE, right after it is made; it is stored only as a hash.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildWhatsAppUrl } from "../lib/portalShare";
import { buildWorkerPortalMessage } from "../lib/workerPortalMessage";
import { fmtDay } from "../lib/workerPortalApi";

interface PortalStatus {
  has_access: boolean; enabled?: boolean; must_change_pin?: boolean; locked?: boolean; needs_office_unlock?: boolean; failed_attempts?: number;
  last_login_at?: string | null; worker_active?: boolean; employee_id?: string | null;
}
interface IssuedPin { pin: string; employee_id: string; worker_name: string; worker_phone: string | null; company_name: string; portal_url: string }

async function callAdmin<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("worker-portal-admin", { body });
  if (!error) return { data: data as T, error: null };
  let message = "Something went wrong. Please try again.";
  try { const res = (error as { context?: Response }).context; if (res?.json) { const j = await res.clone().json(); if (j?.error) message = String(j.error); } } catch { /* generic */ }
  return { data: null, error: message };
}

export default function WorkerPortalAccessCard({ workerId, workerName }: { workerId: string; workerName: string }) {
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedPin | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const r = await callAdmin<{ status: PortalStatus }>({ action: "status", worker_id: workerId });
    if (r.error) { setErr(r.error); return; }
    setErr(null); setStatus(r.data?.status ?? null);
  }, [workerId]);
  useEffect(() => { setStatus(null); setIssued(null); void refresh(); }, [refresh]);

  async function issue(action: "grant" | "reset") {
    if (action === "reset" && !confirm(`Reset the PIN of ${workerName}? Their old PIN stops working and they are signed out.`)) return;
    setBusy(true); setErr(null);
    const r = await callAdmin<IssuedPin>({ action, worker_id: workerId });
    setBusy(false);
    if (r.error || !r.data) { setErr(r.error || "Could not create the PIN."); return; }
    setIssued(r.data); setCopied(false);
    void refresh();
  }
  async function simple(body: Record<string, unknown>) {
    setBusy(true); setErr(null);
    const r = await callAdmin<{ ok: boolean }>({ worker_id: workerId, ...body });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    void refresh();
  }

  const message = issued ? buildWorkerPortalMessage({ companyName: issued.company_name, employeeId: issued.employee_id, pin: issued.pin, url: issued.portal_url }) : "";
  const btn = "px-3 py-2 rounded-lg text-xs font-semibold border transition disabled:opacity-50";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-2" data-testid="worker-portal-access">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Portal access</div>
        {status?.has_access && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.enabled ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-slate-500/15 text-slate-500"}`}>{status.enabled ? "On" : "Off"}</span>}
      </div>

      {!status && !err && <div className="text-xs text-slate-500">Loading…</div>}
      {err && <div role="alert" className="text-xs text-red-600 dark:text-red-400">{err}</div>}

      {status && !status.has_access && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">{workerName} cannot use the worker portal yet. Giving access makes a temporary PIN; they choose their own at the first sign-in.</div>
          <button disabled={busy || status.worker_active === false || !status.employee_id} onClick={() => void issue("grant")} className={`${btn} border-cyan-600 bg-cyan-600 text-white hover:bg-cyan-500`}>{busy ? "Working…" : "Give portal access"}</button>
          {status.worker_active === false && <div className="text-[11px] text-amber-600">Only an active worker can have access.</div>}
        </div>
      )}

      {status?.has_access && (
        <div className="space-y-2">
          <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
            <div>Worker No: <span className="font-mono font-semibold">{status.employee_id}</span></div>
            <div>Last sign-in: {status.last_login_at ? fmtDay(status.last_login_at) : "never"}</div>
            {status.must_change_pin && <div className="text-amber-600">Has not chosen their own PIN yet.</div>}
            {status.locked && <div className="text-red-600">{status.needs_office_unlock ? "Locked after too many wrong tries: unlock to let them try again." : "Locked for a few minutes after wrong tries."}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void issue("reset")} className={`${btn} border-slate-300 dark:border-white/[0.15] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]`}>Reset PIN</button>
            {status.locked && <button disabled={busy} onClick={() => void simple({ action: "unlock" })} className={`${btn} border-amber-500 text-amber-600 hover:bg-amber-500/10`}>Unlock</button>}
            <button disabled={busy} onClick={() => void simple({ action: "set_enabled", enabled: !status.enabled })} className={`${btn} border-slate-300 dark:border-white/[0.15] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]`}>{status.enabled ? "Switch off" : "Switch on"}</button>
          </div>
        </div>
      )}

      {issued && (
        <div role="dialog" aria-label="Temporary PIN" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.1] p-5 shadow-2xl space-y-3">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">Temporary PIN for {issued.worker_name}</div>
            <div className="text-center rounded-xl bg-slate-100 dark:bg-white/[0.06] py-4">
              <div className="text-4xl font-mono font-bold tracking-[0.3em] text-slate-900 dark:text-white">{issued.pin}</div>
              <div className="mt-1 text-xs text-slate-500">Worker No: <span className="font-mono">{issued.employee_id}</span></div>
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400">This PIN is shown only now and cannot be looked up later. If it is lost, reset the PIN.</div>
            <pre className="whitespace-pre-wrap text-[11px] rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-2 text-slate-700 dark:text-slate-300">{message}</pre>
            <a href={buildWhatsAppUrl(issued.worker_phone, message)} target="_blank" rel="noopener noreferrer"
              className="block text-center rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold py-2.5">{issued.worker_phone ? "Send by WhatsApp" : "Send by WhatsApp (choose the contact)"}</a>
            <button onClick={() => { void navigator.clipboard?.writeText(message).then(() => setCopied(true)).catch(() => undefined); }} className="w-full rounded-lg border border-slate-300 dark:border-white/[0.15] text-sm font-semibold py-2 text-slate-700 dark:text-slate-200">{copied ? "Copied" : "Copy message"}</button>
            <button onClick={() => setIssued(null)} className="w-full rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-semibold py-2">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
