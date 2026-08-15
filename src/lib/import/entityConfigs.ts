// src/lib/import/entityConfigs.ts
//
// One EntityImportConfig per importable entity type. Clients is fully wired
// up first (per the phased plan — check in before replicating to Projects
// and Expenses). Registering a future entity is: write a config object,
// add it to ENTITY_CONFIGS below. The wizard shell never changes.
import { supabase } from "../supabase";
import type { EntityImportConfig, ExistingRecord, LookupSource } from "./types";
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
};
