import React, { useState, useMemo } from "react";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";

// ─── Bar size table ────────────────────────────────────────────────────────
const BAR_SIZES = [
  { label: "#3 (3/8\")", key: "#3", weight: 0.560 },
  { label: "#4 (1/2\")", key: "#4", weight: 0.994 },
  { label: "#5 (5/8\")", key: "#5", weight: 1.552 },
  { label: "#6 (3/4\")", key: "#6", weight: 2.235 },
  { label: "#8 (1\")",   key: "#8", weight: 3.973 },
  { label: "#10 (1-1/4\")", key: "#10", weight: 6.310 },
];

function barWeight(key: string): number {
  return BAR_SIZES.find(b => b.key === key)?.weight ?? 0.994;
}

// ─── Element type definitions ──────────────────────────────────────────────
const ELEMENT_TYPES = [
  { key: "column_square",    label: "Square Column",     icon: "🏛️", category: "Reinforcement (Steel)" },
  { key: "column_rect",      label: "Rect. Column",      icon: "🏗️", category: "Reinforcement (Steel)" },
  { key: "ground_beam",      label: "Ground Beam",       icon: "🔲", category: "Reinforcement (Steel)" },
  { key: "ring_beam",        label: "Ring Beam",         icon: "🔄", category: "Reinforcement (Steel)" },
  { key: "slab",             label: "Slab",              icon: "📐", category: "Reinforcement (Steel)" },
  { key: "block_wall",       label: "Block Wall",        icon: "🧱", category: "Masonry" },
  { key: "staircase",        label: "Staircase",         icon: "🪜", category: "Reinforcement (Steel)" },
  { key: "pad_footing",      label: "Pad Footing",       icon: "⬛", category: "Reinforcement (Steel)" },
];

// ─── Types ─────────────────────────────────────────────────────────────────
interface WizardValues {
  name: string;
  col_width: number;
  col_depth: number;
  num_bars: number;
  main_bar: string;
  link_bar: string;
  spacing: number;
  hook_allowance: number;
  beam_width: number;
  beam_depth: number;
  top_bars: number;
  top_bar_size: string;
  bottom_bars: number;
  bottom_bar_size: string;
  link_spacing: number;
  slab_thickness: number;
  bar_spacing_x: number;
  bar_spacing_y: number;
  slab_bar: string;
  block_size: string;
  include_mortar: boolean;
  num_stairs: number;
  going: number;
  riser: number;
  stair_width: number;
  stair_bar: string;
  stair_bar_spacing: number;
  include_concrete: boolean;
  concrete_grade: string;
  include_formwork: boolean;
  include_labor: boolean;
  footing_width: number;
  footing_depth: number;
  footing_thickness: number;
  footing_bar: string;
  footing_spacing: number;
}

const DEFAULT_VALUES: WizardValues = {
  name: "",
  col_width: 300, col_depth: 300,
  num_bars: 4, main_bar: "#4", link_bar: "#3",
  spacing: 150, hook_allowance: 200,
  beam_width: 300, beam_depth: 450,
  top_bars: 3, top_bar_size: "#4",
  bottom_bars: 3, bottom_bar_size: "#5",
  link_spacing: 150,
  slab_thickness: 150, bar_spacing_x: 200, bar_spacing_y: 200, slab_bar: "#4",
  block_size: "6\"", include_mortar: true,
  num_stairs: 12, going: 250, riser: 175, stair_width: 1200,
  stair_bar: "#4", stair_bar_spacing: 150,
  include_concrete: true, concrete_grade: "3000 PSI",
  include_formwork: true, include_labor: false,
  footing_width: 600, footing_depth: 600, footing_thickness: 300,
  footing_bar: "#4", footing_spacing: 150,
};

