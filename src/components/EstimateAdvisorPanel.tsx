// src/components/EstimateAdvisorPanel.tsx
// AI Estimating Intelligence Panel — slides in from right on estimate detail
// User always has final control — AI recommends, never applies automatically

import React, { useState } from "react";
import {
  X, Bot, Sparkles, Loader, Shield, TrendingUp,
  Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info
} from "lucide-react";
import { cn } from "./ui";
import {
  type EstimateFactors,
  type EstimateIntelligenceResult,
  runEstimateIntelligence,
  saveEstimateIntelligence
} from "../lib/estimateIntelligence";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  estimateId: string;
  estimateTitle: string;
  estimateTotal: number;
  itemCount: number;
  companyId: string;
  onClose: () => void;
  onMarkupApplied?: (markup: number) => void;
}

// ─── Default factors ──────────────────────────────────────────────────────────

const DEFAULT_FACTORS: EstimateFactors = {
  project_type: "",
  client_type: "",
  payment_terms: "",
  project_complexity: "",
  distance_km: 0,
  weather_risk: "",
  rainfall_season: false,
  high_material_volatility: false,
  labor_scarce: false,
  long_material_lead_time: false,
};

// ─── Health Score Ring ────────────────────────────────────────────────────────

function HealthRing({ score, risk }: { score: number; risk: string }) {
  const color =
    risk === "low" ? "#10b981" :
    risk === "medium" ? "#f59e0b" :
    risk === "high" ? "#f97316" : "#ef4444";

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="#ffffff08" strokeWidth="7"/>
        <circle cx="45" cy="45" r={radius} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round" transform="rotate(-90 45 45)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}/>
        <text x="45" y="49" textAnchor="middle" fill={color}
          fontSize="18" fontWeight="bold">{score}</text>
      </svg>
      <div className="text-[10px] font-bold uppercase tracking-widest mt-1"
        style={{ color }}>{risk} risk</div>
    </div>
  );
}

// ─── Factor Form ──────────────────────────────────────────────────────────────

