// src/pages/hq/HQCompanyFeatures.tsx — one company's own feature switches (OFF only: a company can never get a feature
// its plan or the platform doesn't allow). Shown inside a company's details on the Companies tab.

import { useEffect, useState } from "react";
import { Alert, Btn, Field, Input, Spinner } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchCompanyFeatures, saveCompanyFeatures, type CompanyFeatureInfo } from "../../lib/hq/platformAdmin";
import { FEATURE_NAMES, type FeatureKey } from "../../lib/platformSettings";

export default function HQCompanyFeatures({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<CompanyFeatureInfo | null>(null);
  const [off, setOff] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCompanyFeatures().then((all) => {
      if (!alive) return;
      const i = all[companyId] ?? { off: [], effective: {} };
      setInfo(i); setOff(i.off ?? []);
    }, (e: unknown) => { if (alive) setMsg({ type: "error", text: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [companyId]);

  if (!info) return msg ? <Alert type="error">{msg.text}</Alert> : <div className="flex justify-center py-3"><Spinner size={16} /></div>;
  const changed = [...off].sort().join() !== [...(info.off ?? [])].sort().join();

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">This company&apos;s features</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(Object.keys(FEATURE_NAMES) as FeatureKey[]).map((k) => {
          const switchedOff = off.includes(k);
          const allowed = info.effective[k] !== false || (info.off ?? []).includes(k);   // on before this company switched it off
          return (
            <label key={k} className={cn("flex items-center gap-2 text-xs rounded-lg border px-2.5 py-1.5", !allowed && "opacity-50",
              "border-slate-200 dark:border-white/10")}>
              <input type="checkbox" disabled={!allowed} checked={allowed && !switchedOff}
                onChange={(e) => setOff((xs) => e.target.checked ? xs.filter((x) => x !== k) : [...xs, k])} />
              <span className="flex-1">{FEATURE_NAMES[k]}</span>
              {!allowed && <span className="text-[10px] text-slate-500">not in plan / platform off</span>}
            </label>
          );
        })}
      </div>
      {changed && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]"><Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. owner asked to hide payroll" /></Field></div>
          <Btn variant="primary" disabled={busy || reason.trim().length < 3} onClick={async () => {
            setBusy(true); setMsg(null);
            try {
              await saveCompanyFeatures(companyId, off, reason.trim());
              setInfo({ ...info, off }); setReason("");
              setMsg({ type: "success", text: "Saved." });
            } catch (e: unknown) { setMsg({ type: "error", text: e instanceof Error ? e.message : String(e) }); }
            finally { setBusy(false); }
          }}>Save features</Btn>
        </div>
      )}
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
    </div>
  );
}
