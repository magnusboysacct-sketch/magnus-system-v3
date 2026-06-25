// src/pages/AssembliesPage.tsx — Assembly Builder v2
// Formula-driven, measurement-type aware, wastage per component, live preview

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { magnusAI } from "../lib/magnusAI";
import {
  Plus, Trash2, Edit2, Save, X, Search, ChevronRight,
  Ruler, Square, Hash, Box, Layers, Sparkles, RefreshCw,
  AlertCircle, Check, Copy, Play, Package, Wand2, Info, Mic, MicOff, Bot, Loader
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type MeasureType = "linear" | "area" | "count" | "volume";

interface Assembly {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  assembly_code: string | null;
  measure_type: MeasureType; // stored in metadata.measure_type
  default_waste_percent: number;
  output_unit: string | null;
  is_active: boolean;
  metadata: any;
  componentCount?: number;
}

interface CostItem {
  id: string;
  item_name: string;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  variant: string | null;
}

interface Component {
  id: string;
  assembly_id: string;
  cost_item_id: string;
  line_type: string;
  quantity_factor: number;   // legacy — we use formula now
  waste_percent: number;
  sort_order: number;
  notes: string | null;
  formula: string;           // stored in metadata.formula
  cost_item?: CostItem | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function uid() { try { return crypto.randomUUID(); } catch { return `${Date.now()}`; } }

// Safe formula evaluator using the measurement variables
function evalFormula(formula: string, vars: Record<string, number>): number | null {
  try {
    const clean = formula.trim();
    if (!clean) return null;
    // Replace variable names with their values
    let expr = clean;
    Object.entries(vars).forEach(([k, v]) => {
      expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), String(v));
    });
    // Only allow safe math characters
    if (!/^[\d\s\+\-\*\/\(\)\.\,]+$/.test(expr)) return null;
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === "number" && isFinite(result) ? result : null;
  } catch { return null; }
}

// Variables available per measurement type
const MEASURE_VARS: Record<MeasureType, string[]> = {
  linear: ["length", "height", "width"],
  area:   ["area", "length", "width"],
  count:  ["count"],
  volume: ["volume", "length", "width", "height"],
};

const MEASURE_CFG: Record<MeasureType, { label: string; icon: React.ReactNode; color: string; hint: string }> = {
  linear: { label: "Linear",  icon: <Ruler size={14}/>,  color: "#38bdf8", hint: "Variables: length, height, width" },
  area:   { label: "Area",    icon: <Square size={14}/>, color: "#a78bfa", hint: "Variables: area, length, width" },
  count:  { label: "Count",   icon: <Hash size={14}/>,   color: "#fb923c", hint: "Variables: count" },
  volume: { label: "Volume",  icon: <Box size={14}/>,    color: "#34d399", hint: "Variables: volume, length, width, height" },
};

const CATEGORIES = [
  "Masonry","Concrete","Structural Steel","Timber & Lumber","Roofing",
  "Plumbing","Electrical","Finishes","Earthworks","General","Other"
];

const LINE_TYPES = ["material","labor","equipment","subcontract","other"];

const TYPE_COLORS: Record<string,string> = {
  material:"bg-blue-500/10 text-blue-400 border-blue-500/20",
  labor:"bg-amber-500/10 text-amber-400 border-amber-500/20",
  equipment:"bg-purple-500/10 text-purple-400 border-purple-500/20",
  subcontract:"bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  other:"bg-slate-500/10 text-slate-400 border-slate-500/20",
};

