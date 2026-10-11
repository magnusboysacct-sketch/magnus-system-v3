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
// Advances (money received for the project before invoicing) can be credited on the new invoice: applyAdvanceIds are linked to
// it and updateInvoiceAfterPayment recalculates amount_paid / balance_due / status once. An advance is applied whole or not
// at all, and together they can't exceed the invoice total (checkAdvanceApplication) - checked before anything is written.
//
// An item with a quantity but NO rate is a hard block (never silently billed at 0): findItemsMissingRate lists them, and the
// generator refuses before anything is written.
//
// Selected items (multi-beneficiary billing): with options.selection only the chosen BOQ items are billed, always itemized and
// always for 1 unit (the multiplier does not apply), and each line carries its item's name (line_name) onto the invoice line.
// Without a selection nothing about the above changes. The missing-rate block then looks only at the chosen items.
//
// Do NOT put anything in client_invoice_line_items.boq_item_id: that column points at boq_items (contract progress
// billing), not at boq_section_items.
import { supabase } from "./supabase";
import { createClientInvoice, createInvoiceLineItems, updateInvoiceAfterPayment, type ClientPayment } from "./finance";
import { formatContractDate } from "./contractDocument";

export type BoqInvoiceLineMode = "per-section" | "itemized";

export interface BoqInvoiceOptions {
  multiplier?: number; // whole number of identical units, default 1
  markupPercent?: number; // default 0
  lineMode?: BoqInvoiceLineMode; // default "per-section"
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  taxRate?: number; // percent, default 0
  terms?: string;
  applyAdvanceIds?: string[]; // unapplied advances (client_payments) to credit against the new invoice
  selection?: { itemIds: string[] }; // bill only these BOQ items (itemized, 1 unit); see the note at the top
}

