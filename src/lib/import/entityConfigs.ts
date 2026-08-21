// src/lib/import/entityConfigs.ts
//
// One EntityImportConfig per importable entity type. Clients is fully wired
// up first (per the phased plan — check in before replicating to Projects
// and Expenses). Registering a future entity is: write a config object,
// add it to ENTITY_CONFIGS below. The wizard shell never changes.
import { supabase } from "../supabase";
import type { EntityImportConfig, ExistingRecord, LookupSource, LookupMaps } from "./types";
import { normalizeEmail, normalizeKey, resolveLookup } from "./matching";

// ─── Clients ────────────────────────────────────────────────────────────────
//
// Schema per the confirmed live information_schema.columns dump: name is the
// only NOT NULL field besides id/company_id/status/created_at/updated_at.
// company_id defaults to current_company_id() at the DB level, but this
// config sets it explicitly anyway (see types.ts's buildPayload comment).
// No UNIQUE constraint on name or email — dedup is app-level, email
// prioritized over name as the stronger match signal.
const clientsConfig: EntityImportConfig = {
  key: "clients",
  label: "Clients",
  table: "clients",
  dedupEnabled: true,

  // Alias lists are deliberately broad, general variants seen across common
  // accounting/CRM export shapes (Zoho, QuickBooks, Xero, generic CRMs) —
  // not tailored to any one specific file. Punctuation/spacing differences
  // ("Email ID" vs "EmailID" vs "email_id") are handled for free by
  // normalizeForMatch (matching.ts), so aliases only need to cover distinct
  // *wording*, not every spelling variant of the same phrase.
  fields: [
    { key: "name", label: "Client Name", required: true, type: "text",
      aliases: ["name", "client name", "company name", "customer name", "account name", "business name", "display name", "organization", "organization name"] },
    { key: "contact_name", label: "Contact Person", required: false, type: "text",
      aliases: ["contact name", "contact person", "attention", "attn", "primary contact", "contact"] },
    { key: "email", label: "Email", required: false, type: "email",
      aliases: ["email", "email address", "e-mail", "email id", "primary email", "work email"] },
    { key: "phone", label: "Phone", required: false, type: "phone",
      aliases: ["phone", "phone number", "mobile", "mobile number", "telephone", "contact number", "work phone", "primary phone", "business phone"] },
    // multiSource: most real exports don't have one "Address" column at
    // all — they split it across several Billing-prefixed columns
    // (confirmed against a real Zoho Contacts export: Billing Address,
    // Billing Street2, Billing City, Billing State, Billing Country,
    // Billing Code — no single combined column). Deliberately Billing-
    // qualified throughout, never bare "city"/"state"/"country"/"code",
    // so these aliases can never accidentally auto-match the parallel
    // Shipping-prefixed columns most of these exports also carry — a
    // client record's address represents their billing/business address,
    // not a shipping destination.
    { key: "address", label: "Address", required: false, type: "text", multiSource: true,
      aliases: [
        "address", "billing address", "street address", "mailing address", "full address",
        "billing street", "billing street2", "billing address2",
        "billing city", "billing state", "billing country", "billing code",
        "billing zip", "billing zip code", "billing postal code",
        "bill to address", "bill to street", "bill to city", "bill to state", "bill to country", "bill to zip",
      ] },
    { key: "notes", label: "Notes", required: false, type: "text",
      aliases: ["notes", "description", "remarks", "comments", "memo"] },
    { key: "status", label: "Status", required: false, type: "select",
      options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }],
      aliases: ["status", "account status"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      label: c.name,
      keys: [normalizeEmail(c.email), normalizeKey(c.name)].filter(Boolean),
    }));
  },

  matchKeysFor(values) {
    // Email checked first — it's the stronger, less-ambiguous signal (two
    // different clients can share a name; they shouldn't share an email).
    const keys: string[] = [];
    if (values.email) keys.push(normalizeEmail(values.email));
    if (values.name) keys.push(normalizeKey(values.name));
    return keys;
  },

  validateField(field, value) {
    if (field.key === "email" && value) {
      const v = String(value).trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Doesn't look like a valid email";
    }
    if (field.key === "status" && value) {
      const v = String(value).trim().toLowerCase();
      if (v !== "active" && v !== "inactive") return `Status must be "active" or "inactive"`;
    }
    return null;
  },

  // name is the one required field, and exports of individual (non-company)
  // clients sometimes only carry a contact name or an email, no separate
  // "company/display name" column — rather than losing that row entirely,
  // fall back to whatever's available. Genuinely blank rows (no name AND no
  // contact_name AND no email mapped) still correctly fail as missing.
  buildFallback(fieldKey, values) {
    if (fieldKey !== "name") return null;
    if (values.contact_name && String(values.contact_name).trim()) return String(values.contact_name).trim();
    if (values.email && String(values.email).trim()) return String(values.email).trim();
    return null;
  },

  buildPayload(values, _lookups, companyId) {
    const status = values.status ? String(values.status).trim().toLowerCase() : "active";
    return {
      company_id: companyId,
      name: String(values.name).trim(),
      contact_name: values.contact_name ? String(values.contact_name).trim() : null,
      email: values.email ? String(values.email).trim() : null,
      phone: values.phone ? String(values.phone).trim() : null,
      address: values.address ? String(values.address).trim() : null,
      notes: values.notes ? String(values.notes).trim() : null,
      status: status === "inactive" ? "inactive" : "active",
    };
  },
};

// ─── Projects ───────────────────────────────────────────────────────────────
//
// Schema per the confirmed Day 1 planning findings: name is the only NOT
// NULL field besides id/company_id/status/created_at/updated_at. status
// defaults to 'planning' and is CHECK-constrained to exactly six values
// (planning/active/on_hold/completed/cancelled/archived) — source exports
// essentially never use these exact strings verbatim, hence remapValue
// below. client_id is a nullable FK to clients, resolved via the
// cross-entity lookup this entity declares (SettingsImportPage.tsx builds
// it from a live clients query before the wizard renders) rather than
// asking the user to hand-enter a UUID. No UNIQUE constraint on name —
// dedup is app-level, same pattern as Clients, disambiguated by client_id
// when it resolves (see matchKeysFor/fetchExisting below).
const PROJECT_STATUS_ALIASES: Record<string, string> = {
  active: "active", "in progress": "active", ongoing: "active", started: "active", open: "active",
  planning: "planning", planned: "planning", "not started": "planning", new: "planning", pending: "planning", draft: "planning",
  "on hold": "on_hold", onhold: "on_hold", hold: "on_hold", paused: "on_hold", suspended: "on_hold",
  completed: "completed", complete: "completed", done: "completed", finished: "completed", closed: "completed",
  cancelled: "cancelled", canceled: "cancelled", cancel: "cancelled",
  archived: "archived", archive: "archived", inactive: "archived",
};

// Real exports use all kinds of date formats (MM/DD/YYYY, DD-MM-YYYY,
// "Jan 5, 2026", ...) — JS's Date constructor already handles most of them
// reasonably; this just centralizes the parse + reformat to the plain
// YYYY-MM-DD Postgres date columns expect, and gives validateField/
// buildPayload a single source of truth for "is this a usable date."
// Excel/spreadsheet serial date numbers (e.g. "45314") arrive as bare
// numeric strings once a CSV/XLSX cell with no format metadata gets
// stringified. JS's Date constructor misinterprets a bare numeric string
// as a YEAR NUMBER — new Date("45314") is January 1, year 45314, not
// Jan 23 2024 — which still "looks valid" (passes isNaN) but produces a
// malformed extended-year ISO string once .toISOString() runs
// ("+045314-01-01T..." — a different format than the normal 4-digit-year
// case), and slice(0,10) on THAT produces "+045314-01", not a real date.
// That malformed value reaching Postgres is what "time zone displacement
// out of range" actually was — confirmed by reproducing it directly
// (new Date("45314").toISOString() -> "+045314-01-01T05:00:00.000Z"),
// not guessed at.
//
// Fixed by detecting a bare numeric string and converting it via the
// standard Excel epoch offset (serial 25569 = Jan 1 1970) — verified
// against known reference points before using it, not trusted blindly:
// serial 44927 -> Jan 1 2023, serial 45292 -> Jan 1 2024, both correct.
// Known, understood, low-stakes gap: this offset is off by one day for
// serials under ~60 (Jan/Feb 1900), from Excel's own well-documented
// phantom 1900-leap-year bug — no real expense would plausibly be dated
// there, so not worth the extra complexity to correct.
//
// A generous but bounded range (1-100000, roughly 1900-2173) avoids
// misreading an unrelated all-digit date format (e.g. "20240123" for
// YYYYMMDD) as a serial number — that falls through to the normal string
// parsing path below instead.
function parseLooseDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= 1 && serial <= 100000) {
      const d = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  // Same bare-year misparse can't slip through the normal string-parsing
  // path either — never trust a resulting year outside a sane 4-digit
  // range before formatting it for the DB.
  const year = d.getUTCFullYear();
  if (year < 1000 || year > 9999) return null;
  return d.toISOString().slice(0, 10);
}

// Shared remapValue helper for any date-typed field (Projects'
// start_date/end_date, Expenses' expense_date) — converts via
// parseLooseDate and writes the result back into `values`, same as any
// other remapValue, so the Preview table shows the ACTUAL value that will
// be sent to the DB (an Excel serial "45314" displays as "2024-01-23",
// not the raw number) rather than only converting it later inside
// buildPayload where the user never sees it. Returns undefined for a
// genuinely invalid date, leaving the raw value in place so validateField's
// existing "doesn't look like a valid date" error/warning still fires
// exactly as before — this hook only ever reformats an already-parseable
// value, it never changes what counts as valid.
function remapDateField(rawValue: string): { value: string; usedFallback: boolean } | undefined {
  const parsed = parseLooseDate(rawValue);
  return parsed ? { value: parsed, usedFallback: false } : undefined;
}

