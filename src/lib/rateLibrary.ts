// Shared rate-library writes, used by the Rates page (price edits) and the BOQ page ("Update Library Price").
//
// cost_items holds an item's identity; cost_item_rates is an append-only price history (one row per item + date +
// source, enforced by uq_cost_item_rates_item_date_source), and v_cost_items_current exposes the latest row as
// current_rate (ordered by effective_date, then created_at).

import { supabase } from "./supabase";

export type LibraryResult<T = {}> = ({ success: true } & T) | { success: false; error: string };

// Today's date in Jamaica (YYYY-MM-DD), so an evening edit doesn't get tomorrow's UTC date.
function todayJamaica(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica" }).format(new Date());
}

// Sets an item's price for today. An UPSERT on (item, date, source): a second edit on the same day updates that day's
// row instead of violating the unique key (a plain insert failed silently the second time). created_at is refreshed
// on every write, because v_cost_items_current breaks same-date ties by created_at — without that, an edit made
// through a source that already had a row earlier that day would not become the "current" price.
export async function upsertLibraryRate(
  costItemId: string,
  rate: number,
  opts: { source?: string; currency?: string; effectiveDate?: string } = {},
): Promise<LibraryResult> {
  if (!costItemId) return { success: false, error: "No item to price." };
  if (!Number.isFinite(rate) || rate < 0) return { success: false, error: "Enter a valid rate." };
  const { error } = await supabase.from("cost_item_rates").upsert(
    {
      cost_item_id: costItemId,
      rate,
      currency: opts.currency || "JMD",
      effective_date: opts.effectiveDate || todayJamaica(),
      source: opts.source || "manual_edit",
      created_at: new Date().toISOString(),
    },
    { onConflict: "cost_item_id,effective_date,source" },
  );
  if (error) return { success: false, error: error.message || "The price could not be saved." };
  return { success: true };
}

// The identifying/behavioural columns copied to a new item. Unique-ish ones (cost_code, supplier_sku, variant_code) are
// deliberately NOT copied. Only columns actually present on the source row are copied.
const COPY_COLUMNS = [
  "description", "variant", "grade", "category", "item_type", "unit", "item_size", "item_group", "material_type",
  "use_type", "tags", "waste_percent", "measurement_type", "formula", "labor_formula", "material_formula",
  "equipment_formula", "calculator_json", "calc_engine_json", "calculator_notes", "formula_variables",
  "coverage_factor", "coverage_unit",
];

export interface CopiedCostItem {
  id: string; item_name: string; description: string | null; variant: string | null; unit: string | null;
  category: string | null; item_type: string | null; company_id: string | null;
  coverage_factor?: number | null; coverage_unit?: string | null; calc_engine_json?: any;
}

// Creates a company-owned copy of a (typically global, uneditable) library item at a given price, leaving the source
// item and its rates completely untouched. If pricing the copy fails the just-created item is removed again so no
// unpriced orphan is left behind.
export async function createOwnCopyAtRate(
  sourceItemId: string,
  companyId: string,
  rate: number,
  opts: { currency?: string; itemName?: string } = {},
): Promise<LibraryResult<{ item: CopiedCostItem }>> {
  if (!sourceItemId || !companyId) return { success: false, error: "Missing item or company." };
  const { data: src, error: srcErr } = await supabase.from("cost_items").select("*").eq("id", sourceItemId).single();
  if (srcErr || !src) return { success: false, error: srcErr?.message || "The library item could not be read." };
  // The copy is named "<original> (Company Copy)" so it is easy to tell apart from the shared original in the library list.
  const payload: Record<string, any> = { item_name: opts.itemName || `${(src as any).item_name} (Company Copy)`, company_id: companyId, cost_code: null, is_active: true };
  for (const col of COPY_COLUMNS) if (col in (src as any) && (src as any)[col] !== undefined) payload[col] = (src as any)[col];
  const { data: created, error: insErr } = await supabase.from("cost_items").insert(payload).select("*").single();
  if (insErr || !created) return { success: false, error: insErr?.message || "The copy could not be created." };
  const priced = await upsertLibraryRate((created as any).id, rate, { source: "boq_update", currency: opts.currency });
  if (!priced.success) {
    await supabase.from("cost_items").delete().eq("id", (created as any).id);
    return { success: false, error: priced.error };
  }
  const c = created as any;
  return {
    success: true,
    item: {
      id: c.id, item_name: c.item_name, description: c.description ?? null, variant: c.variant ?? null, unit: c.unit ?? null,
      category: c.category ?? null, item_type: c.item_type ?? null, company_id: c.company_id ?? companyId,
      coverage_factor: c.coverage_factor ?? null, coverage_unit: c.coverage_unit ?? null, calc_engine_json: c.calc_engine_json ?? null,
    },
  };
}

// ─── Coverage derivation ─────────────────────────────────────────────────────
// Recognises ONLY the simple divide-by-constant form "<var> / <number>" where <var> is the
// formula type's own variable (area/length/count/volume). Anything else (multipliers,
// parentheses, several operators, another variable) returns null so coverage_factor is
// left untouched. coverage_unit is the MEASURED unit (matches the seeded cost_items).
const COVERAGE_VAR_FOR_TYPE: Record<string, string> = { area: "area", length: "length", volume: "volume", count: "count", coverage: "area" };
const COVERAGE_MEASURED_UNIT: Record<string, string> = { area: "ft²", length: "lf", volume: "ft³", count: "ea" };
const COVERAGE_PATTERN = /^\s*([a-z]+)\s*\/\s*(\d+(?:\.\d+)?|\.\d+)\s*$/i;

export function deriveCoverageFromFormula(
  formulaType: string,
  formula: string,
): { factor: number; unit: string } | null {
  const want = COVERAGE_VAR_FOR_TYPE[formulaType];
  if (!want) return null;
  const m = COVERAGE_PATTERN.exec(formula || "");
  if (!m || m[1].toLowerCase() !== want) return null;
  const factor = Number(m[2]);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return { factor, unit: COVERAGE_MEASURED_UNIT[want] };
}
