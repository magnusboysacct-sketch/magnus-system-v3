// src/components/SmartItemSelector.tsx — Full Rebuild
// Matches the new BOQ dark aesthetic. All props/callbacks identical — drop-in replacement.

import React, { useState, useEffect, useMemo } from "react";
import { X, Search, ChevronRight, Check, ArrowLeft, Wand2, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartItemSelection {
  type: string;
  category: string;
  item: string;
  variant: string;
  costItemId: string | null;
  itemName: string;
  unit: string;
  currentRate: number | null;
}

interface CostItemRow {
  id: string;
  item_name: string;
  category: string | null;
  item_group: string | null;
  material_type: string | null;
  use_type: string | null;
  item_size: string | null;
  variant_code: string | null;
  variant: string | null;
  unit: string | null;
  current_rate: number | null;
  item_type: string | null;
}

interface SmartItemSelectorProps {
  companyId: string;
  onSelect: (selection: SmartItemSelection) => void;
  onCancel: () => void;
  initialSelection?: Partial<SmartItemSelection>;
  title?: string;
}

type Step = "type" | "category" | "item" | "variant" | "confirm";

// ─── Type color map ───────────────────────────────────────────────────────────

const TYPE_META: Record<string, { dot: string; badge: string }> = {
  material:    { dot: "bg-blue-400",    badge: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  labor:       { dot: "bg-amber-400",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  labour:      { dot: "bg-amber-400",   badge: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  equipment:   { dot: "bg-purple-400",  badge: "bg-purple-500/15 text-purple-300 border-purple-500/25" },
  subcontract: { dot: "bg-emerald-400", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  other:       { dot: "bg-slate-500",   badge: "bg-slate-500/15 text-slate-400 border-slate-500/25" },
};

function typeDot(type: string) {
  const key = type.toLowerCase();
  const m = TYPE_META[key] ?? TYPE_META.other;
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />;
}

function typeBadge(type: string) {
  const key = type.toLowerCase();
  const m = TYPE_META[key] ?? TYPE_META.other;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${m.badge}`}>
      {type}
    </span>
  );
}

function fmt(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SmartItemSelector({
  companyId,
  onSelect,
  onCancel,
  title = "Smart Item Selector",
}: SmartItemSelectorProps) {
  const [step, setStep] = useState<Step>("type");
  const [items, setItems] = useState<CostItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [sel, setSel] = useState({ type: "", category: "", item: "", variant: "" });

  useEffect(() => { loadItems(); }, [companyId]);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from("v_cost_items_current")
        .select("id, item_name, category, item_group, material_type, use_type, item_size, variant_code, variant, unit, current_rate, item_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("item_name");
      if (error) throw error;
      setItems((data as CostItemRow[]) || []);
    } catch (err) {
      console.error("Error loading items:", err);
    } finally {
      setLoading(false);
    }
  }

  function uniq(arr: string[]): string[] { return Array.from(new Set(arr)).sort(); }

  function forType(type: string) {
    return !type ? items : items.filter(r => (r.item_type ?? "").toLowerCase() === type.toLowerCase());
  }

  const typeOptions = useMemo(() => {
    const disc = items.map(r => (r.item_type ?? "").trim()).filter(Boolean);
    return uniq([...["Material", "Labor", "Equipment", "Subcontract", "Other"], ...disc]);
  }, [items]);

  const categoryOptions = useMemo(() => {
    if (!sel.type) return [];
    return uniq(forType(sel.type).map(r => (r.category ?? "").trim()).filter(Boolean));
  }, [items, sel.type]);

  const itemOptions = useMemo(() => {
    if (!sel.type || !sel.category) return [];
    return uniq(forType(sel.type).filter(r => (r.category ?? "").trim() === sel.category).map(r => r.item_name.trim()).filter(Boolean));
  }, [items, sel.type, sel.category]);

  const variantOptions = useMemo(() => {
    if (!sel.type || !sel.category || !sel.item) return [];
    return forType(sel.type)
      .filter(r => (r.category ?? "").trim() === sel.category && r.item_name.trim() === sel.item)
      .map(r => (r.variant ?? "").trim()).filter(Boolean).sort();
  }, [items, sel.type, sel.category, sel.item]);

  // Match the confirmed selection to a cost item row
  const matchedItem = useMemo(() => {
    if (step !== "confirm") return null;
    return items.find(r =>
      (r.item_type ?? "").toLowerCase() === sel.type.toLowerCase() &&
      (r.category ?? "").trim() === sel.category &&
      r.item_name.trim() === sel.item &&
      (!sel.variant || (r.variant ?? "").trim() === sel.variant)
    ) ?? null;
  }, [items, sel, step]);

  const currentOpts = useMemo(() => {
    const q = search.toLowerCase().trim();
    const f = (arr: string[]) => !q ? arr : arr.filter(x => x.toLowerCase().includes(q));
    if (step === "type") return { list: f(typeOptions), hasNone: false };
    if (step === "category") return { list: f(categoryOptions), hasNone: false };
    if (step === "item") return { list: f(itemOptions), hasNone: false };
    if (step === "variant") return { list: f(variantOptions), hasNone: variantOptions.length === 0 };
    return { list: [], hasNone: false };
  }, [step, search, typeOptions, categoryOptions, itemOptions, variantOptions]);

  function pickType(v: string) { setSel({ type: v, category: "", item: "", variant: "" }); setSearch(""); setStep("category"); }
  function pickCategory(v: string) { setSel(s => ({ ...s, category: v, item: "", variant: "" })); setSearch(""); setStep("item"); }
  function pickItem(v: string) { setSel(s => ({ ...s, item: v, variant: "" })); setSearch(""); setStep("variant"); }
  function pickVariant(v: string) { setSel(s => ({ ...s, variant: v })); setStep("confirm"); }

  function handleBack() {
    setSearch("");
    if (step === "category") { setStep("type"); setSel(s => ({ ...s, category: "", item: "", variant: "" })); }
    else if (step === "item") { setStep("category"); setSel(s => ({ ...s, item: "", variant: "" })); }
    else if (step === "variant") { setStep("item"); setSel(s => ({ ...s, variant: "" })); }
    else if (step === "confirm") setStep("variant");
  }

  function handleConfirm() {
    if (!matchedItem) { console.error("No matching item found"); return; }
    onSelect({
      type: sel.type, category: sel.category, item: sel.item, variant: sel.variant,
      costItemId: matchedItem.id, itemName: matchedItem.item_name,
      unit: matchedItem.unit || "", currentRate: matchedItem.current_rate,
    });
  }

  const breadcrumb = [sel.type, sel.category, sel.item, sel.variant].filter(Boolean).join(" › ");

  const STEPS: Step[] = ["type", "category", "item", "variant"];
  const stepIdx = STEPS.indexOf(step as any);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-sm text-slate-400">Loading items…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1218] rounded-2xl border border-white/[0.09] shadow-2xl max-w-lg w-full max-h-[88vh] flex flex-col"
        style={{ boxShadow: "0 0 0 1px rgba(6,182,212,0.08), 0 25px 60px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
              {breadcrumb ? (
                <div className="text-[10px] text-cyan-400/70 mt-0.5 truncate">{breadcrumb}</div>
              ) : (
                <div className="text-[10px] text-slate-600 mt-0.5">Type → Category → Item → Variant</div>
              )}
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step progress bar */}
        {step !== "confirm" && (
          <div className="px-5 pt-3 pb-0">
            <div className="flex gap-1">
              {STEPS.map((s, i) => {
                const done = (s === "type" && !!sel.type) || (s === "category" && !!sel.category) || (s === "item" && !!sel.item) || (s === "variant" && !!sel.variant);
                const active = step === s;
                const accessible = i <= stepIdx || done;
                return (
                  <button key={s}
                    onClick={() => accessible && i < stepIdx && (() => { setSearch(""); setStep(s); })()}
                    className={`flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      active ? "bg-cyan-500/20 text-cyan-300" :
                      done  ? "bg-white/[0.07] text-slate-400" :
                              "bg-white/[0.02] text-slate-700"
                    }`}>
                    {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                    {done && !active ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        {step !== "confirm" && (
          <div className="px-5 pt-3 pb-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${step}…`}
                autoFocus
                className="w-full pl-8 pr-4 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">

          {/* Confirm screen */}
          {step === "confirm" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Selected Item</div>

                <ConfirmRow label="Type">
                  {sel.type ? typeBadge(sel.type) : <span className="text-slate-600">—</span>}
                </ConfirmRow>

                <ConfirmRow label="Category">
                  <span className="text-xs font-medium text-slate-200">{sel.category || "—"}</span>
                </ConfirmRow>

                <ConfirmRow label="Item">
                  <span className="text-xs font-semibold text-slate-100">{sel.item || "—"}</span>
                </ConfirmRow>

                {sel.variant && (
                  <ConfirmRow label="Variant">
                    <span className="text-xs text-slate-200">{sel.variant}</span>
                  </ConfirmRow>
                )}

                {matchedItem && (
                  <>
                    <div className="w-full h-px bg-white/[0.06] my-1" />
                    <ConfirmRow label="Unit">
                      <span className="text-xs text-slate-300">{matchedItem.unit || "—"}</span>
                    </ConfirmRow>
                    <ConfirmRow label="Rate">
                      <span className="text-xs font-semibold text-cyan-300">${fmt(matchedItem.current_rate)}</span>
                    </ConfirmRow>
                  </>
                )}
              </div>

              {!matchedItem && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  No exact match found — check your selections.
                </div>
              )}
            </div>

          ) : step === "variant" && currentOpts.hasNone ? (
            // No variants
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-3">No variants found for this item. You can continue without one.</p>
              <button
                onClick={() => pickVariant("")}
                className="w-full text-left px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/20 transition-colors flex items-center justify-between group"
              >
                <span className="text-xs font-medium text-slate-300">No variant — continue</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>

          ) : currentOpts.list.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-600">
              {search ? `No ${step} matches "${search}"` : `No ${step} options found`}
            </div>

          ) : (
            // Options list
            <div className="space-y-0.5">
              {currentOpts.list.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    if (step === "type") pickType(opt);
                    else if (step === "category") pickCategory(opt);
                    else if (step === "item") pickItem(opt);
                    else if (step === "variant") pickVariant(opt);
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-lg hover:bg-white/[0.05] hover:border-white/[0.09] border border-transparent transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {step === "type" && typeDot(opt)}
                    <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors truncate">{opt}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/[0.07] flex items-center justify-between">
          <button
            onClick={step === "type" ? onCancel : handleBack}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {step === "type" ? "Cancel" : "Back"}
          </button>

          {step === "confirm" && (
            <button
              onClick={handleConfirm}
              disabled={!matchedItem}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Confirm Selection
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function ConfirmRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] text-slate-600 uppercase tracking-wider flex-shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