// ─── Component generator ───────────────────────────────────────────────────
// NOTE: The live BOQ "Add From Assembly" formula evaluator only recognizes the
// variables `length`, `height`, and `width` (see evalAssemblyFormula in
// BOQPage.tsx). Every formula below is written to use only those three so it
// will actually compute correctly wherever it's applied — everything else
// (bar weights, spacings, dimensions the wizard collects) is baked in as a
// literal number, the same way the original column/beam formulas already do.
interface GeneratedComponent {
  item_name: string;
  type: string;
  formula: string;
  waste_percent: number;
  description: string;
}

function generateComponents(elementType: string, v: WizardValues): GeneratedComponent[] {
  const w = v.col_width / 1000;
  const d = v.col_depth / 1000;
  const sp = v.spacing / 1000;
  const hook = v.hook_allowance / 1000;
  const mw = barWeight(v.main_bar);
  const lw = barWeight(v.link_bar);

  switch (elementType) {
    case "column_square":
    case "column_rect": {
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.main_bar}`,
          type: "material",
          formula: `${v.num_bars} * length * ${mw}`,
          waste_percent: 5,
          description: `${v.num_bars} vertical bars of ${v.main_bar} rebar`,
        },
        {
          item_name: `Rebar ${v.link_bar}`,
          type: "material",
          formula: `(length / ${sp}) * ((${w} + ${d}) * 2 + ${hook}) * ${lw}`,
          waste_percent: 10,
          description: `${v.link_bar} stirrups at ${v.spacing}mm centres`,
        },
      ];
      if (v.include_concrete) comps.push({
        item_name: "Ready Mix Concrete",
        type: "material",
        formula: `${w} * ${d} * length`,
        waste_percent: 5,
        description: `Concrete ${v.concrete_grade}`,
      });
      if (v.include_formwork) comps.push({
        item_name: "Formwork",
        type: "material",
        formula: `(${w} + ${d}) * 2 * length`,
        waste_percent: 10,
        description: "Plywood formwork",
      });
      if (v.include_labor) {
        comps.push({ item_name: "Labor - Steel Fixing", type: "labor", formula: `${v.num_bars} * length * 0.25`, waste_percent: 0, description: "Steel fixing labor" });
        comps.push({ item_name: "Labor - Concrete Pour", type: "labor", formula: `${w} * ${d} * length * 8`, waste_percent: 0, description: "Concrete pour labor" });
      }
      return comps;
    }

    case "ground_beam":
    case "ring_beam": {
      const bw = v.beam_width / 1000;
      const bd = v.beam_depth / 1000;
      const lsp = v.link_spacing / 1000;
      const tw = barWeight(v.top_bar_size);
      const btw = barWeight(v.bottom_bar_size);
      const blw = barWeight(v.link_bar);
      const comps: GeneratedComponent[] = [
        {
          item_name: `Rebar ${v.top_bar_size}`,
          type: "material",
          formula: `${v.top_bars} * length * ${tw}`,
          waste_percent: 5,
          description: `${v.top_bars} top bars ${v.top_bar_size}`,
        },
        {
          item_name: `Rebar ${v.bottom_bar_size}`,
          type: "material",
          formula: `${v.bottom_bars} * length * ${btw}`,
          waste_percent: 5,
          description: `${v.bottom_bars} bottom bars ${v.bottom_bar_size}`,
        },
        {
          item_name: `Rebar ${v.link_bar}`,
          type: "material",
          formula: `(length / ${lsp}) * ((${bw} + ${bd}) * 2 + ${hook}) * ${blw}`,
          waste_percent: 10,
          description: `Links at ${v.link_spacing}mm centres`,
        },
      ];
      if (v.include_concrete) comps.push({ item_name: "Ready Mix Concrete", type: "material", formula: `${bw} * ${bd} * length`, waste_percent: 5, description: `Concrete ${v.concrete_grade}` });
      if (v.include_formwork) comps.push({ item_name: "Formwork", type: "material", formula: `(${bw} + ${bd}) * 2 * length`, waste_percent: 10, description: "Formwork" });
      return comps;
    }

    case "slab": {
      // area isn't a recognized variable in the live BOQ evaluator — expressed
      // as length * width (a slab's length/width dimensions) instead.
      const st = v.slab_thickness / 1000;
      const sx = v.bar_spacing_x / 1000;
      const sy = v.bar_spacing_y / 1000;
      const sw = barWeight(v.slab_bar);
      return [
        { item_name: `Rebar ${v.slab_bar}`, type: "material", formula: `(length / ${sx}) * width * ${sw}`, waste_percent: 10, description: `Bars in X direction at ${v.bar_spacing_x}mm` },
        { item_name: `Rebar ${v.slab_bar}`, type: "material", formula: `(width / ${sy}) * length * ${sw}`, waste_percent: 10, description: `Bars in Y direction at ${v.bar_spacing_y}mm` },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `length * width * ${st}`, waste_percent: 5, description: `Slab concrete ${v.slab_thickness}mm thick` }] : []),
        ...(v.include_formwork ? [{ item_name: "Formwork", type: "material", formula: "length * width", waste_percent: 10, description: "Soffit formwork" }] : []),
      ];
    }

    case "block_wall": {
      // area isn't a recognized variable — a wall's area is length * height.
      const blocksPerSqM = v.block_size === '4"' ? 12.5 : v.block_size === '6"' ? 12.5 : 12.5;
      const blocksPerSqFt = blocksPerSqM / 10.764;
      return [
        { item_name: `Concrete Block ${v.block_size}`, type: "material", formula: `length * height * ${blocksPerSqFt.toFixed(4)}`, waste_percent: 5, description: `${v.block_size} blocks at ${blocksPerSqM} per m²` },
        ...(v.include_mortar ? [{ item_name: "Portland Cement", type: "material", formula: "length * height * 0.08", waste_percent: 10, description: "Mortar cement" }] : []),
        { item_name: "Sand", type: "material", formula: "length * height * 0.025", waste_percent: 10, description: "Mortar sand" },
      ];
    }

    case "staircase": {
      const sw2 = v.stair_width / 1000;
      const go = v.going / 1000;
      const ri = v.riser / 1000;
      const ssp = v.stair_bar_spacing / 1000;
      const ssw = barWeight(v.stair_bar);
      return [
        { item_name: `Rebar ${v.stair_bar}`, type: "material", formula: `${v.num_stairs} * (${go} + ${ri}) * (${sw2} / ${ssp}) * ${ssw}`, waste_percent: 10, description: "Main stair reinforcement" },
        { item_name: `Rebar ${v.stair_bar}`, type: "material", formula: `${v.num_stairs} * ${sw2} * ((${go} + ${ri}) / ${ssp}) * ${ssw}`, waste_percent: 10, description: "Distribution bars" },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${v.num_stairs} * ${go} * ${ri} * ${sw2} * 0.5`, waste_percent: 5, description: "Stair concrete" }] : []),
      ];
    }

    case "pad_footing": {
      const fw = v.footing_width / 1000;
      const fd = v.footing_depth / 1000;
      const ft = v.footing_thickness / 1000;
      const fsp = v.footing_spacing / 1000;
      const fsw = barWeight(v.footing_bar);
      return [
        { item_name: `Rebar ${v.footing_bar}`, type: "material", formula: `(${fw} / ${fsp}) * ${fd} * ${fsw} * 2`, waste_percent: 10, description: "Footing bars both ways" },
        ...(v.include_concrete ? [{ item_name: "Ready Mix Concrete", type: "material", formula: `${fw} * ${fd} * ${ft}`, waste_percent: 5, description: `${v.concrete_grade} footing concrete` }] : []),
      ];
    }

    default:
      return [];
  }
}

