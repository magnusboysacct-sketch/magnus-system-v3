// src/lib/invoiceEdit.ts — change the lines of an invoice, and add what the BOQ has that is not billed yet (migration 20261003000000).
// invoice_save_lines does it all in the database in one step: lines, subtotal, tax, total, balance, status, "Revised invoice, Rev N"
// for a sent invoice, and the books follow by themselves. A paid or cancelled invoice is not changed.
import { supabase } from "./supabase";

export interface EditLine {
  key: string;                      // for React only
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  notes: string;
  line_name: string;
  source_boq_section_item_id: string | null;
}

export interface UnbilledItem {
  item_id: string; section_title: string | null; item_name: string | null; description: string | null; unit: string | null; line_name: string | null;
  boq_qty: number; rate: number; billed_qty: number;
}

export interface ProjectBoq { id: string; version: number | null; status: string | null; created_at: string | null }

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const lineAmount = (l: Pick<EditLine, "quantity" | "rate">) => r2(r2(Number(l.quantity) || 0) * r2(Number(l.rate) || 0));
let k = 0;
export const newKey = () => `l${Date.now()}_${k++}`;

export async function fetchInvoiceLinesForEdit(invoiceId: string): Promise<EditLine[]> {
  const { data, error } = await supabase.from("client_invoice_line_items").select("*").eq("invoice_id", invoiceId).order("line_number");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map((d) => ({
    key: newKey(),
    description: String(d.description ?? ""),
    quantity: String(d.quantity ?? ""),
    unit: String(d.unit ?? "ea"),
    rate: String(d.rate ?? ""),
    notes: String(d.notes ?? ""),
    line_name: String(d.line_name ?? ""),
    source_boq_section_item_id: (d.source_boq_section_item_id as string | null) ?? null,
  }));
}

export async function saveInvoiceLines(invoiceId: string, lines: EditLine[], taxRate: number, note: string) {
  const { data, error } = await supabase.rpc("invoice_save_lines", {
    p_invoice: invoiceId,
    p_lines: lines.map((l) => ({
      description: l.description.trim(), quantity: Number(l.quantity), rate: Number(l.rate), unit: l.unit.trim() || "ea",
      notes: l.notes.trim() || null, line_name: l.line_name.trim() || null, source_boq_section_item_id: l.source_boq_section_item_id,
    })),
    p_tax_rate: taxRate,
    p_note: note.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as { total: number; balance_due: number; status: string; revision: number };
}

export async function fetchProjectBoqs(projectId: string): Promise<ProjectBoq[]> {
  const { data, error } = await supabase.from("boq_headers").select("id, version, status, created_at").eq("project_id", projectId).order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ProjectBoq[];
}

export async function fetchBoqUnbilled(boqId: string): Promise<UnbilledItem[]> {
  const { data, error } = await supabase.rpc("invoice_boq_unbilled", { p_boq: boqId });
  if (error) throw new Error(error.message);
  return ((data || []) as UnbilledItem[]).map((r) => ({ ...r, boq_qty: Number(r.boq_qty) || 0, rate: Number(r.rate) || 0, billed_qty: Number(r.billed_qty) || 0 }));
}