const projectsConfig: EntityImportConfig = {
  key: "projects",
  label: "Projects",
  table: "projects",
  dedupEnabled: true,

  fields: [
    { key: "name", label: "Project Name", required: true, type: "text",
      aliases: ["name", "project name", "project", "job name", "job", "title"] },
    { key: "client_id", label: "Client", required: false, type: "lookup", lookupEntityKey: "clients",
      aliases: ["client", "client name", "customer", "customer name", "account", "account name", "company", "company name"] },
    { key: "status", label: "Status", required: false, type: "select",
      options: [
        { value: "planning", label: "Planning" },
        { value: "active", label: "Active" },
        { value: "on_hold", label: "On Hold" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
        { value: "archived", label: "Archived" },
      ],
      aliases: ["status", "project status", "stage"] },
    { key: "site_address", label: "Site Address", required: false, type: "text",
      aliases: ["site address", "project address", "job site", "job address", "location", "site location"] },
    { key: "notes", label: "Notes", required: false, type: "text",
      aliases: ["notes", "description", "remarks", "comments", "memo"] },
    { key: "start_date", label: "Start Date", required: false, type: "date",
      aliases: ["start date", "begin date", "project start", "start"] },
    { key: "end_date", label: "End Date", required: false, type: "date",
      aliases: ["end date", "finish date", "project end", "due date", "completion date", "end"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, client_id")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(p => {
      const normName = normalizeKey(p.name);
      // An existing project WITH a client only exposes the disambiguated
      // key; one WITHOUT only the bare-name key — matchKeysFor mirrors this
      // exactly, so a same-named project under a different client (or no
      // client at all) never gets treated as a duplicate of this one.
      return { id: p.id, label: p.name, keys: [p.client_id ? `${normName}::${p.client_id}` : normName] };
    });
  },

  matchKeysFor(values, lookups) {
    const normName = values.name ? normalizeKey(String(values.name)) : "";
    if (!normName) return [];
    const clientMatch = resolveLookup(values.client_id, lookups.clients);
    // A resolved client disambiguates — deliberately NOT also falling back
    // to the bare name, which would defeat the point: two different
    // clients' same-named "Renovation" project must not collide.
    if (clientMatch) return [`${normName}::${clientMatch.id}`];
    return [normName];
  },

  validateField(field, value) {
    if ((field.key === "start_date" || field.key === "end_date") && value) {
      if (!parseLooseDate(String(value))) return "Doesn't look like a valid date";
    }
    return null;
  },

  // Source systems' status strings essentially never match this app's exact
  // CHECK-constraint values verbatim (Zoho's real Projects export uses
  // "Active", confirmed earlier this session) — map known variants,
  // default anything unrecognized to "planning" rather than blocking the
  // row, and flag the default in Preview so it's a visible, reviewable
  // choice, not a silent guess.
  remapValue(fieldKey, rawValue) {
    if (fieldKey === "start_date" || fieldKey === "end_date") return remapDateField(rawValue);
    if (fieldKey !== "status") return undefined;
    const mapped = PROJECT_STATUS_ALIASES[rawValue.trim().toLowerCase()];
    if (mapped) return { value: mapped, usedFallback: false };
    return { value: "planning", usedFallback: true };
  },

  buildPayload(values, lookups, companyId) {
    // values.client_id is still the raw typed client name at this point —
    // the wizard shell deliberately never overwrites it (so Preview can
    // keep showing the human-readable text), so resolution happens here
    // too, same as matchKeysFor above. An unresolved reference imports
    // with client_id null rather than blocking the row (already flagged as
    // a warning in Preview when this happens).
    const clientMatch = resolveLookup(values.client_id, lookups.clients);
    return {
      company_id: companyId,
      name: String(values.name).trim(),
      client_id: clientMatch ? clientMatch.id : null,
      status: values.status || "planning",
      site_address: values.site_address ? String(values.site_address).trim() : null,
      notes: values.notes ? String(values.notes).trim() : null,
      start_date: values.start_date ? parseLooseDate(String(values.start_date)) : null,
      end_date: values.end_date ? parseLooseDate(String(values.end_date)) : null,
    };
  },
};

// ─── Expenses ───────────────────────────────────────────────────────────────
//
// Schema per the confirmed Day 1 planning findings: company_id, expense_date,
// description, and amount are NOT NULL; project_id/category_id are nullable
// FKs; status defaults to 'pending' and isn't user-mappable at all here —
// every imported row lands as pending for review, matching how every other
// expense enters this app regardless of source. No dedup (dedupEnabled:
// false, per the Day 1 plan) — a "duplicate-looking" expense might be a
// legitimate second identical purchase, so every row imports as new;
// fetchExisting/matchKeysFor below are unused no-ops, only present to
// satisfy the type.
//
// description's buildFallback (category + vendor) exists because real Zoho
// exports routinely leave "Expense Description" blank (confirmed against
// Veron's actual 258-row Expense.csv) while expenses.description is NOT
// NULL — same mechanism already proven on Clients' name field.
const expensesConfig: EntityImportConfig = {
  key: "expenses",
  label: "Expenses",
  table: "expenses",
  dedupEnabled: false,

  fields: [
    { key: "expense_date", label: "Date", required: true, type: "date",
      aliases: ["date", "expense date", "transaction date", "bill date", "purchase date"] },
    { key: "description", label: "Description", required: true, type: "text",
      aliases: ["description", "expense description", "memo", "details", "line item"] },
    { key: "amount", label: "Amount", required: true, type: "number",
      aliases: ["amount", "expense amount", "total", "cost", "value", "price"] },
    { key: "vendor", label: "Vendor", required: false, type: "text",
      aliases: ["vendor", "payee", "supplier", "merchant", "paid to"] },
    // createIfMissing: expense_categories is a simple flat list Veron
    // hasn't necessarily pre-populated to match Zoho's category vocabulary
    // — unlike Projects' client field, an unmatched category here should
    // create a new row, not just leave category_id null. See
    // createLookupTarget below and the ImportWizard.tsx race-safe cache
    // that actually performs the creation during import.
    { key: "category_id", label: "Category", required: false, type: "lookup",
      lookupEntityKey: "expense_categories", createIfMissing: true,
      aliases: ["category", "expense category", "expense account", "account"] },
    { key: "project_id", label: "Project", required: false, type: "lookup",
      lookupEntityKey: "projects",
      aliases: ["project", "project name", "job", "job name"] },
    { key: "payment_method", label: "Payment Method", required: false, type: "text",
      aliases: ["payment method", "payment type", "paid via", "method"] },
    { key: "notes", label: "Notes", required: false, type: "text",
      aliases: ["notes", "remarks", "comments"] },
  ],

  async fetchExisting() { return []; }, // dedup disabled — never called (see the goToPreview guard), present only to satisfy the type
  matchKeysFor() { return []; },        // same — dedup disabled, never called

  validateField(field, value) {
    if (field.key === "amount") {
      const n = Number(String(value).replace(/[,$]/g, ""));
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    if (field.key === "expense_date" && !parseLooseDate(String(value))) {
      return "Doesn't look like a valid date";
    }
    return null;
  },

  // Converts expense_date (Excel serial numbers included) and writes the
  // result back into `values`, so Preview shows the actual date that will
  // be sent to the DB instead of a raw source number like "45314".
  remapValue(fieldKey, rawValue) {
    if (fieldKey !== "expense_date") return undefined;
    return remapDateField(rawValue);
  },

  // description is often blank in real exports even though it's NOT NULL —
  // derive something usable from category + vendor (whichever are mapped
  // and non-blank) rather than losing the row. Both are raw typed text at
  // this point (goToPreview builds the whole `values` object up front,
  // before any field's fallback runs, regardless of field declaration
  // order), which is exactly what's wanted for a readable derived
  // description — resolving category to an id happens later, in
  // buildPayload, and doesn't affect this.
  buildFallback(fieldKey, values) {
    if (fieldKey !== "description") return null;
    const parts = [values.category_id, values.vendor].map(v => (v ? String(v).trim() : "")).filter(Boolean);
    return parts.length ? parts.join(" - ") : null;
  },

  async createLookupTarget(fieldKey, rawValue, companyId) {
    if (fieldKey !== "category_id") throw new Error(`No creation rule for ${fieldKey}`);
    const name = rawValue.trim();
    // category_type is nullable and CHECK-constrained (labor/materials/
    // equipment/overhead/admin/other) — left null rather than guessed;
    // lib/finance.ts already treats a null category_type as "other"
    // elsewhere in the app, so this is a genuinely safe, already-handled
    // state, not a gap this import introduces.
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ company_id: companyId, name })
      .select("id, name")
      .single();
    if (error) throw error;
    return { id: data.id, label: data.name };
  },

  buildPayload(values, lookups, companyId) {
    const categoryMatch = resolveLookup(values.category_id, lookups.expense_categories);
    const projectMatch = resolveLookup(values.project_id, lookups.projects);
    return {
      company_id: companyId,
      expense_date: values.expense_date ? parseLooseDate(String(values.expense_date)) : null,
      description: String(values.description).trim(),
      amount: Number(String(values.amount).replace(/[,$]/g, "")) || 0,
      vendor: values.vendor ? String(values.vendor).trim() : null,
      category_id: categoryMatch ? categoryMatch.id : null,
      project_id: projectMatch ? projectMatch.id : null,
      payment_method: values.payment_method ? String(values.payment_method).trim() : null,
      notes: values.notes ? String(values.notes).trim() : null,
      status: "pending",
    };
  },
};

// ─── Invoices ───────────────────────────────────────────────────────────────
//
// The first grouped entity — Zoho's real Invoice.csv (confirmed by Veron:
// 71 data rows) has one row per LINE ITEM, not one row per invoice:
// invoice-level fields (Invoice Number, Invoice Date, Invoice Status,
// Customer Name, Due Date, SubTotal, Total, Balance, Project Name) repeat
// identically across every row belonging to the same invoice; Item Name/
// Item Desc/Quantity/Item Price/Item Total vary per row. groupByField:
// "invoice_number" tells the wizard shell to group underlying rows before
// building one PreviewRow per invoice (see buildGroupedPreviewRows in
// ImportWizard.tsx) and write two tables per group instead of one.
//
// Real tables per the confirmed live migrations (NOT the same as any
// generic "invoices" guess): client_invoices (header) — invoice_number/
// invoice_date/due_date NOT NULL, no UNIQUE constraint on invoice_number
// (dedup here is app-level, same as every other entity); client_id/
// project_id nullable FKs; status CHECK-constrained to draft/sent/partial/
// paid/overdue/cancelled, DEFAULT 'draft'; subtotal/tax_rate/tax_amount/
// total_amount/amount_paid/balance_due all DEFAULT 0. client_invoice_line_
// items (child) — invoice_id NOT NULL REFERENCES client_invoices(id) ON
// DELETE CASCADE, description NOT NULL, quantity/rate/amount NOT NULL with
// DB-level defaults, line_number NOT NULL DEFAULT 1.
//
// Aggregate math, confirmed by Veron: use Zoho's own SubTotal/Total/Balance
// directly rather than recomputing from line items (which could drift —
// Zoho's real totals may reflect tax/discount/shipping fields this import
// never sees). tax_amount/tax_rate/amount_paid are then derived
// arithmetically from those three real numbers so this app's own fields
// stay internally consistent (tax_amount = total - subtotal; tax_rate is a
// RECONSTRUCTED APPROXIMATION back-calculated from that, since Zoho's
// export doesn't carry a stored rate directly — confirmed OK for
// historical/migrated data; amount_paid = total - balance_due).
//
// Client/Project are plain non-blocking lookups, same pattern as Projects'
// client_id and Expenses' project_id — never created, an unresolved
// reference just imports with that field null (flagged as a warning).
//
// Line items: item_name is the real per-line description Zoho uses
// (Demolition, Excavation, ...); item_desc is optional extra detail. Both
// quantity and rate (Item Price) are required at the field level — a line
// item missing either is excluded from import (surfaced as "N of M line
// items — K skipped" in Preview) without blocking the rest of the invoice,
// per Veron's explicit design. item_total is NOT required: when Zoho
// provides it, it's trusted as-is (preserves exact historical figures,
// any rounding included); when it's missing, buildLineItemPayload falls
// back to quantity * rate, matching this app's own live AccountsReceivable
// page logic (updateLineItem: amount = quantity * rate).
const INVOICE_STATUS_ALIASES: Record<string, string> = {
  draft: "draft",
  sent: "sent", "not sent": "sent", pending: "sent", open: "sent", unpaid: "sent", unbilled: "sent",
  overdue: "overdue", late: "overdue", "past due": "overdue",
  partial: "partial", "partially paid": "partial", "part payment": "partial", "part paid": "partial",
  paid: "paid", "payment received": "paid", closed: "paid", complete: "paid", completed: "paid",
  cancelled: "cancelled", canceled: "cancelled", void: "cancelled", voided: "cancelled",
};

function toNumber(raw: any): number {
  if (raw === undefined || raw === null || String(raw).trim() === "") return NaN;
  return Number(String(raw).replace(/[,$]/g, ""));
}

// Shared by both buildPayload (never actually called by the wizard shell for
// a grouped entity, but required by the EntityImportConfig type — kept
// genuinely correct rather than a stub, in case anything ever calls it
// directly) and buildGroupHeaderPayload (the one the shell really uses).
function buildInvoiceHeaderPayload(headerValues: Record<string, any>, lookups: LookupMaps, companyId: string): Record<string, any> {
  const clientMatch = resolveLookup(headerValues.client_id, lookups.clients);
  const projectMatch = resolveLookup(headerValues.project_id, lookups.projects);

  const subtotalRaw = toNumber(headerValues.subtotal);
  const subtotal = isFinite(subtotalRaw) ? subtotalRaw : 0;
  const totalRaw = toNumber(headerValues.total_amount);
  const total = isFinite(totalRaw) ? totalRaw : subtotal;
  const balanceRaw = toNumber(headerValues.balance_due);
  const balanceDue = isFinite(balanceRaw) ? balanceRaw : total;

  const taxAmount = total - subtotal;
  const taxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
  const amountPaid = total - balanceDue;

  return {
    company_id: companyId,
    invoice_number: String(headerValues.invoice_number).trim(),
    invoice_date: headerValues.invoice_date ? parseLooseDate(String(headerValues.invoice_date)) : null,
    due_date: headerValues.due_date ? parseLooseDate(String(headerValues.due_date)) : null,
    client_id: clientMatch ? clientMatch.id : null,
    project_id: projectMatch ? projectMatch.id : null,
    // Historical/migrated invoices are essentially never genuinely "draft"
    // — "sent" is the safe default both for a blank status and for any
    // unrecognized Zoho status string (see remapValue below; a blank value
    // never reaches remapValue at all, so it's defaulted here instead).
    status: headerValues.status || "sent",
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
  };
}