export interface BoqSectionInput {
  title?: string | null;
  items: Array<{
    id?: string | null;
    line_name?: string | null;
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
  line_name?: string | null; // only on lines built with carryNames
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
  if (o.selection && !(Array.isArray(o.selection.itemIds) && o.selection.itemIds.length > 0)) return "Tick at least one item to bill.";
  const multiplier = o.multiplier ?? 1;
  // With a selection the multiplier doesn't apply (it is always 1), so it isn't checked.
  if (!o.selection && (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER)) {
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

// The same sections with only the items whose id is in itemIds. Every section is kept (even if empty) so "Section N" numbering
// in messages doesn't shift.
export function filterSectionsBySelection<S extends BoqSectionInput>(sections: S[], itemIds: string[]): S[] {
  const wanted = new Set(itemIds.map(String));
  return sections.map((s) => ({ ...s, items: (s.items || []).filter((it) => it.id != null && wanted.has(String(it.id))) }));
}

// One BOQ item as the invoice line it becomes: the same quantity (x1) and rate (x markup) maths as the itemized builder.
export function itemizedLineAmount(it: { qty?: number | string | null; rate?: number | string | null }, markupPercent = 0): number {
  const quantity = round2(num(it.qty));
  if (quantity <= 0) return 0;
  return round2(quantity * round2(num(it.rate) * (1 + markupPercent / 100)));
}

// Name + item matching for "already billed" warnings: a name and an item description, case/space-insensitive.
export function billedKey(name: unknown, itemDescription: unknown): string {
  const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(name) + "\u0001" + norm(itemDescription || "Unnamed Item");
}

// What this project has already billed by name: billedKey -> the invoice numbers carrying that name + item (cancelled invoices
// don't count). Returns an empty map when the line_name column doesn't exist yet or the read fails.
export async function fetchBilledNameItems(projectId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!projectId) return out;
  try {
    const { data, error } = await supabase
      .from("client_invoice_line_items")
      .select("line_name, description, client_invoices!inner(invoice_number, project_id, status)")
      .not("line_name", "is", null)
      .eq("client_invoices.project_id", projectId);
    if (error) return out;
    for (const row of (data || []) as any[]) {
      const inv = Array.isArray(row.client_invoices) ? row.client_invoices[0] : row.client_invoices;
      if (!inv || inv.status === "cancelled" || !String(row.line_name ?? "").trim()) continue;
      const key = billedKey(row.line_name, row.description);
      const list = out.get(key) ?? [];
      if (inv.invoice_number && !list.includes(inv.invoice_number)) list.push(inv.invoice_number);
      out.set(key, list);
    }
  } catch {
    /* no warnings, never blocks */
  }
  return out;
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
  opts: { multiplier?: number; markupPercent?: number; lineMode?: BoqInvoiceLineMode; carryNames?: boolean },
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
        ...(opts.carryNames && (it.line_name || "").trim() ? { line_name: (it.line_name || "").trim() } : {}),
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

const fmtJMD = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);

// The rule for applying advances to an invoice: an advance is applied whole or not at all (never split), and the advances
// together can't exceed the invoice total (no negative balance). Returns a plain-language problem, or null when it's fine.
// Used by the dialog (to disable Generate) and by the generator (before anything is written), so the rule lives in one place.
export function checkAdvanceApplication(
  invoiceTotal: number,
  advances: Array<{ amount: number | string; payment_date?: string | null }>,
): string | null {
  for (const a of advances) {
    const amount = round2(num(a.amount));
    if (amount > invoiceTotal) {
      const when = a.payment_date ? ` from ${formatContractDate(a.payment_date)}` : "";
      return `The advance of ${fmtJMD(amount)}${when} is larger than this invoice's total of ${fmtJMD(invoiceTotal)}, so it can't be applied. Deselect it, or apply it to a larger invoice.`;
    }
  }
  const sum = round2(advances.reduce((s, a) => s + num(a.amount), 0));
  if (sum > invoiceTotal) {
    return `The selected advances add up to ${fmtJMD(sum)}, which is more than this invoice's total of ${fmtJMD(invoiceTotal)}. Deselect some of them.`;
  }
  return null;
}

export type BoqInvoiceResult =
  | {
      success: true; invoiceId: string; invoiceNumber: string; lineCount: number; subtotal: number; taxAmount: number; total: number;
      advancesApplied: number; amountPaid: number; balanceDue: number; status: string;
    }
  | { success: false; error: string };

export async function generateInvoiceFromBOQ(projectId: string, boqId: string, options: BoqInvoiceOptions): Promise<BoqInvoiceResult> {
  if (!projectId || !boqId) return { success: false, error: "Missing project ID or BOQ ID" };
  const problem = validateBoqInvoiceOptions(options);
  if (problem) return { success: false, error: problem };

  const selecting = !!options.selection;
  const multiplier = selecting ? 1 : options.multiplier ?? 1;
  const markupPercent = options.markupPercent ?? 0;
  const lineMode: BoqInvoiceLineMode = selecting ? "itemized" : options.lineMode ?? "per-section";
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

    // The item names are only read when billing selected items.
    const itemCols = "id, section_id, item_name, description, unit_id, qty, rate, sort_order";
    const itemsRes = (await supabase
      .from("boq_section_items")
      .select(selecting ? itemCols + ", line_name" : itemCols)
      .in("section_id", sections.map((s) => s.id))
      .order("sort_order", { ascending: true })) as unknown as { data: any[] | null; error: { message: string } | null };
    const { data: items, error: itemsError } = itemsRes;
    if (itemsError) {
      if (selecting && /line_name/i.test(itemsError.message)) return { success: false, error: "Item names can't be used yet: the database update for them hasn't been applied." };
      return { success: false, error: "Failed to fetch BOQ items: " + itemsError.message };
    }
    if (!items || items.length === 0) return { success: false, error: "No items found in BOQ" };
    // Every selected id must be an item of THIS BOQ (a stale or foreign id fails before anything is written).
    const selectedIds = selecting ? [...new Set((options.selection?.itemIds ?? []).map(String))] : [];
    if (selecting) {
      const known = new Set(items.map((i) => String(i.id)));
      if (selectedIds.some((id) => !known.has(id))) {
        return { success: false, error: "Some of the selected items are no longer part of this BOQ. Close the dialog, reload the BOQ and try again." };
      }
    }

    const unitIds = [...new Set(items.map((i: any) => i.unit_id).filter(Boolean))] as string[];
    const unitMap = new Map<string, string>();
    if (unitIds.length > 0) {
      const { data: units } = await supabase.from("master_units").select("id, name").in("id", unitIds);
      for (const u of units || []) unitMap.set(u.id, u.name);
    }

    // 3. The lines and totals.
    const allGrouped = sections.map((s) => ({
      title: s.title,
      items: items.filter((i: any) => i.section_id === s.id),
    }));
    const grouped = selecting ? filterSectionsBySelection(allGrouped, selectedIds) : allGrouped;
    // Hard block: an item with a quantity but no rate would bill at 0. Checked before anything is written.
    const missingRates = findItemsMissingRate(grouped);
    if (missingRates.length > 0) return { success: false, error: missingRateMessage(missingRates) };
    const lines = buildBoqInvoiceLines(grouped, { multiplier, markupPercent, lineMode, carryNames: selecting }, (id) => (id ? unitMap.get(id) : null));
    if (lines.length === 0) {
      return { success: false, error: selecting ? "Nothing to bill: the selected items have no quantity." : "Nothing to bill: every section in this BOQ totals zero." };
    }
    const { subtotal, taxAmount, total } = computeInvoiceTotals(lines, taxRate);

    // Advances chosen to be credited on this invoice: checked now, before anything is written.
    let advances: ClientPayment[] = [];
    const advanceIds = [...new Set(options.applyAdvanceIds ?? [])];
    if (advanceIds.length > 0) {
      const { data: advRows, error: advError } = await supabase.from("client_payments").select("*").in("id", advanceIds);
      if (advError) return { success: false, error: "Failed to read the selected advances: " + advError.message };
      advances = (advRows || []) as ClientPayment[];
      if (advances.length !== advanceIds.length) return { success: false, error: "One of the selected advances could not be found. Refresh and try again." };
      if (advances.some((a) => a.invoice_id || a.project_id !== projectId)) {
        return { success: false, error: "One of the selected advances has already been applied or belongs to another project. Refresh and try again." };
      }
      const advanceProblem = checkAdvanceApplication(total, advances);
      if (advanceProblem) return { success: false, error: advanceProblem };
    }

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
    if (selecting) noteBits.push(`${selectedIds.length} selected item${selectedIds.length === 1 ? "" : "s"}`);
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
          ...(l.line_name ? { line_name: l.line_name } : {}),
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


    // Apply the chosen advances: link each one to the new invoice, then let updateInvoiceAfterPayment recalculate
    // amount_paid / balance_due / status ONCE from the linked payments (the app's existing calculation - not repeated here).
    let finalInvoice: { amount_paid?: number; balance_due?: number; status?: string } = { amount_paid: 0, balance_due: total, status: "draft" };
    if (advances.length > 0) {
      try {
        for (const adv of advances) {
          const { data: linked, error: linkError } = await supabase
            .from("client_payments")
            .update({ invoice_id: invoice.id })
            .eq("id", adv.id)
            .is("invoice_id", null)
            .select("id");
          if (linkError) throw linkError;
          if (!linked || linked.length !== 1) throw new Error("an advance was applied elsewhere in the meantime");
        }
        finalInvoice = (await updateInvoiceAfterPayment(invoice.id)) as typeof finalInvoice;
      } catch (applyError: any) {
        // Deleting the invoice header also removes its lines (cascade) and un-links any advance already linked to it
        // (client_payments.invoice_id is ON DELETE SET NULL), so every advance is back to "unapplied".
        const { error: cleanupError } = await supabase.from("client_invoices").delete().eq("id", invoice.id);
        return {
          success: false,
          error:
            "Failed to apply the advance: " + (applyError?.message || String(applyError)) + ". The invoice was not created." +
            (cleanupError ? ` (The invoice ${invoiceNumber} could not be removed automatically - please delete it from Accounts Receivable.)` : ""),
        };
      }
    }

    return {
      success: true, invoiceId: invoice.id, invoiceNumber, lineCount: lines.length, subtotal, taxAmount, total,
      advancesApplied: advances.length,
      amountPaid: Number(finalInvoice.amount_paid ?? 0),
      balanceDue: Number(finalInvoice.balance_due ?? total),
      status: String(finalInvoice.status ?? "draft"),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}
