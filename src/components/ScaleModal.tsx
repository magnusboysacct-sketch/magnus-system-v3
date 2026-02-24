import React, { useEffect, useState } from "react";

type Tab = "standard" | "fis" | "metric" | "auto";

function parseFraction(input: string): number | null {
  const s = (input || "").trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!b) return null;
  return a / b;
}

export function ScaleModal(props: {
  open: boolean;
  canApply: boolean;
  onCancel: () => void;
  onClear: () => void;
  onApplyFeet: (feet: number, opts: { applyAllPages: boolean; autoDimLine: boolean }) => void;
}) {
  const { open, canApply, onCancel, onClear, onApplyFeet } = props;

  const [tab, setTab] = useState<Tab>("fis");

  const [stdFeet, setStdFeet] = useState("10");

  const [fisFeet, setFisFeet] = useState("");
  const [fisInch, setFisInch] = useState("");
  const [fisFrac, setFisFrac] = useState("");

  const [metricMeters, setMetricMeters] = useState("3");

  const [applyAllPages, setApplyAllPages] = useState(true);
  const [autoDimLine, setAutoDimLine] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTab("fis");
  }, [open]);

  if (!open) return null;

  function apply() {
    let feet: number | null = null;

    if (tab === "standard") {
      const n = Number(stdFeet);
      if (Number.isFinite(n) && n > 0) feet = n;
    }

    if (tab === "fis") {
      const f = Number(fisFeet || 0);
      const i = Number(fisInch || 0);
      const fr = parseFraction(fisFrac);
      if (fr == null) {
        alert("Invalid fraction. Use 1/2, 3/8, etc.");
        return;
      }
      const total = f + (i + fr) / 12;
      if (Number.isFinite(total) && total > 0) feet = total;
    }

    if (tab === "metric") {
      const m = Number(metricMeters);
      if (Number.isFinite(m) && m > 0) feet = m * 3.28084;
    }

    if (tab === "auto") {
      alert("Auto scale is coming next.");
      return;
    }

    if (!feet) {
      alert("Enter a valid distance.");
      return;
    }

    onApplyFeet(feet, { applyAllPages, autoDimLine });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="text-lg font-semibold">Scale</div>
          <button onClick={onCancel} className="px-2 py-1 rounded-lg hover:bg-slate-800/50">
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-2 text-sm">
            <button onClick={() => setTab("standard")} className={"px-3 py-2 rounded-xl border " + (tab==="standard" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>Standard</button>
            <button onClick={() => setTab("fis")} className={"px-3 py-2 rounded-xl border " + (tab==="fis" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>F-I-S</button>
            <button onClick={() => setTab("metric")} className={"px-3 py-2 rounded-xl border " + (tab==="metric" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>Metric</button>
            <button onClick={() => setTab("auto")} className={"px-3 py-2 rounded-xl border " + (tab==="auto" ? "bg-slate-800 border-slate-700" : "bg-slate-950 border-slate-800 hover:bg-slate-900")}>Auto</button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/20 p-4">
            {tab === "standard" && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">Enter the real distance between the two points:</div>
                <label className="text-xs text-slate-400">
                  Feet
                  <input value={stdFeet} onChange={(e) => setStdFeet(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" />
                </label>
                <div className="text-xs text-slate-400 flex items-center">ft</div>
              </div>
            )}

            {tab === "fis" && (
              <div className="grid grid-cols-3 gap-3 items-end">
                <label className="text-xs text-slate-400">
                  Feet
                  <input value={fisFeet} onChange={(e) => setFisFeet(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="45" />
                </label>
                <label className="text-xs text-slate-400">
                  Inch
                  <input value={fisInch} onChange={(e) => setFisInch(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="6" />
                </label>
                <label className="text-xs text-slate-400">
                  Fraction
                  <input value={fisFrac} onChange={(e) => setFisFrac(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" placeholder="1/2" />
                </label>
                <div className="col-span-3 text-xs text-slate-500">Fraction accepts 1/2, 3/8, 0.25, etc.</div>
              </div>
            )}

            {tab === "metric" && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="col-span-2 text-sm text-slate-300">Enter distance in meters:</div>
                <label className="text-xs text-slate-400">
                  Meters
                  <input value={metricMeters} onChange={(e) => setMetricMeters(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm" />
                </label>
                <div className="text-xs text-slate-400 flex items-center">m</div>
              </div>
            )}

            {tab === "auto" && (
              <div className="text-sm text-slate-300">
                Auto scale (read scale from title block) — coming next.
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={applyAllPages} onChange={(e) => setApplyAllPages(e.target.checked)} />
              Apply scale to all pages
            </label>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={autoDimLine} onChange={(e) => setAutoDimLine(e.target.checked)} />
              Automatically create dimension line
            </label>
          </div>

          <div className="mt-5 flex items-center justify-between pb-5">
            <button onClick={onClear} className="px-3 py-2 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 text-sm">
              Clear Scale
            </button>

            <div className="flex gap-2">
              <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
                Cancel
              </button>
              <button
                disabled={!canApply}
                onClick={apply}
                className={"px-4 py-2 rounded-xl text-sm " + (canApply ? "bg-emerald-900/50 hover:bg-emerald-900/70 border border-emerald-900/40" : "bg-slate-800/20 text-slate-500")}
              >
                OK
              </button>
            </div>
          </div>

          {!canApply && (
            <div className="pb-5 text-xs text-slate-500">
              Click two points on the drawing first, then press OK.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