const invoicesConfig: EntityImportConfig = {
  key: "invoices",
  label: "Invoices",
  table: "client_invoices",
  lineItemTable: "client_invoice_line_items",
  lineItemParentField: "invoice_id",
  groupByField: "invoice_number",
  dedupEnabled: true,

  fields: [
    { key: "invoice_number", label: "Invoice Number", required: true, type: "text",
      aliases: ["invoice number", "invoice no", "invoice #", "inv number", "inv #", "number"] },
    { key: "invoice_date", label: "Invoice Date", required: true, type: "date",
      aliases: ["invoice date", "date"] },
    { key: "due_date", label: "Due Date", required: true, type: "date",
      aliases: ["due date", "payment due date"] },
    { key: "client_id", label: "Client", required: false, type: "lookup", lookupEntityKey: "clients",
      aliases: ["customer name", "customer", "client", "client name", "account name", "company name"] },
    { key: "project_id", label: "Project", required: false, type: "lookup", lookupEntityKey: "projects",
      aliases: ["project name", "project", "job", "job name"] },
    { key: "status", label: "Status", required: false, type: "select",
      options: [
        { value: "draft", label: "Draft" }, { value: "sent", label: "Sent" },
        { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" },
        { value: "overdue", label: "Overdue" }, { value: "cancelled", label: "Cancelled" },
      ],
      aliases: ["invoice status", "status"] },
    { key: "subtotal", label: "Subtotal", required: false, type: "number",
      aliases: ["subtotal", "sub total"] },
    { key: "total_amount", label: "Total", required: false, type: "number",
      aliases: ["total", "invoice total", "grand total"] },
    { key: "balance_due", label: "Balance Due", required: false, type: "number",
      aliases: ["balance", "balance due", "amount due", "outstanding balance"] },
    // ── Line-item fields (isLineItemField: true) — one value per underlying
    // row, collected into GroupedLineItem[] rather than a single value.
    { key: "item_name", label: "Item Name", required: true, type: "text", isLineItemField: true,
      aliases: ["item name", "item", "product name", "product/service"] },
    { key: "item_desc", label: "Item Description", required: false, type: "text", isLineItemField: true,
      aliases: ["item desc", "item description"] },
    { key: "quantity", label: "Quantity", required: true, type: "number", isLineItemField: true,
      aliases: ["quantity", "qty"] },
    { key: "rate", label: "Unit Price", required: true, type: "number", isLineItemField: true,
      aliases: ["item price", "rate", "unit price", "price"] },
    { key: "item_total", label: "Line Total", required: false, type: "number", isLineItemField: true,
      aliases: ["item total", "line total"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("client_invoices")
      .select("id, invoice_number")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(inv => ({
      id: inv.id,
      label: inv.invoice_number,
      keys: [normalizeKey(inv.invoice_number)],
    }));
  },

  matchKeysFor(values) {
    return values.invoice_number ? [normalizeKey(String(values.invoice_number))] : [];
  },

  validateField(field, value) {
    if ((field.key === "invoice_date" || field.key === "due_date") && !parseLooseDate(String(value))) {
      return "Doesn't look like a valid date";
    }
    if (["quantity", "rate", "item_total", "subtotal", "total_amount", "balance_due"].includes(field.key)) {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    return null;
  },

  remapValue(fieldKey, rawValue) {
    if (fieldKey === "invoice_date" || fieldKey === "due_date") return remapDateField(rawValue);
    if (fieldKey !== "status") return undefined;
    const mapped = INVOICE_STATUS_ALIASES[rawValue.trim().toLowerCase()];
    if (mapped) return { value: mapped, usedFallback: false };
    return { value: "sent", usedFallback: true };
  },

  // item_name is the real per-line description; a row that only has Item
  // Desc mapped (no Item Name) still gets a usable description instead of
  // being excluded outright.
  buildFallback(fieldKey, values) {
    if (fieldKey !== "item_name") return null;
    if (values.item_desc && String(values.item_desc).trim()) return String(values.item_desc).trim();
    return null;
  },

  // Never actually invoked by the wizard shell for a grouped entity
  // (runImport branches to buildGroupHeaderPayload/buildLineItemPayload
  // before this would be called) — required by the type, kept genuinely
  // correct rather than a stub.
  buildPayload(values, lookups, companyId) {
    return buildInvoiceHeaderPayload(values, lookups, companyId);
  },

  buildGroupHeaderPayload(headerValues, _lineItems, lookups, companyId) {
    return buildInvoiceHeaderPayload(headerValues, lookups, companyId);
  },

  // tax_amount/tax_rate/amount_paid have no config.fields entry of their
  // own (they're derived, not directly mapped) — the shell's normal
  // update-payload loop would otherwise never touch them on a re-import,
  // leaving stale figures if an invoice's real Total/Balance changed.
  // Only include them when subtotal, total_amount, AND balance_due were
  // ALL provided by this row — otherwise buildInvoiceHeaderPayload's own
  // fallback chain (subtotal defaults to 0, total falls back to subtotal,
  // balance falls back to total) would derive tax figures from partly-
  // fabricated zeros and silently overwrite real existing data with them.
  buildGroupHeaderUpdateExtras(headerValues, headerPayload) {
    const hasRaw = (k: string) => {
      const raw = headerValues[k];
      return raw !== undefined && raw !== null && String(raw).trim() !== "";
    };
    if (hasRaw("subtotal") && hasRaw("total_amount") && hasRaw("balance_due")) {
      return { tax_amount: headerPayload.tax_amount, tax_rate: headerPayload.tax_rate, amount_paid: headerPayload.amount_paid };
    }
    return {};
  },

  buildLineItemPayload(lineItemValues, lineNumber, headerId, _headerValues, companyId) {
    const itemName = lineItemValues.item_name ? String(lineItemValues.item_name).trim() : "";
    const itemDesc = lineItemValues.item_desc ? String(lineItemValues.item_desc).trim() : "";
    const description = itemName || itemDesc || "Item";
    // Only carry item_desc into notes when it's genuinely EXTRA information
    // beyond what's already used as the description — avoids duplicating
    // the same text into both columns when item_name was blank and
    // buildFallback already promoted item_desc into the description slot.
    const notes = (itemName && itemDesc) ? itemDesc : null;

    const quantityRaw = toNumber(lineItemValues.quantity);
    const quantity = isFinite(quantityRaw) ? quantityRaw : 1;
    const rateRaw = toNumber(lineItemValues.rate);
    const rate = isFinite(rateRaw) ? rateRaw : 0;
    const providedAmount = toNumber(lineItemValues.item_total);
    const amount = isFinite(providedAmount) ? providedAmount : quantity * rate;

    return {
      invoice_id: headerId,
      company_id: companyId,
      line_number: lineNumber,
      description,
      quantity,
      unit: "ea",
      rate,
      amount,
      notes,
    };
  },
};

// ─── Vendors (suppliers table) ───────────────────────────────────────────────
//
// Real table per the confirmed live migration (20260310121055_create_
// suppliers.sql), NOT a vestigial/unused table — actively referenced by FK
// from Purchase Orders, Receiving, Cost Item Rates, Procurement Items,
// Supplier Intelligence, and Supplier Price Sync (6 later migrations, all
// carrying supplier_id). No dedicated SuppliersPage.tsx exists — suppliers
// are currently only managed inline from Procurement/Receiving screens via
// src/lib/suppliers.ts's plain, side-effect-free CRUD (createSupplier is a
// plain insert; no triggers, no auto price-sync, no linked ledger entries).
// expenses.vendor (and vendor_name/ocr_vendor elsewhere) stay deliberately
// separate — confirmed real free-text columns with no FK to this table —
// so importing Vendors does not retroactively link any already-imported
// Expense row to a real supplier_id; that would be a separate reconciliation
// task, out of scope here.
//
// company_id/supplier_name NOT NULL; contact_name/email/phone/address/
// payment_terms/notes all optional text; is_active a genuine boolean
// (DEFAULT true) — NOT a text status enum like Clients' status, hence the
// dedicated true/false remap below rather than reusing Clients' pattern
// verbatim. Real DB-level UNIQUE constraint on (company_id, supplier_name)
// — unlike Clients/Projects, dedup here isn't just a UX nicety; a
// duplicate-name insert genuinely throws Postgres 23505 if the app-level
// dedup check (matchKeysFor, same email-then-name priority as Clients)
// somehow misses it — e.g. two rows in the same import batch normalizing to
// the same name, which fetchExisting/matchKeysFor can't catch since it only
// indexes rows that existed in the DB before this run started, not rows
// just created earlier in the same batch. Per Veron's explicit requirement,
// this must degrade gracefully (that one row reported as failed) rather
// than crash the whole import — the wizard shell's per-row try/catch in
// runImport already isolates any DB error to just that row regardless of
// entity, so this was already safe; the accompanying ImportWizard.tsx change
// this round just makes a 23505 specifically produce a legible message
// instead of raw Postgres text, for every entity, not only this one.
const SUPPLIER_ACTIVE_ALIASES: Record<string, string> = {
  active: "true", enabled: "true", yes: "true", y: "true", true: "true", "1": "true",
  inactive: "false", disabled: "false", no: "false", n: "false", false: "false", "0": "false",
};

const suppliersConfig: EntityImportConfig = {
  key: "suppliers",
  label: "Vendors",
  table: "suppliers",
  dedupEnabled: true,

  fields: [
    { key: "supplier_name", label: "Vendor Name", required: true, type: "text",
      aliases: ["name", "vendor name", "supplier name", "company name", "display name", "business name", "organization", "organization name"] },
    { key: "contact_name", label: "Contact Person", required: false, type: "text",
      aliases: ["contact name", "contact person", "attention", "attn", "primary contact", "contact"] },
    { key: "email", label: "Email", required: false, type: "email",
      aliases: ["email", "email address", "e-mail", "email id", "primary email", "work email"] },
    { key: "phone", label: "Phone", required: false, type: "phone",
      aliases: ["phone", "phone number", "mobile", "mobile number", "telephone", "contact number", "work phone", "primary phone", "business phone"] },
    // Same multiSource mechanism already built and shipped for Clients —
    // Zoho's Vendors export uses the identical Billing-prefixed
    // split-column pattern (confirmed by Veron against the real file).
    { key: "address", label: "Address", required: false, type: "text", multiSource: true,
      aliases: [
        "address", "billing address", "street address", "mailing address", "full address",
        "billing street", "billing street2", "billing address2",
        "billing city", "billing state", "billing country", "billing code",
        "billing zip", "billing zip code", "billing postal code",
        "bill to address", "bill to street", "bill to city", "bill to state", "bill to country", "bill to zip",
      ] },
    { key: "payment_terms", label: "Payment Terms", required: false, type: "text",
      aliases: ["payment terms", "terms", "credit terms"] },
    { key: "notes", label: "Notes", required: false, type: "text",
      aliases: ["notes", "description", "remarks", "comments", "memo"] },
    { key: "is_active", label: "Status", required: false, type: "select",
      options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
      aliases: ["status", "vendor status", "active"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, supplier_name, email, contact_name")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(s => ({
      id: s.id,
      label: s.supplier_name,
      // contact_name added as a third candidate key so a Bill's Vendor
      // Name of e.g. "CARL SIMPSON" (the real contact on file for "CARL
      // RENTAL"/"Carl Trucking", confirmed against Veron's real Bill.csv
      // data) resolves too, not just an exact business-name match. Only
      // reachable via a lookup field once SettingsImportPage.tsx indexes
      // by every key here, not just label — see that file's comment.
      // ImportWizard.tsx's processRawRow flags a resolution that lands
      // via a non-primary key as a distinct warning, so a contact-name
      // match is never silently accepted without being visible in
      // Preview.
      keys: [normalizeEmail(s.email), normalizeKey(s.supplier_name), normalizeKey(s.contact_name)].filter(Boolean),
    }));
  },

  matchKeysFor(values) {
    const keys: string[] = [];
    if (values.email) keys.push(normalizeEmail(values.email));
    if (values.supplier_name) keys.push(normalizeKey(values.supplier_name));
    return keys;
  },

  validateField(field, value) {
    if (field.key === "email" && value) {
      const v = String(value).trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Doesn't look like a valid email";
    }
    return null;
  },

  // Vendor exports sometimes carry only a contact name or email with no
  // separate company/display name column — same reasoning, same mechanism
  // as Clients' name fallback.
  buildFallback(fieldKey, values) {
    if (fieldKey !== "supplier_name") return null;
    if (values.contact_name && String(values.contact_name).trim()) return String(values.contact_name).trim();
    if (values.email && String(values.email).trim()) return String(values.email).trim();
    return null;
  },

  // "Active"/similar -> true, "Inactive"/similar -> false, blank or
  // unrecognized -> true (confirmed default — matches the suppliers table's
  // own column default and the same "less-restrictive state for migrated
  // historical data" reasoning used for Invoices' status default).
  remapValue(fieldKey, rawValue) {
    if (fieldKey !== "is_active") return undefined;
    const mapped = SUPPLIER_ACTIVE_ALIASES[rawValue.trim().toLowerCase()];
    if (mapped) return { value: mapped, usedFallback: false };
    return { value: "true", usedFallback: true };
  },

  buildPayload(values, _lookups, companyId) {
    return {
      company_id: companyId,
      supplier_name: String(values.supplier_name).trim(),
      contact_name: values.contact_name ? String(values.contact_name).trim() : null,
      email: values.email ? String(values.email).trim() : null,
      phone: values.phone ? String(values.phone).trim() : null,
      address: values.address ? String(values.address).trim() : null,
      payment_terms: values.payment_terms ? String(values.payment_terms).trim() : null,
      notes: values.notes ? String(values.notes).trim() : null,
      is_active: values.is_active !== "false",
    };
  },
};

// ─── Bills (supplier_invoices table) ─────────────────────────────────────────
//
// Real table per the confirmed live migrations, NOT a generic "bills"
// guess: supplier_invoices (header, in the same finance-ERP migration as
// client_invoices) + supplier_invoice_line_items (child, added by the
// three-way-matching migration). This is genuinely the AP/Bills concept —
// createSupplierInvoice in finance.ts is a plain insert, no hidden side
// effects; performThreeWayMatch/autoApproveMatchedInvoice are separate,
// explicitly-called RPCs never triggered automatically, so leaving
// purchase_order_id/po_matched/three_way_match_status untouched on import
// is safe.
//
// Real, concrete schema differences from client_invoices/client_invoice_
// line_items — verified against the live migrations before writing this,
// not assumed from the Invoices precedent:
//   - status vocabulary is different: pending/approved/partial/paid/
//     disputed (no "draft", no "overdue", no "cancelled" here).
//   - no tax_rate column at all on supplier_invoices (client_invoices has
//     one) — only tax_amount needs deriving, not a rate.
//   - supplier_invoices has a shipping_amount column client_invoices
//     doesn't; nothing in Zoho's Bill.csv maps to it, left at its DB
//     default (0).
//   - supplier_invoice_line_items has NO company_id column at all (client_
//     invoice_line_items does) — including it in the insert payload would
//     fail outright.
//   - supplier_invoice_line_items' CHECK constraints are stricter:
//     quantity must be > 0 (client_invoice_line_items had no such CHECK),
//     unit_cost/total_amount must be >= 0, and unit has NO DB default
//     (client_invoice_line_items defaults it to 'ea') — must be set
//     explicitly in buildLineItemPayload or every insert fails.
//
// Zoho's real Bill Status values (confirmed by Veron against the actual
// 343-row Bill.csv): only "Paid" and "Overdue" ever appear. "Paid" maps
// directly. "Overdue" has no equivalent value in this app's vocabulary at
// all (there's no "overdue" status here) — resolved by computing
// amount_paid the same way buildBillHeaderPayload already needs to
// (total_amount - balance_due): if something has genuinely been paid
// already but not the full amount, "partial" is the more accurate status
// than "approved"; if literally nothing has been paid, "approved" (a
// real, already-incurred bill, just not yet paid — NOT "pending", which
// in this app's own Expenses convention means "awaiting review," not true
// of historical migrated data). A blank or otherwise-unrecognized status
// defaults to "pending" (confirmed) — deliberately a DIFFERENT default
// than the confident "approved" above, since a truly unknown status
// hasn't told us anything concrete, unlike a confirmed-Overdue-with-
// nothing-paid bill.
const BILL_STATUS_UNRECOGNIZED_DEFAULT = "pending";

function buildBillHeaderPayload(headerValues: Record<string, any>, lookups: LookupMaps, companyId: string): Record<string, any> {
  const supplierMatch = resolveLookup(headerValues.supplier_id, lookups.suppliers);
  const projectMatch = resolveLookup(headerValues.project_id, lookups.projects);

  const subtotalRaw = toNumber(headerValues.subtotal);
  const subtotal = isFinite(subtotalRaw) ? subtotalRaw : 0;
  const totalRaw = toNumber(headerValues.total_amount);
  const total = isFinite(totalRaw) ? totalRaw : subtotal;
  const balanceRaw = toNumber(headerValues.balance_due);
  const balanceDue = isFinite(balanceRaw) ? balanceRaw : total;

  const taxAmount = total - subtotal;
  const amountPaid = total - balanceDue;

  return {
    company_id: companyId,
    supplier_id: supplierMatch ? supplierMatch.id : null,
    project_id: projectMatch ? projectMatch.id : null,
    invoice_number: String(headerValues.invoice_number).trim(),
    invoice_date: headerValues.invoice_date ? parseLooseDate(String(headerValues.invoice_date)) : null,
    due_date: headerValues.due_date ? parseLooseDate(String(headerValues.due_date)) : null,
    subtotal,
    tax_amount: taxAmount,
    total_amount: total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status: headerValues.status || BILL_STATUS_UNRECOGNIZED_DEFAULT,
    notes: `Migrated from Zoho Bill.csv import (Bill ${headerValues.invoice_number ? String(headerValues.invoice_number).trim() : "?"}).`,
  };
}

const billsConfig: EntityImportConfig = {
  key: "bills",
  label: "Bills",
  table: "supplier_invoices",
  lineItemTable: "supplier_invoice_line_items",
  lineItemParentField: "supplier_invoice_id",
  groupByField: "invoice_number",
  dedupEnabled: true,
  // supplier_id's own lookupEntityKey ("suppliers") only gets that one map
  // loaded — validateFieldWithLookups on that same field separately needs
  // lookups.workers to check for the subcontractor-routing case. Without
  // this, lookups.workers would never be fetched at all for a Bills run,
  // and the exclusion check would silently never trigger (resolveLookup
  // against an undefined map just returns null) — caught while tracing
  // the lookup-loading path end to end before shipping this.
  additionalLookupSources: ["workers"],

  fields: [
    { key: "invoice_number", label: "Bill Number", required: true, type: "text",
      aliases: ["bill number", "bill no", "bill #", "vendor invoice number", "invoice number"] },
    { key: "invoice_date", label: "Bill Date", required: true, type: "date",
      aliases: ["bill date", "invoice date", "date"] },
    { key: "due_date", label: "Due Date", required: true, type: "date",
      aliases: ["due date", "payment due date"] },
    // type "lookup" (not "text") — buildGroupHeaderPayload needs a real
    // resolved supplier_id for the FK column, unlike Field Payments'
    // worker_name below which stores the raw text directly.
    { key: "supplier_id", label: "Vendor", required: false, type: "lookup", lookupEntityKey: "suppliers",
      aliases: ["vendor name", "vendor", "supplier", "supplier name"] },
    { key: "project_id", label: "Project", required: false, type: "lookup", lookupEntityKey: "projects",
      aliases: ["project name", "project", "job", "job name"] },
    { key: "status", label: "Status", required: false, type: "select",
      options: [
        { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" },
        { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" },
        { value: "disputed", label: "Disputed" },
      ],
      aliases: ["bill status", "status"] },
    { key: "subtotal", label: "Subtotal", required: false, type: "number",
      aliases: ["subtotal", "sub total"] },
    { key: "total_amount", label: "Total", required: false, type: "number",
      aliases: ["total", "bill total", "grand total"] },
    { key: "balance_due", label: "Balance Due", required: false, type: "number",
      aliases: ["balance", "balance due", "amount due", "outstanding balance"] },
    // Line-item fields — quantity/rate both required (a line item missing
    // either is excluded, not defaulted, per the DB's own > 0 / >= 0
    // constraints below); item_total optional, falls back to
    // quantity * rate when Zoho doesn't provide it.
    { key: "item_name", label: "Item Name", required: true, type: "text", isLineItemField: true,
      aliases: ["item name", "item", "description", "service", "product/service"] },
    { key: "quantity", label: "Quantity", required: true, type: "number", isLineItemField: true,
      aliases: ["quantity", "qty"] },
    { key: "rate", label: "Rate", required: true, type: "number", isLineItemField: true,
      aliases: ["rate", "unit price", "item price", "price", "unit cost"] },
    { key: "item_total", label: "Item Total", required: false, type: "number", isLineItemField: true,
      aliases: ["item total", "line total"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("supplier_invoices")
      .select("id, invoice_number")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(inv => ({ id: inv.id, label: inv.invoice_number, keys: [normalizeKey(inv.invoice_number)] }));
  },

  matchKeysFor(values) {
    return values.invoice_number ? [normalizeKey(String(values.invoice_number))] : [];
  },

  validateField(field, value) {
    if ((field.key === "invoice_date" || field.key === "due_date") && !parseLooseDate(String(value))) {
      return "Doesn't look like a valid date";
    }
    if (field.key === "quantity") {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
      if (n <= 0) return "Quantity must be greater than 0"; // matches the DB's own CHECK (quantity > 0)
      return null;
    }
    if (field.key === "rate" || field.key === "item_total") {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
      if (n < 0) return "Can't be negative"; // matches the DB's own CHECK (>= 0)
      return null;
    }
    if (["subtotal", "total_amount", "balance_due"].includes(field.key)) {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    return null;
  },

  // Bills vs Field Payments both read the same uploaded Bill.csv — a
  // vendor that positively resolves to a known Worker means this is a
  // subcontractor labor payment (Zoho had no subcontractor concept, so
  // these were entered as vendors), not a real Bill. Unresolved (matches
  // neither a Supplier nor a Worker) still imports as a Bill — same
  // non-blocking-lookup treatment every other plain lookup field gets.
  validateFieldWithLookups(field, value, lookups) {
    if (field.key !== "supplier_id") return null;
    const workerMatch = resolveLookup(String(value), lookups.workers);
    if (workerMatch) {
      return `"${value}" matches field worker "${workerMatch.label}" — this looks like a subcontractor labor payment, not a real vendor bill. Import via Field Payments instead.`;
    }
    return null;
  },

  remapValue(fieldKey, rawValue, values) {
    if (fieldKey === "invoice_date" || fieldKey === "due_date") return remapDateField(rawValue);
    if (fieldKey !== "status") return undefined;
    const raw = rawValue.trim().toLowerCase();
    if (raw === "paid") return { value: "paid", usedFallback: false };
    if (raw === "overdue") {
      const total = toNumber(values?.total_amount);
      const balance = toNumber(values?.balance_due);
      const safeTotal = isFinite(total) ? total : 0;
      const safeBalance = isFinite(balance) ? balance : safeTotal;
      const amountPaid = safeTotal - safeBalance;
      // Recognized either way — this isn't a fallback for an unrecognized
      // value, it's a computed decision between two real, deliberately
      // different mappings for the same Zoho status. usedFallback stays
      // false for both branches; Preview already shows the resulting
      // status directly alongside the Total/Balance columns, so the
      // underlying arithmetic is visible without an extra warning message
      // that would otherwise have to (incorrectly) claim "not recognized."
      if (amountPaid > 0 && amountPaid < safeTotal) return { value: "partial", usedFallback: false };
      return { value: "approved", usedFallback: false };
    }
    return { value: BILL_STATUS_UNRECOGNIZED_DEFAULT, usedFallback: true };
  },

  // No buildFallback — a bill line item's item_name has no natural
  // fallback source in Zoho's Bill.csv, so a genuinely blank one is
  // correctly excluded by the plain required-field check.

  buildPayload(values, lookups, companyId) {
    return buildBillHeaderPayload(values, lookups, companyId);
  },

  buildGroupHeaderPayload(headerValues, _lineItems, lookups, companyId) {
    return buildBillHeaderPayload(headerValues, lookups, companyId);
  },

  // tax_amount is purely derived (no config.fields entry of its own) —
  // same reasoning as Invoices' buildGroupHeaderUpdateExtras. No tax_rate
  // here at all (supplier_invoices has no such column), so this is
  // simpler than the Invoices version.
  buildGroupHeaderUpdateExtras(headerValues, headerPayload) {
    const hasRaw = (k: string) => {
      const raw = headerValues[k];
      return raw !== undefined && raw !== null && String(raw).trim() !== "";
    };
    if (hasRaw("subtotal") && hasRaw("total_amount") && hasRaw("balance_due")) {
      return { tax_amount: headerPayload.tax_amount, amount_paid: headerPayload.amount_paid };
    }
    return {};
  },

  buildLineItemPayload(lineItemValues, lineNumber, headerId) {
    const itemName = lineItemValues.item_name ? String(lineItemValues.item_name).trim() : "Item";
    const quantity = toNumber(lineItemValues.quantity);
    const unitCost = toNumber(lineItemValues.rate);
    const providedTotal = toNumber(lineItemValues.item_total);
    const totalAmount = isFinite(providedTotal) ? providedTotal : quantity * unitCost;
    return {
      // No company_id — supplier_invoice_line_items has no such column
      // (confirmed against the live migration; unlike client_invoice_line_items).
      supplier_invoice_id: headerId,
      line_no: lineNumber,
      item_name: itemName,
      unit: "ea", // no DB default on this table's unit column — must be set explicitly
      quantity,
      unit_cost: unitCost,
      total_amount: totalAmount,
    };
  },
};

// ─── Field Payments (field_payments table) ───────────────────────────────────
//
// Real table per the confirmed live migration — genuinely surprising
// finding worth being explicit about: field_payments has NO foreign key
// to workers at all (confirmed across the entire migration history, not
// assumed). worker_name is plain `text NOT NULL`; worker_id_number is a
// text field for an ID *document* number, not a worker_id FK. So unlike
// every lookup field elsewhere in this wizard, worker_name below is type
// "text", not "lookup" — buildPayload stores the raw name directly, there
// is no id to resolve. lookupEntityKey is still set (see below) purely so
// validateFieldWithLookups can consult the workers lookup map for
// classification — SettingsImportPage.tsx loads a lookup by
// lookupEntityKey presence alone now, not also gated on type === "lookup".
//
// No header/line-item structure at all (the only child table is
// field_payment_signatures — signatures, unrelated to line items) — so
// unlike Bills, this entity is NOT grouped. Each of Bill.csv's 343
// underlying rows becomes its own field_payments record directly (one
// line item = one payment), which is exactly the shape every ordinary
// (non-grouped) entity already handles with zero new mechanism.
//
// payment_method (NOT NULL, no DB default) hardcoded to "cash" for every
// imported record — confirmed, matches the live FieldPaymentForm.tsx's
// own default for a brand-new payment. status hardcoded to "completed" —
// confirmed, these are historical records of payments that already
// happened, not new drafts awaiting a live signature capture. Neither is
// exposed as a mappable field since both are fixed for this whole import.
//
// No dedup (dedupEnabled: false) — same reasoning as Expenses: multiple
// legitimate payments to the same worker on the same day for different
// work are completely normal, not duplicates.
const fieldPaymentsConfig: EntityImportConfig = {
  key: "field_payments",
  label: "Field Payments",
  table: "field_payments",
  dedupEnabled: false,

  fields: [
    { key: "worker_name", label: "Vendor Name", required: true, type: "text", lookupEntityKey: "workers",
      aliases: ["vendor name", "vendor", "worker", "worker name", "subcontractor", "subcontractor name"] },
    { key: "work_type", label: "Work Done", required: true, type: "text",
      aliases: ["item name", "work type", "work description", "description", "task", "service"] },
    // Bill Date, not Due Date — a closer real-world proxy for when the
    // work actually happened; Due Date is a payment deadline, often well
    // after the fact.
    { key: "work_date", label: "Work Date", required: true, type: "date",
      aliases: ["bill date", "work date", "date"] },
    { key: "total_amount", label: "Amount", required: true, type: "number",
      aliases: ["item total", "amount", "total"] },
    { key: "project_id", label: "Project", required: false, type: "lookup", lookupEntityKey: "projects",
      aliases: ["project name", "project", "job", "job name"] },
    // Not persisted directly (field_payments has no quantity/rate/bill-
    // number columns) — quantity/rate exist only to let buildPayload fall
    // back to quantity * rate on the rare row missing Item Total;
    // bill_number exists only to build a traceable note.
    { key: "quantity", label: "Quantity", required: false, type: "number",
      aliases: ["quantity", "qty"] },
    { key: "rate", label: "Rate", required: false, type: "number",
      aliases: ["rate", "unit price", "item price", "price"] },
    { key: "bill_number", label: "Bill Number", required: false, type: "text",
      aliases: ["bill number", "bill no", "bill #"] },
  ],

  async fetchExisting() { return []; }, // dedup disabled — never called, present only to satisfy the type
  matchKeysFor() { return []; },        // same — dedup disabled, never called

  validateField(field, value) {
    if (field.key === "work_date" && !parseLooseDate(String(value))) return "Doesn't look like a valid date";
    if (["total_amount", "quantity", "rate"].includes(field.key)) {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    return null;
  },

  // Inverse of Bills' rule: only a POSITIVE Worker match belongs here.
  // Resolves to a Supplier, or to nothing at all, means this isn't
  // confirmed as a subcontractor labor payment — excluded rather than
  // guessed, with the reason visible in Preview (it may still belong in
  // Bills, imported via that config's own separate pass instead).
  validateFieldWithLookups(field, value, lookups) {
    if (field.key !== "worker_name") return null;
    const workerMatch = resolveLookup(String(value), lookups.workers);
    if (!workerMatch) {
      return `"${value}" doesn't match a known field worker — not importing as a Field Payment (may belong in Bills instead).`;
    }
    return null;
  },

  remapValue(fieldKey, rawValue) {
    if (fieldKey !== "work_date") return undefined;
    return remapDateField(rawValue);
  },

  buildFallback(fieldKey) {
    // Matches FieldPaymentForm.tsx's own live fallback convention for a
    // payment with no specific task description.
    if (fieldKey === "work_type") return "Work Payment";
    return null;
  },

  buildPayload(values, lookups, companyId) {
    const projectMatch = resolveLookup(values.project_id, lookups.projects);
    const quantity = toNumber(values.quantity);
    const rate = toNumber(values.rate);
    const providedTotal = toNumber(values.total_amount);
    const totalAmount = isFinite(providedTotal) ? providedTotal
      : (isFinite(quantity) && isFinite(rate) ? quantity * rate : 0);
    const billRef = values.bill_number ? String(values.bill_number).trim() : null;
    return {
      company_id: companyId,
      project_id: projectMatch ? projectMatch.id : null,
      worker_name: String(values.worker_name).trim(),
      work_type: String(values.work_type).trim(),
      work_date: values.work_date ? parseLooseDate(String(values.work_date)) : null,
      total_amount: totalAmount,
      payment_method: "cash",
      status: "completed",
      // Persisted as its own column (field_payments.bill_number) so a
      // future enrichment/matching pass against a payments file can join
      // on it directly — not just embedded in notes text the way the
      // first 313 records were, which needed a one-off backfill migration
      // to recover reliably. Still also kept in notes below for a human
      // glancing at one record, at no extra cost.
      bill_number: billRef,
      notes: billRef ? `Migrated from Zoho Bill.csv (Bill ${billRef}).` : "Migrated from Zoho Bill.csv import.",
    };
  },
};

// ─── Supplier Payments (supplier_payments table) ─────────────────────────────
//
// Phase 1 of the Vendor_Payment.csv split (Phase 2 — enriching the 313
// existing field_payments records with this same file's worker-routed
// rows — is a separate, deferred design, not built here). Real table
// confirmed via the live migration (same file that created
// supplier_invoices): supplier_payments — a genuine transaction-level
// ledger already existing in the schema, not something new to add.
// company_id/payment_number/payment_date/amount NOT NULL; supplier_id/
// invoice_id nullable FKs; payment_method nullable text CHECK (check/ach/
// wire/credit_card/cash/other — Zoho's "Mode" needs remapping onto this);
// check_number/reference_number/notes all nullable text. No CHECK on
// amount's sign (unlike Bills' line-item quantity/unit_cost) — not
// artificially constrained beyond what the DB actually enforces.
//
// Real side-effect finding from investigating this before building
// anything: the app's own createSupplierPayment() (finance.ts) does two
// things beyond a plain insert — auto-creates a cash_transactions row,
// and RECALCULATES the linked invoice's amount_paid/balance_due/status by
// summing every supplier_payments row for that invoice, overwriting the
// header. Confirmed this is application-level only, not a database
// trigger (searched every migration referencing supplier_payments; the
// only trigger-bearing tables nearby are the general-ledger internals,
// unrelated). Import here uses a plain, direct .insert() — same as every
// entity this session — which deliberately does NOT go through
// createSupplierPayment() and so does NOT touch cash_transactions or
// recompute the invoice header. This is intentional, not an oversight:
// the 9 real Bills' amount_paid/balance_due/status are already correct,
// sourced directly from Zoho's own Total/Balance at Bills-import time,
// and must not be silently overwritten by a second, different
// computation derived from these payment rows.
//
// Same vendor-routing rule as Bills (not the inverted Field Payments
// rule): exclude a row only when its vendor positively resolves to a
// known Worker — matches Field Payments/Field Payments-enrichment
// territory, not a real vendor payment. Unresolved (matches neither a
// Supplier nor a Worker) still imports, same non-blocking-lookup
// treatment as every other plain lookup field.
//
// invoice_id resolves "Bill Number" against billsConfig's own
// fetchExisting — no new lookup mechanism needed at all. Every full
// EntityImportConfig already satisfies LookupSource for free (see the
// LOOKUP_SOURCES comment below), so registering bills there costs
// nothing and is exactly "look up against another entity's real,
// already-imported rows" — the generic capability this needed, already
// built when Clients/Projects/Suppliers were.
//
// Zoho's "Bill Amount" column is deliberately not mapped anywhere —
// redundant with supplier_invoices.total_amount, already captured by
// Bills. "Bank Reference Number" and "Payment Status" have no dedicated
// columns on supplier_payments (only one generic reference_number slot,
// no status column at all) — folded into notes rather than silently
// dropped, alongside a migration tag. Not used as an import-exclusion
// filter (e.g. skipping a "Failed" status) — no confirmed real values
// for this column yet, so nothing is assumed; flagged for review instead
// of guessed at.
const PAYMENT_MODE_ALIASES: Record<string, string> = {
  cash: "cash",
  check: "check", cheque: "check", chq: "check",
  ach: "ach", "direct deposit": "ach", "ach transfer": "ach",
  wire: "wire", "wire transfer": "wire", "bank transfer": "wire", bank: "wire",
  "credit card": "credit_card", creditcard: "credit_card", card: "credit_card",
};

const supplierPaymentsConfig: EntityImportConfig = {
  key: "supplier_payments",
  label: "Vendor Payments",
  table: "supplier_payments",
  dedupEnabled: true,
  // supplier_id's own lookupEntityKey ("suppliers") only gets that map
  // loaded — validateFieldWithLookups on that same field separately needs
  // lookups.workers to check for the worker-routing exclusion, same gap
  // (and same fix) as billsConfig.
  additionalLookupSources: ["workers"],

  fields: [
    { key: "payment_number", label: "Payment Number", required: true, type: "text",
      aliases: ["payment number", "payment no", "payment #"] },
    { key: "payment_date", label: "Date", required: true, type: "date",
      aliases: ["date", "payment date"] },
    { key: "supplier_id", label: "Vendor", required: false, type: "lookup", lookupEntityKey: "suppliers",
      aliases: ["vendor name", "vendor", "supplier", "supplier name"] },
    { key: "invoice_id", label: "Bill Number", required: false, type: "lookup", lookupEntityKey: "bills",
      aliases: ["bill number", "bill no", "bill #", "invoice number"] },
    { key: "amount", label: "Amount", required: true, type: "number",
      aliases: ["amount", "payment amount"] },
    { key: "payment_method", label: "Mode", required: false, type: "select",
      options: [
        { value: "cash", label: "Cash" }, { value: "check", label: "Check" },
        { value: "ach", label: "ACH" }, { value: "wire", label: "Wire" },
        { value: "credit_card", label: "Credit Card" }, { value: "other", label: "Other" },
      ],
      aliases: ["mode", "payment method", "payment mode"] },
    { key: "reference_number", label: "Reference Number", required: false, type: "text",
      aliases: ["reference number", "reference no", "ref number", "ref #"] },
    // Not persisted as their own columns (supplier_payments has no
    // dedicated home for either) — folded into notes by buildPayload.
    { key: "bank_reference_number", label: "Bank Reference Number", required: false, type: "text",
      aliases: ["bank reference number", "bank ref", "bank reference"] },
    { key: "payment_status", label: "Payment Status", required: false, type: "text",
      aliases: ["payment status", "status"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("supplier_payments")
      .select("id, payment_number")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(p => ({ id: p.id, label: p.payment_number, keys: [normalizeKey(p.payment_number)] }));
  },

  matchKeysFor(values) {
    return values.payment_number ? [normalizeKey(String(values.payment_number))] : [];
  },

  validateField(field, value) {
    if (field.key === "payment_date" && !parseLooseDate(String(value))) return "Doesn't look like a valid date";
    if (field.key === "amount") {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    return null;
  },

  // Mirrors Bills' rule exactly (not Field Payments' inverted rule): a
  // vendor that positively resolves to a known Worker means this is a
  // worker payment, not a real vendor payment — that's Field Payments/
  // Phase 2 enrichment territory, not this entity.
  validateFieldWithLookups(field, value, lookups) {
    if (field.key !== "supplier_id") return null;
    const workerMatch = resolveLookup(String(value), lookups.workers);
    if (workerMatch) {
      return `"${value}" matches field worker "${workerMatch.label}" — this looks like a worker payment, not a real vendor payment. Not importing here (a separate Field Payments enrichment pass will handle this data instead).`;
    }
    return null;
  },

  remapValue(fieldKey, rawValue) {
    if (fieldKey === "payment_date") return remapDateField(rawValue);
    if (fieldKey !== "payment_method") return undefined;
    const mapped = PAYMENT_MODE_ALIASES[rawValue.trim().toLowerCase()];
    if (mapped) return { value: mapped, usedFallback: false };
    return { value: "other", usedFallback: true };
  },

  buildPayload(values, lookups, companyId) {
    const supplierMatch = resolveLookup(values.supplier_id, lookups.suppliers);
    const invoiceMatch = resolveLookup(values.invoice_id, lookups.bills);
    const bankRef = values.bank_reference_number ? String(values.bank_reference_number).trim() : "";
    const paymentStatus = values.payment_status ? String(values.payment_status).trim() : "";
    const noteParts = [
      bankRef ? `Bank Ref: ${bankRef}` : "",
      paymentStatus ? `Zoho Payment Status: ${paymentStatus}` : "",
      "Migrated from Zoho Vendor_Payment.csv import.",
    ].filter(Boolean);
    return {
      company_id: companyId,
      supplier_id: supplierMatch ? supplierMatch.id : null,
      invoice_id: invoiceMatch ? invoiceMatch.id : null,
      payment_number: String(values.payment_number).trim(),
      payment_date: values.payment_date ? parseLooseDate(String(values.payment_date)) : null,
      amount: (() => { const n = toNumber(values.amount); return isFinite(n) ? n : 0; })(),
      payment_method: values.payment_method || "other",
      reference_number: values.reference_number ? String(values.reference_number).trim() : null,
      notes: noteParts.join(" | "),
    };
  },
};

// ─── Customer Payments (client_payments table) ───────────────────────────────
//
// Architecturally identical to Supplier Payments (mirrors it field-for-
// field) — real table confirmed via the live migration
// (20260315125158_create_finance_erp_system.sql), unchanged since
// original creation (no later ALTER TABLE touches it): payment_method
// CHECK-constrained to the SAME vocabulary as supplier_payments
// (check/ach/wire/credit_card/cash/other), so PAYMENT_MODE_ALIASES is
// reused directly rather than duplicated. No status or deposit_to column
// exists at all — same gap as Supplier Payments' bank_reference_number/
// payment_status, same treatment: folded into notes, not dropped.
const clientPaymentsConfig: EntityImportConfig = {
  key: "client_payments",
  label: "Customer Payments",
  table: "client_payments",
  dedupEnabled: true,

  fields: [
    { key: "payment_number", label: "Payment Number", required: true, type: "text",
      aliases: ["payment number", "payment no", "payment #"] },
    { key: "payment_date", label: "Date", required: true, type: "date",
      aliases: ["date", "payment date"] },
    { key: "client_id", label: "Customer Name", required: false, type: "lookup", lookupEntityKey: "clients",
      aliases: ["customer name", "customer", "client name", "client"] },
    { key: "invoice_id", label: "Invoice Number", required: false, type: "lookup", lookupEntityKey: "invoices",
      aliases: ["invoice number", "invoice no", "invoice #"] },
    { key: "amount", label: "Amount", required: true, type: "number",
      aliases: ["amount", "payment amount"] },
    { key: "payment_method", label: "Mode", required: false, type: "select",
      options: [
        { value: "cash", label: "Cash" }, { value: "check", label: "Check" },
        { value: "ach", label: "ACH" }, { value: "wire", label: "Wire" },
        { value: "credit_card", label: "Credit Card" }, { value: "other", label: "Other" },
      ],
      aliases: ["mode", "payment method", "payment mode"] },
    { key: "reference_number", label: "Reference Number", required: false, type: "text",
      aliases: ["reference number", "reference no", "ref number", "ref #"] },
    // Neither has a dedicated column on client_payments — folded into
    // notes by buildPayload, same treatment as supplier_payments' bank_
    // reference_number/payment_status. Still genuinely mappable even
    // though Veron's real file's Deposit To sample is always "Undeposited
    // Funds" — a future file might vary.
    { key: "deposit_to", label: "Deposit To", required: false, type: "text",
      aliases: ["deposit to", "deposit account"] },
    { key: "payment_status", label: "Payment Status", required: false, type: "text",
      aliases: ["payment status", "status"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("client_payments")
      .select("id, payment_number")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(p => ({ id: p.id, label: p.payment_number, keys: [normalizeKey(p.payment_number)] }));
  },

  matchKeysFor(values) {
    return values.payment_number ? [normalizeKey(String(values.payment_number))] : [];
  },

  validateField(field, value) {
    if (field.key === "payment_date" && !parseLooseDate(String(value))) return "Doesn't look like a valid date";
    if (field.key === "amount") {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
    }
    return null;
  },

  remapValue(fieldKey, rawValue) {
    if (fieldKey === "payment_date") return remapDateField(rawValue);
    if (fieldKey !== "payment_method") return undefined;
    // Reuses PAYMENT_MODE_ALIASES (defined above, right before
    // supplierPaymentsConfig) — client_payments.payment_method has the
    // exact same CHECK vocabulary as supplier_payments, confirmed against
    // the live schema, not assumed.
    const mapped = PAYMENT_MODE_ALIASES[rawValue.trim().toLowerCase()];
    if (mapped) return { value: mapped, usedFallback: false };
    return { value: "other", usedFallback: true };
  },

  buildPayload(values, lookups, companyId) {
    const clientMatch = resolveLookup(values.client_id, lookups.clients);
    const invoiceMatch = resolveLookup(values.invoice_id, lookups.invoices);
    const depositTo = values.deposit_to ? String(values.deposit_to).trim() : "";
    const paymentStatus = values.payment_status ? String(values.payment_status).trim() : "";
    const noteParts = [
      depositTo ? `Deposit To: ${depositTo}` : "",
      paymentStatus ? `Zoho Payment Status: ${paymentStatus}` : "",
      "Migrated from Zoho Customer_Payment.csv import.",
    ].filter(Boolean);
    return {
      company_id: companyId,
      client_id: clientMatch ? clientMatch.id : null,
      invoice_id: invoiceMatch ? invoiceMatch.id : null,
      payment_number: String(values.payment_number).trim(),
      payment_date: values.payment_date ? parseLooseDate(String(values.payment_date)) : null,
      amount: (() => { const n = toNumber(values.amount); return isFinite(n) ? n : 0; })(),
      payment_method: values.payment_method || "other",
      reference_number: values.reference_number ? String(values.reference_number).trim() : null,
      notes: noteParts.join(" | "),
    };
  },
};

// ─── Transfer Fund (posts directly to gl_transactions/gl_entries) ────────────
//
// No dedicated business table exists for this entity — confirmed via a
// full migration search, no fund_transfers table anywhere. Each row
// posts directly to the general ledger: buildPayload creates the
// gl_transactions HEADER only (status: "draft" — never posted directly,
// same two-step draft-then-post discipline as postingEngine.ts's
// createGLTransaction, needed so the balance-update-on-posting trigger
// added earlier this session actually fires); resolveSelfReferentialLinks
// (Pass 2 — built for Chart of Accounts' parent-link resolution, reused
// here for something else entirely, but its (outcomes, previewRows,
// companyId) signature is exactly what's needed: every header's real id,
// plus each row's already-resolved debit/credit account ids) inserts the
// two gl_entries lines per transaction and flips status to "posted" once
// both are in.
//
// Routing is purely mechanical per Veron's confirmation: Transaction Type
// literally "Money Paid to User" -> debit is the owner's equity account;
// anything else -> ordinary internal transfer. Both cases resolve To
// Account and From Account by the SAME exact-name lookup against
// chart_of_accounts — confirmed the raw "To Account" column literally
// contains "Enron Williams"/"Veron Williams" text for owner-draw rows, so
// no special-cased account lookup is needed; only which side ends up
// debit vs credit changes.
//
// Both From Account and To Account MUST block (not soft-skip) on an
// unresolved name — gl_entries.account_id is NOT NULL REFERENCES
// chart_of_accounts(id), so an unresolved lookup can't just leave the
// row's other fields valid the way a normal non-blocking lookup does;
// the row genuinely cannot be inserted at all without both resolving.
// validateFieldWithLookups (blocking regardless of field.required, same
// mechanism Bills/Supplier Payments use for their worker-routing
// exclusion) enforces this.
//
// dedupEnabled: false — same reasoning as Expenses/Field Payments: no
// natural unique identifier in the source file, and two genuinely
// separate real transfers between the same two accounts for the same
// amount on the same day are entirely plausible, not duplicates.
const fundTransferConfig: EntityImportConfig = {
  key: "fund_transfer",
  label: "Transfer Fund",
  table: "gl_transactions",
  dedupEnabled: false,

  fields: [
    { key: "transaction_type", label: "Transaction Type", required: true, type: "text",
      aliases: ["transaction type", "type"] },
    { key: "date", label: "Date", required: true, type: "date",
      aliases: ["date", "transaction date"] },
    { key: "from_account", label: "From Account", required: true, type: "lookup", lookupEntityKey: "chart_of_accounts",
      aliases: ["from account", "from", "source account"] },
    { key: "to_account", label: "To Account", required: true, type: "lookup", lookupEntityKey: "chart_of_accounts",
      aliases: ["to account", "to", "destination account"] },
    { key: "amount", label: "Amount", required: true, type: "number",
      aliases: ["amount", "transfer amount"] },
    { key: "description", label: "Description", required: false, type: "text",
      aliases: ["description", "notes", "memo"] },
  ],

  async fetchExisting() { return []; }, // dedup disabled — never called, present only to satisfy the type
  matchKeysFor() { return []; },        // same

  validateField(field, value) {
    if (field.key === "date" && !parseLooseDate(String(value))) return "Doesn't look like a valid date";
    if (field.key === "amount") {
      const n = toNumber(value);
      if (!isFinite(n) || isNaN(n)) return "Doesn't look like a valid number";
      if (n <= 0) return "Amount must be greater than 0"; // matches gl_transactions' own CHECK(total_amount > 0)
    }
    return null;
  },

  // Both From Account and To Account must resolve — a null account_id on
  // either side would violate gl_entries' NOT NULL FK outright, so this
  // has to block, not soft-skip like every other entity's plain lookup.
  validateFieldWithLookups(field, value, lookups) {
    if (field.key !== "from_account" && field.key !== "to_account") return null;
    const match = resolveLookup(String(value), lookups.chart_of_accounts);
    if (!match) {
      return `"${value}" doesn't match any account in the Chart of Accounts by exact name — cannot post a transfer without a real account on both sides.`;
    }
    return null;
  },

  remapValue(fieldKey, rawValue) {
    if (fieldKey === "date") return remapDateField(rawValue);
    return undefined;
  },

  buildPayload(values, lookups, companyId) {
    const fromMatch = resolveLookup(values.from_account, lookups.chart_of_accounts);
    const toMatch = resolveLookup(values.to_account, lookups.chart_of_accounts);
    const isOwnerDraw = String(values.transaction_type || "").trim().toLowerCase() === "money paid to user";
    const description = values.description
      ? String(values.description).trim()
      : `${isOwnerDraw ? "Owner draw" : "Fund transfer"}: ${values.from_account} -> ${values.to_account}`;
    const amount = (() => { const n = toNumber(values.amount); return isFinite(n) ? n : 0; })();

    // Stashed onto values as side effects — values is the same object
    // reference that lives in previewRows, so resolveSelfReferentialLinks
    // (Pass 2, below) can read these back directly without re-resolving
    // the lookups a second time. Same technique Chart of Accounts uses to
    // pass subtype from remapValue through to buildPayload.
    values._debitAccountId = toMatch ? toMatch.id : null;
    values._creditAccountId = fromMatch ? fromMatch.id : null;
    values._amount = amount;

    return {
      company_id: companyId,
      // Random suffix, not just Date.now() — the wizard processes rows in
      // parallel chunks (see runImport in ImportWizard.tsx), so two rows'
      // buildPayload calls landing in the same millisecond is a real
      // possibility, not a theoretical one; a pure Date.now() scheme is
      // exactly the collision risk already flagged as a bug in
      // postingEngine.ts's postTransactionWithData earlier this session.
      transaction_number: `FT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      transaction_date: values.date ? parseLooseDate(String(values.date)) : null,
      source_type: "fund_transfer",
      description,
      total_amount: amount,
      status: "draft", // Pass 2 below flips this to "posted" once entries exist
      notes: "Migrated from Zoho Transfer_Fund.csv import.",
    };
  },

  // Pass 2: insert the two gl_entries lines per transaction (debit/credit
  // account ids were already resolved and stashed onto values during the
  // main per-row pass above), then flip status to "posted" — a genuine
  // draft -> posted transition, which the balance-update-on-posting
  // trigger added earlier this session fires on correctly.
  async resolveSelfReferentialLinks(outcomes, previewRows, companyId) {
    const outcomeByRowIndex = new Map(outcomes.map(o => [o.rowIndex, o.id]));

    for (const row of previewRows) {
      const transactionId = outcomeByRowIndex.get(row.rowIndex);
      if (!transactionId) continue; // row was excluded/failed — nothing to post

      const debitAccountId = row.values._debitAccountId;
      const creditAccountId = row.values._creditAccountId;
      const amount = row.values._amount;
      if (!debitAccountId || !creditAccountId || !amount) {
        console.error(`Transfer row ${row.rowIndex}: missing resolved account/amount, skipping entries insert for transaction ${transactionId}`);
        continue;
      }

      const { error: entriesErr } = await supabase.from("gl_entries").insert([
        { transaction_id: transactionId, company_id: companyId, account_id: debitAccountId, debit: amount, credit: 0, line_number: 1, entry_type: "regular" },
        { transaction_id: transactionId, company_id: companyId, account_id: creditAccountId, debit: 0, credit: amount, line_number: 2, entry_type: "regular" },
      ]);
      if (entriesErr) {
        // The header stays "draft" — never posted without real entries to
        // back it, same "logged, not thrown, one bad row doesn't abort
        // the batch" discipline as Chart of Accounts' own Pass 2.
        console.error(`Failed to insert entries for transfer transaction ${transactionId}:`, entriesErr);
        continue;
      }

      const { error: postErr } = await supabase.from("gl_transactions")
        .update({ status: "posted", posted_at: new Date().toISOString() })
        .eq("id", transactionId);
      if (postErr) {
        console.error(`Failed to post transfer transaction ${transactionId}:`, postErr);
      }
    }
  },
};

// Lookup-only target for Expenses' category field — not a directly-
// importable entity (Veron never runs a separate "import categories" pass),
// just something another entity's field can resolve/create against.
const expenseCategoriesLookup: LookupSource = {
  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id, name")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(c => ({ id: c.id, label: c.name, keys: [normalizeKey(c.name)] }));
  },
};

// Lookup-only target for Bills' vendor-type classification and Field
// Payments' worker_name field — not a directly-importable entity via THIS
// wizard round (workers were populated by a one-off SQL data migration,
// not this wizard); label built from first_name + last_name since workers
// stores them as separate NOT NULL columns rather than one combined name
// field the way clients/suppliers do.
const workersLookup: LookupSource = {
  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("workers")
      .select("id, first_name, last_name")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(w => {
      const fullName = `${w.first_name || ""} ${w.last_name || ""}`.trim();
      return { id: w.id, label: fullName || w.first_name, keys: [normalizeKey(fullName)].filter(Boolean) };
    });
  },
};

// ─── Chart of Accounts (chart_of_accounts table) ─────────────────────────────
//
// Real table confirmed via the live migration (20260329190000_create_
// chart_of_accounts.sql) — company/code-unique (UNIQUE(company_id, code)),
// code/name/type all NOT NULL, type CHECK-constrained to exactly asset/
// liability/equity/revenue/expense, parent_id a nullable self-referencing
// FK (with its own DB-level circular-reference guard trigger — a real
// safety net this import deliberately doesn't try to duplicate), level
// nullable but CHECK(level >= 1 AND level <= 10). A seed function for a
// default construction chart of accounts exists in a later migration
// (seed_default_chart_of_accounts) but is never called anywhere in the
// app or any other migration — confirmed via a full-repo search, not
// assumed — so this table is empty for every real company today; Veron's
// 90-account file is the first real data it will ever receive.
//
// Parent Account is the genuinely new piece: a lookup against OTHER ROWS
// IN THE SAME UPLOAD, not pre-existing DB data resolvable the normal way
// via LookupMaps (which are built once, before Preview even runs, from
// whatever already existed in the DB at that point). Two-pass design:
// buildPayload always sends parent_id: null (Pass 1 — every account gets
// created/updated normally, by the shell's completely unmodified loop);
// resolveSelfReferentialLinks (Pass 2, a new shell hook — see types.ts)
// runs once every row has a real id, does one fresh live query (which by
// then includes everything this batch just created), and resolves both
// parent_id AND level in the same pass, since level is just a function of
// how many parent hops an account has once parent_id is known. This also
// naturally handles a parent from an EARLIER import, not only ones in the
// same batch — the resolution query is against live data, not just this
// run's own rows. A child whose referenced parent doesn't resolve (not in
// this upload, and not already in the DB) simply stays a root-level
// account rather than failing outright — the DB's own circular-reference
// trigger is the real backstop, not something duplicated here.
//
// type deliberately does NOT follow this wizard's usual remap-with-safe-
// default pattern (Bills' status -> "pending", Suppliers' is_active ->
// true on anything unrecognized). Getting an account's type wrong isn't a
// soft workflow default — it's the literal categorization the P&L/Balance
// Sheet math groups on, so an unrecognized value is a BLOCKING error
// (validateField rejects it, and since type is required that excludes
// just that one account) rather than a silent guess that could
// miscategorize real money.
const ACCOUNT_TYPE_ALIASES: Record<string, string> = {
  asset: "asset", assets: "asset",
  liability: "liability", liabilities: "liability",
  equity: "equity",
  revenue: "revenue", income: "revenue", revenues: "revenue",
  expense: "expense", expenses: "expense",

  // Confirmed against every one of the 14 distinct Account Type values in
  // Veron's real 90-row Chart_of_Accounts.csv — Zoho's own vocabulary
  // (QuickBooks-style categories) never matches this app's 5-value CHECK
  // verbatim, same reason every other remap in this wizard exists. This
  // list covers 100% of his real data; anything not in it still hits the
  // deliberate strict-reject path below, unchanged — this only widens
  // which real-world spellings are recognized, not how strict an
  // unrecognized one is treated.
  bank: "asset",
  cash: "asset",
  "fixed asset": "asset",
  "other current asset": "asset",
  stock: "asset",
  "accounts receivable": "asset",

  "other current liability": "liability",
  "other liability": "liability",
  "accounts payable": "liability",

  "cost of goods sold": "expense",
  "other expense": "expense",
};

// Populates chart_of_accounts.subtype from the SAME raw Zoho Account Type
// text used above for `type` — subtype has no column of its own in Veron's
// file, it's purely derived. Confirmed against the real subtype CHECK
// constraint in supabase/migrations/20260329190000_create_chart_of_accounts.sql
// before mapping anything, not assumed:
//   asset:     current_asset, fixed_asset, bank, accounts_receivable,
//              inventory, prepaid_expense
//   liability: current_liability, long_term_liability, accounts_payable,
//              accrued_expense, deferred_revenue
//   equity:    owner_equity, retained_earnings, common_stock,
//              additional_paid_in_capital
//   revenue:   service_revenue, product_revenue, other_revenue
//   expense:   operating_expense, cost_of_goods_sold, selling_expense,
//              administrative_expense, payroll_expense, other_expense
//
// Mapping rule, applied consistently: use the most SPECIFIC subtype when
// Zoho's value clearly indicates one (Bank -> bank, Fixed Asset ->
// fixed_asset, Accounts Receivable/Payable -> their exact counterparts,
// Cost Of Goods Sold -> cost_of_goods_sold, Other Expense -> other_expense).
// When the Zoho value gives no specific indication, fall back to that
// type's own GENERIC/umbrella subtype ONLY IF the vocabulary actually has
// one (current_asset, current_liability, other_revenue, other_expense are
// genuine "unspecified" buckets, not a stretch — e.g. Cash IS truly a
// current_asset even though there's no dedicated "cash" subtype). Where
// NEITHER a specific nor a generic subtype honestly applies, leave it
// unmapped so subtype stays null rather than forcing a bad fit:
//   - Equity (bare): no generic equity subtype exists at all in the real
//     vocabulary (owner_equity/retained_earnings/common_stock/
//     additional_paid_in_capital are all specific) — a real structural
//     gap, not a judgment call.
// Two mappings below rest on Zoho's own naming convention rather than a
// literal string match, flagged for review:
//   - Stock -> inventory (Zoho's "Stock" account type conventionally means
//     goods held on hand, i.e. inventory)
//   - Other Liability -> long_term_liability (Zoho convention: "Other
//     Liability" without a "Current" qualifier denotes the non-current/
//     long-term bucket, distinct from "Other Current Liability")
const ACCOUNT_SUBTYPE_ALIASES: Record<string, string> = {
  bank: "bank",
  cash: "current_asset",
  "fixed asset": "fixed_asset",
  "other current asset": "current_asset",
  stock: "inventory",
  "accounts receivable": "accounts_receivable",

  "other current liability": "current_liability",
  "other liability": "long_term_liability",
  "accounts payable": "accounts_payable",

  "cost of goods sold": "cost_of_goods_sold",
  "other expense": "other_expense",
  expense: "other_expense",

  income: "other_revenue",
  // "equity" deliberately absent — see header comment.
};

const chartOfAccountsConfig: EntityImportConfig = {
  key: "chart_of_accounts",
  label: "Chart of Accounts",
  table: "chart_of_accounts",
  dedupEnabled: true,

  fields: [
    { key: "name", label: "Account Name", required: true, type: "text",
      aliases: ["account name", "name"] },
    // required: false — this must stay mappable (a future customer's
    // file might have real codes), but must NOT block Map Columns just
    // because a file has no code column at all, which is Veron's actual
    // real data: confirmed every one of his 90 rows has this column
    // present but blank (Zoho didn't require account codes). Never
    // actually reaches buildPayload blank, though — postProcessPreviewRows
    // below unconditionally assigns one to every row still missing it,
    // before Preview is ever shown, so the DB's NOT NULL is always
    // satisfied regardless of what the source file provided.
    { key: "code", label: "Account Code", required: false, type: "text",
      aliases: ["account code", "code", "account number"] },
    { key: "type", label: "Account Type", required: true, type: "select",
      options: [
        { value: "asset", label: "Asset" }, { value: "liability", label: "Liability" },
        { value: "equity", label: "Equity" }, { value: "revenue", label: "Revenue" },
        { value: "expense", label: "Expense" },
      ],
      aliases: ["account type", "type"] },
    { key: "description", label: "Description", required: false, type: "text",
      aliases: ["description"] },
    // Plain text, not type "lookup" — never resolved by buildPayload at
    // all. resolveSelfReferentialLinks (Pass 2) is the only thing that
    // ever reads this field's value.
    { key: "parent_account", label: "Parent Account", required: false, type: "text",
      aliases: ["parent account", "parent", "parent account name"] },
    { key: "is_active", label: "Status", required: false, type: "select",
      options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
      aliases: ["account status", "status"] },
  ],

  async fetchExisting(companyId: string): Promise<ExistingRecord[]> {
    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(a => ({ id: a.id, label: a.name, keys: [normalizeKey(a.code), normalizeKey(a.name)].filter(Boolean) }));
  },

  // name added as a fallback key, not just code — genuinely necessary,
  // not just extra safety: dedup match/action gets decided during the
  // normal per-row build, which runs BEFORE postProcessPreviewRows ever
  // assigns a code. On Veron's real file (every row blank) the code-based
  // key alone would never fire at all, meaning a second upload of the
  // exact same 90 accounts would be silently treated as 90 new ones
  // instead of 90 duplicates — matching Clients' own email-then-name
  // priority-ordered pattern, just code-then-name here.
  matchKeysFor(values) {
    const keys: string[] = [];
    if (values.code) keys.push(normalizeKey(String(values.code)));
    if (values.name) keys.push(normalizeKey(String(values.name)));
    return keys;
  },

  validateField(field, value) {
    if (field.key === "type") {
      const valid = new Set(["asset", "liability", "equity", "revenue", "expense"]);
      if (!valid.has(String(value).toLowerCase())) {
        return `Doesn't match a recognized account type (asset/liability/equity/revenue/expense) — got "${value}"`;
      }
    }
    return null;
  },

  remapValue(fieldKey, rawValue, values) {
    if (fieldKey === "type") {
      const raw = rawValue.trim().toLowerCase();
      const mapped = ACCOUNT_TYPE_ALIASES[raw];
      // Side effect: also derive subtype from this SAME raw Account Type
      // text, right here, before it's lost. This is the only point in the
      // pipeline that ever sees the raw Zoho value — by the time
      // buildPayload runs, values.type has already been overwritten with
      // the canonical value below, so several distinct raw values (Bank,
      // Cash, Fixed Asset, ...) would all be indistinguishable "asset" by
      // then. `values` is passed by reference, so mutating it here reaches
      // buildPayload without needing a new field or a new wizard hook —
      // subtype isn't a user-mappable column at all, purely derived.
      // See ACCOUNT_SUBTYPE_ALIASES above for the full mapping + reasoning.
      values.subtype = ACCOUNT_SUBTYPE_ALIASES[raw] ?? null;
      // Deliberately no fallback default here — see the header comment
      // above. Leaving the raw text in place on a miss means
      // validateField (which runs right after) correctly rejects it as
      // invalid, rather than this hook silently picking something.
      return mapped ? { value: mapped, usedFallback: false } : undefined;
    }
    if (fieldKey !== "is_active") return undefined;
    const raw = rawValue.trim().toLowerCase();
    if (["active", "enabled", "yes", "y", "true", "1"].includes(raw)) return { value: "true", usedFallback: false };
    if (["inactive", "disabled", "no", "n", "false", "0"].includes(raw)) return { value: "false", usedFallback: false };
    // Blank/unrecognized -> true, same "less-restrictive default for
    // historical migrated data" reasoning as Suppliers' is_active.
    return { value: "true", usedFallback: true };
  },

  buildPayload(values, _lookups, companyId) {
    return {
      company_id: companyId,
      code: String(values.code).trim(),
      name: String(values.name).trim(),
      type: values.type,
      // Stashed onto values as a side effect inside remapValue's "type"
      // branch (see ACCOUNT_SUBTYPE_ALIASES) — null whenever Veron's
      // Account Type value had no clean subtype equivalent.
      subtype: values.subtype ?? null,
      description: values.description ? String(values.description).trim() : null,
      is_active: values.is_active !== "false",
      // Always null at create/update time — resolveSelfReferentialLinks
      // (Pass 2) is the only thing that ever sets these two columns.
      parent_id: null,
      level: null,
    };
  },

  // Auto-generates Account Code for any row still missing one, once every
  // row's type is already fully resolved (this runs after the entire
  // per-row pipeline, so values.type is guaranteed to be the canonical
  // lowercase value, never the raw Zoho text). Standard accounting
  // convention, confirmed with Veron rather than picked arbitrarily:
  // 1000s = asset, 2000s = liability, 3000s = equity, 4000s = revenue,
  // 5000s+ = expense, incrementing by 10 within each type to leave room
  // for manual insertions later. Runs at Preview time specifically (not
  // buildPayload, which runs later at import time) so the code actually
  // shown in Preview is the real one that gets written, not a surprise
  // discovered only after commit — same "Preview must show the truth"
  // principle that governed remapValue from the very first entity.
  async postProcessPreviewRows(rows, _lookups, companyId) {
    const TYPE_BASE: Record<string, number> = {
      asset: 1000, liability: 2000, equity: 3000, revenue: 4000, expense: 5000,
    };

    // Seed each type's starting counter past whatever's already really in
    // the DB, not blindly from the type's base every run — otherwise a
    // SECOND import batch of genuinely new accounts (not a re-upload of
    // the same file — dedup above already handles that case by matching
    // on name) would try to hand out 1000, 1010, 1020... again and collide
    // with codes a prior batch already claimed.
    const { data: existing, error } = await supabase
      .from("chart_of_accounts")
      .select("code, type")
      .eq("company_id", companyId);
    if (error) throw error;

    const nextCode: Record<string, number> = { ...TYPE_BASE };
    for (const acc of existing || []) {
      const base = TYPE_BASE[acc.type];
      if (base === undefined) continue;
      const n = Number(acc.code);
      if (!isFinite(n) || isNaN(n)) continue;
      // Only a code that's genuinely within this type's own numeric
      // range counts as evidence for where its next free slot is — an
      // existing account with a custom/non-numeric code, or one that
      // happens to fall in a different type's range, shouldn't shift
      // where auto-generated codes for THIS type start.
      const ceiling = base + 999;
      if (n >= base && n <= ceiling && n + 10 > nextCode[acc.type]) {
        nextCode[acc.type] = n + 10;
      }
    }

    // Also account for codes THIS batch's own source file already
    // explicitly provided (not blank) — an auto-generated code must
    // never collide with one a sibling row in the same upload supplied.
    const explicitCodes = new Set<string>();
    for (const row of rows) {
      if (row.values.code) explicitCodes.add(normalizeKey(String(row.values.code)));
    }

    for (const row of rows) {
      if (row.errors.length > 0) continue; // already excluded — nothing to assign
      // A row matched to an existing account (skip or update) already has
      // a real code on that existing record — never overwrite it with a
      // freshly auto-generated one just because this row's own source
      // value happened to be blank.
      if (row.action !== "create") continue;
      if (row.values.code && String(row.values.code).trim() !== "") continue;

      const type = row.values.type; // already remapped to canonical lowercase by this point
      const base = TYPE_BASE[type];
      if (base === undefined) continue; // shouldn't happen — an unrecognized type already excluded this row above

      let candidate = nextCode[type];
      while (explicitCodes.has(normalizeKey(String(candidate)))) candidate += 10;

      row.values.code = String(candidate);
      row.fallbackFields = [...row.fallbackFields, "code"]; // same "derived, not from the file" flagging Preview already gives any other buildFallback-sourced value
      explicitCodes.add(normalizeKey(String(candidate)));
      nextCode[type] = candidate + 10;
    }

    return rows;
  },

  async resolveSelfReferentialLinks(outcomes, previewRows, companyId) {
    const { data: liveAccounts, error } = await supabase
      .from("chart_of_accounts")
      .select("id, code, name, parent_id")
      .eq("company_id", companyId);
    if (error) throw error;

    const nameToId = new Map<string, string>();
    const codeToId = new Map<string, string>();
    const parentOf = new Map<string, string | null>();
    for (const a of liveAccounts || []) {
      const nameKey = normalizeKey(a.name);
      if (nameKey && !nameToId.has(nameKey)) nameToId.set(nameKey, a.id);
      const codeKey = normalizeKey(a.code);
      if (codeKey) codeToId.set(codeKey, a.id);
      parentOf.set(a.id, a.parent_id ?? null);
    }

    const outcomeByRowIndex = new Map(outcomes.map(o => [o.rowIndex, o.id]));

    // Resolve every batch row's own id and its parent_id (if any) into
    // our in-memory view first, so level computation below reflects the
    // intended final state even before each row's own UPDATE round-trip
    // completes.
    const resolvedParent = new Map<string, string | null>(); // ownId -> resolved parent_id, or null
    for (const row of previewRows) {
      const ownId = outcomeByRowIndex.get(row.rowIndex)
        ?? (row.values.code ? codeToId.get(normalizeKey(String(row.values.code))) : undefined);
      if (!ownId) continue; // row was excluded/failed — nothing to link

      const rawParent = row.values.parent_account;
      let parentId: string | null = null;
      if (rawParent && String(rawParent).trim() !== "") {
        const candidate = nameToId.get(normalizeKey(String(rawParent)));
        if (candidate && candidate !== ownId) parentId = candidate;
      }
      resolvedParent.set(ownId, parentId);
      parentOf.set(ownId, parentId);
    }

    // Root accounts (no parent) are level 1, not 0 — the DB's own
    // CHECK(level >= 1 AND level <= 10) requires it. A cycle guard is
    // included defensively even though the DB's own trigger already
    // prevents a real circular reference from ever being written.
    function computeLevel(id: string): number {
      let level = 1;
      let current = parentOf.get(id) ?? null;
      const seen = new Set<string>([id]);
      while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        level++;
        if (level >= 10) break;
        current = parentOf.get(current) ?? null;
      }
      return Math.min(level, 10);
    }

    for (const [ownId, parentId] of resolvedParent) {
      const payload: Record<string, any> = { level: computeLevel(ownId) };
      if (parentId) payload.parent_id = parentId;
      const { error: updErr } = await supabase.from("chart_of_accounts").update(payload).eq("id", ownId);
      if (updErr) {
        // The account itself was already created successfully — a
        // failed parent/level link is a lesser, recoverable problem, not
        // grounds to undo real data. Logged, not thrown, so one bad link
        // doesn't abort linking for every other account in the batch.
        console.error(`Failed to link parent/level for chart_of_accounts ${ownId}:`, updErr);
      }
    }
  },
};

// ─── Registry ───────────────────────────────────────────────────────────────
// The wizard's entity picker walks ENTITY_CONFIGS, so sequencing (Clients
// -> Projects -> Expenses) is enforced just by array order.
export const ENTITY_CONFIGS: EntityImportConfig[] = [
  clientsConfig,
  projectsConfig,
  expensesConfig,
  invoicesConfig,
  suppliersConfig,
  billsConfig,
  fieldPaymentsConfig,
  supplierPaymentsConfig,
  chartOfAccountsConfig,
  clientPaymentsConfig,
  fundTransferConfig,
];

export function getEntityConfig(key: string): EntityImportConfig | undefined {
  return ENTITY_CONFIGS.find(c => c.key === key);
}

// Every fetchable lookup/create source, keyed by lookupEntityKey. Every
// full EntityImportConfig already satisfies LookupSource for free (its own
// fetchExisting) — registering clients/projects here costs nothing — plus
// lookup-only targets that aren't themselves importable, like
// expense_categories and workers (workers were populated by a one-off SQL
// data migration this session, not this wizard — see the workersLookup
// comment above). SettingsImportPage.tsx uses this (not ENTITY_CONFIGS)
// to build the live lookup maps a wizard's fields declare.
//
// bills: billsConfig is Supplier Payments' "look up against another
// entity's real, already-imported rows" need (resolving a payment's Bill
// Number against supplier_invoices.invoice_number) — no new mechanism
// required for this at all, just this one registration, same as every
// other full-config-as-lookup-source entry here.
//
// invoices: invoicesConfig is Customer Payments' equivalent (resolving a
// payment's Invoice Number against client_invoices.invoice_number) — same
// pattern, same zero-new-mechanism reuse.
//
// chart_of_accounts: chartOfAccountsConfig is Transfer Fund's From
// Account/To Account resolution target — same reuse again.
export const LOOKUP_SOURCES: Record<string, LookupSource> = {
  clients: clientsConfig,
  projects: projectsConfig,
  expense_categories: expenseCategoriesLookup,
  suppliers: suppliersConfig,
  workers: workersLookup,
  bills: billsConfig,
  invoices: invoicesConfig,
  chart_of_accounts: chartOfAccountsConfig,
};
