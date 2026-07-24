// src/pages/BOQPage.tsx ? v3 Rebuild: staff-friendly, search-first picker, clear UX
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Save, CheckCircle,
  FileSpreadsheet, ShoppingCart, Download, RefreshCw, AlertCircle,
  FolderOpen, DollarSign, Search, X, Check, Boxes, Sparkles,
  BookOpen, Package, Users, Wrench, Layers, AlertTriangle, Wand2,
  Bot, ChevronLeft, Loader, Zap, Star, MessageSquare
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";
import EditableDropdown from "../components/common/EditableDropdown";
import { ImportTakeoffModal } from "../components/ImportTakeoffModal";
import { generateProcurementFromBOQ } from "../lib/procurement";
import { generateEstimateFromBOQ } from "../lib/estimates";
import { useProjectContext } from "../context/ProjectContext";
import { SmartItemSelector } from "../components/SmartItemSelector";
import { magnusAI } from "../lib/magnusAI";
import { BOQSuggestionCard } from "../components/BOQSuggestionCard";
import { addSuggestionToBOQ, type BOQSuggestion } from "../lib/boqSuggestions";
import { computeQuantity } from "../lib/calculatorEngine";

// --- Types --------------------------------------------------------------------
interface MeasurementRow {
  id: string;
  description: string;
  qty: number;
  lengthFt: number | "";
  lengthIn: number | "";
  widthFt: number | "";
  widthIn: number | "";
  heightFt: number | "";
  heightIn: number | "";
  total: number;
  deduct: boolean;
}

type RateItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  current_rate?: number | null;
  current_currency?: string | null;
  calc_engine_json?: {
    vars?: { key: string }[];
    formulas?: { qty?: string };
    formula_type?: string;
    consts?: { unit_weight?: number; weight_unit?: string; coverage_rate?: number; labor_mode?: string; crew_size?: number };
  } | string | null;
};

type BOQItemRow = {
  id: string;
  pick_type: string;
  pick_category: string;
  pick_item: string;
  pick_variant: string;
  cost_item_id: string | null;
  item_name: string;
  description: string;
  unit_id: string | null;
  qty: number;
  rate: number;
  rate_source?: "library" | "manual" | "assembly" | "";
  measurements?: MeasurementRow[];
  // Shared by every component row exploded from the same "Add From Assembly"
  // action, so the UI can collapse them into one summary row with a
  // drill-down — the rows themselves stay real (cost_item_id, rate, etc.)
  // so procurement/estimate generation keep reading them unchanged.
  assembly_instance_id?: string | null;
  assembly_name?: string | null;
  // Master measurement inheritance — set on every component row when the
  // assembly group's master measurement is applied; a component keeps its
  // own qty once `measurement_overridden` is set, ignoring the master.
  assembly_master_length?: number | null;
  assembly_master_width?: number | null;
  assembly_master_height?: number | null;
  assembly_master_set?: boolean;
  component_formula?: string | null;
  component_waste_percent?: number | null;
  measurement_overridden?: boolean;
};

type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
  collapsed?: boolean;
};

type AssemblyRow = {
  id: string; name: string; description: string | null;
  unit: string | null; category: string | null; is_active?: boolean | null;
};
type AssemblyComponentRow = {
  id: string; assembly_id: string; cost_item_id: string; line_type: string;
  quantity_factor: number; waste_percent: number; sort_order: number; notes: string | null;
};
type BoqHeaderRow = {
  id: string; project_id: string; status: string; version: number; updated_at: string;
};