// ─── Formula hints per measurement type ───────────────────────────────────────
const FORMULA_HINTS: Record<MeasureType, {label:string;formula:string}[]> = {
  linear: [
    { label:"Blocks per linear ft", formula:"(length / 0.667) * (height / 0.5)" },
    { label:"Bags of cement", formula:"length * 0.08" },
    { label:"Labor hours", formula:"length * 1.5" },
    { label:"Simple factor", formula:"length * 2.5" },
  ],
  area: [
    { label:"Tiles (1 ft² each)", formula:"area * 1.05" },
    { label:"Paint (1 gal/400 ft²)", formula:"area / 400" },
    { label:"Bags of cement", formula:"area * 0.12" },
    { label:"Simple factor", formula:"area * 0.5" },
  ],
  count: [
    { label:"Per unit", formula:"count * 1" },
    { label:"Materials per unit", formula:"count * 4" },
  ],
  volume: [
    { label:"Concrete (1 yd³)", formula:"volume / 27" },
    { label:"Bags (0.6 ft³ per bag)", formula:"volume / 0.6" },
  ],
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AssembliesPage() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [loading, setLoading] = useState(true);
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [companyId, setCompanyId] = useState<string>("");

  // Active assembly
  const [activeId, setActiveId] = useState<string | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [compLoading, setCompLoading] = useState(false);

  // UI state
  const [showNewForm, setShowNewForm] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New assembly form
  const [form, setForm] = useState({
    name: "", description: "", category: "", assembly_code: "",
    measure_type: "linear" as MeasureType, default_waste_percent: "0", output_unit: "",
  });

  // Edit assembly inline
  const [editingAssembly, setEditingAssembly] = useState(false);
  const [editForm, setEditForm] = useState({ ...form });

  // New component form
  const [newComp, setNewComp] = useState({
    cost_item_id: "", line_type: "material", formula: "", waste_percent: "0", notes: "",
  });
  const [showItemSearch, setShowItemSearch] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  // Live preview
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({
    length: "10", height: "8", width: "1", area: "100", count: "5", volume: "50",
  });
  const [showPreview, setShowPreview] = useState(false);

  const activeAssembly = assemblies.find(a => a.id === activeId) || null;

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).single();
        if (p?.company_id) setCompanyId(p.company_id);
      }
      await loadAssemblies();
      const { data: items } = await supabase.from("cost_items")
        .select("id,item_name,unit,category,item_type,variant")
        .eq("is_active", true).order("item_name").limit(5000);
      setCostItems(items || []);
      setLoading(false);
    }
    init();
  }, []);

  async function loadAssemblies() {
    setLoading(true);
    const { data: asmbs } = await supabase.from("assemblies")
      .select("id,name,description,category,assembly_code,output_unit,default_waste_percent,is_active,metadata")
      .order("name").limit(1000);
    const { data: comps } = await supabase.from("assembly_components").select("assembly_id");
    const counts: Record<string, number> = {};
    (comps || []).forEach((c: any) => { counts[c.assembly_id] = (counts[c.assembly_id] || 0) + 1; });
    const list: Assembly[] = (asmbs || []).map((a: any) => ({
      id: a.id, name: a.name, description: a.description, category: a.category,
      assembly_code: a.assembly_code, output_unit: a.output_unit,
      default_waste_percent: numOr(a.default_waste_percent, 0),
      is_active: a.is_active !== false, metadata: a.metadata || {},
      measure_type: (a.metadata?.measure_type as MeasureType) || "linear",
      componentCount: counts[a.id] || 0,
    }));
    setAssemblies(list);
    if (!activeId && list.length > 0) setActiveId(list[0].id);
    setLoading(false);
  }

  useEffect(() => {
    if (!activeId) { setComponents([]); return; }
    loadComponents(activeId);
    // Set edit form to active assembly values
    const a = assemblies.find(x => x.id === activeId);
    if (a) {
      setEditForm({
        name: a.name, description: a.description || "", category: a.category || "",
        assembly_code: a.assembly_code || "", measure_type: a.measure_type,
        default_waste_percent: String(a.default_waste_percent), output_unit: a.output_unit || "",
      });
    }
  }, [activeId, assemblies.length]);

  async function loadComponents(id: string) {
    setCompLoading(true);
    const { data } = await supabase.from("assembly_components")
      .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes,created_at")
      .eq("assembly_id", id).order("sort_order");
    const list = (data || []) as any[];
    const ids = [...new Set(list.map(c => c.cost_item_id))];
    let itemMap: Record<string, CostItem> = {};
    if (ids.length > 0) {
      const { data: ci } = await supabase.from("cost_items")
        .select("id,item_name,unit,category,item_type,variant").in("id", ids);
      (ci || []).forEach((i: any) => { itemMap[i.id] = i; });
    }
    setComponents(list.map(c => ({
      ...c,
      formula: c.notes?.startsWith("formula:") ? c.notes.slice(8) : (String(numOr(c.quantity_factor, 1))),
      waste_percent: numOr(c.waste_percent, 0),
      cost_item: itemMap[c.cost_item_id] || null,
    })));
    setCompLoading(false);
  }

  // ─── Assembly CRUD ─────────────────────────────────────────────────────────
  async function createAssembly() {
    if (!form.name.trim()) { setError("Assembly name is required."); return; }
    setSaving(true);
    try {
      const { data, error: e } = await supabase.from("assemblies").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category || null,
        assembly_code: form.assembly_code.trim() || null,
        output_unit: form.output_unit.trim() || null,
        default_waste_percent: parseFloat(form.default_waste_percent) || 0,
        is_active: true,
        company_id: companyId || null,
        metadata: { measure_type: form.measure_type },
      }).select().single();
      if (e) throw e;
      showToast("Assembly created!");
      setShowNewForm(false);
      setForm({ name:"",description:"",category:"",assembly_code:"",measure_type:"linear",default_waste_percent:"0",output_unit:"" });
      await loadAssemblies();
      setActiveId(data.id);
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function updateAssembly() {
    if (!activeId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.from("assemblies").update({
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        category: editForm.category || null,
        assembly_code: editForm.assembly_code.trim() || null,
        output_unit: editForm.output_unit.trim() || null,
        default_waste_percent: parseFloat(editForm.default_waste_percent) || 0,
        metadata: { measure_type: editForm.measure_type },
        updated_at: new Date().toISOString(),
      }).eq("id", activeId);
      if (e) throw e;
      showToast("Assembly updated!");
      setEditingAssembly(false);
      await loadAssemblies();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  }

  async function deleteAssembly(id: string) {
    if (!confirm("Delete this assembly and all its components?")) return;
    await supabase.from("assembly_components").delete().eq("assembly_id", id);
    await supabase.from("assemblies").delete().eq("id", id);
    setAssemblies(prev => prev.filter(a => a.id !== id));
    if (activeId === id) setActiveId(assemblies.find(a => a.id !== id)?.id || null);
    showToast("Assembly deleted.");
  }

  async function duplicateAssembly(a: Assembly) {
    const { data } = await supabase.from("assemblies").insert({
      name: `${a.name} (Copy)`, description: a.description, category: a.category,
      output_unit: a.output_unit, default_waste_percent: a.default_waste_percent,
      is_active: true, company_id: companyId || null,
      metadata: { measure_type: a.measure_type },
    }).select().single();
    if (!data) return;
    // Copy components
    const { data: comps } = await supabase.from("assembly_components")
      .select("*").eq("assembly_id", a.id);
    if (comps && comps.length > 0) {
      await supabase.from("assembly_components").insert(
        comps.map((c: any) => ({ ...c, id: undefined, assembly_id: data.id, created_at: undefined }))
      );
    }
    showToast("Assembly duplicated!");
    await loadAssemblies();
    setActiveId(data.id);
  }

  // ─── Component CRUD ────────────────────────────────────────────────────────
  async function addComponent() {
    if (!activeId) return;
    if (!newComp.cost_item_id) { setError("Select a cost item first."); return; }
    if (!newComp.formula.trim()) { setError("Enter a formula (e.g. length * 2.5)."); return; }
    try {
      const { error: e } = await supabase.from("assembly_components").insert({
        assembly_id: activeId,
        cost_item_id: newComp.cost_item_id,
        line_type: newComp.line_type,
        quantity_factor: 1, // legacy field
        waste_percent: parseFloat(newComp.waste_percent) || 0,
        sort_order: components.length,
        // Store formula in notes with prefix so we can restore it
        notes: `formula:${newComp.formula.trim()}`,
      });
      if (e) throw e;
      setNewComp({ cost_item_id:"", line_type:"material", formula:"", waste_percent:"0", notes:"" });
      await loadComponents(activeId);
      showToast("Component added!");
    } catch (e: any) { setError(e.message); }
  }

  async function deleteComponent(id: string) {
    await supabase.from("assembly_components").delete().eq("id", id);
    setComponents(prev => prev.filter(c => c.id !== id));
    showToast("Component removed.");
  }

  async function updateComponentFormula(id: string, formula: string, waste: number) {
    await supabase.from("assembly_components").update({
      notes: `formula:${formula}`,
      waste_percent: waste,
    }).eq("id", id);
    setComponents(prev => prev.map(c => c.id === id ? { ...c, formula, waste_percent: waste } : c));
  }

  async function moveComponent(id: string, dir: "up" | "down") {
    const idx = components.findIndex(c => c.id === id);
    if (idx === -1) return;
    const next = [...components];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    next.forEach((c, i) => c.sort_order = i);
    setComponents(next);
    for (const c of next) await supabase.from("assembly_components").update({ sort_order: c.sort_order }).eq("id", c.id);
  }

  // ─── Preview calculation ───────────────────────────────────────────────────
  const previewResults = useMemo(() => {
    if (!activeAssembly) return [];
    const vars: Record<string, number> = {};
    Object.entries(previewVars).forEach(([k, v]) => { vars[k] = parseFloat(v) || 0; });
    return components.map(c => {
      const base = evalFormula(c.formula, vars);
      const withWaste = base !== null ? base * (1 + c.waste_percent / 100) : null;
      return { id: c.id, base, withWaste, item: c.cost_item };
    });
  }, [components, previewVars, activeAssembly]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assemblies.filter(a => {
      const matchSearch = !q || a.name.toLowerCase().includes(q) || (a.category || "").toLowerCase().includes(q);
      const matchCat = !catFilter || a.category === catFilter;
      return matchSearch && matchCat && a.is_active;
    });
  }, [assemblies, search, catFilter]);

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return !q ? costItems.slice(0, 30) : costItems.filter(i =>
      i.item_name.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q)
    ).slice(0, 40);
  }, [costItems, itemSearch]);

  const measureVars = activeAssembly ? MEASURE_VARS[activeAssembly.measure_type] : [];
  const measureCfg = activeAssembly ? MEASURE_CFG[activeAssembly.measure_type] : null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100 flex flex-col">

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0d1117] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-700 flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Layers size={18} className="text-white"/>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">Assembly Builder</h1>
            <p className="text-xs text-slate-500">{assemblies.length} assemblies · Formula-driven material calculator</p>
          </div>
        </div>
        <button onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition shadow-sm">
          <Plus size={14}/> New Assembly
        </button>
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Left: Assembly List ── */}
        <div className="w-72 flex-shrink-0 border-r border-white/[0.06] bg-[#0d1117] flex flex-col">
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search assemblies…"
                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg pl-7 pr-2 py-2 text-[11px] text-slate-300 placeholder:text-slate-700 outline-none focus:border-purple-500/40"/>
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-1.5 text-[11px] text-slate-400 outline-none">
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-slate-600 text-xs">
                <RefreshCw size={12} className="animate-spin"/> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10">
                <Layers size={20} className="text-slate-800 mx-auto mb-2"/>
                <p className="text-xs text-slate-700">No assemblies yet</p>
                <button onClick={() => setShowNewForm(true)} className="mt-3 text-xs text-purple-400 hover:text-purple-300">+ Create first</button>
              </div>
            ) : filtered.map(a => {
              const cfg = MEASURE_CFG[a.measure_type];
              const active = a.id === activeId;
              return (
                <div key={a.id} onClick={() => setActiveId(a.id)}
                  className={`group px-3 py-3 border-b border-white/[0.04] cursor-pointer transition-all ${active ? "bg-purple-500/10 border-l-2 border-l-purple-500" : "hover:bg-white/[0.02]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span style={{ color: cfg.color }}>{cfg.icon}</span>
                        <span className={`text-[11px] font-bold truncate ${active ? "text-slate-100" : "text-slate-300"}`}>{a.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.category && <span className="text-[9px] text-slate-600">{a.category}</span>}
                        <span className="text-[9px] text-slate-700">·</span>
                        <span className="text-[9px] text-slate-600">{a.componentCount} component{a.componentCount !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); duplicateAssembly(a); }}
                        className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300" title="Duplicate">
                        <Copy size={11}/>
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteAssembly(a.id); }}
                        className="p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400" title="Delete">
                        <Trash2 size={11}/>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Assembly Editor ── */}
        <div className="flex-1 overflow-y-auto">
          {!activeAssembly ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Layers size={28} className="text-slate-700"/>
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">No assembly selected</p>
                <p className="text-slate-700 text-xs">Select from the list or create a new one</p>
              </div>
              <button onClick={() => setShowNewForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition">
                <Plus size={12}/> New Assembly
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-5 max-w-4xl">

              {/* Assembly header card */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                  {!editingAssembly ? (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center border flex-shrink-0"
                          style={{ backgroundColor: measureCfg!.color + "15", borderColor: measureCfg!.color + "30" }}>
                          <span style={{ color: measureCfg!.color }}>{measureCfg!.icon}</span>
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-100">{activeAssembly.name}</h2>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-md border font-semibold"
                              style={{ backgroundColor: measureCfg!.color + "15", borderColor: measureCfg!.color + "25", color: measureCfg!.color }}>
                              {measureCfg!.label}
                            </span>
                            {activeAssembly.category && <span className="text-[10px] text-slate-600">{activeAssembly.category}</span>}
                            {activeAssembly.assembly_code && <span className="text-[10px] text-slate-700 font-mono">{activeAssembly.assembly_code}</span>}
                            {activeAssembly.default_waste_percent > 0 && <span className="text-[10px] text-amber-500">{activeAssembly.default_waste_percent}% default waste</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowPreview(v => !v)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition ${showPreview ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-white/[0.04] border-white/[0.07] text-slate-400 hover:text-slate-200"}`}>
                          <Play size={11}/> {showPreview ? "Hide Preview" : "Live Preview"}
                        </button>
                        <button onClick={() => setEditingAssembly(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-[11px] text-slate-400 transition">
                          <Edit2 size={11}/> Edit
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Assembly Name</label>
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Category</label>
                          <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                            className="w-full bg-[#080b10] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/50">
                            <option value="">None</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Measurement Type</label>
                          <div className="grid grid-cols-4 gap-1">
                            {(Object.entries(MEASURE_CFG) as [MeasureType, typeof MEASURE_CFG[MeasureType]][]).map(([k, cfg]) => (
                              <button key={k} onClick={() => setEditForm(f => ({ ...f, measure_type: k }))}
                                className={[
                                  "flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-bold transition",
                                  editForm.measure_type === k ? "border-white/20 bg-white/10 text-slate-100" : "border-white/[0.06] text-slate-600 hover:text-slate-400"
                                ].join(" ")}>
                                <span style={{ color: editForm.measure_type === k ? cfg.color : undefined }}>{cfg.icon}</span>
                                {cfg.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Code</label>
                          <input value={editForm.assembly_code} onChange={e => setEditForm(f => ({ ...f, assembly_code: e.target.value }))} placeholder="e.g. BLK-6-STD"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none font-mono focus:border-purple-500/50"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Default Waste %</label>
                          <input type="number" value={editForm.default_waste_percent} onChange={e => setEditForm(f => ({ ...f, default_waste_percent: e.target.value }))}
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-500 block mb-1 font-medium uppercase tracking-wider">Output Unit</label>
                          <input value={editForm.output_unit} onChange={e => setEditForm(f => ({ ...f, output_unit: e.target.value }))} placeholder="e.g. m², ft, each"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end border-t border-white/[0.06] pt-3">
                        <button onClick={() => setEditingAssembly(false)} className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-sm text-slate-400 transition hover:text-slate-200">Cancel</button>
                        <button onClick={updateAssembly} disabled={saving}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 transition">
                          <Save size={13}/> {saving ? "Saving…" : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Variable hint */}
                <div className="px-5 py-2.5 bg-white/[0.015] flex items-center gap-2">
                  <Info size={11} className="text-slate-600 flex-shrink-0"/>
                  <span className="text-[10px] text-slate-600">{measureCfg!.hint} — use these in your formulas below</span>
                </div>
              </div>

              {/* Live Preview */}
              {showPreview && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] overflow-hidden">
                  <div className="px-5 py-3 border-b border-emerald-500/15 flex items-center gap-2">
                    <Play size={12} className="text-emerald-400"/>
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Live Preview</span>
                    <span className="text-[10px] text-slate-600 ml-2">Enter test values to see calculated quantities</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Test inputs */}
                    <div className="flex gap-3 flex-wrap">
                      {measureVars.map(v => (
                        <div key={v}>
                          <label className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider">{v}</label>
                          <input type="number" value={previewVars[v] || ""} onChange={e => setPreviewVars(prev => ({ ...prev, [v]: e.target.value }))}
                            className="w-24 bg-white/[0.04] border border-emerald-500/20 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-500/40"/>
                        </div>
                      ))}
                    </div>
                    {/* Results */}
                    {previewResults.length > 0 && (
                      <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                        <div className="grid text-[9px] font-bold uppercase tracking-widest text-slate-700 px-4 py-2 bg-white/[0.02] border-b border-white/[0.05]"
                          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
                          <span>Item</span><span>Formula</span><span>Base Qty</span><span>+Waste</span><span>Unit</span>
                        </div>
                        {previewResults.map((r, i) => (
                          <div key={r.id} className={`grid items-center px-4 py-2.5 border-b border-white/[0.03] last:border-0 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}
                            style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
                            <span className="text-xs font-semibold text-slate-200 truncate">{r.item?.item_name || "—"}</span>
                            <span className="text-[10px] text-slate-600 font-mono truncate">{components[i]?.formula}</span>
                            <span className={`text-sm font-bold ${r.base !== null ? "text-emerald-400" : "text-red-500"}`}>
                              {r.base !== null ? r.base.toFixed(2) : "Error"}
                            </span>
                            <span className={`text-sm font-bold ${r.withWaste !== null ? "text-sky-400" : "text-slate-700"}`}>
                              {r.withWaste !== null ? r.withWaste.toFixed(2) : "—"}
                            </span>
                            <span className="text-[10px] text-slate-600">{r.item?.unit || "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Components */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-slate-100">Components</span>
                    <span className="text-[10px] text-slate-600 ml-2">{components.length} lines</span>
                  </div>
                </div>

                {/* Column headers */}
                <div className="grid text-[9px] font-bold uppercase tracking-widest text-slate-700 px-5 py-2 bg-white/[0.02] border-b border-white/[0.05]"
                  style={{ gridTemplateColumns: "2fr 1fr 2fr 80px 60px 72px" }}>
                  <span>Item</span><span>Type</span><span>Formula</span><span className="text-right">Waste %</span><span className="text-right">Preview</span><span/>
                </div>

                {compLoading ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-slate-600 text-xs">
                    <RefreshCw size={12} className="animate-spin"/> Loading…
                  </div>
                ) : components.length === 0 ? (
                  <div className="text-center py-10">
                    <Package size={18} className="text-slate-700 mx-auto mb-2"/>
                    <p className="text-xs text-slate-700">No components yet. Add one below.</p>
                  </div>
                ) : components.map((c, idx) => {
                  const tcol = TYPE_COLORS[c.line_type] || TYPE_COLORS.other;
                  const preview = previewResults.find(r => r.id === c.id);
                  return (
                    <ComponentRow key={c.id} component={c} idx={idx} total={components.length}
                      typeColor={tcol} preview={preview}
                      onDelete={() => deleteComponent(c.id)}
                      onUpdate={(formula, waste) => updateComponentFormula(c.id, formula, waste)}
                      onMove={dir => moveComponent(c.id, dir)}
                      measureVars={measureVars}
                      formulaHints={activeAssembly ? FORMULA_HINTS[activeAssembly.measure_type] : []}/>
                  );
                })}

                {/* Add component form */}
                <div className="px-5 py-4 bg-white/[0.015] border-t border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Add Component</div>
                    <span className="text-[9px] text-purple-400 flex items-center gap-1"><Bot size={9}/> AI Formula Assistant enabled</span>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
                      <AlertCircle size={11} className="text-red-400"/>
                      <span className="text-[11px] text-red-300">{error}</span>
                      <button onClick={() => setError(null)} className="ml-auto text-slate-600 hover:text-slate-400"><X size={11}/></button>
                    </div>
                  )}

                  {/* AI Formula Assistant Panel */}
                  <AIFormulaAssistant
                    measureType={activeAssembly?.measure_type || "linear"}
                    measureVars={measureVars}
                    onFormulaGenerated={(formula) => setNewComp(p => ({ ...p, formula }))}
                  />

                  <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 2fr 80px 80px auto" }}>
                    {/* Item picker */}
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Item</label>
                      <button onClick={() => setShowItemSearch(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-left hover:bg-white/[0.07] transition">
                        {newComp.cost_item_id ? (
                          <span className="text-slate-200 truncate">{costItems.find(i => i.id === newComp.cost_item_id)?.item_name || "Selected"}</span>
                        ) : (
                          <span className="text-slate-600">Select item from Rate Library…</span>
                        )}
                      </button>
                    </div>

                    {/* Line type */}
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Type</label>
                      <select value={newComp.line_type} onChange={e => setNewComp(p => ({ ...p, line_type: e.target.value }))}
                        className="w-full bg-[#080b10] border border-white/[0.07] rounded-lg px-2 py-2 text-[11px] text-slate-300 outline-none focus:border-purple-500/40">
                        {LINE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                      </select>
                    </div>

                    {/* Formula */}
                    <div className="relative">
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Formula (qty per unit)</label>
                      <input value={newComp.formula} onChange={e => setNewComp(p => ({ ...p, formula: e.target.value }))}
                        placeholder="Formula e.g. length * 2.5"
                        className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-[11px] text-slate-200 font-mono placeholder:text-slate-700 outline-none focus:border-purple-500/50"/>
                    </div>

                    {/* Waste % */}
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1">Waste %</label>
                      <input type="number" value={newComp.waste_percent} onChange={e => setNewComp(p => ({ ...p, waste_percent: e.target.value }))}
                        placeholder="0"
                        className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none focus:border-purple-500/50 text-right"/>
                    </div>

                    {/* Preview of formula */}
                    <div className="flex items-center justify-center">
                      {newComp.formula && (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">
                          {(() => {
                            const vars: Record<string,number> = {};
                            Object.entries(previewVars).forEach(([k,v]) => { vars[k]=parseFloat(v)||0; });
                            const r = evalFormula(newComp.formula, vars);
                            return r !== null ? `≈ ${r.toFixed(2)}` : "?";
                          })()}
                        </span>
                      )}
                    </div>

                    {/* Add button */}
                    <button onClick={addComponent} disabled={!newComp.cost_item_id || !newComp.formula.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-semibold disabled:opacity-40 transition">
                      <Plus size={12}/> Add
                    </button>
                  </div>

                  {/* Formula hints */}
                  {activeAssembly && FORMULA_HINTS[activeAssembly.measure_type].length > 0 && (
                    <div>
                      <div className="text-[9px] text-slate-700 uppercase tracking-wider mb-1.5">Quick formula examples:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {FORMULA_HINTS[activeAssembly.measure_type].map(h => (
                          <button key={h.formula} onClick={() => setNewComp(p => ({ ...p, formula: h.formula }))}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[10px] text-slate-500 hover:text-slate-300 font-mono transition">
                            <Wand2 size={9}/> {h.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Variable reference */}
                  <div className="flex items-center gap-2 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3 py-2">
                    <Info size={10} className="text-slate-600 flex-shrink-0"/>
                    <span className="text-[10px] text-slate-600">Available variables: </span>
                    {measureVars.map(v => (
                      <code key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono">{v}</code>
                    ))}
                    <span className="text-[10px] text-slate-700 ml-1">· Math ops: + - * / ( )</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Assembly Modal ── */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-100">New Assembly</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Create a reusable material template</div>
              </div>
              <button onClick={() => setShowNewForm(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-300"><AlertCircle size={11}/>{error}</div>}

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Assembly Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus
                  placeholder="e.g. 6 inch Concrete Block Wall"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Measurement Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(MEASURE_CFG) as [MeasureType, typeof MEASURE_CFG[MeasureType]][]).map(([k, cfg]) => (
                    <button key={k} onClick={() => setForm(f => ({ ...f, measure_type: k }))}
                      className={[
                        "flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-bold transition",
                        form.measure_type === k ? "border-white/20 bg-white/10 text-slate-100" : "border-white/[0.06] text-slate-600 hover:text-slate-400 hover:border-white/10"
                      ].join(" ")}>
                      <span style={{ color: form.measure_type === k ? cfg.color : undefined }}>{cfg.icon}</span>
                      {cfg.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">{MEASURE_CFG[form.measure_type].hint}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full bg-[#080b10] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500/50">
                    <option value="">Select…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Default Waste %</label>
                  <input type="number" value={form.default_waste_percent} onChange={e => setForm(f => ({ ...f, default_waste_percent: e.target.value }))} placeholder="0"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Code (optional)</label>
                  <input value={form.assembly_code} onChange={e => setForm(f => ({ ...f, assembly_code: e.target.value }))} placeholder="e.g. BLK-6-STD"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 font-mono outline-none focus:border-purple-500/50"/>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Output Unit</label>
                  <input value={form.output_unit} onChange={e => setForm(f => ({ ...f, output_unit: e.target.value }))} placeholder="e.g. m², ft, each"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 block mb-1.5 font-medium uppercase tracking-wider">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-purple-500/50"/>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/[0.07]">
              <button onClick={() => { setShowNewForm(false); setError(null); }}
                className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-sm text-slate-400 hover:text-slate-200 transition">Cancel</button>
              <button onClick={createAssembly} disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 transition">
                <Plus size={13}/> {saving ? "Creating…" : "Create Assembly"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Search Modal ── */}
      {showItemSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-100">Select Item from Rate Library</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{costItems.length} items available</div>
              </div>
              <button onClick={() => setShowItemSearch(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="px-5 pt-4 pb-3 border-b border-white/[0.06]">
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
                <input autoFocus value={itemSearch} onChange={e => setItemSearch(e.target.value)}
                  placeholder="Search items…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-purple-500/50"/>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredItems.map(i => (
                <button key={i.id} onClick={() => { setNewComp(p => ({ ...p, cost_item_id: i.id })); setShowItemSearch(false); setItemSearch(""); }}
                  className="w-full text-left px-5 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                    <Package size={12} className="text-slate-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">{i.item_name}</div>
                    <div className="text-[10px] text-slate-600">{i.category || "—"}{i.unit ? ` · ${i.unit}` : ""}{i.variant ? ` · ${i.variant}` : ""}</div>
                  </div>
                  <ChevronRight size={13} className="text-slate-700 flex-shrink-0"/>
                </button>
              ))}
              {filteredItems.length === 0 && (
                <div className="text-center py-10 text-slate-600 text-sm">No items match your search</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] pointer-events-none">
          <div className="bg-[#0d1117] border border-green-500/25 text-green-400 text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── AI Formula Assistant Component ──────────────────────────────────────────
function AIFormulaAssistant({
  measureType, measureVars, onFormulaGenerated
}: {
  measureType: MeasureType;
  measureVars: string[];
  onFormulaGenerated: (formula: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{formula:string;explanation:string}|null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const recognitionRef = React.useRef<any>(null);

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setDescription(prev => prev ? prev + " " + transcript : transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function generateFormula() {
    if (!description.trim()) return;
    setLoading(true); setResult(null);
    try {
      const vars = measureVars.join(", ");
      const prompt = `You are a construction quantity calculator formula expert. 
A user wants to create a formula for a ${measureType} measurement in a construction assembly.
Available variables are: ${vars}

The user described what they want in plain English:
"${description}"

Write a simple math formula using ONLY these variables: ${vars}
Use only: + - * / ( ) and numbers.

Respond with ONLY this JSON, nothing else:
{"formula": "length * 2.5", "explanation": "One sentence plain English explanation of what the formula calculates"}

Important rules:
- Only use the available variables: ${vars}
- Keep it simple — one formula expression
- No functions, no if statements, just math
- If the user mentions inches convert to feet (divide by 12)
- If the user mentions block sizes convert to feet automatically`;

      const text = await magnusAI.chat(prompt);
      const clean = String(text).replace(/\`\`\`json|\`\`\`/g, "").trim();
      const start = clean.indexOf("{");
      const end = clean.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON returned");
      const parsed = JSON.parse(clean.slice(start, end + 1));
      setResult({ formula: parsed.formula, explanation: parsed.explanation });
    } catch (e: any) {
      setResult({ formula: "", explanation: "Could not generate formula. Try describing it differently." });
    }
    setLoading(false);
  }

  function applyFormula() {
    if (result?.formula) {
      onFormulaGenerated(result.formula);
      setOpen(false);
      setDescription("");
      setResult(null);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-purple-500/20 bg-purple-500/[0.06] hover:bg-purple-500/[0.1] transition group">
        <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
          <Bot size={13} className="text-purple-400"/>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-semibold text-purple-300">AI Formula Assistant</div>
          <div className="text-[9px] text-slate-600">Describe what you want to calculate — AI writes the formula for you</div>
        </div>
        {speechSupported && (
          <div className="flex items-center gap-1 text-[9px] text-slate-700">
            <Mic size={9}/> Voice enabled
          </div>
        )}
        <Sparkles size={12} className="text-purple-500 flex-shrink-0"/>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-purple-500/25 bg-purple-500/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/15">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-purple-400"/>
          <span className="text-xs font-bold text-purple-300">AI Formula Assistant</span>
          <span className="text-[9px] text-slate-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
            Variables: {measureVars.join(", ")}
          </span>
        </div>
        <button onClick={() => { setOpen(false); setDescription(""); setResult(null); }}
          className="p-1 rounded hover:bg-white/[0.06] text-slate-600 hover:text-slate-300 transition">
          <X size={13}/>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Description input + mic */}
        <div>
          <div className="text-[10px] text-slate-500 mb-1.5 font-medium">
            Describe what you want to calculate in plain words:
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={
                  measureType === "linear"
                    ? "e.g. number of 6 inch blocks for a wall, each block is 8 inches tall and 16 inches wide"
                    : measureType === "area"
                    ? "e.g. how many tiles I need, each tile is 1 foot by 1 foot with 5 percent extra"
                    : measureType === "count"
                    ? "e.g. 4 bolts needed per item"
                    : "e.g. cubic yards of concrete for a slab"
                }
                rows={2}
                className="w-full bg-white/[0.04] border border-purple-500/20 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-700 outline-none focus:border-purple-500/50 resize-none"/>
              {listening && (
                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>
                  <span className="text-[9px] text-red-400">Listening…</span>
                </div>
              )}
            </div>
            {speechSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition ${
                  listening
                    ? "bg-red-500/20 border-red-500/40 text-red-400 animate-pulse"
                    : "bg-white/[0.04] border-white/[0.08] text-slate-500 hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/10"
                }`}
                title={listening ? "Stop listening" : "Speak your description"}>
                {listening ? <MicOff size={16}/> : <Mic size={16}/>}
              </button>
            )}
          </div>
          {speechSupported && !listening && (
            <div className="text-[9px] text-slate-700 mt-1 flex items-center gap-1">
              <Mic size={8}/> Click the mic to speak instead of typing
            </div>
          )}
        </div>

        {/* Generate button */}
        <button onClick={generateFormula} disabled={loading || !description.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold disabled:opacity-40 transition">
          {loading
            ? <><Loader size={13} className="animate-spin"/> Generating formula…</>
            : <><Sparkles size={13}/> Generate Formula</>
          }
        </button>

        {/* Result */}
        {result && (
          <div className={`rounded-lg border p-3 space-y-2 ${result.formula ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-red-500/20 bg-red-500/[0.04]"}`}>
            {result.formula ? (
              <>
                <div className="flex items-center gap-2">
                  <Check size={12} className="text-emerald-400 flex-shrink-0"/>
                  <span className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">Formula generated</span>
                </div>
                <div className="bg-[#080b10] rounded-lg px-3 py-2 font-mono text-sm text-purple-300 border border-purple-500/20">
                  {result.formula}
                </div>
                <div className="text-[11px] text-slate-400">{result.explanation}</div>
                <div className="flex gap-2 pt-1">
                  <button onClick={applyFormula}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition">
                    <Check size={11}/> Use This Formula
                  </button>
                  <button onClick={() => setResult(null)}
                    className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs text-slate-400 hover:text-slate-200 transition">
                    Try Again
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-red-300">{result.explanation}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component Row ─────────────────────────────────────────────────────────────
function ComponentRow({ component, idx, total, typeColor, preview, onDelete, onUpdate, onMove, measureVars, formulaHints }: {
  component: Component; idx: number; total: number; typeColor: string;
  preview: any; onDelete: () => void;
  onUpdate: (formula: string, waste: number) => void;
  onMove: (dir: "up"|"down") => void;
  measureVars: string[]; formulaHints: {label:string;formula:string}[];
}) {
  const [editing, setEditing] = useState(false);
  const [formula, setFormula] = useState(component.formula);
  const [waste, setWaste] = useState(String(component.waste_percent));

  function save() { onUpdate(formula, parseFloat(waste) || 0); setEditing(false); }

  return (
    <div className={`group border-b border-white/[0.03] last:border-0 ${idx % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
      {!editing ? (
        <div className="grid items-center px-5 py-3 gap-2 hover:bg-white/[0.02] transition"
          style={{ gridTemplateColumns: "2fr 1fr 2fr 80px 60px 72px" }}>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-200 truncate">{component.cost_item?.item_name || "—"}</div>
            <div className="text-[10px] text-slate-600">{component.cost_item?.category || "—"}{component.cost_item?.unit ? ` · ${component.cost_item.unit}` : ""}</div>
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-md border w-fit ${typeColor}`}>
            {component.line_type}
          </span>
          <code className="text-[11px] text-purple-300 font-mono truncate">{component.formula || "—"}</code>
          <div className="text-right text-[11px] text-amber-400">{component.waste_percent > 0 ? `${component.waste_percent}%` : "—"}</div>
          <div className="text-right">
            {preview?.withWaste != null ? (
              <span className="text-sm font-bold text-sky-400">{preview.withWaste.toFixed(2)}</span>
            ) : <span className="text-slate-700 text-xs">—</span>}
          </div>
          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
            <button onClick={() => onMove("up")} disabled={idx === 0}
              className="p-1 rounded hover:bg-white/10 text-slate-700 hover:text-slate-300 disabled:opacity-20 transition text-xs">↑</button>
            <button onClick={() => onMove("down")} disabled={idx === total - 1}
              className="p-1 rounded hover:bg-white/10 text-slate-700 hover:text-slate-300 disabled:opacity-20 transition text-xs">↓</button>
            <button onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-blue-500/10 text-slate-600 hover:text-blue-400 transition"><Edit2 size={11}/></button>
            <button onClick={onDelete}
              className="p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition"><Trash2 size={11}/></button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-3 bg-purple-500/[0.04] border-l-2 border-purple-500 space-y-2">
          <div className="text-xs font-semibold text-slate-300 mb-1">Editing: {component.cost_item?.item_name}</div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 block mb-1">Formula</label>
              <input value={formula} onChange={e => setFormula(e.target.value)}
                className="w-full bg-white/[0.04] border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono outline-none focus:border-purple-500/60"/>
            </div>
            <div className="w-24">
              <label className="text-[10px] text-slate-500 block mb-1">Waste %</label>
              <input type="number" value={waste} onChange={e => setWaste(e.target.value)}
                className="w-full bg-white/[0.04] border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/60"/>
            </div>
            <button onClick={save}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition">
              <Check size={11}/> Save
            </button>
            <button onClick={() => setEditing(false)}
              className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] text-xs text-slate-400 hover:text-slate-200 transition">Cancel</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {formulaHints.map(h => (
              <button key={h.formula} onClick={() => setFormula(h.formula)}
                className="text-[9px] px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-slate-600 hover:text-slate-300 font-mono transition">
                {h.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {measureVars.map(v => (
              <code key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono">{v}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}