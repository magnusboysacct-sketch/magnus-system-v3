// src/lib/import/entityConfigs.ts
//
// One EntityImportConfig per importable entity type. Clients is fully wired
// up first (per the phased plan — check in before replicating to Projects
// and Expenses). Registering a future entity is: write a config object,
// add it to ENTITY_CONFIGS below. The wizard shell never changes.
import { supabase } from "../supabase";
import type { EntityImportConfig, ExistingRecord } from "./types";
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
function parseLooseDate(raw: string): string | null {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
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

// ─── Registry ───────────────────────────────────────────────────────────────
// Expenses joins this list in the next round — the wizard's entity picker
// walks this array, so sequencing is enforced just by array order.
export const ENTITY_CONFIGS: EntityImportConfig[] = [
  clientsConfig,
  projectsConfig,
];

export function getEntityConfig(key: string): EntityImportConfig | undefined {
  return ENTITY_CONFIGS.find(c => c.key === key);
}
