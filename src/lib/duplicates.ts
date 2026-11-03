// src/lib/duplicates.ts — warn while typing when a receipt or bill is already entered (migration 20260986).
// "exact" = same number from the same vendor / supplier (refused by the database too); otherwise a possible duplicate
// (no number: same vendor, amount and day).

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface DuplicateDoc {
  kind: "expense" | "bill"; id: string; number: string | null; vendor: string | null; date: string; amount: number;
  status: string | null; description?: string | null; exact: boolean;
}

export async function findDuplicates(p: { vendor?: string; number?: string; amount?: number | null; date?: string | null; supplierId?: string | null; excludeId?: string | null }): Promise<DuplicateDoc[]> {
  const { data, error } = await supabase.rpc("find_duplicate_documents", {
    p_vendor: p.vendor?.trim() || null, p_number: p.number?.trim() || null, p_amount: p.amount ?? null, p_date: p.date || null,
    p_supplier: p.supplierId || null, p_exclude: p.excludeId || null,
  });
  if (error) return [];   // a failed check never blocks typing; the database still refuses exact duplicates on save
  return ((data || []) as DuplicateDoc[]).map((d) => ({ ...d, amount: Number(d.amount) }));
}

export function describeDuplicate(d: DuplicateDoc): string {
  const when = d.date ? new Date(`${d.date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  const amt = new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(d.amount || 0);
  return d.kind === "bill"
    ? `Bill ${d.number ?? ""} from ${d.vendor ?? "this supplier"} (${when}, ${amt}) in Payables`
    : `Expense ${d.number ? `#${d.number} ` : ""}${d.vendor ? `from ${d.vendor} ` : ""}(${when}, ${amt}${d.description ? `, "${d.description}"` : ""})`;
}

/** Checks half a second after the user stops typing. Results for older input are never shown. */
export function useDuplicateCheck(args: { vendor?: string; number?: string; amount?: number | null; date?: string | null; supplierId?: string | null; excludeId?: string | null }, enabled: boolean) {
  const { vendor, number, amount, date, supplierId, excludeId } = args;
  const key = enabled && (number?.trim() || (amount && date)) ? JSON.stringify([vendor, number, amount, date, supplierId, excludeId]) : null;
  const [result, setResult] = useState<{ key: string; dups: DuplicateDoc[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const t = window.setTimeout(() => {
      findDuplicates({ vendor, number, amount, date, supplierId, excludeId }).then((dups) => { if (alive) setResult({ key, dups }); });
    }, 500);
    return () => { alive = false; window.clearTimeout(t); };
  }, [key, vendor, number, amount, date, supplierId, excludeId]);
  return key && result?.key === key ? result.dups : [];
}
