// src/pages/hq/HQHealthTab.tsx — Magnus HQ Health tab.
// Step 2: the built-in security scan (RLS off, missing policies, "true" policies, unsafe functions).
// Red = PROBLEM, gold = warning, grey = OK on purpose (with the reason). Step 6 adds live service health here.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, Btn, Card, CardHeader, Spinner } from "../../components/ui";
import { cn } from "../../lib/theme";
import { runSecurityScan, type ScanKind, type SecurityFinding } from "../../lib/hq/platformAdmin";
import HQLiveHealth from "./HQLiveHealth";

const KIND_LABEL: Record<ScanKind, string> = {
  rls_off: "RLS off",
  no_policies: "No policies",
  true_policy: "Open policy",
  definer_search_path: "Unsafe function",
  no_company_guard: "No pause guard",
};

function FindingRow({ f }: { f: SecurityFinding }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 border-l-4 border-b border-b-slate-100 dark:border-b-white/[0.04]",
        f.level === "problem" && "border-l-red-500 bg-red-50/60 dark:bg-red-500/[0.06]",
        f.level === "warn" && "border-l-amber-400 bg-amber-50/60 dark:bg-amber-400/[0.05]",
        f.level === "ok" && "border-l-slate-200 dark:border-l-white/10",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide w-24",
          f.level === "problem" && "text-red-600 dark:text-red-400",
          f.level === "warn" && "text-amber-600 dark:text-amber-400",
          f.level === "ok" && "text-slate-400",
        )}
      >
        {KIND_LABEL[f.kind] ?? f.kind}
      </span>
      <div className="min-w-0">
        <div className={cn("text-xs font-mono break-all", f.level === "ok" ? "text-slate-500" : "text-slate-800 dark:text-slate-200")}>{f.object}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{f.detail}</div>
      </div>
    </div>
  );
}

export default function HQHealthTab({ isOwner, controlRoom, onControlRoom }: {
  isOwner: boolean; controlRoom: boolean; onControlRoom: (on: boolean) => void;
}) {
  const [rows, setRows] = useState<SecurityFinding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [showOk, setShowOk] = useState(false);

  const scan = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      setRows(await runSecurityScan());
      setCheckedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  const problems = rows?.filter((r) => r.level === "problem") ?? [];
  const warnings = rows?.filter((r) => r.level === "warn") ?? [];
  const okOnPurpose = rows?.filter((r) => r.level === "ok") ?? [];

  return (
    <div className="space-y-4">
      <HQLiveHealth isOwner={isOwner} controlRoom={controlRoom} onControlRoom={onControlRoom} />
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card padding={false}>
        <div className="p-4 pb-0">
          <CardHeader
            title="Security check"
            subtitle={checkedAt ? `Checked ${checkedAt.toLocaleTimeString("en-JM", { timeStyle: "short" })}` : "Checking the database..."}
            action={<Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void scan(); }} disabled={busy}>Check again</Btn>}
          />
        </div>

        {rows === null ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 px-4 pb-4">
              <div className="rounded-lg border border-red-200 dark:border-red-500/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400 font-semibold">Problems</div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">{problems.length}</div>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-400/20 p-3">
                <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold">Warnings</div>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{warnings.length}</div>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">OK on purpose</div>
                <div className="text-xl font-bold text-slate-600 dark:text-slate-300">{okOnPurpose.length}</div>
              </div>
            </div>

            {problems.length === 0 && warnings.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 border-t border-slate-100 dark:border-white/[0.04] text-sm text-emerald-700 dark:text-emerald-400">
                <ShieldCheck size={16} /> All clear: every table is protected.
              </div>
            ) : (
              <div className="border-t border-slate-100 dark:border-white/[0.04]">
                {problems.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
                    <ShieldAlert size={14} /> Fix these first: company data could be exposed.
                  </div>
                )}
                {[...problems, ...warnings].map((f) => <FindingRow key={`${f.kind}:${f.object}:${f.detail}`} f={f} />)}
              </div>
            )}

            {okOnPurpose.length > 0 && (
              <div className="border-t border-slate-100 dark:border-white/[0.04]">
                <button
                  onClick={() => setShowOk((v) => !v)}
                  className="w-full text-left px-4 py-2.5 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  {showOk ? "Hide" : "Show"} {okOnPurpose.length} item{okOnPurpose.length === 1 ? "" : "s"} that are locked or shared on purpose
                </button>
                {showOk && okOnPurpose.map((f) => <FindingRow key={`${f.kind}:${f.object}:${f.detail}`} f={f} />)}
              </div>
            )}
          </>
        )}
      </Card>

      <p className="text-[11px] text-slate-500">
        Red means company data could be seen or changed by the wrong people. Gold means check it.
      </p>
    </div>
  );
}
