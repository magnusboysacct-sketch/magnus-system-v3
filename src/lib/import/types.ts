// src/lib/import/types.ts
//
// Generic, config-driven Import Wizard types. One EntityImportConfig per
// importable entity type (Clients now; Projects/Expenses follow in later
// rounds). Adding a future entity — Workers, Suppliers, whatever a future
// customer's migration needs — means writing one new config object and
// registering it in entityConfigs.ts; the wizard shell (ImportWizard.tsx)
// never needs to change.

export type ImportFieldType = "text" | "email" | "phone" | "number" | "date" | "select" | "lookup";

export interface ImportFieldConfig {
  key: string;                 // DB column name this field maps to
  label: string;                // shown in the mapping UI
  required: boolean;
  type: ImportFieldType;
  // Lowercased/normalized header strings that auto-suggest this field during
  // column mapping — real-world exports rarely use the exact DB column name
  // (Zoho's "Company Name" vs. our "name", for instance).
  aliases?: string[];
  options?: { value: string; label: string }[]; // for type "select"
  // For type "lookup": which prior entity's lookup map (see LookupMaps
  // below) this field resolves against, e.g. a Projects "Client" column
  // resolving to a client_id via the Clients pass's lookup map. Unused by
  // Clients (the first entity in the chain, nothing to resolve against).
  lookupEntityKey?: string;
  // Allows more than one uploaded column to be mapped to this field at
  // once — e.g. a single "address" target built from several separate
  // Billing Address / City / State / Country columns, which is how most
  // accounting/CRM exports actually split address data (confirmed against
  // a real Zoho Contacts export: 6 separate Billing-prefixed columns, no
  // single "Address" column at all). When true, the Map Columns step lets
  // multiple headers point at this field; their values are concatenated —
  // in the order the columns appear in the uploaded file, skipping any
  // blank parts — into one final string, joined by `joinWith`. Ordinary
  // (non-multiSource) fields still only accept one source column, same as
  // before.
  multiSource?: boolean;
  joinWith?: string; // only used when multiSource is true; defaults to ", "
}

export interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[]; // raw string cell values, keyed by original header
}

// header -> fieldKey it's mapped to, or null if the column is skipped
export type ColumnMapping = Record<string, string | null>;

export type DedupAction = "create" | "skip" | "update";

export interface ExistingRecord {
  id: string;
  label: string;   // human-readable label for display, e.g. the client's name
  keys: string[];   // normalized candidate match keys for this existing row
}

export interface PreviewRow {
  rowIndex: number;             // index into ParsedFile.rows, kept for traceability into results
  values: Record<string, any>;  // mapped + type-coerced field values (fallback-derived values already applied)
  errors: string[];             // validation errors on REQUIRED fields; non-empty blocks import for this row
  warnings: string[];           // format issues on OPTIONAL fields — reported but non-blocking; that field's value is dropped, not the whole row
  fallbackFields: string[];     // required fields whose value was derived via config.buildFallback rather than the source file — flagged, not hidden
  match: ExistingRecord | null; // existing DB row this one appears to duplicate, if any
  action: DedupAction;          // what happens on import — user-adjustable per row when a match exists
}

export type RowOutcome =
  | { status: "created"; rowIndex: number; id: string }
  | { status: "updated"; rowIndex: number; id: string }
  | { status: "skipped"; rowIndex: number; reason: string }
  | { status: "failed"; rowIndex: number; error: string };

// Built up as each entity pass completes — e.g. after Clients import, a
// lookup map of normalized-name/email -> new client id lets the Projects
// pass resolve a "Client" column without the user re-entering anything.
// Seeded from existing DB rows too, so referencing a client that predates
// this wizard entirely also resolves correctly.
export type LookupMaps = Record<string, Map<string, { id: string; label: string }>>;

export interface EntityImportConfig {
  key: string;      // e.g. "clients" — also the LookupMaps key other entities reference
  label: string;     // "Clients"
  table: string;      // Supabase table name
  fields: ImportFieldConfig[];
  dedupEnabled: boolean; // false for Expenses per the approved plan — no dedup, always "create"

  // Fetches existing company rows and computes each one's normalized match
  // keys, for both dedup (this entity) and lookup resolution (entities
  // later in the chain that reference this one).
  fetchExisting: (companyId: string) => Promise<ExistingRecord[]>;

  // Candidate normalized keys for a freshly-mapped row, checked against the
  // ExistingRecord.keys fetched above, in priority order (e.g. email before
  // name for Clients — the stronger signal wins).
  matchKeysFor: (values: Record<string, any>) => string[];

  // Per-field validation beyond plain "required" (format checks etc.).
  // Return null when valid.
  validateField?: (field: ImportFieldConfig, value: any) => string | null;

  // General robustness hook for a required field that's commonly blank in
  // real-world exports across accounting/CRM systems (not specific to any
  // one export) — e.g. expenses.description is NOT NULL in this app's
  // schema, but "Description" columns are routinely empty in practice.
  // Called only when the mapped value for `fieldKey` is blank; return a
  // reasonable value derived from the row's OTHER mapped values (e.g.
  // category + vendor), or null/undefined to leave it blank — in which case
  // the normal "required" validation error still applies, same as if this
  // hook didn't exist. Whenever a fallback is used, the wizard flags it on
  // the row rather than silently treating it as if it came from the file.
  buildFallback?: (fieldKey: string, values: Record<string, any>) => string | null | undefined;

  // Builds the final DB payload from a preview row's mapped values, resolving
  // any lookup fields against `lookups` and applying entity-specific
  // defaults (e.g. status defaults) the wizard shell has no business knowing.
  // companyId is always set explicitly on the payload here rather than
  // relied on any DB-side default (e.g. clients.company_id defaults to
  // current_company_id() per the live schema check, but that default isn't
  // confirmed to exist on every table) — matches how every other insert path
  // in this app already works (fetch company_id once, pass it explicitly).
  buildPayload: (values: Record<string, any>, lookups: LookupMaps, companyId: string) => Record<string, any>;
}
