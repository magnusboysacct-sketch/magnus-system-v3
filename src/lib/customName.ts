// An optional "custom name" on a BOQ and the invoices made from it: a label chosen from a list (e.g. "Beneficiary Name") plus the
// name itself (e.g. "Mary Johnson"). It shows only when BOTH are filled in. The label list is four starter presets plus every label
// this company has already used on a BOQ or an invoice - there is no table of labels; they are simply read back from the data.
import { supabase } from "./supabase";

export const CUSTOM_NAME_PRESETS = ["Beneficiary Name", "Unit Name", "Site/Community Name", "Reference Name"];
export const CUSTOM_NAME_LABEL_MAX = 60;
export const CUSTOM_NAME_VALUE_MAX = 120;

// Trimmed and length-limited. A missing half is kept as null so nothing half-filled is ever shown.
export function normalizeCustomName(label: unknown, value: unknown): { label: string | null; value: string | null } {
  const l = String(label ?? "").trim().slice(0, CUSTOM_NAME_LABEL_MAX);
  const v = String(value ?? "").trim().slice(0, CUSTOM_NAME_VALUE_MAX);
  return { label: l || null, value: v || null };
}

// True only when there is something to show (label AND value).
export function hasCustomName(row: { custom_name_label?: unknown; custom_name_value?: unknown } | null | undefined): boolean {
  const n = normalizeCustomName(row?.custom_name_label, row?.custom_name_value);
  return !!(n.label && n.value);
}

// Presets first (their spelling wins), then the labels already used - most recent first - then the label currently in the field.
// Duplicates that differ only by upper/lower case or surrounding spaces collapse into the first spelling seen.
export function buildLabelOptions(used: string[], current?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...CUSTOM_NAME_PRESETS, ...used, current ?? ""]) {
    const label = String(raw ?? "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

// Labels this company has used on BOQs and invoices (company scoping comes from the tables' own access rules), newest first. Only
// rows that actually have a name count. Returns [] until the columns exist, so a page using this works before the database update.
export async function fetchUsedCustomNameLabels(): Promise<string[]> {
  const out: string[] = [];
  try {
    const [boq, inv] = await Promise.all([
      supabase.from("boq_headers").select("custom_name_label").not("custom_name_label", "is", null).not("custom_name_value", "is", null)
        .order("updated_at", { ascending: false }).limit(1000),
      supabase.from("client_invoices").select("custom_name_label").not("custom_name_label", "is", null).not("custom_name_value", "is", null)
        .order("created_at", { ascending: false }).limit(1000),
    ]);
    for (const res of [boq, inv]) {
      if (res.error) continue;
      for (const row of (res.data || []) as Array<{ custom_name_label: string | null }>) if (row.custom_name_label) out.push(row.custom_name_label);
    }
  } catch {
    /* the list just has the presets */
  }
  return out;
}

// For a save payload: the two fields, but only when they are needed. Leaving them out when nothing was ever set means a database
// that doesn't have the columns yet is never asked for them; `alreadyHad` makes sure clearing a saved name still writes the nulls.
export function customNamePayload(label: unknown, value: unknown, alreadyHad: boolean): { custom_name_label?: string | null; custom_name_value?: string | null } {
  const n = normalizeCustomName(label, value);
  if (!n.label && !n.value && !alreadyHad) return {};
  return { custom_name_label: n.label, custom_name_value: n.value };
}

export function isMissingCustomNameColumn(error: unknown): boolean {
  return /custom_name/i.test(String((error as any)?.message ?? ""));
}