function FactorForm({ factors, onChange }: {
  factors: EstimateFactors;
  onChange: (f: EstimateFactors) => void;
}) {
  const set = (key: keyof EstimateFactors) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const val = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    onChange({ ...factors, [key]: val });
  };

  const selectClass = "w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/40";
  const labelClass = "text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1 block";
  const checkClass = "flex items-center gap-2 text-xs text-slate-400 cursor-pointer";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Project Type</label>
          <select className={selectClass} value={factors.project_type} onChange={set("project_type")}>
            <option value="">Select...</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="government">Government</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="renovation">Renovation</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Client Type</label>
          <select className={selectClass} value={factors.client_type} onChange={set("client_type")}>
            <option value="">Select...</option>
            <option value="new">New Client</option>
            <option value="existing">Existing Client</option>
            <option value="government">Government</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Payment Terms</label>
          <select className={selectClass} value={factors.payment_terms} onChange={set("payment_terms")}>
            <option value="">Select...</option>
            <option value="upfront">Upfront</option>
            <option value="milestone">Milestone</option>
            <option value="net30">Net 30</option>
            <option value="net60">Net 60</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Complexity</label>
          <select className={selectClass} value={factors.project_complexity} onChange={set("project_complexity")}>
            <option value="">Select...</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Weather Risk</label>
          <select className={selectClass} value={factors.weather_risk} onChange={set("weather_risk")}>
            <option value="">Select...</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Distance (km)</label>
          <input type="number" min="0" className={selectClass}
            value={factors.distance_km || ""}
            onChange={e => onChange({ ...factors, distance_km: parseFloat(e.target.value) || 0 })}
            placeholder="0"/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {([
          ["rainfall_season", "Rainfall Season"],
          ["high_material_volatility", "Material Volatility"],
          ["labor_scarce", "Labor Scarce"],
          ["long_material_lead_time", "Long Lead Times"],
        ] as [keyof EstimateFactors, string][]).map(([key, label]) => (
          <label key={key} className={checkClass}>
            <input type="checkbox" checked={factors[key] as boolean}
              onChange={set(key)}
              className="accent-cyan-500 w-3.5 h-3.5"/>
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function EstimateAdvisorPanel({
  estimateId, estimateTitle, estimateTotal, itemCount, companyId, onClose, onMarkupApplied
}: Props) {
  const [factors, setFactors] = useState<EstimateFactors>(DEFAULT_FACTORS);
  const [result, setResult] = useState<EstimateIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [customMarkup, setCustomMarkup] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "JMD", maximumFractionDigits: 0
  }).format(n);

  async function analyze() {
    setLoading(true); setError(null); setResult(null); setSaved(false);
    try {
      const r = await runEstimateIntelligence(factors, estimateTotal, itemCount, companyId);
      setResult(r);
      setCustomMarkup(String(r.markup.suggested));
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function applyMarkup() {
    if (!result) return;
    const markup = parseFloat(customMarkup) || result.markup.suggested;
    await saveEstimateIntelligence(estimateId, result, markup);
    setSaved(true);
    onMarkupApplied?.(markup);
  }

  const riskColor = (risk: string) =>
    risk === "low" ? "text-emerald-400" :
    risk === "medium" ? "text-amber-400" :
    risk === "high" ? "text-orange-400" : "text-red-400";

  const riskBg = (risk: string) =>
    risk === "low" ? "bg-emerald-500/10 border-emerald-500/20" :
    risk === "medium" ? "bg-amber-500/10 border-amber-500/20" :
    risk === "high" ? "bg-orange-500/10 border-orange-500/20" : "bg-red-500/10 border-red-500/20";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>

      {/* Panel */}
      <div className="relative w-full max-w-md h-full bg-[#0d1117] border-l border-white/[0.08] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
              <Bot size={15} className="text-purple-400"/>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">AI Bid Advisor</div>
              <div className="text-[10px] text-slate-600 truncate max-w-[220px]">{estimateTitle}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.07] text-slate-600 hover:text-slate-300 transition-colors">
            <X size={15}/>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Estimate value */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Estimate Value</span>
            <span className="text-lg font-bold text-emerald-400">{fmt(estimateTotal)}</span>
          </div>

          {/* Factor form */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Project Conditions</div>
            <FactorForm factors={factors} onChange={setFactors}/>
          </div>

          {/* Analyze button */}
          <button onClick={analyze} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition">
            {loading
              ? <><Loader size={14} className="animate-spin"/> Analyzing bid...</>
              : <><Sparkles size={14}/> Analyze This Bid</>}
          </button>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{error}</div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">

              {/* Bid Health Score */}
              <div className={cn("rounded-xl border p-4", riskBg(result.bid_health.risk_level))}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className={riskColor(result.bid_health.risk_level)}/>
                    <span className="text-xs font-semibold text-slate-200">Bid Health Score</span>
                  </div>
                  <button onClick={() => setShowBreakdown(!showBreakdown)}
                    className="text-slate-600 hover:text-slate-400">
                    {showBreakdown ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <HealthRing score={result.bid_health.overall} risk={result.bid_health.risk_level}/>
                  <div className="flex-1 space-y-1">
                    {result.bid_health.risk_flags.slice(0, 3).map((flag, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle size={10} className="text-amber-400 flex-shrink-0 mt-0.5"/>
                        <span className="text-[10px] text-slate-400">{flag}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score breakdown */}
                {showBreakdown && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
                    {Object.entries(result.bid_health.breakdown).map(([key, val]) => {
                      const maxVal: Record<string, number> = {
                        client_risk: 20, location_risk: 15, material_risk: 15,
                        weather_risk: 15, labor_risk: 10, schedule_risk: 10,
                        cashflow_risk: 10, complexity_risk: 5
                      };
                      const max = maxVal[key] || 10;
                      const pct = (val / max) * 100;
                      const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                      return (
                        <div key={key}>
                          <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                            <span>{label}</span>
                            <span>{val}/{max}</span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.05]">
                            <div className="h-1 rounded-full bg-emerald-500/60 transition-all"
                              style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Markup Recommendation */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={14} className="text-cyan-400"/>
                  <span className="text-xs font-semibold text-slate-200">Markup Recommendation</span>
                  {result.markup.ai_powered && (
                    <span className="ml-auto text-[9px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full">AI</span>
                  )}
                </div>
                <div className="flex items-end gap-3 mb-3">
                  <div className="text-3xl font-bold text-cyan-400">{result.markup.suggested}%</div>
                  <div className="text-xs text-slate-500 pb-1">Range: {result.markup.range_low}%–{result.markup.range_high}%</div>
                </div>
                <div className="space-y-1 mb-3">
                  {result.markup.reasoning.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <Info size={10} className="text-cyan-500 flex-shrink-0 mt-0.5"/>
                      <span className="text-[10px] text-slate-400">{r}</span>
                    </div>
                  ))}
                </div>
                {/* Profit preview */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2">
                    <div className="text-[9px] text-slate-600 mb-0.5">Profit @ {result.markup.suggested}%</div>
                    <div className="text-xs font-bold text-emerald-400">{fmt(result.estimated_profit_at_suggested)}</div>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-2">
                    <div className="text-[9px] text-slate-600 mb-0.5">Profit @ {result.markup.range_low}%</div>
                    <div className="text-xs font-bold text-slate-300">{fmt(result.estimated_profit_at_low)}</div>
                  </div>
                </div>
                {/* Apply markup */}
                <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 flex-1">
                    <span className="text-[10px] text-slate-500">Apply markup %</span>
                    <input type="number" value={customMarkup}
                      onChange={e => setCustomMarkup(e.target.value)}
                      className="w-16 bg-white/[0.05] border border-white/[0.1] rounded-md px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-500/40 text-center"/>
                  </div>
                  <button onClick={applyMarkup}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition",
                      saved ? "bg-emerald-500/15 border border-emerald-500/25 text-emerald-400"
                            : "bg-cyan-600 hover:bg-cyan-500 text-white")}>
                    {saved ? <><CheckCircle2 size={11}/> Saved</> : "Apply & Save"}
                  </button>
                </div>
              </div>

              {/* Duration Estimate */}
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={14} className="text-amber-400"/>
                  <span className="text-xs font-semibold text-slate-200">Duration Estimate</span>
                  {result.duration.ai_powered && (
                    <span className="ml-auto text-[9px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-full">AI</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-amber-400 mb-3">
                  {result.duration.total_weeks} weeks
                </div>
                <div className="space-y-1.5 mb-3">
                  {result.duration.breakdown.map((phase, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">{phase.phase}</span>
                      <span className="text-[11px] font-semibold text-slate-300">{phase.weeks}w</span>
                    </div>
                  ))}
                </div>
                {result.duration.risk_factors.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.05] space-y-1">
                    {result.duration.risk_factors.map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle size={10} className="text-amber-400 flex-shrink-0 mt-0.5"/>
                        <span className="text-[10px] text-slate-500">{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="text-[9px] text-slate-700 text-center leading-relaxed">
                AI recommendations are advisory only. You have full control over all values applied to this estimate.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}