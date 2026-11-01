// src/pages/hq/HQLiveHealth.tsx — top of the Health tab: the same checks /api/health uses (with numbers),
// the control-room switch for a computer that stays open, and the plan's space limits.

import { useCallback, useEffect, useState } from "react";
import { BellRing, CircleAlert, CircleCheck, Radio, RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, Btn, Card, CardHeader, Field, Input, Modal, Spinner } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchHealth, saveLimits, type HQHealth, type Level } from "../../lib/hq/platformAdmin";
import { askNotificationPermission, testAlert, useControlRoom } from "./controlRoom";

const ICON: Record<Level, React.ReactNode> = {
  ok: <CircleCheck size={15} className="text-emerald-500" />,
  warn: <TriangleAlert size={15} className="text-amber-500" />,
  problem: <CircleAlert size={15} className="text-red-500" />,
};

function mb(bytes?: number) {
  if (bytes == null) return "";
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function HQLiveHealth({ isOwner, controlRoom, onControlRoom }: {
  isOwner: boolean; controlRoom: boolean; onControlRoom: (on: boolean) => void;
}) {
  const [h, setH] = useState<HQHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { setH(await fetchHealth()); setError(null); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useControlRoom(controlRoom, setH);

  async function toggleControlRoom() {
    if (!controlRoom) {
      const p = await askNotificationPermission();
      setNotice(p === "granted" ? null : "Browser notifications are blocked. Sound and voice still work; allow notifications for this site to get pop-ups too.");
    }
    onControlRoom(!controlRoom);
  }

  return (
    <Card padding={false}>
      <div className="p-4 pb-2">
        <CardHeader
          title="Platform health"
          subtitle={h ? `Checked ${new Date(h.checked_at).toLocaleTimeString("en-JM", { timeStyle: "short" })} · the same checks UptimeRobot sees at /api/health` : "Checking..."}
          action={<Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Check now</Btn>}
        />
      </div>
      {error && <div className="px-4 pb-3"><Alert type="error">{error}</Alert></div>}
      {!h ? <div className="flex justify-center py-8"><Spinner /></div> : (
        <div className="border-t border-slate-100 dark:border-white/[0.04]">
          {h.checks.map((c) => (
            <div key={c.key} className={cn("flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.04] border-l-4",
              c.level === "problem" ? "border-l-red-500" : c.level === "warn" ? "border-l-amber-400" : "border-l-emerald-400")}>
              {ICON[c.level]}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-800 dark:text-slate-200">{c.label}</div>
                <div className="text-[11px] text-slate-500">
                  {c.text}{c.used_bytes != null && c.limit_mb != null ? ` · ${mb(c.used_bytes)} of ${c.limit_mb >= 1024 ? `${c.limit_mb / 1024} GB` : `${c.limit_mb} MB`}` : ""}
                </div>
              </div>
              {c.pct != null && (
                <div className="w-24 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div className={cn("h-full", c.pct >= 90 ? "bg-red-500" : c.pct >= 70 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${Math.min(100, c.pct)}%` }} />
                </div>
              )}
            </div>
          ))}
          <div className="px-4 py-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
            Space limits: {h.limits?.plan ?? "Supabase"} ({h.limits?.db_mb} MB database, {h.limits?.storage_mb} MB files). Gold at 70%, red at 90%.
            {isOwner && <button className="underline" onClick={() => setLimitsOpen(true)}>Change</button>}
          </div>
        </div>
      )}

      <div className="p-4 border-t border-slate-100 dark:border-white/[0.04] flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="text-sm font-medium flex items-center gap-1.5"><Radio size={14} className={controlRoom ? "text-red-500 animate-pulse" : "text-slate-400"} /> Control room mode</div>
          <div className="text-[11px] text-slate-500">
            For a computer that stays open: checks every minute. A new problem plays 3 beeps and a voice reads it; a warning plays 1 beep.
            {controlRoom && " Auto sign-out is paused while it's on (it switches itself off after 12 hours)."}
          </div>
        </div>
        <Btn icon={<BellRing size={13} />} onClick={() => { void askNotificationPermission().then(testAlert); }}>Test alert</Btn>
        <Btn variant={controlRoom ? "danger" : "primary"} onClick={() => { void toggleControlRoom(); }}>{controlRoom ? "Turn off" : "Turn on"}</Btn>
        {notice && <div className="w-full"><Alert type="warning" onClose={() => setNotice(null)}>{notice}</Alert></div>}
      </div>

      {limitsOpen && h?.limits && <LimitsModal limits={h.limits} onClose={() => setLimitsOpen(false)} onSaved={() => { setLimitsOpen(false); void load(); }} />}
    </Card>
  );
}

function LimitsModal({ limits, onClose, onSaved }: { limits: NonNullable<HQHealth["limits"]>; onClose: () => void; onSaved: () => void }) {
  const [db, setDb] = useState(String(limits.db_mb));
  const [st, setSt] = useState(String(limits.storage_mb));
  const [plan, setPlan] = useState(limits.plan ?? "Supabase Free");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Space limits" subtitle="What your Supabase plan includes">
      <div className="space-y-3">
        <p className="text-[11px] text-slate-500">Supabase Free: 500 MB database, 1024 MB files. Supabase Pro: 8192 MB database, 102400 MB files.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Database (MB)"><Input type="number" value={db} onChange={(e) => setDb(e.target.value)} /></Field>
          <Field label="Files (MB)"><Input type="number" value={st} onChange={(e) => setSt(e.target.value)} /></Field>
        </div>
        <Field label="Plan name"><Input value={plan} onChange={(e) => setPlan(e.target.value)} /></Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. upgraded to Pro" /></Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy || reason.trim().length < 3} onClick={async () => {
            setBusy(true); setError(null);
            try { await saveLimits(Number(db), Number(st), plan, reason.trim()); onSaved(); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
          }}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
