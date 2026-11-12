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
  source_expense_id?: string | null;   // a receipt billed back to the client (migration 20261004000000)
  source_bill_id?: string | null;      // a supplier / contractor bill billed back to the client (migration 20261005000000)
}

export interface BillableExpense {
  kind: "receipt" | "bill";            // a receipt (Expenses) or a supplier / contractor bill (Accounts Payable)
  tax: number;                         // tax on a bill (its items are before tax)
  id: string; expense_date: string | null; vendor: string | null; description: string | null; amount: number; receipt_number: string | null;
  line_items: { description?: string | null; quantity?: number | null; unit_price?: number | null; amount?: number | null }[] | null;
  bill_markup_percent: number;
}
// The project's receipts AND bills ticked "Bill this to the client" that are not on an invoice yet
export async function fetchBillableExpenses(projectId: string): Promise<BillableExpense[]> {
  const [rc, bl] = await Promise.all([
    supabase.rpc("billable_expenses_to_bill", { p_project: projectId }),
    supabase.rpc("billable_bills_to_bill", { p_project: projectId }),
  ]);
  if (rc.error) throw new Error(rc.error.message);
  const receipts = ((rc.data || []) as Omit<BillableExpense, "kind" | "tax">[]).map((e) => ({
    ...e, kind: "receipt" as const, tax: 0, amount: Number(e.amount) || 0, bill_markup_percent: Number(e.bill_markup_percent) || 0,
  }));
  // bills need migration 20261005000000; without it only receipts show
  const bills = bl.error ? [] : ((bl.data || []) as { id: string; invoice_number: string | null; invoice_date: string | null; supplier: string | null;
    total_amount: number; tax_amount: number; items: BillableExpense["line_items"]; bill_markup_percent: number }[]).map((b) => ({
    kind: "bill" as const, id: b.id, expense_date: b.invoice_date, vendor: b.supplier, description: `Bill ${b.invoice_number || ""}`.trim(),
    amount: Number(b.total_amount) || 0, tax: Number(b.tax_amount) || 0, receipt_number: b.invoice_number, line_items: b.items,
    bill_markup_percent: Number(b.bill_markup_percent) || 0,
  }));
  return [...receipts, ...bills].sort((a, b) => String(a.expense_date || "").localeCompare(String(b.expense_date || "")));
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
    source_expense_id: (d.source_expense_id as string | null) ?? null,
    source_bill_id: (d.source_bill_id as string | null) ?? null,
  }));
}

export async function saveInvoiceLines(invoiceId: string, lines: EditLine[], taxRate: number, note: string) {
  const { data, error } = await supabase.rpc("invoice_save_lines", {
    p_invoice: invoiceId,
    p_lines: lines.map((l) => ({
      description: l.description.trim(), quantity: Number(l.quantity), rate: Number(l.rate), unit: l.unit.trim() || "ea",
      notes: l.notes.trim() || null, line_name: l.line_name.trim() || null, source_boq_section_item_id: l.source_boq_section_item_id,
      ...(l.source_expense_id ? { source_expense_id: l.source_expense_id } : {}),
      ...(l.source_bill_id ? { source_bill_id: l.source_bill_id } : {}),
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
