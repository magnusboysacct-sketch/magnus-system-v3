// Generate a DRAFT client invoice from an approved BOQ, optionally for several identical units and with a markup.
//
// A BOQ is priced at library COST rates, for one unit of the job. `multiplier` bills N identical units on one invoice
// (e.g. three identical houses), and `markupPercent` turns cost into a client price. Two shapes:
//   per-section  one invoice line per BOQ section: quantity 1, rate = the section's total x multiplier x markup
//   itemized     one invoice line per BOQ item: quantity = item qty x multiplier, rate = item rate x markup
// The pure builders below do all the arithmetic, so the dialog preview and the saved invoice are always identical.
// Money and quantities are rounded the way the database stores them (cents, 2-decimal quantities), and every itemized
// line satisfies quantity x rate = amount exactly as printed.
//
// An item with a quantity but NO rate is a hard block (never silently billed at 0): findItemsMissingRate lists them, and the
// generator refuses before anything is written.
//
// Do NOT put anything in client_invoice_line_items.boq_item_id: that column points at boq_items (contract progress
// billing), not at boq_section_items.
import { supabase } from "./supabase";
import { createClientInvoice, createInvoiceLineItems } from "./finance";

export type BoqInvoiceLineMode = "per-section" | "itemized";

export interface BoqInvoiceOptions {
  multiplier?: number; // whole number of identical units, default 1
  markupPercent?: number; // default 0
  lineMode?: BoqInvoiceLineMode; // default "per-section"
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  taxRate?: number; // percent, default 0
  terms?: string;
}

export interface BoqSectionInput {
  title?: string | null;
  items: Array<{
    item_name?: string | null;
    description?: string | null;
    unit_id?: string | null;
    qty?: number | string | null;
    rate?: number | string | null;
  }>;
}

export interface InvoiceLineDraft {
  line_number: number;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  notes: string | null;
}

export const MAX_MULTIPLIER = 1000;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Today in Jamaica (YYYY-MM-DD).
export function jamaicaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica" }).format(new Date());
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns a plain-language problem with the options, or null when they are fine.
export function validateBoqInvoiceOptions(o: BoqInvoiceOptions): string | null {
  const multiplier = o.multiplier ?? 1;
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER) {
    return `Number of units must be a whole number from 1 to ${MAX_MULTIPLIER}.`;
  }
  const markup = o.markupPercent ?? 0;
  if (!Number.isFinite(markup) || markup < 0 || markup > 1000) return "Markup must be between 0% and 1000%.";
  const tax = o.taxRate ?? 0;
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) return "Tax must be between 0% and 100%.";
  if (!DATE_RE.test(o.invoiceDate || "")) return "Enter a valid invoice date.";
  if (!DATE_RE.test(o.dueDate || "")) return "Enter a valid due date.";
  if (o.dueDate < o.invoiceDate) return "The due date can't be before the invoice date.";
  return null;
}

// BOQ items that have a quantity but no usable rate (0, blank or not a number). Named with their section so they can be found.
export function findItemsMissingRate(sections: BoqSectionInput[]): string[] {
  const missing: string[] = [];
  sections.forEach((section, index) => {
    const sectionName = (section.title || "").trim() || `Section ${index + 1}`;
    for (const it of section.items || []) {
      if (num(it.qty) > 0 && !(num(it.rate) > 0)) {
        missing.push(`${(it.item_name || "").trim() || "Unnamed Item"} (${sectionName})`);
      }
    }
  });
  return missing;
}

const MAX_LISTED = 10;

export function missingRateMessage(names: string[]): string {
  const listed = names.slice(0, MAX_LISTED).join(", ");
  const more = names.length > MAX_LISTED ? ` and ${names.length - MAX_LISTED} more` : "";
  return (
    `Can't generate the invoice: ${names.length} item${names.length === 1 ? " has" : "s have"} a quantity but no rate: ${listed}${more}. ` +
    `Set a rate for ${names.length === 1 ? "it" : "them"} first (in the Rate Library, then on the BOQ), save and approve the BOQ again, and try again.`
  );
}