// ─── Preview calculator ────────────────────────────────────────────────────
function calcPreview(formula: string, vars: Record<string, number>): number {
  try {
    let expr = formula;
    Object.entries(vars).forEach(([k, val]) => {
      expr = expr.replace(new RegExp(`\\b${k}\\b`, "g"), String(val));
    });
    if (!/^[\d\s\+\-\*\/\.\(\)]+$/.test(expr)) return 0;
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${expr})`)() as number;
  } catch { return 0; }
}

// ─── Bar picker ────────────────────────────────────────────────────────────
function BarPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
        {BAR_SIZES.map(b => (
          <option key={b.key} value={b.key}>{b.label} — {b.weight} kg/m</option>
        ))}
      </select>
    </div>
  );
}

// ─── Number input ──────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, unit, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  unit?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Toggle ────────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${value ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}/>
      </button>
    </label>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────
export default function AssemblyWizard({
  onClose,
  onCreated,
  onUseBlankForm,
  companyId,
}: {
  onClose: () => void;
  onCreated: () => void;
  onUseBlankForm: () => void;
  companyId: string | null;
}) {
  const [step, setStep] = useState<"pick_type" | "configure" | "preview">("pick_type");
  const [elementType, setElementType] = useState<string | null>(null);
  const [values, setValues] = useState<WizardValues>(DEFAULT_VALUES);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof WizardValues>(key: K, val: WizardValues[K]) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  const selectedElement = ELEMENT_TYPES.find(e => e.key === elementType);

  const components = useMemo(() => {
    if (!elementType) return [];
    return generateComponents(elementType, values);
  }, [elementType, values]);

  // Preview vars — a 3m x 3m x 3m element, matching the only variables the
  // live formula evaluator (and every generated formula) actually uses.
  const previewVars = { length: 3, width: 3, height: 3 };

  function buildConstants(type: string, v: WizardValues): Record<string, number> {
    const c: Record<string, number> = {};
    if (type.startsWith("column")) {
      c.col_width = v.col_width / 1000;
      c.col_depth = v.col_depth / 1000;
      c.num_bars = v.num_bars;
      c.spacing = v.spacing / 1000;
      c.hook_allowance = v.hook_allowance / 1000;
      c.main_bar_weight = barWeight(v.main_bar);
      c.link_bar_weight = barWeight(v.link_bar);
    }
    // Add more element types as needed
    return c;
  }

  async function handleSave() {
    if (!elementType || !values.name.trim()) return;
    setSaving(true);
    try {
      const measureType = elementType.includes("slab") ? "area"
        : elementType.includes("wall") ? "area"
        : elementType.includes("stair") ? "count"
        : "linear";

      // Create assembly — measure_type/constants live inside metadata (jsonb),
      // there is no top-level measure_type column on the assemblies table.
      const { data: asm, error: asmErr } = await supabase
        .from("assemblies")
        .insert({
          name: values.name.trim(),
          category: selectedElement?.category || "General",
          default_waste_percent: 5,
          is_active: true,
          company_id: companyId,
          metadata: {
            measure_type: measureType,
            constants: buildConstants(elementType, values),
            wizard_type: elementType,
            wizard_values: values,
          },
        })
        .select("id")
        .single();

      if (asmErr || !asm) { alert(asmErr?.message || "Failed to create assembly"); return; }

      // Find a matching rate library item per component and add it — the
      // assembly_components table stores the formula inside `notes` (prefixed
      // "formula:") and has no item_name/component_type columns of its own.
      const unmatched: string[] = [];
      let sortOrder = 0;
      for (const comp of components) {
        const { data: items } = await supabase
          .from("cost_items")
          .select("id")
          .eq("company_id", companyId)
          .ilike("item_name", `%${comp.item_name}%`)
          .limit(1);

        const costItemId = items?.[0]?.id;
        if (!costItemId) { unmatched.push(comp.item_name); continue; }

        await supabase.from("assembly_components").insert({
          assembly_id: asm.id,
          cost_item_id: costItemId,
          line_type: comp.type,
          quantity_factor: 1,
          waste_percent: comp.waste_percent,
          sort_order: sortOrder++,
          notes: `formula:${comp.formula}`,
        });
      }

      if (unmatched.length > 0) {
        alert(
          `Assembly created, but ${unmatched.length} of ${components.length} components couldn't be matched to a Rate Library item and were skipped:\n\n` +
          unmatched.map(n => `• ${n}`).join("\n") +
          `\n\nAdd these to your Rate Library, then add them to the assembly manually.`
        );
      }

      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {step === "pick_type" ? "What are you building?" :
               step === "configure" ? `Configure ${selectedElement?.label}` :
               "Review & Save"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {step === "pick_type" ? "Pick a structural element to get started" :
               step === "configure" ? "Fill in the details — we handle the formulas" :
               "Check the components before saving"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={18}/>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP 1 — Pick type */}
          {step === "pick_type" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {ELEMENT_TYPES.map(el => (
                  <button key={el.key}
                    onClick={() => { setElementType(el.key); setValues(v => ({ ...v, name: el.label })); setStep("configure"); }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all group">
                    <span className="text-3xl">{el.icon}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 text-center group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {el.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={onUseBlankForm}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1">
                  Or create a blank assembly manually →
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Configure */}
          {step === "configure" && elementType && (
            <div className="space-y-5">
              {/* Assembly name */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assembly Name</label>
                <input
                  value={values.name}
                  onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Square Column 300×300"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Column fields */}
              {(elementType === "column_square" || elementType === "column_rect") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Width" value={values.col_width} onChange={v => set("col_width", v)} unit="mm" hint="e.g. 300mm = 12 inches"/>
                    {elementType === "column_rect"
                      ? <NumInput label="Depth" value={values.col_depth} onChange={v => set("col_depth", v)} unit="mm"/>
                      : <NumInput label="Depth" value={values.col_width} onChange={v => { set("col_depth", v); set("col_width", v); }} unit="mm" hint="Same as width (square)"/>
                    }
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Number of vertical bars" value={values.num_bars} onChange={v => set("num_bars", v)} hint="Typically 4, 6, or 8"/>
                    <BarPicker label="Vertical bar size" value={values.main_bar} onChange={v => set("main_bar", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Stirrup (link) bar size" value={values.link_bar} onChange={v => set("link_bar", v)}/>
                    <NumInput label="Stirrup spacing" value={values.spacing} onChange={v => set("spacing", v)} unit="mm" hint="Typically 150mm"/>
                  </div>
                </>
              )}

              {/* Beam fields */}
              {(elementType === "ground_beam" || elementType === "ring_beam") && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Beam width" value={values.beam_width} onChange={v => set("beam_width", v)} unit="mm"/>
                    <NumInput label="Beam depth" value={values.beam_depth} onChange={v => set("beam_depth", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Top bars" value={values.top_bars} onChange={v => set("top_bars", v)}/>
                    <BarPicker label="Top bar size" value={values.top_bar_size} onChange={v => set("top_bar_size", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Bottom bars" value={values.bottom_bars} onChange={v => set("bottom_bars", v)}/>
                    <BarPicker label="Bottom bar size" value={values.bottom_bar_size} onChange={v => set("bottom_bar_size", v)}/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Link bar size" value={values.link_bar} onChange={v => set("link_bar", v)}/>
                    <NumInput label="Link spacing" value={values.link_spacing} onChange={v => set("link_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Slab fields */}
              {elementType === "slab" && (
                <>
                  <NumInput label="Slab thickness" value={values.slab_thickness} onChange={v => set("slab_thickness", v)} unit="mm" hint="e.g. 150mm"/>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Bar size" value={values.slab_bar} onChange={v => set("slab_bar", v)}/>
                    <NumInput label="Bar spacing (both ways)" value={values.bar_spacing_x} onChange={v => { set("bar_spacing_x", v); set("bar_spacing_y", v); }} unit="mm"/>
                  </div>
                </>
              )}

              {/* Block wall fields */}
              {elementType === "block_wall" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Block size</label>
                    <div className="flex gap-2">
                      {['4"', '6"', '8"'].map(s => (
                        <button key={s} type="button"
                          onClick={() => set("block_size", s)}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${values.block_size === s ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600" : "border-slate-200 dark:border-slate-700 text-slate-500"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Include mortar" value={values.include_mortar} onChange={v => set("include_mortar", v)}/>
                </>
              )}

              {/* Staircase fields */}
              {elementType === "staircase" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Number of stairs" value={values.num_stairs} onChange={v => set("num_stairs", v)}/>
                    <NumInput label="Going (tread)" value={values.going} onChange={v => set("going", v)} unit="mm"/>
                    <NumInput label="Riser (height)" value={values.riser} onChange={v => set("riser", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Stair width" value={values.stair_width} onChange={v => set("stair_width", v)} unit="mm"/>
                    <BarPicker label="Bar size" value={values.stair_bar} onChange={v => set("stair_bar", v)}/>
                  </div>
                  <NumInput label="Bar spacing" value={values.stair_bar_spacing} onChange={v => set("stair_bar_spacing", v)} unit="mm"/>
                </>
              )}

              {/* Pad footing fields */}
              {elementType === "pad_footing" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <NumInput label="Width" value={values.footing_width} onChange={v => set("footing_width", v)} unit="mm"/>
                    <NumInput label="Length" value={values.footing_depth} onChange={v => set("footing_depth", v)} unit="mm"/>
                    <NumInput label="Thickness" value={values.footing_thickness} onChange={v => set("footing_thickness", v)} unit="mm"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <BarPicker label="Bar size (both ways)" value={values.footing_bar} onChange={v => set("footing_bar", v)}/>
                    <NumInput label="Bar spacing" value={values.footing_spacing} onChange={v => set("footing_spacing", v)} unit="mm"/>
                  </div>
                </>
              )}

              {/* Common options — show for structural types */}
              {elementType !== "block_wall" && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Include in Assembly</p>
                  <Toggle label="Ready Mix Concrete" value={values.include_concrete} onChange={v => set("include_concrete", v)}/>
                  <Toggle label="Formwork" value={values.include_formwork} onChange={v => set("include_formwork", v)}/>
                  <Toggle label="Labor" value={values.include_labor} onChange={v => set("include_labor", v)}/>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Preview */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4">
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">{values.name}</p>
                <p className="text-xs text-blue-500">Preview based on 3m × 3m × 3m</p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Component</th>
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold hidden sm:table-cell">Formula</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">Preview Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {components.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-700 dark:text-slate-200">{c.item_name}</div>
                          <div className="text-slate-400 text-[10px]">{c.description}</div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <code className="text-purple-600 dark:text-purple-400 text-[10px] font-mono">{c.formula}</code>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-cyan-600 dark:text-cyan-400">
                            {calcPreview(c.formula, previewVars).toFixed(3)}
                          </span>
                          <span className="text-slate-400 ml-1">+{c.waste_percent}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-slate-400 text-center">
                These components will be added to your assembly. You can edit formulas afterwards in the Assembly Builder.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => {
              if (step === "configure") setStep("pick_type");
              else if (step === "preview") setStep("configure");
              else onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft size={16}/>
            {step === "pick_type" ? "Cancel" : "Back"}
          </button>

          {step !== "pick_type" && (
            <div className="flex items-center gap-2">
              {/* Step indicators */}
              {["configure", "preview"].map((s, i) => (
                <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step === s ? "bg-blue-500" : i < ["configure", "preview"].indexOf(step) ? "bg-blue-300" : "bg-slate-200 dark:bg-slate-700"}`}/>
              ))}
            </div>
          )}

          {step === "configure" && (
            <button
              onClick={() => setStep("preview")}
              disabled={!values.name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              Preview
              <ChevronRight size={16}/>
            </button>
          )}

          {step === "preview" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? "Saving..." : <><Check size={16}/> Save Assembly</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
