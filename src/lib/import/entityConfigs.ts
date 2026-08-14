// src/lib/import/entityConfigs.ts
//
// One EntityImportConfig per importable entity type. Clients is fully wired
// up first (per the phased plan — check in before replicating to Projects
// and Expenses). Registering a future entity is: write a config object,
// add it to ENTITY_CONFIGS below. The wizard shell never changes.
import { supabase } from "../supabase";
import type { EntityImportConfig, ExistingRecord } from "./types";
import { normalizeEmail, normalizeKey } from "./matching";

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

// ─── Registry ───────────────────────────────────────────────────────────────
// Projects and Expenses join this list in the next round, in that order —
// the wizard's entity picker walks this array, so sequencing is enforced
// just by array order.
export const ENTITY_CONFIGS: EntityImportConfig[] = [
  clientsConfig,
];

export function getEntityConfig(key: string): EntityImportConfig | undefined {
  return ENTITY_CONFIGS.find(c => c.key === key);
}