// Builds the invoice lines from BOQ sections. `unitName` resolves a unit_id to its name (unknown -> "ea").
export function buildBoqInvoiceLines(
  sections: BoqSectionInput[],
  opts: { multiplier?: number; markupPercent?: number; lineMode?: BoqInvoiceLineMode },
  unitName: (unitId: string | null | undefined) => string | null | undefined = () => null,
): InvoiceLineDraft[] {
  const multiplier = opts.multiplier ?? 1;
  const factor = 1 + (opts.markupPercent ?? 0) / 100;
  const mode = opts.lineMode ?? "per-section";
  const lines: InvoiceLineDraft[] = [];

  if (mode === "per-section") {
    sections.forEach((section, index) => {
      let base = 0;
      for (const it of section.items || []) base += num(it.qty) * num(it.rate);
      const amount = round2(base * multiplier * factor);
      if (amount === 0) return; // nothing to bill for this section
      lines.push({
        line_number: lines.length + 1,
        description: (section.title || "").trim() || `Section ${index + 1}`,
        quantity: 1,
        unit: "lot",
        rate: amount,
        amount,
        notes: multiplier > 1 ? `Covers ${multiplier} units` : null,
      });
    });
    return lines;
  }

  for (const section of sections) {
    for (const it of section.items || []) {
      const quantity = round2(num(it.qty) * multiplier);
      if (quantity <= 0) continue;
      const rate = round2(num(it.rate) * factor);
      lines.push({
        line_number: lines.length + 1,
        description: (it.item_name || "").trim() || "Unnamed Item",
        quantity,
        unit: (it.unit_id ? unitName(it.unit_id) : null) || "ea",
        rate,
        amount: round2(quantity * rate),
        notes: (it.description || "").trim() || null,
      });
    }
  }
  return lines;
}

