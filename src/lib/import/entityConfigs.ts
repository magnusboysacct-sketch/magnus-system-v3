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
      .select("id, supplier_name, email")
      .eq("company_id", companyId);
    if (error) throw error;
    return (data || []).map(s => ({
      id: s.id,
      label: s.supplier_name,
      keys: [normalizeEmail(s.email), normalizeKey(s.supplier_name)].filter(Boolean),
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

// ─── Registry ───────────────────────────────────────────────────────────────
// The wizard's entity picker walks ENTITY_CONFIGS, so sequencing (Clients
// -> Projects -> Expenses) is enforced just by array order.
export const ENTITY_CONFIGS: EntityImportConfig[] = [
  clientsConfig,
  projectsConfig,
  expensesConfig,
  invoicesConfig,
  suppliersConfig,
];

export function getEntityConfig(key: string): EntityImportConfig | undefined {
  return ENTITY_CONFIGS.find(c => c.key === key);
}

// Every fetchable lookup/create source, keyed by lookupEntityKey. Every
// full EntityImportConfig already satisfies LookupSource for free (its own
// fetchExisting) — registering clients/projects here costs nothing — plus
// lookup-only targets that aren't themselves importable, like
// expense_categories. SettingsImportPage.tsx uses this (not ENTITY_CONFIGS)
// to build the live lookup maps a wizard's fields declare.
export const LOOKUP_SOURCES: Record<string, LookupSource> = {
  clients: clientsConfig,
  projects: projectsConfig,
  expense_categories: expenseCategoriesLookup,
  suppliers: suppliersConfig,
};