// --- Helpers ------------------------------------------------------------------
function safeId() {
  try { const c: any = typeof crypto !== "undefined" ? crypto : null; if (c?.randomUUID) return c.randomUUID(); } catch {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function parseCalcJson(rateItem: RateItem | undefined | null): any {
  if (!rateItem?.calc_engine_json) return null;
  if (typeof rateItem.calc_engine_json === "string") {
    try { return JSON.parse(rateItem.calc_engine_json); } catch { return null; }
  }
  return rateItem.calc_engine_json;
}
function getCategoryId(c: any): string { return String(c?.id ?? ""); }
function getCategoryLabel(c: any): string { return String(c?.name ?? "Unnamed Category"); }
function getCategoryScope(c: any): string { return String(c?.scope_of_work ?? ""); }
function getUnitId(u: any): string { return String(u?.id ?? ""); }
function getUnitLabel(u: any): string { return String(u?.name ?? "Unit"); }
function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) { const v = localStorage.getItem(k); if (v?.trim()) return v.trim(); }
  return null;
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}
function fmtNum(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Type config --------------------------------------------------------------
const TYPE_CFG: Record<string, { pill: string; icon: React.ReactNode; short: string }> = {
  material:    { pill: "bg-blue-500/15 text-blue-300 border-blue-500/25",     icon: <Package size={9}/>,  short: "MAT" },
  labor:       { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25",  icon: <Users size={9}/>,    short: "LAB" },
  labour:      { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25",  icon: <Users size={9}/>,    short: "LAB" },
  equipment:   { pill: "bg-purple-500/15 text-purple-300 border-purple-500/25",icon: <Wrench size={9}/>,  short: "EQP" },
  subcontract: { pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",icon:<Layers size={9}/>,short: "SUB" },
  other:       { pill: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/25",  icon: <Boxes size={9}/>,    short: "OTH" },
};
function TypeChip({ type }: { type: string }) {
  const cfg = TYPE_CFG[type.toLowerCase()] ?? TYPE_CFG.other;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${cfg.pill}`}>
      {cfg.icon}{cfg.short}
    </span>
  );
}

// --- Find Item Modal ----------------------------------------------------------
function FindItemModal({
  rateItems, onSelect, onClose
}: {
  rateItems: RateItem[];
  onSelect: (item: RateItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rateItems.filter(r => {
      const matchType = !typeFilter || (r.item_type || "").toLowerCase() === typeFilter.toLowerCase();
      const matchSearch = !q ||
        (r.item_name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.variant || "").toLowerCase().includes(q);
      return matchType && matchSearch;
    }).slice(0, 80);
  }, [rateItems, search, typeFilter]);

  const types = useMemo(() => {
    const set = new Set(rateItems.map(r => r.item_type || "").filter(Boolean));
    return Array.from(set).sort();
  }, [rateItems]);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#0d1117] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <BookOpen size={14} className="text-blue-400"/>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Find Item from Rate Library</div>
              <div className="text-[11px] text-slate-500">{rateItems.length} items available ? rate auto-fills</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">
            <X size={15}/>
          </button>
        </div>

        {/* Search + type filter */}
        <div className="px-5 pt-4 pb-3 space-y-3 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, category, or description?"
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600 outline-none focus:border-blue-500/50 transition"/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTypeFilter("")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${!typeFilter ? "bg-blue-600 text-white border-blue-500" : "bg-slate-50 dark:bg-white/[0.04] text-slate-500 border-slate-200 dark:border-white/[0.07] hover:text-slate-700 dark:text-slate-300"}`}>
              All ({rateItems.length})
            </button>
            {types.map(t => {
              const cfg = TYPE_CFG[t.toLowerCase()] ?? TYPE_CFG.other;
              const count = rateItems.filter(r => (r.item_type||"").toLowerCase() === t.toLowerCase()).length;
              return (
                <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${typeFilter === t ? cfg.pill : "bg-slate-50 dark:bg-white/[0.04] text-slate-500 border-slate-200 dark:border-white/[0.07] hover:text-slate-700 dark:text-slate-300"}`}>
                  {t} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Package size={20} className="text-slate-400 dark:text-slate-700"/>
              <p className="text-slate-500 text-sm">No items match your search</p>
              <p className="text-slate-400 dark:text-slate-700 text-xs">Try a different keyword or clear filters</p>
            </div>
          ) : filtered.map((item, idx) => {
            const cfg = TYPE_CFG[(item.item_type||"").toLowerCase()] ?? TYPE_CFG.other;
            const hasRate = item.current_rate != null && item.current_rate > 0;
            return (
              <button key={item.id} onClick={() => onSelect(item)}
                className={`w-full text-left px-5 py-3 border-b border-slate-100 dark:border-white/[0.04] last:border-0 hover:bg-slate-50 dark:bg-white/[0.04] transition group flex items-center gap-4 ${idx === 0 ? "" : ""}`}>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase flex-shrink-0 ${cfg.pill}`}>
                  {cfg.icon}{cfg.short}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-white transition truncate">{item.item_name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.category && <span className="text-[10px] text-slate-500 dark:text-slate-600">{item.category}</span>}
                    {item.variant && <span className="text-[10px] text-slate-400 dark:text-slate-700">? {item.variant}</span>}
                    {item.description && <span className="text-[10px] text-slate-400 dark:text-slate-700 truncate">? {item.description}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {hasRate ? (
                    <div>
                      <div className="text-sm font-bold text-green-400">{fmtMoney(item.current_rate!)}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-600">per {item.unit || "unit"}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 dark:text-slate-700 italic">No rate</div>
                  )}
                </div>
                <ChevronRight size={13} className="text-slate-400 dark:text-slate-700 group-hover:text-slate-600 dark:text-slate-400 transition flex-shrink-0"/>
              </button>
            );
          })}
          {filtered.length === 80 && (
            <div className="px-5 py-3 text-[11px] text-slate-500 dark:text-slate-600 text-center">Showing first 80 results ? refine your search to see more</div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Weight Measurement Modal ----------------------------------------------------
interface WeightRow {
  id: string;
  description: string;
  numBars: number | "";
  lengthM: number | "";
  lengthFt: number | "";
  lengthIn: number | "";
  deduct: boolean;
}

function WeightMeasurementModal({
  modal,
  onClose,
  onApply,
  rateItems,
}: {
  modal: { sectionId: string; itemId: string; itemName: string; unit: string; costItemId: string | null; rows: MeasurementRow[] };
  onClose: () => void;
  onApply: (sectionId: string, itemId: string, rows: MeasurementRow[], total: number) => void;
  rateItems: RateItem[];
}) {
  const rateItem = useMemo(() => rateItems.find(r => r.id === modal.costItemId), [rateItems, modal.costItemId]);
  const calcJson = useMemo(() => parseCalcJson(rateItem), [rateItem]);
  const unitWeight = Number(calcJson?.consts?.unit_weight) || 1;
  const formulaHint = calcJson?.formulas?.qty || null;

  const [rows, setRows] = useState<WeightRow[]>([
    { id: safeId(), description: "", numBars: "", lengthM: "", lengthFt: "", lengthIn: "", deduct: false }
  ]);
  const [outputUnit, setOutputUnit] = useState<"kg"|"tonne"|"lb">(
    (calcJson?.consts?.weight_unit as "kg"|"tonne"|"lb") || "kg"
  );
  const [useMetric, setUseMetric] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  function calcRowKg(r: WeightRow): number {
    const bars = Number(r.numBars) || 1;
    let lengthM = 0;
    if (useMetric) {
      lengthM = Number(r.lengthM) || 0;
    } else {
      const ft = Number(r.lengthFt) || 0;
      const inches = Number(r.lengthIn) || 0;
      lengthM = (ft + inches / 12) * 0.3048;
    }
    const kg = bars * lengthM * unitWeight;
    return r.deduct ? -Math.abs(kg) : Math.abs(kg);
  }

  function updateRow(id: string, patch: Partial<WeightRow>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows(prev => [...prev, {
      id: safeId(), description: "", numBars: "", lengthM: "", lengthFt: "", lengthIn: "", deduct: false,
    }]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  const totalKg = rows.reduce((sum, r) => sum + calcRowKg(r), 0);

  function convertOutput(kg: number): number {
    if (outputUnit === "tonne") return kg / 1000;
    if (outputUnit === "lb") return kg * 2.20462;
    return kg;
  }

  function handleApply() {
    const finalQty = convertOutput(totalKg);
    // Weight rows don't map cleanly onto the L/W/H MeasurementRow shape used
    // by the standard modal — stored just enough (description, bar count,
    // computed kg) to keep the BOQ item's measurements history non-empty.
    // Reopening a saved weight item currently starts blank rather than
    // restoring bars/length inputs.
    const stdRows: MeasurementRow[] = rows.map(r => ({
      id: r.id,
      description: r.description,
      qty: Number(r.numBars) || 1,
      lengthFt: useMetric ? "" : (r.lengthFt === "" ? "" : Number(r.lengthFt)),
      lengthIn: useMetric ? "" : (r.lengthIn === "" ? "" : Number(r.lengthIn)),
      widthFt: "",
      widthIn: "",
      heightFt: "",
      heightIn: "",
      total: calcRowKg(r),
      deduct: r.deduct,
    }));
    onApply(modal.sectionId, modal.itemId, stdRows, finalQty);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">⚖️ Steel Weight Calculator</h2>
            <p className="text-xs text-slate-500 mt-0.5">{modal.itemName} · Unit weight: {unitWeight} kg/m</p>
            {formulaHint && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">🔢 {formulaHint}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={16}/>
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Measure in:</span>
            <button onClick={() => setUseMetric(true)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${useMetric ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              Metres
            </button>
            <button onClick={() => setUseMetric(false)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${!useMetric ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
              Feet / Inches
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Output in:</span>
            {(["kg","tonne","lb"] as const).map(u => (
              <button key={u} onClick={() => setOutputUnit(u)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${outputUnit === u ? "bg-red-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Help */}
        <div className="px-5 py-2 border-b border-slate-100 dark:border-slate-800">
          <button onClick={() => setShowHelp(v => !v)}
            className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1">
            {showHelp ? "▲" : "▼"} How to use
          </button>
          {showHelp && (
            <div className="mt-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <p>• Enter the <strong>number of bars</strong> and the <strong>length of each bar</strong></p>
              <p>• System calculates: bars × length × {unitWeight} kg/m = total weight</p>
              <p>• Use <strong>–</strong> to deduct bars (e.g. offcuts or waste credits)</p>
              <p>• Toggle between <strong>Metres</strong> and <strong>Feet/Inches</strong> for length input</p>
              <p>• Toggle output between <strong>kg, tonne, lb</strong></p>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2">Description</th>
                <th className="text-center pb-2 w-16">No. Bars</th>
                {useMetric ? (
                  <th className="text-center pb-2 w-24">Length (m)</th>
                ) : (
                  <>
                    <th className="text-center pb-2 w-16">ft</th>
                    <th className="text-center pb-2 w-16">in</th>
                  </>
                )}
                <th className="text-center pb-2 w-24">Total Length (m)</th>
                <th className="text-center pb-2 w-8">±</th>
                <th className="text-right pb-2 w-28">Weight ({outputUnit})</th>
                <th className="w-5"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, idx) => {
                const kg = calcRowKg(row);
                const displayWeight = convertOutput(kg);
                const bars = Number(row.numBars) || 0;
                const totalM = useMetric
                  ? bars * (Number(row.lengthM) || 0)
                  : bars * ((Number(row.lengthFt) || 0) + (Number(row.lengthIn) || 0) / 12) * 0.3048;
                return (
                  <tr key={row.id} className={row.deduct ? "bg-red-50 dark:bg-red-500/5" : ""}>
                    <td className="py-1.5 pr-1 text-slate-400">{idx + 1}</td>
                    <td className="py-1.5 pr-2">
                      <input value={row.description}
                        onChange={e => updateRow(row.id, { description: e.target.value })}
                        placeholder="e.g. Foundation bars"
                        className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 py-0.5 text-xs"/>
                    </td>
                    <td className="py-1.5 px-1">
                      <input type="number" min="1"
                        value={row.numBars === "" ? "" : row.numBars}
                        onChange={e => updateRow(row.id, { numBars: e.target.value === "" ? "" : Number(e.target.value) })}
                        placeholder="1"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"/>
                    </td>
                    {useMetric ? (
                      <td className="py-1.5 px-1">
                        <input type="number" min="0" step="0.01"
                          value={row.lengthM === "" ? "" : row.lengthM}
                          onChange={e => updateRow(row.id, { lengthM: e.target.value === "" ? "" : Number(e.target.value) })}
                          placeholder="0.00"
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"/>
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 px-0.5">
                          <input type="number" min="0"
                            value={row.lengthFt === "" ? "" : row.lengthFt}
                            onChange={e => updateRow(row.id, { lengthFt: e.target.value === "" ? "" : Number(e.target.value) })}
                            placeholder="0"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"/>
                        </td>
                        <td className="py-1.5 px-0.5">
                          <input type="number" min="0" max="11"
                            value={row.lengthIn === "" ? "" : row.lengthIn}
                            onChange={e => updateRow(row.id, { lengthIn: e.target.value === "" ? "" : Math.min(11, Number(e.target.value)) })}
                            placeholder="0"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"/>
                        </td>
                      </>
                    )}
                    <td className="py-1.5 px-1 text-center text-slate-500 dark:text-slate-400 text-xs">
                      {totalM.toFixed(2)} m
                    </td>
                    <td className="py-1.5 px-1 text-center">
                      <button onClick={() => updateRow(row.id, { deduct: !row.deduct })}
                        className={`w-7 h-7 rounded-lg text-sm font-bold transition-colors ${row.deduct ? "bg-red-100 dark:bg-red-500/20 text-red-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-50 hover:text-red-400"}`}>
                        {row.deduct ? "–" : "+"}
                      </button>
                    </td>
                    <td className={`py-1.5 text-right text-xs font-semibold ${row.deduct ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>
                      {row.deduct ? `(${Math.abs(displayWeight).toFixed(3)})` : displayWeight.toFixed(3)} {outputUnit}
                    </td>
                    <td className="py-1.5 pl-1">
                      <button onClick={() => removeRow(row.id)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 hover:text-red-400 transition-colors">
                        <X size={11}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={addRow}
            className="mt-3 flex items-center gap-2 text-xs text-blue-500 hover:text-blue-600 font-medium">
            <Plus size={13}/> Add Row
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">Total Length</div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {rows.reduce((sum, r) => {
                  const bars = Number(r.numBars) || 0;
                  const m = useMetric
                    ? Number(r.lengthM) || 0
                    : ((Number(r.lengthFt) || 0) + (Number(r.lengthIn) || 0) / 12) * 0.3048;
                  return sum + bars * m;
                }, 0).toFixed(2)} m
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">Total Weight (kg)</div>
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {totalKg.toFixed(2)} kg
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-500/10 rounded-xl p-3 text-center">
              <div className="text-xs text-red-400 mb-1">Output ({outputUnit})</div>
              <div className="text-sm font-bold text-red-600 dark:text-red-400">
                {convertOutput(totalKg).toFixed(3)} {outputUnit}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500">Applying to BOQ as:</span>
              <span className="ml-2 text-xl font-bold text-red-600 dark:text-red-400">
                {convertOutput(totalKg).toFixed(3)} {outputUnit}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleApply}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">
                Apply {convertOutput(totalKg).toFixed(3)} {outputUnit} to BOQ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Measurement Modal ----------------------------------------------------------
function MeasurementModal({
  modal,
  onClose,
  onApply,
  rateItems,
}: {
  modal: { sectionId: string; itemId: string; itemName: string; unit: string; costItemId: string | null; rows: MeasurementRow[] };
  onClose: () => void;
  onApply: (sectionId: string, itemId: string, rows: MeasurementRow[], total: number) => void;
  rateItems: RateItem[];
}) {
  const [rows, setRows] = useState<MeasurementRow[]>(modal.rows);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    calculatedQty: number;
    explanation: string;
    breakdown: { label: string; value: string }[];
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  function calcRow(r: MeasurementRow): number {
    const l = (Number(r.lengthFt) || 0) + (Number(r.lengthIn) || 0) / 12;
    const w = (Number(r.widthFt) || 0) + (Number(r.widthIn) || 0) / 12;
    const h = (Number(r.heightFt) || 0) + (Number(r.heightIn) || 0) / 12;
    const q = Number(r.qty) || 1;
    let val = 0;
    if (l === 0 && w === 0 && h === 0) {
      val = q; // count only
    } else if (l > 0 && w === 0 && h === 0) {
      val = l * q; // linear
    } else if (l > 0 && w > 0 && h === 0) {
      val = l * w * q; // area
    } else if (l > 0 && w > 0 && h > 0) {
      val = l * w * h * q; // volume
    } else if (l > 0 && h > 0 && w === 0) {
      val = l * h * q; // area (length × height, no width)
    } else {
      val = q;
    }
    return r.deduct ? -Math.abs(val) : Math.abs(val);
  }

  function updateRow(id: string, patch: Partial<MeasurementRow>) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch };
      updated.total = calcRow(updated);
      return updated;
    }));
  }

  function addRow() {
    setRows(prev => [...prev, {
      id: safeId(), description: "", qty: 1,
      lengthFt: "", lengthIn: "", widthFt: "", widthIn: "", heightFt: "", heightIn: "",
      total: 0, deduct: false,
    }]);
  }

  function removeRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  const grandTotal = rows.reduce((sum, r) => sum + calcRow(r), 0);

  // Resolve the rate item's Advanced Calculator Engine formula once, shared
  // by the header hint, the auto-calc effect, and the manual Smart Calculate button.
  const rateItem = useMemo(() => rateItems.find(r => r.id === modal.costItemId), [rateItems, modal.costItemId]);
  const calcJson = useMemo(() => parseCalcJson(rateItem), [rateItem]);
  const formulaExpr = calcJson?.formulas?.qty || null;

  function resolveFormulaResult(): typeof aiResult | null {
    if (!formulaExpr || !calcJson?.vars?.length) return null;
    // Every var (area/length/width/height/count) maps to the same measured
    // total — grandTotal already represents whichever magnitude the entered
    // dimensions produced (sf, lf, cf, or count).
    const vars: Record<string, number> = {};
    for (const v of calcJson.vars) vars[v.key] = grandTotal;
    const result = computeQuantity(formulaExpr, vars, { wastePercent: 0, roundTo: 4, clampZero: true });
    if (!result.ok) return null;
    const withWaste = Math.ceil(result.value * 1.05); // 5% default wastage
    return {
      calculatedQty: withWaste,
      explanation: `Used item formula: ${formulaExpr} → ${result.value.toFixed(2)} + 5% wastage = ${withWaste} ${modal.unit}`,
      breakdown: [
        { label: "Measured", value: `${grandTotal.toFixed(2)} ${modal.unit || ""}`.trim() },
        { label: "Formula", value: formulaExpr },
        { label: "Base quantity", value: `${result.value.toFixed(2)} ${modal.unit}` },
        { label: "Wastage (5%)", value: `+ ${(withWaste - result.value).toFixed(2)} ${modal.unit}` },
        { label: "Final quantity", value: `${withWaste} ${modal.unit}` },
      ],
    };
  }

  // Formula conversion is deterministic and instant (no AI call needed), so
  // resolve it automatically as soon as real dimensions are entered — the
  // user shouldn't have to remember to press Smart Calculate before Apply.
  // Guarded on actual L/W/H input (not just the default qty:1 placeholder
  // row) so the modal doesn't show a bogus result before any measuring.
  const hasDimensions = rows.some(r => Number(r.lengthFt) > 0 || Number(r.widthFt) > 0 || Number(r.heightFt) > 0);
  useEffect(() => {
    if (!hasDimensions) { setAiResult(null); return; }
    const formulaResult = resolveFormulaResult();
    if (formulaResult) setAiResult(formulaResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, formulaExpr, hasDimensions]);

  async function handleAICalculate() {
    if (grandTotal === 0) return;
    const formulaResult = resolveFormulaResult();
    if (formulaResult) { setAiResult(formulaResult); return; }
    setAiLoading(true);
    setAiResult(null);
    try {
      const measuredDims = rows.filter(r => !r.deduct).map(r => {
        const l = (Number(r.lengthFt) || 0) + (Number(r.lengthIn) || 0) / 12;
        const w = (Number(r.widthFt) || 0) + (Number(r.widthIn) || 0) / 12;
        const h = (Number(r.heightFt) || 0) + (Number(r.heightIn) || 0) / 12;
        return { desc: r.description || "wall", l, w, h, qty: r.qty };
      });

      const hasLength = measuredDims.some(d => d.l > 0);
      const hasWidth = measuredDims.some(d => d.w > 0);
      const hasHeight = measuredDims.some(d => d.h > 0);

      const measureType = !hasLength ? "count"
        : hasLength && hasWidth && hasHeight ? "volume (cubic feet)"
        : hasLength && (hasHeight || hasWidth) ? "area (square feet)"
        : "linear (feet)";

      const prompt = `You are a construction quantity surveyor specializing in Jamaican construction.

ITEM TO QUANTIFY: "${modal.itemName}"
ITEM UNIT: "${modal.unit}" (this is the unit we need to calculate — e.g. "each" means number of pieces)
${rateItem ? `RATE ITEM DETAILS: ${rateItem.item_name}, category: ${rateItem.category}` : ""}
MEASUREMENT TYPE: ${measureType}
TOTAL MEASURED: ${grandTotal.toFixed(3)} ${measureType.split(" ")[0]}

MEASUREMENT BREAKDOWN:
${measuredDims.map(d => `- ${d.desc}: ${d.l > 0 ? `L=${d.l.toFixed(2)}ft` : ""} ${d.h > 0 ? `H=${d.h.toFixed(2)}ft` : ""} ${d.w > 0 ? `W=${d.w.toFixed(2)}ft` : ""} × qty ${d.qty}`).join("\n")}

YOUR JOB: Convert the measured ${measureType} into the number of "${modal.unit}" of "${modal.itemName}" needed.

JAMAICAN CONSTRUCTION STANDARDS:
- 6" concrete hollow block: 1.125 blocks per square foot of wall (including 3/8" mortar joints) = 12.1 blocks/m²
- 4" concrete hollow block: 1.125 blocks per square foot of wall
- 8" concrete hollow block: 1.125 blocks per square foot of wall
- Standard clay brick: 6.75 bricks per square foot
- Ceramic floor tile 12"×12": 1.1 tiles per square foot (10% waste)
- Ceramic wall tile 8"×10": 1.8 tiles per square foot
- Portland cement bag (94 lb): covers approximately 8 square feet of plaster (1/2" thick)
- Sand (one cubic foot): covers approximately 16 square feet of plaster
- Paint (1 gallon): covers 350-400 square feet per coat
- Primer (1 gallon): covers 300-350 square feet
- Ready mix concrete: 1 cubic yard = 27 cubic feet
- Roofing sheet (standard): covers approximately 27.5 square feet
- Plywood sheet 4'×8': covers 32 square feet
- 2×4 lumber stud: 1 per 1.5 linear feet of wall

IMPORTANT:
- The measured quantity is in ${measureType} but the item unit is "${modal.unit}"
- You MUST convert from ${measureType} to "${modal.unit}"
- For blocks: sf of wall ÷ (1/1.125) = number of blocks
- Always add appropriate wastage (typically 5-10% for blocks, 10-15% for tiles)
- Round up to nearest whole number for countable items

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "coverageFactor": <number>,
  "coverageUnit": "<e.g. '1.125 blocks per sf' or '1 gallon per 400 sf'>",
  "baseQuantity": <number without wastage>,
  "wastagePercent": <number>,
  "calculatedQty": <final quantity including wastage, rounded up for countable items>,
  "explanation": "<one clear sentence explaining the conversion>",
  "breakdown": [
    {"label": "Measured area", "value": "${grandTotal.toFixed(2)} sf"},
    {"label": "Coverage factor", "value": "<coverage description>"},
    {"label": "Base quantity", "value": "<base qty> ${modal.unit}"},
    {"label": "Wastage (X%)", "value": "+ <wastage qty> ${modal.unit}"},
    {"label": "Final quantity", "value": "<total> ${modal.unit}"}
  ]
}`;

      const text = await magnusAI.chat(prompt);
      const clean = String(text).replace(/```json|```/g, "").trim();
      const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON in AI response");
      const parsed = JSON.parse(clean.slice(start, end + 1));
      setAiResult({
        calculatedQty: Number(parsed.calculatedQty) || grandTotal,
        explanation: String(parsed.explanation || ""),
        breakdown: Array.isArray(parsed.breakdown) ? parsed.breakdown : [],
      });
    } catch (e) {
      console.error("AI calculation failed:", e);
      setAiResult({
        calculatedQty: grandTotal,
        explanation: "Could not calculate automatically. Please enter quantity manually.",
        breakdown: [],
      });
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">📐 Measurements</h2>
            <p className="text-xs text-slate-500 mt-0.5">{modal.itemName} · {modal.unit}</p>
            {formulaExpr && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                🔢 Formula: {formulaExpr}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={16}/>
          </button>
        </div>

        {/* How to use */}
        <div className="mx-4 mt-3">
          <button
            onClick={() => setShowHelp(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
            <span>{showHelp ? "▲" : "▼"}</span>
            How to use
            <span className="text-[10px] font-normal text-slate-400">{showHelp ? "click to hide" : "click to show"}</span>
          </button>
          {showHelp && (
            <div className="mt-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20">
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5">
                <li>• <strong>Linear</strong> (length only): enter Length → Total = Length × Qty</li>
                <li>• <strong>Area</strong> (wall, floor): enter Length + Height → Total = L × H × Qty</li>
                <li>• <strong>Volume</strong> (concrete): enter Length + Width + Height → Total = L × W × H × Qty</li>
                <li>• <strong>Count only</strong>: leave all dimensions blank → Total = Qty</li>
                <li>• Click <strong>+</strong> to toggle a row as a <strong>deduction</strong> (e.g. subtract window openings)</li>
              </ul>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left pb-2 w-6">#</th>
                <th className="text-left pb-2">Description</th>
                <th className="text-center pb-2 w-14">Qty</th>
                <th className="text-center pb-2" colSpan={2}>Length</th>
                <th className="text-center pb-2" colSpan={2}>Width</th>
                <th className="text-center pb-2" colSpan={2}>Height</th>
                <th className="text-center pb-2 w-8">±</th>
                <th className="text-right pb-2 w-20">Total</th>
                <th className="w-5"/>
              </tr>
              <tr className="text-[9px] text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th/><th/>
                <th/>
                <th className="text-center pb-1 text-slate-400">ft</th>
                <th className="text-center pb-1 text-slate-400">in</th>
                <th className="text-center pb-1 text-slate-400">ft</th>
                <th className="text-center pb-1 text-slate-400">in</th>
                <th className="text-center pb-1 text-slate-400">ft</th>
                <th className="text-center pb-1 text-slate-400">in</th>
                <th/><th/><th/>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, idx) => (
                <tr key={row.id} className={row.deduct ? "bg-red-50 dark:bg-red-500/5" : ""}>
                  <td className="py-1.5 pr-1 text-slate-400 text-[10px]">{idx + 1}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      value={row.description}
                      onChange={e => updateRow(row.id, { description: e.target.value })}
                      placeholder="e.g. North wall"
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500 py-0.5 text-xs"
                    />
                  </td>
                  {/* Qty */}
                  <td className="py-1.5 px-1">
                    <input type="number" min="1"
                      value={row.qty}
                      onChange={e => updateRow(row.id, { qty: Number(e.target.value) || 1 })}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  {/* Length ft + in */}
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0"
                      value={row.lengthFt === "" ? "" : row.lengthFt}
                      onChange={e => updateRow(row.id, { lengthFt: e.target.value === "" ? "" : Number(e.target.value) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0" max="11"
                      value={row.lengthIn === "" ? "" : row.lengthIn}
                      onChange={e => updateRow(row.id, { lengthIn: e.target.value === "" ? "" : Math.min(11, Number(e.target.value)) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  {/* Width ft + in */}
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0"
                      value={row.widthFt === "" ? "" : row.widthFt}
                      onChange={e => updateRow(row.id, { widthFt: e.target.value === "" ? "" : Number(e.target.value) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0" max="11"
                      value={row.widthIn === "" ? "" : row.widthIn}
                      onChange={e => updateRow(row.id, { widthIn: e.target.value === "" ? "" : Math.min(11, Number(e.target.value)) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  {/* Height ft + in */}
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0"
                      value={row.heightFt === "" ? "" : row.heightFt}
                      onChange={e => updateRow(row.id, { heightFt: e.target.value === "" ? "" : Number(e.target.value) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="py-1.5 px-0.5">
                    <input type="number" min="0" max="11"
                      value={row.heightIn === "" ? "" : row.heightIn}
                      onChange={e => updateRow(row.id, { heightIn: e.target.value === "" ? "" : Math.min(11, Number(e.target.value)) })}
                      placeholder="0"
                      className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1 text-center text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  {/* Deduct toggle */}
                  <td className="py-1.5 px-1 text-center">
                    <button
                      onClick={() => updateRow(row.id, { deduct: !row.deduct })}
                      title={row.deduct ? "Deduction — click to make addition" : "Addition — click to make deduction"}
                      className={`w-7 h-7 rounded-lg text-sm font-bold transition-colors ${row.deduct ? "bg-red-100 dark:bg-red-500/20 text-red-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-50 hover:text-red-400"}`}>
                      {row.deduct ? "–" : "+"}
                    </button>
                  </td>
                  {/* Total */}
                  <td className={`py-1.5 text-right text-xs font-semibold ${row.deduct ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>
                    {row.deduct ? `(${Math.abs(calcRow(row)).toFixed(3)})` : calcRow(row).toFixed(3)}
                  </td>
                  <td className="py-1.5 pl-1">
                    <button onClick={() => removeRow(row.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 hover:text-red-400 transition-colors">
                      <X size={11}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={addRow}
            className="mt-3 flex items-center gap-2 text-xs text-blue-500 hover:text-blue-600 font-medium">
            <Plus size={13}/> Add Row
          </button>
        </div>

        {/* AI Calculation Result */}
        {aiResult && (
          <div className="mx-4 mb-3 p-4 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-purple-600 dark:text-purple-400">🤖</span>
              <span className="text-sm font-bold text-purple-700 dark:text-purple-300">AI Calculation Result</span>
            </div>
            {aiResult.explanation && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">{aiResult.explanation}</p>
            )}
            {aiResult.breakdown.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {aiResult.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{b.label}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{b.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between p-3 rounded-lg bg-purple-100 dark:bg-purple-500/20">
              <span className="text-sm font-bold text-purple-700 dark:text-purple-300">Recommended Quantity:</span>
              <span className="text-xl font-bold text-purple-600 dark:text-purple-400">{aiResult.calculatedQty.toFixed(2)} {modal.unit}</span>
            </div>
            <button
              onClick={() => onApply(modal.sectionId, modal.itemId, rows, aiResult.calculatedQty)}
              className="w-full mt-3 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              ✅ Apply {aiResult.calculatedQty.toFixed(2)} {modal.unit} to BOQ
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">Grand Total:</span>
            <span className="ml-2 text-xl font-bold text-blue-600 dark:text-blue-400">{grandTotal.toFixed(2)}</span>
            <span className="ml-1 text-xs text-slate-400">{modal.unit}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAICalculate}
              disabled={aiLoading || grandTotal === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {aiLoading ? (
                <><span className="animate-spin">⟳</span> Calculating...</>
              ) : (
                <><span>🤖</span> Smart Calculate</>
              )}
            </button>
            {(!formulaExpr || (grandTotal > 0 && !aiResult)) && (
              <button onClick={() => onApply(modal.sectionId, modal.itemId, rows, grandTotal)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                Apply {grandTotal.toFixed(2)} {modal.unit}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------
export default function BOQPage() {
  const nav = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject: selectedProject, userRole } = useProjectContext();
  const canApproveBoq = userRole === "director" || userRole === "estimator";
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [sections, setSections] = useState<Section[]>([]);
  const [boqId, setBoqId] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    routeProjectId || currentProjectId || resolveProjectId()
  );
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPanelLoading, setAiPanelLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{role:"ai"|"user";text:string;actions?:{label:string;onClick:()=>void}[]}[]>([]);
  const [aiInput, setAiInput] = useState("");

  const { categories: masterCategories, units: masterUnits, refresh: refreshCategories } = useMasterLists();
  const canEdit = status === "draft";

  const usableCategories = useMemo(() => {
    return (Array.isArray(masterCategories) ? masterCategories : []).filter((c: any) => !!getCategoryId(c));
  }, [masterCategories]);
  const usableUnits = useMemo(() => {
    return (Array.isArray(masterUnits) ? masterUnits : []).filter((u: any) => !!getUnitId(u));
  }, [masterUnits]);

  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");

  // Find item modal
  const [findModal, setFindModal] = useState<{ open: boolean; sectionId: string; rowId: string } | null>(null);

  // Smart selector
  const [showSmartSelector, setShowSmartSelector] = useState(false);
  const [smartSelectorCtx, setSmartSelectorCtx] = useState<{ sectionId: string; rowId: string } | null>(null);

  // Assembly modal
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assemblyComponents, setAssemblyComponents] = useState<AssemblyComponentRow[]>([]);
  type AsmModal = { open: boolean; sectionId: string | null; search: string; selectedId: string; qty: string };
  const [asmModal, setAsmModal] = useState<AsmModal>({ open: false, sectionId: null, search: "", selectedId: "", qty: "1" });
  // Which assembly instances currently show their component breakdown (collapsed by default).
  const [expandedAssemblies, setExpandedAssemblies] = useState<Set<string>>(new Set());
  function toggleAssemblyExpanded(instanceId: string) {
    setExpandedAssemblies(prev => {
      const next = new Set(prev);
      if (next.has(instanceId)) next.delete(instanceId); else next.add(instanceId);
      return next;
    });
  }
  function deleteAssemblyGroup(sectionId: string, instanceId: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: s.items.filter(it => it.assembly_instance_id !== instanceId) }));
  }
  // Master measurement — one measurement drives every non-overridden component's qty.
  const [assemblyMasterMeasModal, setAssemblyMasterMeasModal] = useState<{
    instanceId: string;
    assemblyName: string;
    unit: string;
    currentRows: MeasurementRow[];
  } | null>(null);

  const [importTakeoffModal, setImportTakeoffModal] = useState<{ open: boolean; sectionId: string | null; itemId: string | null }>({ open: false, sectionId: null, itemId: null });
  const [measureModal, setMeasureModal] = useState<{
    sectionId: string;
    itemId: string;
    itemName: string;
    unit: string;
    costItemId: string | null;
    rows: MeasurementRow[];
  } | null>(null);
  const [aiSuggestionsModal, setAiSuggestionsModal] = useState<{ open: boolean; suggestions: BOQSuggestion[] }>({ open: false, suggestions: [] });
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  // --- Load rate items -------------------------------------------------------
  useEffect(() => {
    let alive = true;
    async function load() {
      setRateLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).single();
        if (p?.company_id && alive) setCompanyId(p.company_id);
      }
      try {
        const { data, error } = await supabase.from("v_cost_items_current")
          .select("id,item_name,description,variant,unit,category,item_type,current_rate,current_currency,calc_engine_json")
          .order("item_name", { ascending: true }).limit(5000);
        if (error) throw error;
        if (alive) setRateItems((data ?? []) as RateItem[]);
      } catch {
        try {
          const { data } = await supabase.from("cost_items")
            .select("id,item_name,description,variant,unit,category,item_type,calc_engine_json")
            .order("item_name", { ascending: true }).limit(5000);
          if (alive) setRateItems((data ?? []) as RateItem[]);
        } catch (e: any) { console.error("Failed to load rate items:", e); }
      } finally { if (alive) setRateLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // --- Load assemblies -------------------------------------------------------
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data: aData } = await supabase.from("assemblies")
          .select("id,name,description,unit,category,is_active").order("name").limit(5000);
        const active = (aData || []).filter((a: any) => a?.is_active !== false);
        const { data: cData } = await supabase.from("assembly_components")
          .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
          .order("sort_order").limit(20000);
        if (!alive) return;
        setAssemblies(active.map((a: any) => ({ id: String(a.id), name: String(a.name ?? ""), description: a.description ? String(a.description) : null, unit: a.unit ? String(a.unit) : null, category: a.category ? String(a.category) : null, is_active: a.is_active ?? true })));
        setAssemblyComponents((cData || []).map((c: any) => ({ id: String(c.id), assembly_id: String(c.assembly_id), cost_item_id: String(c.cost_item_id), line_type: String(c.line_type ?? "material"), quantity_factor: numOr(c.quantity_factor, 1), waste_percent: numOr(c.waste_percent, 0), sort_order: numOr(c.sort_order, 0), notes: c.notes ? String(c.notes) : null })));
      } catch (e) { console.error("Assembly load error:", e); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // --- Takeoff import --------------------------------------------------------
  const lastImportedParamRef = useRef<string>("");

useEffect(() => {
  const groupsParam = searchParams.get("groups");

  if (!groupsParam) return;

  if (lastImportedParamRef.current === groupsParam)
    return;

  const needsExplosion =
    groupsParam.includes('"assemblyId"');

  if (
    needsExplosion &&
    (
      assemblyComponents.length === 0 ||
      rateItems.length === 0
    )
  ) {
    return;
  }

  try {
    const groups = JSON.parse(groupsParam);

    if (
      Array.isArray(groups) &&
      groups.length > 0
    ) {
      const importedItems: BOQItemRow[] = [];

      for (const g of groups) {

        if (g.assemblyId) {

          const exploded =
            explodeAssembly(
              g.assemblyId,
              Number(g.value) || 0,
              assemblyComponents,
              rateItems,
                    usableUnits,
                    (g.length != null || g.height != null || g.width != null)
                      ? { length: Number(g.length) || undefined, height: Number(g.height) || undefined, width: Number(g.width) || undefined }
                      : undefined,
                    assemblies.find(a => a.id === g.assemblyId)?.name || g.name || g.groupName || "Assembly"
            );

          if (exploded.length > 0) {
            importedItems.push(...exploded);
            continue;
          }
        }

        importedItems.push({
          id: safeId(),
          pick_type: "manual",
          pick_category: "",
          pick_item: "",
          pick_variant: "",
          cost_item_id: null,
          item_name:
            g.name ||
            g.groupName ||
            "Imported Item",
          description:
            `${g.metric} measurement`,
          unit_id: null,
          qty:
            Number(g.value) || 0,
          rate: 0,
          rate_source: "",
        });
      }

      lastImportedParamRef.current =
        groupsParam;

      setSections(prev => [
        ...prev,
        {
          id: safeId(),
          masterCategoryId: null,
          title: "Takeoff Import",
          scope:
            "Quantities imported from takeoff measurements",
          items: importedItems,
        }
      ]);

      setSearchParams({});
    }

  } catch (e) {
    console.error(
      "Takeoff parse error:",
      e
    );
  }

}, [
  searchParams,
  setSearchParams,
  assemblies,
  assemblyComponents,
  rateItems,
  usableUnits
]);

  // --- BOQ Persistence -------------------------------------------------------
  async function loadLatestBoq(projectId: string) {
    setPersistLoading(true); setPersistError(null);
    try {
      const { data: headers, error: hErr } = await supabase.from("boq_headers")
        .select("id,project_id,status,version,updated_at").eq("project_id", projectId)
        .order("updated_at", { ascending: false }).order("version", { ascending: false }).limit(1);
      if (hErr) throw hErr;
      const header = (Array.isArray(headers) ? headers[0] : undefined) as BoqHeaderRow | undefined;
      if (!header) { setBoqId(null); setStatus("draft"); setSections([]); return; }
      setBoqId(header.id); setStatus(header.status as "draft" | "approved");
      const { data: secRows, error: sErr } = await supabase.from("boq_sections")
        .select("id,boq_id,sort_order,master_category_id,title,scope").eq("boq_id", header.id).order("sort_order");
      if (sErr) throw sErr;
      const secList = Array.isArray(secRows) ? secRows : [];
      const sectionIds = secList.map((s: any) => s.id).filter(Boolean);
      const itemsBySection = new Map<string, any[]>();
      if (sectionIds.length > 0) {
        const { data: itemRows, error: iErr } = await supabase.from("boq_section_items")
          .select("id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate,measurements")
          .in("section_id", sectionIds).order("sort_order");
        if (iErr) throw iErr;
        for (const r of (itemRows || [])) {
          const sid = String((r as any).section_id ?? "");
          if (!sid) continue;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(r);
        }
      }
      setSections(secList.map((s: any) => ({
        id: String(s.id), masterCategoryId: s.master_category_id ? String(s.master_category_id) : null,
        title: String(s.title ?? "New Section"), scope: String(s.scope ?? ""), collapsed: false,
        items: (itemsBySection.get(String(s.id)) ?? []).map((r: any) => ({
          id: String(r.id ?? safeId()), pick_type: String(r.pick_type ?? ""),
          pick_category: String(r.pick_category ?? ""), pick_item: String(r.pick_item ?? ""),
          pick_variant: String(r.pick_variant ?? ""), cost_item_id: r.cost_item_id ? String(r.cost_item_id) : null,
          item_name: String(r.item_name ?? ""), description: String(r.description ?? ""),
          unit_id: r.unit_id ? String(r.unit_id) : null,
          qty: numOr(r.qty, 0), rate: numOr(r.rate, 0), rate_source: "",
          measurements: (r.measurements as MeasurementRow[]) || [],
        }))
      })));
    } catch (e: any) { setPersistError(e?.message ?? "Failed to load BOQ"); }
    finally { setPersistLoading(false); }
  }

  async function saveBoq(nextStatus: "draft" | "approved") {
    const projectId = activeProjectId ?? resolveProjectId();
    if (!projectId) { alert("Please select a project first."); return; }
    setPersistLoading(true); setPersistError(null);
    try {
      let headerId = boqId;
      let versionNumber = 1;
      let opType: "INSERT" | "UPDATE" = "INSERT";
      if (!headerId) {
        const { data: existing } = await supabase.from("boq_headers").select("id,version,status").eq("project_id", projectId).order("version", { ascending: false }).limit(1);
        const ex = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
        if (ex) {
          if (nextStatus === "draft" && ex.status === "draft") { headerId = String(ex.id); versionNumber = numOr(ex.version, 1); opType = "UPDATE"; }
          else { versionNumber = numOr(ex.version, 0) + 1; opType = "INSERT"; }
        }
      } else {
        opType = "UPDATE";
        const { data: ex } = await supabase.from("boq_headers").select("id,version,project_id").eq("id", headerId).single();
        versionNumber = numOr(ex?.version, 1);
        if (String(ex?.project_id) !== projectId) throw new Error("BOQ belongs to a different project!");
      }
      if (opType === "INSERT") {
        const { data: vCheck } = await supabase.from("boq_headers").select("id").eq("project_id", projectId).eq("version", versionNumber).maybeSingle();
        if (vCheck) throw new Error(`BOQ version ${versionNumber} already exists.`);
        const { data: ins, error: insErr } = await supabase.from("boq_headers").insert([{ project_id: projectId, status: nextStatus, version: versionNumber }]).select("id,version").single();
        if (insErr) throw insErr;
        headerId = String((ins as any).id); setBoqId(headerId);
      } else {
        const { error: upErr } = await supabase.from("boq_headers").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", headerId);
        if (upErr) throw upErr;
      }
      const { error: delErr } = await supabase.from("boq_sections").delete().eq("boq_id", headerId);
      if (delErr) throw delErr;
      const sectionIdMap = new Map<string, string>();
      if (sections.length > 0) {
        const { data: insertedSecs, error: secErr } = await supabase.from("boq_sections")
          .insert(sections.map((s, i) => ({ boq_id: headerId, sort_order: i, master_category_id: s.masterCategoryId, title: s.title ?? "New Section", scope: s.scope ?? "" })))
          .select("id,sort_order");
        if (secErr) throw secErr;
        (insertedSecs || []).forEach((db: any) => { const cs = sections[db.sort_order]; if (cs) sectionIdMap.set(cs.id, db.id); });
      }
      const itemPayload: any[] = [];
      for (const s of sections) {
        const dbSid = sectionIdMap.get(s.id);
        if (!dbSid) throw new Error(`Section mapping failed: ${s.title}`);
        s.items.forEach((it, i) => itemPayload.push({ section_id: dbSid, sort_order: i, pick_type: it.pick_type ?? "", pick_category: it.pick_category ?? "", pick_item: it.pick_item ?? "", pick_variant: it.pick_variant ?? "", cost_item_id: it.cost_item_id, item_name: it.item_name ?? "", description: it.description ?? "", unit_id: it.unit_id, qty: numOr(it.qty, 0), rate: numOr(it.rate, 0), measurements: it.measurements ?? [] }));
      }
      if (itemPayload.length > 0) {
        const { error: iErr } = await supabase.from("boq_section_items").insert(itemPayload).select("id,item_name");
        if (iErr) throw iErr;
      }
      setStatus(nextStatus);
      await supabase.rpc("sync_boq_budget_to_cost_events", { p_boq_id: headerId }).then(({ error }) => { if (error) console.error("BOQ sync error:", error); });
      await loadLatestBoq(projectId);
      setLastAutoSaveAt(new Date().toLocaleTimeString());
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) { setPersistError(e?.message ?? "Failed to save"); alert(e?.message ?? "Failed to save BOQ"); }
    finally { setPersistLoading(false); }
  }

  // Flush unsaved BOQ changes on unmount (nav away, browser back, route change)
  // so deletes/imports made in-session are not silently discarded on next load.
  // Refs avoid stale-closure bugs: the cleanup function below is created once on
  // mount, so it must read current values via refs, not via state/closures directly.
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const boqIdRef = useRef(boqId);
  useEffect(() => { boqIdRef.current = boqId; }, [boqId]);
  const saveBoqRef = useRef(saveBoq);
  useEffect(() => { saveBoqRef.current = saveBoq; }, [saveBoq]);
  const hasUnsavedRef = useRef(false);
  useEffect(() => { hasUnsavedRef.current = true; }, [sections]);
  useEffect(() => {
    return () => {
      if (hasUnsavedRef.current && boqIdRef.current !== null) {
        saveBoqRef.current("draft");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pid = activeProjectId;
    if (!pid) { setBoqId(null); setStatus("draft"); setSections([]); return; }
    if (searchParams.get("groups")) return; // skip auto-load, takeoff import effect will handle this
    void loadLatestBoq(pid);
  }, [activeProjectId]);

  useEffect(() => {
    const next = routeProjectId || currentProjectId || resolveProjectId() || null;
    setActiveProjectId(next);
  }, [routeProjectId, currentProjectId]);

  // --- Mutations -------------------------------------------------------------
  function addSection() { setSections(prev => [...prev, { id: safeId(), masterCategoryId: null, title: "New Section", scope: "", items: [], collapsed: false }]); }
  function deleteSection(id: string) { setSections(prev => prev.filter(s => s.id !== id)); }
  function updateSection(id: string, patch: Partial<Section>) { setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)); }
  function toggleCollapse(id: string) { setSections(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s)); }

  function onPickCategory(sectionId: string, catId: string) {
    const cat = usableCategories.find((c: any) => getCategoryId(c) === catId);
    updateSection(sectionId, { masterCategoryId: catId, title: cat ? getCategoryLabel(cat) : "New Section", scope: cat ? getCategoryScope(cat) : "" });
  }

  async function addBOQCategory(name: string) {
    await supabase.from("master_categories").insert({
      name,
      company_id: companyId || null,
      is_active: true,
      sort_order: usableCategories.length + 1,
    });
    await refreshCategories();
  }

  async function deleteBOQCategory(name: string) {
    await supabase.from("master_categories").delete().eq("name", name);
    await refreshCategories();
  }

  function addItem(sectionId: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: [...s.items, { id: safeId(), pick_type: "", pick_category: "", pick_item: "", pick_variant: "", cost_item_id: null, item_name: "", description: "", unit_id: null, qty: 0, rate: 0, rate_source: "" }] }));
  }
  function deleteItem(sectionId: string, itemId: string) { setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: s.items.filter(it => it.id !== itemId) })); }
  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQItemRow>) { setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: s.items.map(it => it.id === itemId ? { ...it, ...patch } : it) })); }

  function openMeasureModal(sectionId: string, item: BOQItemRow) {
    const unitObj = usableUnits.find((u: any) => getUnitId(u) === item.unit_id);
    const unitLabel = unitObj ? getUnitLabel(unitObj) : "";
    setMeasureModal({
      sectionId,
      itemId: item.id,
      itemName: item.item_name || "Item",
      unit: unitLabel,
      costItemId: item.cost_item_id || null,
      rows: item.measurements?.length
        ? item.measurements
        : [{ id: safeId(), description: "", qty: 1, lengthFt: "", lengthIn: "", widthFt: "", widthIn: "", heightFt: "", heightIn: "", total: 0, deduct: false }],
    });
  }

  async function applyMeasurements(sectionId: string, itemId: string, rows: MeasurementRow[], total: number) {
    const qty = Math.max(0, total);
    // A component that gets its own measurement set opts out of master-measurement inheritance.
    updateItem(sectionId, itemId, { qty, measurements: rows, measurement_overridden: true });
    setMeasureModal(null);
    // Best-effort persist: no-ops silently if the item hasn't been saved to
    // boq_section_items yet — the next saveBoq() will include it via itemPayload.
    const { error } = await supabase
      .from("boq_section_items")
      .update({ measurements: rows, qty })
      .eq("id", itemId);
    if (error) console.error("Failed to persist measurements:", error);
  }

  function applyMasterMeasurement(instanceId: string, rows: MeasurementRow[], grandTotal: number) {
    setAssemblyMasterMeasModal(null);

    const firstRow = rows.find(r => !r.deduct) || rows[0];
    const masterLength = (Number(firstRow?.lengthFt) || 0) + (Number(firstRow?.lengthIn) || 0) / 12;
    const masterWidth = (Number(firstRow?.widthFt) || 0) + (Number(firstRow?.widthIn) || 0) / 12;
    const masterHeight = (Number(firstRow?.heightFt) || 0) + (Number(firstRow?.heightIn) || 0) / 12;

    const vars: Record<string, number> = {
      length: masterLength || grandTotal,
      width: masterWidth || 1,
      height: masterHeight || 1,
      area: grandTotal,
      volume: grandTotal,
      count: grandTotal,
    };

    setSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item => {
        if (item.assembly_instance_id !== instanceId) return item;
        // Skip items that have been manually overridden with their own measurement.
        if (item.measurement_overridden) return item;

        let newQty = grandTotal;
        if (item.component_formula) {
          try {
            let expr = item.component_formula;
            Object.entries(vars).forEach(([k, val]) => {
              expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), String(val));
            });
            if (/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) {
              // eslint-disable-next-line no-new-func
              newQty = Function(`"use strict"; return (${expr})`)() as number;
              newQty = newQty * (1 + (item.component_waste_percent || 0) / 100);
            }
          } catch { /* keep grandTotal */ }
        }

        return {
          ...item,
          qty: Math.round(newQty * 100) / 100,
          assembly_master_length: masterLength,
          assembly_master_width: masterWidth,
          assembly_master_height: masterHeight,
          assembly_master_set: true,
          measurements: rows,
        };
      }),
    })));
  }

  // --- Find Item Handler -----------------------------------------------------
  function handleFindItem(selected: RateItem) {
    if (!findModal) return;
    const { sectionId, rowId } = findModal;
    const unitObj = usableUnits.find((u: any) => getUnitLabel(u).toLowerCase() === (selected.unit || "").toLowerCase());
    updateItem(sectionId, rowId, {
      pick_type: selected.item_type || "",
      pick_category: selected.category || "",
      pick_item: selected.item_name || "",
      pick_variant: selected.variant || "",
      cost_item_id: selected.id,
      item_name: selected.item_name || "",
      description: selected.description || "",
      unit_id: unitObj ? getUnitId(unitObj) : null,
      rate: numOr(selected.current_rate ?? 0, 0),
      rate_source: "library",
    });
    setFindModal(null);
  }

  // --- Smart Selector Handler ------------------------------------------------
  function handleSmartSelection(sel: any) {
    if (!smartSelectorCtx) return;
    const { sectionId, rowId } = smartSelectorCtx;
    const updates: Partial<BOQItemRow> = {
      pick_type: sel.type || "", pick_category: sel.category || "",
      pick_item: sel.item || "", pick_variant: sel.variant || "",
      item_name: sel.itemName || "", cost_item_id: sel.costItemId || null, rate_source: "library",
    };
    if (sel.unit) { const u = usableUnits.find((u: any) => getUnitLabel(u) === sel.unit); if (u) updates.unit_id = getUnitId(u); }
    if (sel.currentRate != null) updates.rate = sel.currentRate;
    updateItem(sectionId, rowId, updates);
    setShowSmartSelector(false); setSmartSelectorCtx(null);
  }

  // --- Assembly Handler ------------------------------------------------------
  function mapLineType(t: string) {
    const x = (t || "").toLowerCase();
    if (x === "material") return "Material";
    if (x === "labour" || x === "labor") return "Labor";
    if (x === "equipment") return "Equipment";
    if (x === "subcontract") return "Subcontract";
    return "Other";
  }
  function matchUnitId(unitName: string | null) {
    if (!unitName) return null;
    const u = usableUnits.find((x: any) => getUnitLabel(x).toLowerCase() === unitName.toLowerCase());
    return u ? getUnitId(u) : null;
  }
// --- Safe formula evaluator (length/height/width only, no eval/Function) ---
type FormulaVars = { length?: number; height?: number; width?: number };

function evalAssemblyFormula(formula: string, vars: FormulaVars): number | null {
  const tokens = formula.match(/[A-Za-z_]+|\d+(\.\d+)?|[+\-*/()]/g);
  if (!tokens) return null;
  let pos = 0;

  function peek() { return tokens![pos]; }
  function next() { return tokens![pos++]; }

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      v = op === "+" ? v + rhs : v - rhs;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  }
  function parseFactor(): number {
    const t = next();
    if (t === undefined) throw new Error("Unexpected end of formula");
    if (t === "(") {
      const v = parseExpr();
      if (next() !== ")") throw new Error("Missing closing paren");
      return v;
    }
    if (t === "-") return -parseFactor();
    if (/^[A-Za-z_]+$/.test(t)) {
      const key = t.toLowerCase();
      if (key === "length" || key === "height" || key === "width") {
        const v = vars[key as keyof FormulaVars];
        if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Missing variable: ${key}`);
        return v;
      }
      throw new Error(`Unknown variable: ${t}`);
    }
    const n = parseFloat(t);
    if (!Number.isFinite(n)) throw new Error(`Bad token: ${t}`);
    return n;
  }

  try {
    const result = parseExpr();
    if (pos < tokens.length) return null; // leftover tokens = malformed formula
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function extractFormula(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/formula:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

function explodeAssembly(
  assemblyId: string,
  qtyBase: number,
  assemblyComponents: AssemblyComponentRow[],
  rateItems: RateItem[],
  usableUnits: any[],
  dims?: FormulaVars,
  assemblyName?: string
): BOQItemRow[] {
  const comps = assemblyComponents
    .filter(c => c.assembly_id === assemblyId)
    .sort((a, b) => a.sort_order - b.sort_order);

  // One shared id per "Add From Assembly" action so the UI can group these
  // rows into a single collapsible summary row (see groupBOQItems below).
  const instanceId = safeId();

  return comps
    .map(c => {
      const r = rateItems.find(x => x.id === c.cost_item_id);
      if (!r) return null;

      const formula = extractFormula(c.notes);
      let rawQty: number;

      if (formula && dims) {
        const evaluated = evalAssemblyFormula(formula, dims);
        rawQty = evaluated !== null ? evaluated : qtyBase * numOr(c.quantity_factor, 1);
      } else {
        rawQty = qtyBase * numOr(c.quantity_factor, 1);
      }

      const finalQty = rawQty * (1 + numOr(c.waste_percent, 0) / 100);

      const unitMatch = r.unit
        ? usableUnits.find((u:any)=>
            getUnitLabel(u).toLowerCase() === (r.unit || "").toLowerCase()
          )
        : null;

      return {
        id: safeId(),
        pick_type: mapLineType(c.line_type),
        pick_category: (r.category ?? "").trim(),
        pick_item: (r.item_name ?? "").trim(),
        pick_variant: (r.variant ?? "").trim(),
        cost_item_id: c.cost_item_id,
        item_name: r.item_name ?? "",
        description: (r.description ?? "").trim() || (formula ? "" : c.notes) || "",
        unit_id: unitMatch ? getUnitId(unitMatch) : null,
        qty: Number.isFinite(finalQty) ? finalQty : 0,
        rate: numOr(r.current_rate ?? 0, 0),
        rate_source: "assembly",
        assembly_instance_id: instanceId,
        assembly_name: assemblyName || null,
        component_formula: formula,
        component_waste_percent: numOr(c.waste_percent, 0),
        measurement_overridden: false,
        assembly_master_set: false,
        assembly_master_length: null,
        assembly_master_width: null,
        assembly_master_height: null,
      };
    })
    .filter(Boolean) as BOQItemRow[];
}

// --- Grouping for display: collapse an assembly's component rows into one
// summary row with a drill-down, without altering what actually gets saved.
type BOQItemGroup =
  | { kind: "single"; item: BOQItemRow }
  | { kind: "assembly"; instanceId: string; name: string; items: BOQItemRow[] };

function groupBOQItems(items: BOQItemRow[]): BOQItemGroup[] {
  const groups: BOQItemGroup[] = [];
  const byInstance = new Map<string, Extract<BOQItemGroup, { kind: "assembly" }>>();
  for (const item of items) {
    if (item.assembly_instance_id) {
      let g = byInstance.get(item.assembly_instance_id);
      if (!g) {
        g = { kind: "assembly", instanceId: item.assembly_instance_id, name: item.assembly_name || "Assembly", items: [] };
        byInstance.set(item.assembly_instance_id, g);
        groups.push(g);
      }
      g.items.push(item);
    } else {
      groups.push({ kind: "single", item });
    }
  }
  return groups;
}

function addAssembly(sectionId: string, assemblyId: string, qtyStr: string) {
  const qtyBase = numOr(qtyStr, 0);

  if (!sectionId || !assemblyId || qtyBase <= 0) {
    alert("Pick an assembly and enter qty > 0.");
    return;
  }

  const newRows = explodeAssembly(
    assemblyId,
    qtyBase,
    assemblyComponents,
    rateItems,
    usableUnits,
    undefined,
    assemblies.find(a => a.id === assemblyId)?.name || "Assembly"
  );

  if (newRows.length === 0) {
    alert("This assembly has no components yet.");
    return;
  }

  setSections(prev =>
    prev.map(s =>
      s.id !== sectionId
        ? s
        : { ...s, items: [...s.items, ...newRows] }
    )
  );

  setAsmModal({
    open: false,
    sectionId: null,
    search: "",
    selectedId: "",
    qty: "1"
  });
}
// --- Generate Actions ------------------------------------------------------
  async function generateEstimate() {
    if (status !== "approved") { setPersistError("Approve the BOQ first."); return; }
    if (!routeProjectId || !boqId) { setPersistError("Save the BOQ first."); return; }
    setPersistLoading(true);
    try {
      const result = await generateEstimateFromBOQ(routeProjectId, boqId);
      if (result.success) setTimeout(() => nav(`/projects/${routeProjectId}/estimates`), 500);
      else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(e?.message); } finally { setPersistLoading(false); }
  }

  async function handleGenerateProcurement() {
    if (!routeProjectId) { setPersistError("Select a project first"); return; }
    if (!boqId) { setPersistError("Save the BOQ before generating procurement"); return; }
    if (!window.confirm("Save BOQ and regenerate procurement list. Continue?")) return;
    setPersistLoading(true); setPersistError(null);
    try {
      await saveBoq("draft");
      await loadLatestBoq(routeProjectId);
      const result = await generateProcurementFromBOQ(routeProjectId);
      if (result.success) {
        const procId = (result as any).procurementId as string | undefined;
        if (procId) { await supabase.rpc("sync_procurement_committed_to_cost_events", { p_procurement_id: procId }); setTimeout(() => nav(`/projects/${routeProjectId}/procurement?view=document&doc=${procId}`), 500); }
        else setTimeout(() => nav(`/projects/${routeProjectId}/procurement`), 500);
      } else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(e?.message); } finally { setPersistLoading(false); }
  }

  async function handleAddSuggestion(suggestion: BOQSuggestion) {
    if (!boqId) { setPersistError("Save the BOQ before adding suggestions"); return; }
    setAddingSuggestion(suggestion.id);
    const result = await addSuggestionToBOQ(suggestion, boqId);
    if (result.success) { setIgnoredSuggestions(prev => new Set(prev).add(suggestion.id)); await loadLatestBoq(routeProjectId || ""); }
    else setPersistError(result.error || "Failed to add suggestion");
    setAddingSuggestion(null);
  }

  // --- Totals ----------------------------------------------------------------
  const totals = useMemo(() => {
    let subtotal = 0;
    for (const s of sections) for (const it of s.items) subtotal += numOr(it.qty) * numOr(it.rate);
    return { subtotal };
  }, [sections]);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const missingRates = sections.reduce((sum, s) => sum + s.items.filter(it => it.qty > 0 && it.rate === 0).length, 0);
  const missingUnits = sections.reduce((sum, s) => sum + s.items.filter(it => !it.unit_id).length, 0);

  // Weight-type items (steel/rebar) get a dedicated bars×length calculator
  // instead of the standard L/W/H measurement modal.
  const measureModalIsWeight = useMemo(() => {
    if (!measureModal?.costItemId) return false;
    const rateItem = rateItems.find(r => r.id === measureModal.costItemId);
    return !!parseCalcJson(rateItem)?.consts?.unit_weight;
  }, [measureModal, rateItems]);

  // --- BOQ AI Actions -------------------------------------------------------
  function addAiMessage(text: string, actions?: {label:string;onClick:()=>void}[]) {
    setAiMessages(prev => [...prev, { role: "ai", text, actions }]);
  }

  async function aiCheckBOQ() {
    setAiPanelLoading(true);
    const issues: string[] = [];
    const missingRateItems = sections.flatMap(s => s.items.filter(it => it.qty > 0 && it.rate === 0).map(it => it.item_name || "Unnamed item"));
    const emptyItems = sections.flatMap(s => s.items.filter(it => !it.item_name.trim()).map(() => s.title));
    const emptySections = sections.filter(s => s.items.length === 0).map(s => s.title);
    if (missingRateItems.length > 0) issues.push(`?? ${missingRateItems.length} item${missingRateItems.length>1?"s":""} have qty but no rate: ${missingRateItems.slice(0,3).join(", ")}${missingRateItems.length>3?` +${missingRateItems.length-3} more`:""}`);
    if (emptySections.length > 0) issues.push(`?? ${emptySections.length} empty section${emptySections.length>1?"s":""}: ${emptySections.join(", ")}`);
    if (emptyItems.length > 0) issues.push(`?? ${emptyItems.length} item${emptyItems.length>1?"s":""} with no name`);
    if (issues.length === 0) {
      addAiMessage("? Your BOQ looks good! All items have names, rates, and quantities. Ready to approve.");
    } else {
      addAiMessage(`Found ${issues.length} issue${issues.length>1?"s":""}:\n\n${issues.join("\n\n")}`);
    }
    setAiPanelLoading(false);
  }

  async function aiSuggestMissingItems() {
    if (sections.length === 0) { addAiMessage("Add some sections and items to your BOQ first, then I can suggest what you might be missing."); return; }
    setAiPanelLoading(true);
    try {
      const boqSummary = sections.map(s => `${s.title}: ${s.items.map(it => it.item_name).filter(Boolean).join(", ")}`).join("\n");
      const text = await magnusAI.chat(
        `You are a Jamaica construction estimating expert. Review this BOQ and suggest any commonly missing items for each section. Be specific and practical for Jamaica construction.
        
BOQ Summary:
${boqSummary}

Available items in rate library: ${rateItems.slice(0,20).map(r=>r.item_name).join(", ")}

Respond in plain English, section by section. Keep it brief and actionable. Max 150 words.`
      );
      addAiMessage(String(text));
    } catch(e:any) { addAiMessage("Could not get suggestions right now. Please try again."); }
    setAiPanelLoading(false);
  }

  async function aiFillMissingRates() {
    const noRate = sections.flatMap(s => s.items.filter(it => it.rate === 0 && it.item_name.trim()));
    if (noRate.length === 0) { addAiMessage("All your items already have rates set. Nothing to fill!"); return; }
    setAiPanelLoading(true);
    addAiMessage(`Getting Jamaica market rates for ${noRate.length} item${noRate.length>1?"s":""}...`);
    let filled = 0;
    for (const item of noRate.slice(0, 5)) {
      try {
        const text = await magnusAI.chat(
          `Jamaica construction price. Item: "${item.item_name}". Respond ONLY with JSON: {"price_jmd":1500,"unit":"each"}`
        );
        const clean = String(text).replace(/\`\`\`json|\`\`\`/g,"").trim();
        const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          const p = JSON.parse(clean.slice(s, e+1));
          const rate = Number(p.price_jmd) || 0;
          if (rate > 0) {
            sections.forEach(sec => sec.items.forEach(it => {
              if (it.id === item.id) updateItem(sec.id, it.id, { rate });
            }));
            filled++;
          }
        }
      } catch {}
    }
    addAiMessage(`? Filled rates for ${filled} item${filled>1?"s":""}${noRate.length>5?` (first 5 of ${noRate.length} ? run again for more)`:""}.`);
    setAiPanelLoading(false);
  }

  async function aiChat(message: string) {
    if (!message.trim()) return;
    setAiMessages(prev => [...prev, { role: "user", text: message }]);
    setAiInput("");
    setAiPanelLoading(true);
    try {
      const boqContext = `BOQ has ${sections.length} sections, ${totalItems} items, total ${fmtMoney(totals.subtotal)}.`;
      const text = await magnusAI.chat(
        `You are a Jamaica construction BOQ assistant for Magnus Boys Construction. 
${boqContext}
User asks: "${message}"
Answer briefly and practically. If they ask to add items, explain they need to use the Add Section / Find Item buttons.`
      );
      addAiMessage(String(text));
    } catch { addAiMessage("Sorry, I could not process that. Please try again."); }
    setAiPanelLoading(false);
  }

  // --- No project guard ------------------------------------------------------
  if (!currentProjectId && !routeProjectId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-slate-500 dark:text-slate-600 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">No Project Selected</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Select a project from the top bar to open the BOQ Builder.</p>
        </div>
      </div>
    );
  }

  // --- Render ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] text-slate-900 dark:text-slate-100">

      {/* -- Sticky Header -- */}
      <div className="sticky top-0 z-30 bg-white dark:bg-[#0d1117]/95 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06]">
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-900/30">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100">BOQ Builder</h1>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${status === "approved" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/25"}`}>{status}</span>
              </div>
              {selectedProject && <div className="text-[11px] text-slate-500 truncate">{selectedProject.name}</div>}
            </div>
          </div>

          {/* Right ? action buttons */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto w-full md:w-auto flex-shrink-0 -mx-5 px-5 md:mx-0 md:px-0 pb-1 md:pb-0">
            {persistLoading && <span className="text-[11px] text-slate-500 flex items-center gap-1"><RefreshCw size={11} className="animate-spin"/>Saving?</span>}
            {saveSuccess && !persistLoading && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle size={11}/>Saved</span>}
            {persistError && <span className="text-[11px] text-red-400 flex items-center gap-1 max-w-[160px] truncate"><AlertCircle size={11}/>{persistError}</span>}

            <button onClick={() => activeProjectId && loadLatestBoq(activeProjectId)} disabled={!activeProjectId || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] text-[11px] text-slate-700 dark:text-slate-300 font-medium disabled:opacity-40 transition">
              <RefreshCw size={12}/> Load
            </button>
            <button onClick={() => void saveBoq("draft")} disabled={!activeProjectId || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-200 dark:border-white/[0.08] text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <Save size={12}/> Save Draft
            </button>
            {canApproveBoq && (
              <button onClick={() => void saveBoq("approved")} disabled={!activeProjectId || persistLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
                <CheckCircle size={12}/> Approve
              </button>
            )}
            <div className="w-px h-4 bg-slate-200 dark:bg-white/[0.08] mx-0.5"/>
            <button onClick={generateEstimate} disabled={status !== "approved" || persistLoading}
              title={status !== "approved" ? "Approve BOQ first" : ""}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <FileSpreadsheet size={12}/> Estimate
            </button>
            <button onClick={handleGenerateProcurement} disabled={!routeProjectId || sections.length === 0 || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <ShoppingCart size={12}/> Procurement
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-white/[0.08] mx-0.5"/>
            <button
              onClick={() => { setShowAIPanel(true); if(aiMessages.length===0) addAiMessage("Hi! I am your BOQ Assistant. I can check your BOQ for issues, suggest missing items, fill in missing rates, or answer any questions. What would you like to do?", [{label:"Check BOQ",onClick:aiCheckBOQ},{label:"Suggest Missing Items",onClick:aiSuggestMissingItems},{label:"Fill Missing Rates",onClick:aiFillMissingRates}]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-[11px] text-white font-bold transition shadow-sm">
              <Bot size={12}/> AI Assistant
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-5 pb-2.5 flex items-center gap-5 flex-wrap">
          {[
            { icon: <Layers size={11}/>, label: "Sections", value: sections.length, color: "text-slate-600 dark:text-slate-400" },
            { icon: <Package size={11}/>, label: "Items", value: totalItems, color: "text-slate-600 dark:text-slate-400" },
            { icon: <DollarSign size={11}/>, label: "Total", value: fmtMoney(totals.subtotal), color: "text-cyan-300" },
          ].map(({ icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-slate-700">{icon}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-600">{label}</span>
              <span className={`text-[10px] font-bold ${color}`}>{value}</span>
            </div>
          ))}
          {missingRates > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5">
              <AlertTriangle size={10}/> {missingRates} item{missingRates > 1 ? "s" : ""} missing rate
            </div>
          )}
          {lastAutoSaveAt && <span className="text-[10px] text-slate-400 dark:text-slate-700 ml-auto">Last saved {lastAutoSaveAt}</span>}
        </div>
      </div>

      {/* -- Body -- */}
      <div className="px-5 py-4 space-y-3 max-w-[1440px] mx-auto">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button onClick={addSection} disabled={!canEdit || !activeProjectId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition">
            <Plus size={13}/> Add Section
          </button>
          <button onClick={() => nav("/settings/master-lists")} className="text-[11px] text-slate-500 dark:text-slate-600 hover:text-slate-600 dark:text-slate-400 transition">
            Edit Categories ?
          </button>
        </div>

        {/* Empty state */}
        {sections.length === 0 && !persistLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] flex items-center justify-center mb-4">
              <FileSpreadsheet size={24} className="text-slate-500 dark:text-slate-600"/>
            </div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">No sections yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-600 mb-5 max-w-xs">Start by adding a section. Each section groups related items ? e.g. "Foundations", "Blockwork", "Roofing".</p>
            <button onClick={addSection} disabled={!canEdit || !activeProjectId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition">
              <Plus size={13}/> Add First Section
            </button>
          </div>
        )}

        {/* Sections */}
        {sections.map((section, sIdx) => {
          const sectionTotal = section.items.reduce((sum, it) => sum + numOr(it.qty) * numOr(it.rate), 0);
          const sectionWarnings = section.items.filter(it => it.qty > 0 && it.rate === 0).length;
          return (
            <div key={section.id} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1117] overflow-hidden">
              {/* Section header */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.06]">
                <button onClick={() => toggleCollapse(section.id)} className="text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:text-slate-300 transition flex-shrink-0">
                  {section.collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                </button>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-700 w-5 text-center flex-shrink-0">{sIdx + 1}</span>

                <EditableDropdown
                  value={(() => {
                    const cat = usableCategories.find((c: any) => getCategoryId(c) === section.masterCategoryId);
                    return cat ? getCategoryLabel(cat) : "";
                  })()}
                  onChange={(name) => {
                    const cat = usableCategories.find((c: any) => getCategoryLabel(c) === name);
                    onPickCategory(section.id, cat ? getCategoryId(cat) : "");
                  }}
                  options={usableCategories.map((c: any) => getCategoryLabel(c))}
                  onAddOption={addBOQCategory}
                  onDeleteOption={deleteBOQCategory}
                  placeholder="Category?"
                  disabled={!canEdit}
                  className="w-28 md:w-40 flex-shrink-0"
                />

                <input value={section.title} disabled={!canEdit} onChange={e => updateSection(section.id, { title: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-bold text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none disabled:opacity-60 min-w-[100px]"
                  placeholder="Section title?"/>

                <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3 flex-shrink-0 md:ml-auto order-last md:order-none">
                  {sectionWarnings > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle size={10}/>{sectionWarnings} missing rate</span>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-600">{section.items.length} item{section.items.length !== 1 ? "s" : ""}</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmtMoney(sectionTotal)}</span>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => addItem(section.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-[10px] text-cyan-400 font-semibold transition">
                        <Plus size={10}/> Item
                      </button>
                      <button onClick={() => setAsmModal({ open: true, sectionId: section.id, search: "", selectedId: "", qty: "1" })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.04] hover:bg-white/[0.07] border border-slate-200 dark:border-white/[0.07] text-[10px] text-slate-600 dark:text-slate-400 transition">
                        <Boxes size={10}/> Assembly
                      </button>
                      <button onClick={() => deleteSection(section.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 dark:text-slate-700 hover:text-red-400 transition">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Scope */}
              {!section.collapsed && (
                <div className="px-4 py-1.5 bg-slate-50 dark:bg-white/[0.01] border-b border-slate-100 dark:border-white/[0.04]">
                  <input value={section.scope} disabled={!canEdit} onChange={e => updateSection(section.id, { scope: e.target.value })}
                    className="w-full bg-transparent text-[11px] text-slate-500 dark:text-slate-600 placeholder-slate-800 focus:outline-none focus:text-slate-600 dark:text-slate-400 disabled:opacity-50"
                    placeholder="Section scope / description (e.g. All 6&quot; block walls including mortar and ties)?"/>
                </div>
              )}

              {/* Items */}
              {!section.collapsed && (
                <div>
                  {section.items.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-slate-400 dark:text-slate-700 mb-3">No items yet in this section</p>
                      <button onClick={() => addItem(section.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-xs text-cyan-400 font-semibold transition">
                        <Plus size={11}/> Add Item
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Mobile card layout */}
                      <div className="md:hidden divide-y divide-slate-100 dark:divide-white/[0.03]">
                        {(() => {
                          const renderMobileCard = (item: BOQItemRow, indented?: boolean) => {
                          const amount = numOr(item.qty) * numOr(item.rate);
                          const isMissingRate = item.qty > 0 && item.rate === 0;
                          const linkedItem = item.pick_item || item.cost_item_id;
                          return (
                            <div key={item.id} className={`p-3 ${indented ? "pl-6 bg-purple-50/40 dark:bg-purple-500/[0.03]" : ""} ${isMissingRate ? "bg-amber-500/[0.02]" : ""}`}>
                              {/* Row 1: Type badge + Item name + Delete */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {item.pick_type && <TypeChip type={item.pick_type}/>}
                                  <input value={item.item_name} disabled={!canEdit}
                                    onChange={e => updateItem(section.id, item.id, { item_name: e.target.value, rate_source: "manual" })}
                                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none disabled:opacity-60"
                                    placeholder="Item name…"/>
                                  {isMissingRate && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0"/>}
                                </div>
                                <button onClick={() => deleteItem(section.id, item.id)} disabled={!canEdit}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 dark:text-slate-700 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40">
                                  <X size={14}/>
                                </button>
                              </div>

                              {/* Row 2: Find Item button */}
                              <div className="mb-2">
                                <button onClick={() => setFindModal({ open: true, sectionId: section.id, rowId: item.id })}
                                  disabled={!canEdit || rateLoading}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition disabled:opacity-40">
                                  <Search size={12}/>
                                  {linkedItem ? `📦 ${item.pick_item || "Linked"}` : "Find Item from Library"}
                                </button>
                              </div>

                              {/* Row 3: Unit + Qty + Rate */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex-shrink-0">
                                  <div className="text-[9px] text-slate-400 dark:text-slate-700 mb-1 uppercase">Unit</div>
                                  <select value={item.unit_id ?? ""} disabled={!canEdit}
                                    onChange={e => updateItem(section.id, item.id, { unit_id: e.target.value || null })}
                                    className="w-20 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-700 dark:text-slate-300 focus:outline-none disabled:opacity-50">
                                    <option value="">—</option>
                                    {usableUnits.map((u: any) => <option key={getUnitId(u)} value={getUnitId(u)}>{getUnitLabel(u)}</option>)}
                                  </select>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[9px] text-slate-400 dark:text-slate-700 mb-1 uppercase">Quantity</div>
                                  <div className="flex items-center gap-1">
                                    <input type="number" value={Number.isFinite(item.qty) ? item.qty : 0} disabled={!canEdit}
                                      onChange={e => updateItem(section.id, item.id, { qty: numOr(e.target.value, 0) })}
                                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-800 dark:text-slate-200 text-center focus:outline-none focus:border-cyan-500/40 disabled:opacity-50"/>
                                    {canEdit && routeProjectId && (
                                      <button onClick={() => setImportTakeoffModal({ open: true, sectionId: section.id, itemId: item.id })}
                                        className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-slate-400 dark:text-slate-700 hover:text-emerald-400 transition flex-shrink-0" title="Import from Takeoff">
                                        <Download size={13}/>
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button onClick={() => openMeasureModal(section.id, item)}
                                        className={`p-1.5 rounded-lg transition flex-shrink-0 ${item.measurements?.length ? "text-blue-400 bg-blue-50 dark:bg-blue-500/15" : "text-slate-400 dark:text-slate-700 hover:bg-blue-50 dark:hover:bg-blue-500/15 hover:text-blue-400"}`}
                                        title="Enter measurements">
                                        📐
                                      </button>
                                    )}
                                    {canEdit && item.assembly_instance_id && item.measurement_overridden && (
                                      <button
                                        onClick={() => updateItem(section.id, item.id, { measurement_overridden: false })}
                                        className="text-[9px] text-amber-500 hover:text-amber-600 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 font-medium flex-shrink-0"
                                        title="Remove override — inherit from assembly master measurement">
                                        ↩ Reset
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-shrink-0 w-24">
                                  <div className="text-[9px] text-slate-400 dark:text-slate-700 mb-1 uppercase">Rate (JMD)</div>
                                  <input type="number" value={Number.isFinite(item.rate) ? item.rate : 0} disabled={!canEdit}
                                    onChange={e => updateItem(section.id, item.id, { rate: numOr(e.target.value, 0), rate_source: "manual" })}
                                    className={`w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border text-xs font-semibold text-right focus:outline-none disabled:opacity-50 transition ${isMissingRate ? "border-amber-500/40 text-amber-500" : "border-slate-200 dark:border-white/[0.07] text-green-500 dark:text-green-400 focus:border-cyan-500/40"}`}/>
                                </div>
                              </div>

                              {/* Row 4: Amount */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                                {isMissingRate && (
                                  <span className="text-[10px] text-amber-500 flex items-center gap-1">
                                    <AlertTriangle size={10}/> No rate set
                                  </span>
                                )}
                                <div className="ml-auto text-sm font-bold text-slate-700 dark:text-slate-200">
                                  {fmtMoney(amount)}
                                </div>
                              </div>
                            </div>
                          );
                          };

                          return groupBOQItems(section.items).map(group => {
                            if (group.kind === "single") return renderMobileCard(group.item);
                            const total = group.items.reduce((s, it) => s + numOr(it.qty) * numOr(it.rate), 0);
                            const expanded = expandedAssemblies.has(group.instanceId);
                            return (
                              <React.Fragment key={group.instanceId}>
                                <div className="p-3 bg-purple-50/60 dark:bg-purple-500/[0.05]">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20 flex-shrink-0">ASM</span>
                                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{group.name}</span>
                                    </div>
                                    <button onClick={() => deleteAssemblyGroup(section.id, group.instanceId)} disabled={!canEdit}
                                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 dark:text-slate-700 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40">
                                      <X size={14}/>
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <button onClick={() => toggleAssemblyExpanded(group.instanceId)}
                                        className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-colors ${expanded ? "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                        {expanded ? "▲ Hide" : "▼"} {group.items.length} component{group.items.length !== 1 ? "s" : ""}
                                      </button>
                                      {(() => {
                                        const masterSet = group.items.find(i => i.assembly_master_set);
                                        return (
                                          <button
                                            onClick={() => setAssemblyMasterMeasModal({
                                              instanceId: group.instanceId,
                                              assemblyName: group.name,
                                              unit: "m",
                                              currentRows: masterSet?.measurements?.length ? masterSet.measurements : [{
                                                id: safeId(), description: "", qty: 1,
                                                lengthFt: "", lengthIn: "", widthFt: "", widthIn: "", heightFt: "", heightIn: "",
                                                total: 0, deduct: false,
                                              }],
                                            })}
                                            disabled={!canEdit}
                                            className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-colors disabled:opacity-40 ${masterSet ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>
                                            📐 {masterSet ? `${masterSet.assembly_master_length?.toFixed(1)}m` : "Measure"}
                                          </button>
                                        );
                                      })()}
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{fmtMoney(total)}</span>
                                  </div>
                                </div>
                                {expanded && group.items.map(it => renderMobileCard(it, true))}
                              </React.Fragment>
                            );
                          });
                        })()}

                        {/* Add item — mobile */}
                        {canEdit && (
                          <div className="p-3">
                            <button onClick={() => addItem(section.id)}
                              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/[0.07] text-xs text-slate-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-500 transition-colors">
                              <Plus size={14}/> Add Item
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Desktop grid layout */}
                      <div className="hidden md:block">
                      {/* Column headers */}
                      <div className="grid px-4 py-2 border-b border-slate-100 dark:border-white/[0.04] text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-700"
                        style={{ gridTemplateColumns: "44px 1fr 160px 80px 104px 90px 90px 32px" }}>
                        <span>Type</span>
                        <span>Item / Description</span>
                        <span>From Library</span>
                        <span>Unit</span>
                        <span className="text-right pr-11">Qty</span>
                        <span className="text-right">Rate (JMD)</span>
                        <span className="text-right">Amount</span>
                        <span/>
                      </div>

                      {/* Item rows */}
                      {(() => {
                        const renderDesktopRow = (item: BOQItemRow, indented?: boolean) => {
                        const amount = numOr(item.qty) * numOr(item.rate);
                        const isMissingRate = item.qty > 0 && item.rate === 0;
                        const linkedItem = item.pick_item || item.cost_item_id;
                        return (
                          <div key={item.id}
                            className={`grid px-4 py-2 border-b border-white/[0.03] hover:bg-slate-50 dark:bg-white/[0.02] transition group items-center ${indented ? "pl-8 bg-purple-50/40 dark:bg-purple-500/[0.03]" : ""} ${isMissingRate ? "bg-amber-500/[0.02]" : ""}`}
                            style={{ gridTemplateColumns: "44px 1fr 160px 80px 104px 90px 90px 32px" }}>

                            {/* Type chip */}
                            <div className="min-w-0">
                              {item.pick_type
                                ? <TypeChip type={item.pick_type}/>
                                : <span className="text-[10px] text-slate-800">?</span>}
                            </div>

                            {/* Item name + description */}
                            <div className="pr-3 space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <input value={item.item_name} disabled={!canEdit}
                                  onChange={e => updateItem(section.id, item.id, { item_name: e.target.value, rate_source: "manual" })}
                                  className="flex-1 bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none disabled:opacity-60 min-w-0"
                                  placeholder="Item name?"/>
                                {isMissingRate && <span title="Missing rate ? qty set but no rate"><AlertTriangle size={10} className="text-amber-500 flex-shrink-0" /></span>}
                              </div>
                              <input value={item.description} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { description: e.target.value })}
                                className="w-full bg-transparent text-[10px] text-slate-500 dark:text-slate-600 placeholder-slate-800 focus:outline-none disabled:opacity-60"
                                placeholder="Description?"/>
                              {item.rate_source === "library" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15 font-medium">Library</span>
                              )}
                              {item.rate_source === "assembly" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15 font-medium">Assembly</span>
                              )}
                              {item.rate_source === "manual" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 border border-slate-500/15 font-medium">Manual</span>
                              )}
                            </div>

                            {/* Library picker */}
                            <div className="pr-2 space-y-1 min-w-0">
                              {linkedItem && (
                                <div className="text-[9px] text-slate-500 dark:text-slate-600 truncate" title={item.pick_item || ""}>
                                  {item.pick_item || "Linked"}
                                </div>
                              )}
                              <div className="flex gap-1">
                                <button onClick={() => setFindModal({ open: true, sectionId: section.id, rowId: item.id })}
                                  disabled={!canEdit || rateLoading}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-400 font-semibold disabled:opacity-40 transition">
                                  <Search size={9}/> Find Item
                                </button>
                                {companyId && (
                                  <button onClick={() => { setSmartSelectorCtx({ sectionId: section.id, rowId: item.id }); setShowSmartSelector(true); }}
                                    disabled={!canEdit || rateLoading} title="Smart guided selector"
                                    className="p-1.5 rounded-lg bg-gradient-to-r from-cyan-600/20 to-violet-600/20 hover:from-cyan-600/40 hover:to-violet-600/40 border border-cyan-500/25 text-cyan-400 disabled:opacity-40 transition">
                                    <Wand2 size={11}/>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Unit */}
                            <div className="pr-1 min-w-0">
                              <select value={item.unit_id ?? ""} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { unit_id: e.target.value || null })}
                                className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg px-1.5 py-1 text-[10px] text-slate-700 dark:text-slate-300 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50">
                                <option value="">?</option>
                                {usableUnits.map((u: any) => <option key={getUnitId(u)} value={getUnitId(u)}>{getUnitLabel(u)}</option>)}
                              </select>
                            </div>

                            {/* Qty */}
                            <div className="flex items-center gap-0.5 pr-1 min-w-0">
                              <input type="number" value={Number.isFinite(item.qty) ? item.qty : 0} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { qty: numOr(e.target.value, 0) })}
                                className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg px-1.5 py-1 text-[10px] text-right text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50"/>
                              {canEdit && routeProjectId && (
                                <button onClick={() => setImportTakeoffModal({ open: true, sectionId: section.id, itemId: item.id })}
                                  className="p-0.5 rounded hover:bg-emerald-500/15 text-slate-400 dark:text-slate-700 hover:text-emerald-400 transition flex-shrink-0" title="Import from Takeoff">
                                  <Download size={10}/>
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  onClick={() => openMeasureModal(section.id, item)}
                                  className={`p-0.5 rounded transition flex-shrink-0 ${item.measurements?.length ? "text-blue-400 hover:bg-blue-500/15" : "text-slate-700 hover:bg-blue-500/15 hover:text-blue-400"}`}
                                  title="Enter measurements">
                                  📐
                                </button>
                              )}
                              {canEdit && item.assembly_instance_id && item.measurement_overridden && (
                                <button
                                  onClick={() => updateItem(section.id, item.id, { measurement_overridden: false })}
                                  className="text-[9px] text-amber-500 hover:text-amber-600 px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 font-medium flex-shrink-0"
                                  title="Remove override — inherit from assembly master measurement">
                                  ↩
                                </button>
                              )}
                            </div>

                            {/* Rate */}
                            <div className="pr-1 min-w-0">
                              <input type="number" value={Number.isFinite(item.rate) ? item.rate : 0} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { rate: numOr(e.target.value, 0), rate_source: "manual" })}
                                className={`w-full bg-slate-50 dark:bg-white/[0.04] border rounded-lg px-1.5 py-1 text-[10px] text-right font-semibold focus:outline-none disabled:opacity-50 transition ${isMissingRate ? "border-amber-500/40 text-amber-500" : "border-slate-200 dark:border-white/[0.07] text-green-400 focus:border-cyan-500/40"}`}/>
                            </div>

                            {/* Amount */}
                            <div className="text-right text-xs font-bold text-slate-800 dark:text-slate-200 pr-1 min-w-0">
                              {fmtMoney(amount)}
                            </div>

                            {/* Delete */}
                            <div className="flex justify-center min-w-0">
                              <button onClick={() => deleteItem(section.id, item.id)} disabled={!canEdit}
                                className="p-1 rounded-lg text-transparent group-hover:text-slate-400 dark:text-slate-700 hover:!text-red-400 hover:bg-red-500/10 transition disabled:hidden">
                                <X size={12}/>
                              </button>
                            </div>
                          </div>
                        );
                        };

                        return groupBOQItems(section.items).map(group => {
                          if (group.kind === "single") return renderDesktopRow(group.item);
                          const total = group.items.reduce((s, it) => s + numOr(it.qty) * numOr(it.rate), 0);
                          const expanded = expandedAssemblies.has(group.instanceId);
                          return (
                            <React.Fragment key={group.instanceId}>
                              <div className="grid px-4 py-2 border-b border-white/[0.03] items-center group"
                                style={{ gridTemplateColumns: "44px 1fr 160px 80px 104px 90px 90px 32px" }}>
                                <div>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-purple-500/10 text-purple-500 border border-purple-500/20">ASM</span>
                                </div>
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{group.name}</span>
                                    <button onClick={() => toggleAssemblyExpanded(group.instanceId)}
                                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition-colors flex-shrink-0 ${expanded ? "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:text-purple-500"}`}>
                                      {expanded ? "▲ Hide" : "▼ Breakdown"}
                                    </button>
                                    {(() => {
                                      const masterSet = group.items.find(i => i.assembly_master_set);
                                      return (
                                        <button
                                          onClick={() => setAssemblyMasterMeasModal({
                                            instanceId: group.instanceId,
                                            assemblyName: group.name,
                                            unit: "m",
                                            currentRows: masterSet?.measurements?.length ? masterSet.measurements : [{
                                              id: safeId(), description: "", qty: 1,
                                              lengthFt: "", lengthIn: "", widthFt: "", widthIn: "", heightFt: "", heightIn: "",
                                              total: 0, deduct: false,
                                            }],
                                          })}
                                          disabled={!canEdit}
                                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold transition-colors flex-shrink-0 disabled:opacity-40 ${masterSet ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-500"}`}
                                          title="Set master measurement for all components">
                                          📐 {masterSet ? `${masterSet.assembly_master_length?.toFixed(1)}m` : "Measure"}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{group.items.length} component{group.items.length !== 1 ? "s" : ""}</div>
                                </div>
                                <div/>
                                <div/>
                                <div/>
                                <div/>
                                <div className="text-right text-xs font-bold text-slate-700 dark:text-slate-200 pr-1">
                                  {fmtMoney(total)}
                                </div>
                                <div className="flex justify-center min-w-0">
                                  <button onClick={() => deleteAssemblyGroup(section.id, group.instanceId)} disabled={!canEdit}
                                    className="p-1 rounded-lg text-transparent group-hover:text-slate-400 dark:text-slate-700 hover:!text-red-400 hover:bg-red-500/10 transition disabled:hidden">
                                    <X size={12}/>
                                  </button>
                                </div>
                              </div>
                              {expanded && group.items.map(it => renderDesktopRow(it, true))}
                            </React.Fragment>
                          );
                        });
                      })()}
                      </div>

                      {/* Section total */}
                      <div className="flex items-center justify-end gap-3 px-4 py-2.5 bg-slate-50 dark:bg-white/[0.01] border-t border-slate-100 dark:border-white/[0.04]">
                        <span className="text-[10px] text-slate-500 dark:text-slate-600 uppercase tracking-wider font-semibold">Section Total</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{fmtMoney(sectionTotal)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Grand total */}
        {sections.length > 0 && (
          <div className="flex items-center justify-end gap-4 px-5 py-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04]">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Grand Total</div>
              <div className="text-2xl font-bold text-cyan-300">{fmtMoney(totals.subtotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* -- Find Item Modal -- */}
      {findModal && (
        <FindItemModal rateItems={rateItems} onSelect={handleFindItem} onClose={() => setFindModal(null)}/>
      )}

      {/* -- Assembly Modal -- */}
      {asmModal.open && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0d1117] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Add From Assembly</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Explodes an assembly into individual line items</div>
              </div>
              <button onClick={() => setAsmModal({ open: false, sectionId: null, search: "", selectedId: "", qty: "1" })} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-600 pointer-events-none"/>
                  <input autoFocus value={asmModal.search} onChange={e => setAsmModal(p => ({ ...p, search: e.target.value }))}
                    placeholder="Search assemblies?"
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600 outline-none focus:border-blue-500/50"/>
                </div>
                <input value={asmModal.qty} onChange={e => setAsmModal(p => ({ ...p, qty: e.target.value }))} type="number"
                  className="w-20 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500/50 text-right"
                  placeholder="Qty"/>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] overflow-hidden max-h-72 overflow-y-auto">
                {assemblies.filter(a => {
                  const q = asmModal.search.trim().toLowerCase();
                  return !q || (a.name||"").toLowerCase().includes(q) || (a.category||"").toLowerCase().includes(q);
                }).map(a => {
                  const selected = asmModal.selectedId === a.id;
                  const cc = assemblyComponents.filter(c => c.assembly_id === a.id).length;
                  return (
                    <button key={a.id} onClick={() => setAsmModal(p => ({ ...p, selectedId: a.id }))}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] last:border-0 flex items-center justify-between transition ${selected ? "bg-cyan-500/10" : "hover:bg-slate-50 dark:bg-white/[0.03]"}`}>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{a.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-600 mt-0.5">{a.category && `${a.category} ? `}{cc} component{cc !== 1 ? "s" : ""}{a.unit && ` ? ${a.unit}`}</div>
                      </div>
                      {selected && <Check size={14} className="text-cyan-400 flex-shrink-0"/>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 dark:border-white/[0.07]">
              <span className="text-[11px] text-slate-500 dark:text-slate-600">{asmModal.selectedId ? "Ready to add" : "Select an assembly"}</span>
              <button onClick={() => asmModal.sectionId && asmModal.selectedId && addAssembly(asmModal.sectionId, asmModal.selectedId, asmModal.qty)}
                disabled={!asmModal.sectionId || !asmModal.selectedId}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40 transition">
                <Plus size={12}/> Add Lines
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- AI Suggestions Modal -- */}
      {aiSuggestionsModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0d1117] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles size={16} className="text-white"/>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">AI BOQ Suggestions</div>
                  <div className="text-[11px] text-slate-500">{aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length} items recommended</div>
                </div>
              </div>
              <button onClick={() => setAiSuggestionsModal({ open: false, suggestions: [] })} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">All suggestions added or ignored.</p>
              ) : (
                <div className="space-y-3">
                  {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).map(s => (
                    <BOQSuggestionCard key={s.id} suggestion={s} onAdd={handleAddSuggestion}
                      onIgnore={id => setIgnoredSuggestions(p => new Set(p).add(id))} isAdding={addingSuggestion === s.id}/>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -- Smart Selector -- */}
      {showSmartSelector && companyId && (
        <SmartItemSelector companyId={companyId} onSelect={handleSmartSelection}
          onCancel={() => { setShowSmartSelector(false); setSmartSelectorCtx(null); }} title="Smart Item Selector"/>
      )}

      {/* -- BOQ AI Panel -- */}
      {showAIPanel && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-[#0d1117] border-l border-slate-200 dark:border-white/[0.08] shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] bg-gradient-to-r from-purple-900/40 to-blue-900/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <Bot size={15} className="text-white"/>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">BOQ AI Assistant</div>
                <div className="text-[10px] text-slate-500">Powered by Magnus AI</div>
              </div>
            </div>
            <button onClick={() => setShowAIPanel(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:bg-white/[0.06] text-slate-500 hover:text-slate-700 dark:text-slate-300 transition">
              <X size={15}/>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] grid grid-cols-3 gap-2">
            {[
              {label:"Check BOQ",icon:<Zap size={11}/>,color:"text-amber-400",action:aiCheckBOQ},
              {label:"Suggest Items",icon:<Star size={11}/>,color:"text-purple-400",action:aiSuggestMissingItems},
              {label:"Fill Rates",icon:<Sparkles size={11}/>,color:"text-emerald-400",action:aiFillMissingRates},
            ].map(({label,icon,color,action})=>(
              <button key={label} onClick={()=>{action();}}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] hover:bg-white/[0.08] border border-slate-200 dark:border-white/[0.07] transition">
                <span className={color}>{icon}</span>
                <span className="text-[9px] text-slate-600 dark:text-slate-400 font-semibold text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {aiMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot size={24} className="text-slate-400 dark:text-slate-700 mx-auto mb-2"/>
                <p className="text-xs text-slate-500 dark:text-slate-600">Click a quick action above or type a question below</p>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${msg.role==="user"?"bg-blue-600 text-white":"bg-slate-200 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200"}`}>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-slate-300 dark:border-white/[0.1]">
                      {msg.actions.map(a => (
                        <button key={a.label} onClick={a.onClick}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-[10px] text-purple-300 font-semibold transition">
                          <Zap size={9}/>{a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {aiPanelLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-200 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <Loader size={12} className="text-purple-400 animate-spin"/>
                  <span className="text-[11px] text-slate-500">Thinking?</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-white/[0.07]">
            <div className="flex gap-2">
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&aiChat(aiInput)}
                placeholder="Ask anything about your BOQ?"
                className="flex-1 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 dark:text-slate-600 outline-none focus:border-purple-500/50"/>
              <button onClick={()=>aiChat(aiInput)} disabled={!aiInput.trim()||aiPanelLoading}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition">
                <MessageSquare size={14}/>
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-700 mt-1.5 text-center">Press Enter to send ? AI uses Jamaica construction knowledge</p>
          </div>
        </div>
      )}

      {/* -- Import Takeoff -- */}
      <ImportTakeoffModal isOpen={importTakeoffModal.open}
        onClose={() => setImportTakeoffModal({ open: false, sectionId: null, itemId: null })}
        projectId={routeProjectId || ""}
        onImport={(_g: string, _m: string, value: number) => {
          if (!importTakeoffModal.sectionId || !importTakeoffModal.itemId) return;
          updateItem(importTakeoffModal.sectionId, importTakeoffModal.itemId, { qty: value });
        }}/>

      {/* -- AI Assistant -- */}

      {/* -- Measurement Modal -- */}
      {measureModal && measureModalIsWeight && (
        <WeightMeasurementModal
          modal={measureModal}
          onClose={() => setMeasureModal(null)}
          onApply={applyMeasurements}
          rateItems={rateItems}
        />
      )}
      {measureModal && !measureModalIsWeight && (
        <MeasurementModal
          modal={measureModal}
          onClose={() => setMeasureModal(null)}
          onApply={applyMeasurements}
          rateItems={rateItems}
        />
      )}

      {/* -- Assembly master measurement modal -- */}
      {assemblyMasterMeasModal && (
        <MeasurementModal
          modal={{
            sectionId: "",
            itemId: assemblyMasterMeasModal.instanceId,
            itemName: assemblyMasterMeasModal.assemblyName,
            unit: assemblyMasterMeasModal.unit,
            costItemId: null,
            rows: assemblyMasterMeasModal.currentRows,
          }}
          onClose={() => setAssemblyMasterMeasModal(null)}
          onApply={(_sectionId, _itemId, rows, total) => applyMasterMeasurement(assemblyMasterMeasModal.instanceId, rows, total)}
          rateItems={rateItems}
        />
      )}
    </div>
  );
}