export function computeInvoiceTotals(lines: Array<{ amount: number }>, taxRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxAmount = round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

// INV-<year>-<5 digits>, the same style the estimate page uses.
function makeInvoiceNumber(): string {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica", year: "numeric" }).format(new Date());
  return `INV-${year}-${Date.now().toString().slice(-5)}`;
}

export type BoqInvoiceResult =
  | { success: true; invoiceId: string; invoiceNumber: string; lineCount: number; subtotal: number; taxAmount: number; total: number }
  | { success: false; error: string };

export async function generateInvoiceFromBOQ(projectId: string, boqId: string, options: BoqInvoiceOptions): Promise<BoqInvoiceResult> {
  if (!projectId || !boqId) return { success: false, error: "Missing project ID or BOQ ID" };
  const problem = validateBoqInvoiceOptions(options);
  if (problem) return { success: false, error: problem };

  const multiplier = options.multiplier ?? 1;
  const markupPercent = options.markupPercent ?? 0;
  const lineMode = options.lineMode ?? "per-section";
  const taxRate = options.taxRate ?? 0;

  try {
    // 1. The project, and its client - checked before anything is written.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name, client_id, company_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return { success: false, error: "Failed to read the project: " + projectError.message };
    if (!project) return { success: false, error: "Project not found or access denied" };
    if (!project.client_id) {
      return { success: false, error: "This project has no client set. Set the project's client on the Projects page, then try again." };
    }
    if (!project.company_id) return { success: false, error: "The project isn't linked to a company." };
    const { data: client } = await supabase.from("clients").select("id, name").eq("id", project.client_id).maybeSingle();
    if (!client) return { success: false, error: "The project's client could not be found. Check the client on the Projects page." };

    // 2. The BOQ: must belong to the project and be approved.
    const { data: boqHeader, error: headerError } = await supabase
      .from("boq_headers")
      .select("id, project_id, status, version")
      .eq("id", boqId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (headerError) return { success: false, error: "Failed to fetch BOQ: " + headerError.message };
    if (!boqHeader) return { success: false, error: "BOQ not found or access denied" };
    if (boqHeader.status !== "approved") return { success: false, error: "BOQ must be approved before generating an invoice" };

    const { data: sections, error: sectionsError } = await supabase
      .from("boq_sections")
      .select("id, title, sort_order")
      .eq("boq_id", boqId)
      .order("sort_order", { ascending: true });
    if (sectionsError) return { success: false, error: "Failed to fetch BOQ sections: " + sectionsError.message };
    if (!sections || sections.length === 0) return { success: false, error: "No sections found in BOQ" };

    const { data: items, error: itemsError } = await supabase
      .from("boq_section_items")
      .select("id, section_id, item_name, description, unit_id, qty, rate, sort_order")
      .in("section_id", sections.map((s) => s.id))
      .order("sort_order", { ascending: true });
    if (itemsError) return { success: false, error: "Failed to fetch BOQ items: " + itemsError.message };
    if (!items || items.length === 0) return { success: false, error: "No items found in BOQ" };

    const unitIds = [...new Set(items.map((i) => i.unit_id).filter(Boolean))] as string[];
    const unitMap = new Map<string, string>();
    if (unitIds.length > 0) {
      const { data: units } = await supabase.from("master_units").select("id, name").in("id", unitIds);
      for (const u of units || []) unitMap.set(u.id, u.name);
    }

    // 3. The lines and totals.
    const grouped = sections.map((s) => ({
      title: s.title,
      items: items.filter((i) => i.section_id === s.id),
    }));
    // Hard block: an item with a quantity but no rate would bill at 0. Checked before anything is written.
    const missingRates = findItemsMissingRate(grouped);
    if (missingRates.length > 0) return { success: false, error: missingRateMessage(missingRates) };
    const lines = buildBoqInvoiceLines(grouped, { multiplier, markupPercent, lineMode }, (id) => (id ? unitMap.get(id) : null));
    if (lines.length === 0) return { success: false, error: "Nothing to bill: every section in this BOQ totals zero." };
    const { subtotal, taxAmount, total } = computeInvoiceTotals(lines, taxRate);

    // 4. A fresh invoice number (re-rolled if the company already has it).
    let invoiceNumber = makeInvoiceNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await supabase
        .from("client_invoices")
        .select("id")
        .eq("company_id", project.company_id)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();
      if (!clash) break;
      invoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    }

    // 5. The invoice, then its lines; if the lines fail the invoice header is removed again.
    const noteBits = [`Generated from BOQ v${boqHeader.version ?? ""}`.trim()];
    if (multiplier > 1) noteBits.push(`${multiplier} units`);
    // The markup is deliberately NOT recorded here: invoice notes travel with the invoice data the client portal receives.
    const invoice = await createClientInvoice({
      company_id: project.company_id,
      client_id: project.client_id,
      project_id: projectId,
      invoice_number: invoiceNumber,
      invoice_date: options.invoiceDate,
      due_date: options.dueDate,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      amount_paid: 0,
      balance_due: total,
      status: "draft",
      notes: noteBits.join(" - "),
      terms: options.terms?.trim() || null,
    });

    try {
      await createInvoiceLineItems(
        lines.map((l) => ({
          invoice_id: invoice.id,
          company_id: project.company_id as string,
          line_number: l.line_number,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          rate: l.rate,
          amount: l.amount,
          notes: l.notes,
        })),
      );
    } catch (lineError: any) {
      const { error: cleanupError } = await supabase.from("client_invoices").delete().eq("id", invoice.id);
      return {
        success: false,
        error:
          "Failed to create the invoice lines: " + (lineError?.message || String(lineError)) +
          (cleanupError ? ` (The empty invoice ${invoiceNumber} could not be removed automatically - please delete it from Accounts Receivable.)` : ""),
      };
    }

    return { success: true, invoiceId: invoice.id, invoiceNumber, lineCount: lines.length, subtotal, taxAmount, total };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
