// src/components/import/ImportWizard.tsx
//
// Generic, config-driven Import Wizard shell. Walks Upload -> Map Columns ->
// Preview/Dedup -> Confirm & Import -> Result for whichever EntityImportConfig
// it's given — this file has zero Clients/Projects/Expenses-specific logic;
// all of that lives in the config (see src/lib/import/entityConfigs.ts).
// Adding a future entity type never touches this file.
import React, { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { parseImportFile } from "../../lib/import/parseFile";
import { headerMatchesAlias, normalizeForMatch, normalizeKey, resolveLookup } from "../../lib/import/matching";
import type {
  EntityImportConfig, ParsedFile, ColumnMapping, PreviewRow,
  ExistingRecord, RowOutcome, DedupAction, LookupMaps, FieldIssue, GroupedLineItem,
} from "../../lib/import/types";
import { Card, CardHeader, Btn, Badge, Select, Alert, Table, Th, Tr, Td, Progress, Spinner, cn } from "../ui";
import { Upload, ArrowLeft, ArrowRight, Check, AlertTriangle, RefreshCw } from "lucide-react";

type Step = "upload" | "map" | "preview" | "importing" | "result";

// ─── Shared per-row processing ───────────────────────────────────────────────
//
// Column-mapping + required/fallback/remap/lookup/validate logic for exactly
// ONE underlying parsed row. Used directly by the ordinary (one-row-per-
// record) Preview path below, and — per row, before grouping — by a grouped
// entity's (e.g. Invoices) Preview path too, so the two paths can never
// silently drift apart. Errors/warnings come back tagged with the field key
// they belong to (FieldIssue), not as plain strings, specifically so a
// grouped entity can tell a header-field problem (blocks the whole group)
// apart from a line-item-field problem (excludes just that one line item)
// without parsing formatted message strings back apart. The ordinary path
// just maps `.message` off each issue to reproduce the exact flat-string
// behavior it had before this was extracted.
function processRawRow(
  row: Record<string, string>,
  headers: string[],
  mapping: ColumnMapping,
  config: EntityImportConfig,
  lookups: LookupMaps
): { values: Record<string, any>; fieldErrors: FieldIssue[]; fieldWarnings: FieldIssue[]; fallbackFields: string[] } {
  const values: Record<string, any> = {};
  // Group mapped headers by target field, preserving the uploaded file's own
  // column order — matters for multiSource fields (e.g. address), whose
  // parts get concatenated in that order.
  const headersByField = new Map<string, string[]>();
  for (const header of headers) {
    const fieldKey = mapping[header];
    if (!fieldKey) continue;
    if (!headersByField.has(fieldKey)) headersByField.set(fieldKey, []);
    headersByField.get(fieldKey)!.push(header);
  }
  for (const field of config.fields) {
    const fieldHeaders = headersByField.get(field.key);
    if (!fieldHeaders || fieldHeaders.length === 0) continue;
    if (field.multiSource && fieldHeaders.length > 1) {
      const joinWith = field.joinWith ?? ", ";
      const parts = fieldHeaders.map(h => (row[h] ?? "").trim()).filter(Boolean);
      values[field.key] = parts.join(joinWith);
    } else {
      values[field.key] = row[fieldHeaders[0]] ?? "";
    }
  }

  // Format errors on a REQUIRED field block the row — there's no usable
  // fallback. A format error on an OPTIONAL field must not block the whole
  // row from importing — instead, drop just that field's value back to
  // unmapped so buildPayload's own default takes over, and note it as a
  // (non-blocking) warning surfaced in the preview table.
  const fieldErrors: FieldIssue[] = [];
  const fieldWarnings: FieldIssue[] = [];
  const fallbackFields: string[] = [];
  for (const field of config.fields) {
    let v = values[field.key];
    const isBlank = v === undefined || v === null || String(v).trim() === "";
    if (field.required && isBlank) {
      // Required-but-commonly-blank fields (e.g. expenses.description) get
      // one chance at a config-supplied fallback derived from the row's
      // other mapped values before this row is excluded outright.
      const fallback = config.buildFallback?.(field.key, values);
      if (fallback && String(fallback).trim() !== "") {
        values[field.key] = fallback;
        v = fallback;
        fallbackFields.push(field.key);
      } else {
        fieldErrors.push({ fieldKey: field.key, message: `${field.label} is required` });
        continue;
      }
    }
    const stillBlank = v === undefined || v === null || String(v).trim() === "";
    if (!stillBlank && config.remapValue) {
      // e.g. Zoho's Projects status "Active" -> this app's exact
      // CHECK-constraint value "active". Runs before validateField so a
      // remapped value (already canonical) isn't then flagged as invalid by
      // a validator written against the canonical set.
      const rawText = String(v);
      const remapped = config.remapValue(field.key, rawText, values);
      if (remapped) {
        values[field.key] = remapped.value;
        v = remapped.value;
        if (remapped.usedFallback) fieldWarnings.push({ fieldKey: field.key, message: `${field.label}: "${rawText}" not recognized — defaulted to "${remapped.value}"` });
      }
    }
    if (!stillBlank && field.type === "lookup" && field.lookupEntityKey) {
      // Doesn't block the row either way — flagged here so it's visible
      // before committing, not discovered only after the fact.
      // createIfMissing fields (e.g. Expenses' category) will actually
      // create a new record during the real import step (never here —
      // Preview must stay side-effect-free); plain lookup fields (e.g.
      // Projects' client) just import with that field left null.
      const resolved = resolveLookup(String(v), lookups[field.lookupEntityKey]);
      if (!resolved) {
        fieldWarnings.push({ fieldKey: field.key, message: field.createIfMissing
          ? `${field.label}: "${v}" doesn't exist yet — will be created on import`
          : `${field.label}: "${v}" didn't match any existing ${field.lookupEntityKey} — will import without a link` });
      } else if (normalizeKey(String(v)) !== normalizeKey(resolved.label)) {
        // Resolved, but not via the record's own primary name (e.g. a
        // Bill's Vendor Name of "CARL SIMPSON" resolving against a
        // supplier's contact_name rather than its supplier_name) — never
        // silently accept this without flagging it, since it's a real
        // possibility for a different value to have matched than the one
        // actually typed.
        fieldWarnings.push({ fieldKey: field.key, message: `${field.label}: "${v}" matched via a secondary field on "${resolved.label}" — verify this is correct` });
      }
    }
    if (!stillBlank && config.validateFieldWithLookups) {
      // Always blocking when non-null, regardless of field.required — see
      // the EntityImportConfig.validateFieldWithLookups comment in
      // types.ts for why this can't just reuse validateField's
      // required-vs-optional gating below.
      const lookupErr = config.validateFieldWithLookups(field, v, lookups);
      if (lookupErr) fieldErrors.push({ fieldKey: field.key, message: lookupErr });
    }
    if (!stillBlank && config.validateField) {
      const err = config.validateField(field, v);
      if (err) {
        if (field.required) fieldErrors.push({ fieldKey: field.key, message: `${field.label}: ${err}` });
        else { fieldWarnings.push({ fieldKey: field.key, message: `${field.label}: ${err} — left blank` }); delete values[field.key]; }
      }
    }
  }
  return { values, fieldErrors, fieldWarnings, fallbackFields };
}

// Groups a parsed file's underlying rows into one PreviewRow per logical
// record for a grouped entity (e.g. Invoices — one row per line item in the
// source export, invoice-level fields repeated identically across every row
// belonging to the same invoice). Runs processRawRow per underlying row
// first — identical field-level handling to the ordinary path — then groups
// by the normalized value of config.groupByField.
function buildGroupedPreviewRows(
  parsedFile: ParsedFile,
  mapping: ColumnMapping,
  config: EntityImportConfig,
  lookups: LookupMaps,
  existingIndex: Map<string, ExistingRecord>
): PreviewRow[] {
  const groupField = config.groupByField!;
  const isLineItemKey = (key: string) => config.fields.find(f => f.key === key)?.isLineItemField === true;

  const processed = parsedFile.rows.map((row, rowIndex) => ({
    rowIndex,
    ...processRawRow(row, parsedFile.headers, mapping, config, lookups),
  }));

  // A row whose group key comes out blank (e.g. no Invoice Number
  // mapped/present on that row) still needs to surface as an error, not
  // vanish silently — it becomes its own single-row group instead of being
  // merged into (or lost from) any other group.
  const groupOrder: string[] = [];
  const groupsByKey = new Map<string, typeof processed>();
  for (const r of processed) {
    const raw = r.values[groupField];
    const key = raw ? normalizeKey(String(raw)) : `__ungrouped_${r.rowIndex}`;
    if (!groupsByKey.has(key)) { groupsByKey.set(key, []); groupOrder.push(key); }
    groupsByKey.get(key)!.push(r);
  }

  return groupOrder.map(key => {
    const groupRows = groupsByKey.get(key)!;
    const first = groupRows[0];

    // Header values: the group's first row's non-line-item field values.
    // Header fields repeat identically across every row in a well-formed
    // export, so the first row is representative of the whole group.
    const headerValues: Record<string, any> = {};
    for (const [k, v] of Object.entries(first.values)) {
      if (!isLineItemKey(k)) headerValues[k] = v;
    }

    // Header-level errors/warnings come from the first row's field-tagged
    // issues on non-line-item fields only — a line item's own problem (a
    // bad quantity, say) must never block the whole invoice.
    const headerErrors = first.fieldErrors.filter(fi => !isLineItemKey(fi.fieldKey)).map(fi => fi.message);
    const headerWarningsFromFirst = first.fieldWarnings.filter(fi => !isLineItemKey(fi.fieldKey)).map(fi => fi.message);
    const headerFallbackFields = first.fallbackFields.filter(k => !isLineItemKey(k));

    // Line items: one entry per underlying row, holding only that row's
    // line-item-marked field values. A row whose line-item fields have
    // errors is still included here (so its raw data + error stays
    // visible/traceable) but excluded from what actually gets created.
    const lineItems: GroupedLineItem[] = groupRows.map(r => {
      const lineValues: Record<string, any> = {};
      for (const [k, v] of Object.entries(r.values)) {
        if (isLineItemKey(k)) lineValues[k] = v;
      }
      const lineErrors = r.fieldErrors.filter(fi => isLineItemKey(fi.fieldKey)).map(fi => fi.message);
      return { values: lineValues, errors: lineErrors, sourceRowIndex: r.rowIndex };
    });

    const validLineItems = lineItems.filter(li => li.errors.length === 0);
    const invalidCount = lineItems.length - validLineItems.length;
    const warnings = [...headerWarningsFromFirst];
    if (invalidCount > 0) {
      warnings.push(`${invalidCount} of ${lineItems.length} line item${lineItems.length === 1 ? "" : "s"} couldn't be read and will be skipped`);
    }

    // A group whose EVERY underlying line item failed validation is a
    // real problem, not a legitimate header-only import — the source file
    // structurally has line items for this record, so ending up with zero
    // valid ones almost always means something's actually wrong (bad
    // mapping, malformed source data), not that this particular record
    // intentionally has none. Discovered as a real, silent gap: Bills'
    // first live run produced several "successfully created" records
    // with zero line items and no error ever surfaced for it, because the
    // line-item insert step was simply skipped outright when there was
    // nothing valid to insert — this makes that case a blocking header
    // error instead, visible in Preview before anything is ever written.
    const groupHeaderErrors = [...headerErrors];
    if (lineItems.length > 0 && validLineItems.length === 0) {
      groupHeaderErrors.push("Every line item on this record failed validation — nothing valid to import.");
    }

    let match: ExistingRecord | null = null;
    if (config.dedupEnabled) {
      for (const k of config.matchKeysFor(headerValues, lookups)) {
        const found = k ? existingIndex.get(k) : undefined;
        if (found) { match = found; break; }
      }
    }

    const action: DedupAction = groupHeaderErrors.length > 0 ? "skip" : (match ? "skip" : "create");

    return {
      rowIndex: first.rowIndex,
      values: headerValues,
      errors: groupHeaderErrors,
      warnings,
      fallbackFields: headerFallbackFields,
      match,
      action,
      lineItems,
      groupRowIndexes: groupRows.map(r => r.rowIndex),
    };
  });
}

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Columns" },
  { key: "preview", label: "Preview" },
  { key: "importing", label: "Import" },
  { key: "result", label: "Done" },
];

interface ImportWizardProps {
  config: EntityImportConfig;
  companyId: string;
  // Lookup maps accumulated from earlier entity passes in the same wizard
  // session (e.g. Clients' results, once Projects joins the flow) — empty
  // for Clients itself, since it's first in the chain.
  lookups: LookupMaps;
  onEntityComplete?: (outcomes: RowOutcome[]) => void;
}

export default function ImportWizard({ config, companyId, lookups, onEntityComplete }: ImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<RowOutcome[]>([]);

  function resetAll() {
    setStep("upload"); setError(null); setParsedFile(null); setMapping({});
    setPreviewRows([]); setOutcomes([]); setProgress({ done: 0, total: 0 });
  }

  // ── Step 1: Upload ─────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setError(null);
    try {
      const parsed = await parseImportFile(file);
      setParsedFile(parsed);
      setMapping(autoMapHeaders(parsed.headers, config));
      setStep("map");
    } catch (e: any) {
      setError(e.message || "Couldn't read that file.");
    }
  }

  // ── Step 2: Map Columns ────────────────────────────────────────────────
  const requiredFields = config.fields.filter(f => f.required);
  const mappedFieldKeys = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = requiredFields.filter(f => !mappedFieldKeys.has(f.key));

  function setColumnMapping(header: string, fieldKey: string) {
    setMapping(prev => {
      const next = { ...prev };
      if (fieldKey) {
        const targetField = config.fields.find(f => f.key === fieldKey);
        // An ordinary field can only be mapped from one column — clear it
        // from wherever it was previously assigned before assigning it
        // here. multiSource fields (e.g. address) skip this: several
        // columns are allowed to point at the same field simultaneously,
        // and get concatenated in goToPreview below.
        if (!targetField?.multiSource) {
          for (const h of Object.keys(next)) {
            if (h !== header && next[h] === fieldKey) next[h] = null;
          }
        }
      }
      next[header] = fieldKey || null;
      return next;
    });
  }

  async function goToPreview() {
    if (!parsedFile) return;
    setError(null);
    setLoadingPreview(true);
    try {
      const existingRecords = config.dedupEnabled ? await config.fetchExisting(companyId) : [];

      const existingIndex = new Map<string, ExistingRecord>();
      for (const rec of existingRecords) {
        for (const k of rec.keys) if (k && !existingIndex.has(k)) existingIndex.set(k, rec);
      }

      const builtRows: PreviewRow[] = config.groupByField
        ? buildGroupedPreviewRows(parsedFile, mapping, config, lookups, existingIndex)
        : parsedFile.rows.map((row, rowIndex) => {
            const { values, fieldErrors, fieldWarnings, fallbackFields } = processRawRow(row, parsedFile.headers, mapping, config, lookups);
            const errors = fieldErrors.map(fi => fi.message);
            const warnings = fieldWarnings.map(fi => fi.message);

            let match: ExistingRecord | null = null;
            if (config.dedupEnabled) {
              for (const key of config.matchKeysFor(values, lookups)) {
                const found = key ? existingIndex.get(key) : undefined;
                if (found) { match = found; break; }
              }
            }

            const action: DedupAction = errors.length > 0 ? "skip" : (match ? "skip" : "create");
            return { rowIndex, values, errors, warnings, fallbackFields, match, action };
          });

      // Cross-row / live-DB-aware Preview post-processing (e.g. Chart of
      // Accounts' sequential Account Code assignment) — runs once, after
      // every row already has its normal per-row result, before anything
      // ever reaches React state.
      const rows = config.postProcessPreviewRows
        ? await config.postProcessPreviewRows(builtRows, lookups, companyId)
        : builtRows;

      setPreviewRows(rows);
      setStep("preview");
    } catch (e: any) {
      setError(e.message || "Couldn't build the preview.");
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Step 3: Preview & Dedup ─────────────────────────────────────────────
  function setRowAction(rowIndex: number, action: DedupAction) {
    setPreviewRows(prev => prev.map(r => r.rowIndex === rowIndex ? { ...r, action } : r));
  }

  function bulkSetDuplicateAction(action: DedupAction) {
    setPreviewRows(prev => prev.map(r => (r.match && r.errors.length === 0) ? { ...r, action } : r));
  }

  const counts = useMemo(() => {
    const errorCount = previewRows.filter(r => r.errors.length > 0).length;
    const dup = previewRows.filter(r => r.match && r.errors.length === 0);
    const willCreate = previewRows.filter(r => r.errors.length === 0 && r.action === "create").length;
    const willUpdate = previewRows.filter(r => r.errors.length === 0 && r.action === "update").length;
    const willSkip = previewRows.filter(r => r.errors.length === 0 && r.action === "skip").length;
    return { total: previewRows.length, errorCount, dupCount: dup.length, willCreate, willUpdate, willSkip };
  }, [previewRows]);

  // ── Step 4: Confirm & Import ────────────────────────────────────────────
  async function runImport() {
    const toProcess = previewRows.filter(r => r.errors.length === 0 && r.action !== "skip");
    setStep("importing");
    setProgress({ done: 0, total: toProcess.length });
    const results: RowOutcome[] = [];

    // Cache for createIfMissing lookup resolutions during this run, keyed
    // by `${lookupEntityKey}::${normalizedRawValue}` -> the in-flight (or
    // already-settled) creation. Rows are processed in parallel chunks
    // below, so without this, two rows both referencing the same brand-new
    // value (e.g. two expenses both say a "Fuel" category that doesn't
    // exist yet) would race to insert it twice. The fix relies on
    // createCache.set() happening synchronously, before resolveOrCreate's
    // own await ever yields control — since chunk.map(async row => ...)
    // invokes every row's callback synchronously up to ITS first await,
    // the first row to need a given new value always wins the cache race
    // before a second row gets a chance to check it, not just "usually."
    const createCache = new Map<string, Promise<{ id: string; label: string } | null>>();

    async function resolveOrCreate(field: EntityImportConfig["fields"][number], rawValue: string): Promise<{ id: string; label: string } | null> {
      if (!field.lookupEntityKey) return null;
      const existing = resolveLookup(rawValue, lookups[field.lookupEntityKey]);
      if (existing) return existing;
      if (!field.createIfMissing || !config.createLookupTarget) return null;
      const cacheKey = `${field.lookupEntityKey}::${normalizeKey(rawValue)}`;
      if (!createCache.has(cacheKey)) {
        createCache.set(cacheKey, config.createLookupTarget(field.key, rawValue, companyId)
          .then(created => {
            // Merge into the shared lookups map so every later resolution —
            // this row's own buildPayload call right after, any later row
            // in this or a later chunk, even a second file uploaded without
            // leaving the page — finds it via the normal lookup path
            // instead of creating it again.
            if (!lookups[field.lookupEntityKey!]) lookups[field.lookupEntityKey!] = new Map();
            lookups[field.lookupEntityKey!].set(normalizeKey(rawValue), created);
            return created;
          })
          .catch(() => null)); // creation failed — cache the miss so every row referencing this value this run degrades the same way (null) rather than each retrying independently
      }
      return createCache.get(cacheKey)!;
    }

    // Sequential in small chunks — not a single bulk insert, since "update"
    // rows need individual .update().eq('id', ...) calls and per-row failure
    // reporting is the whole point (no all-or-nothing transaction).
    const CHUNK = 10;
    for (let i = 0; i < toProcess.length; i += CHUNK) {
      const chunk = toProcess.slice(i, i + CHUNK);
      const chunkResults = await Promise.all(chunk.map(async (row): Promise<RowOutcome> => {
        try {
          // Resolve (creating if needed and allowed) every createIfMissing
          // lookup field before buildPayload runs, so buildPayload can stay
          // simple and synchronous — it just reads the now-current lookups
          // map, never needs to know creation happened at all.
          for (const field of config.fields) {
            if (field.type === "lookup" && field.createIfMissing) {
              const raw = row.values[field.key];
              if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
                await resolveOrCreate(field, String(raw));
              }
            }
          }
          if (config.groupByField) {
            // Grouped entity (e.g. Invoices): header first, then its line
            // items referencing the header's real id — a genuine two-step
            // dependency within one group (different groups still process
            // across parallel chunks as usual). Known, deliberate
            // limitation: if the line-item insert below fails after a
            // successful header write, the header is left in place rather
            // than rolled back — Supabase/PostgREST has no easy client-
            // side multi-table transaction without a dedicated RPC
            // function, which this pass doesn't introduce. The failure is
            // still reported below (not silent), so a header-only row is
            // visible and fixable rather than hidden.
            const validLineItems = (row.lineItems || []).filter(li => li.errors.length === 0);
            const headerPayload = config.buildGroupHeaderPayload!(row.values, row.lineItems || [], lookups, companyId);

            let headerId: string;
            if (row.action === "update" && row.match) {
              const updatePayload: Record<string, any> = {};
              for (const field of config.fields) {
                if (field.isLineItemField) continue;
                const raw = row.values[field.key];
                if (raw === undefined || raw === null || String(raw).trim() === "") continue;
                if (field.type === "lookup" && headerPayload[field.key] == null) continue;
                updatePayload[field.key] = headerPayload[field.key];
              }
              // Purely derived header keys (no 1:1 config.fields entry —
              // e.g. Invoices' tax_amount/tax_rate/amount_paid) aren't
              // covered by the loop above at all; the config decides for
              // itself, from its own knowledge of what feeds them, which
              // of those are safe to include given what this row provided.
              Object.assign(updatePayload, config.buildGroupHeaderUpdateExtras?.(row.values, headerPayload) ?? {});
              const { error: updErr } = await supabase.from(config.table).update(updatePayload).eq("id", row.match.id);
              if (updErr) throw updErr;
              headerId = row.match.id;
              // Update = full replace of line items, matching this app's
              // own precedent (deleteInvoice already deletes line items by
              // invoice_id before removing the header) — simpler and more
              // predictable than diffing/merging existing vs. re-imported
              // line items. The parent-referencing column name is config-
              // declared, not hardcoded — it genuinely differs between
              // grouped entities (client_invoice_line_items.invoice_id vs
              // supplier_invoice_line_items.supplier_invoice_id).
              const { error: delErr } = await supabase.from(config.lineItemTable!).delete().eq(config.lineItemParentField!, headerId);
              if (delErr) throw delErr;
            } else {
              const { data: newHeader, error: insErr } = await supabase.from(config.table).insert(headerPayload).select("id").single();
              if (insErr) throw insErr;
              headerId = newHeader.id;
            }

            if (validLineItems.length > 0) {
              const lineItemPayloads = validLineItems.map((li, idx) =>
                config.buildLineItemPayload!(li.values, idx + 1, headerId, row.values, companyId)
              );
              const { error: liErr } = await supabase.from(config.lineItemTable!).insert(lineItemPayloads);
              if (liErr) throw liErr;
            }

            return row.action === "update" && row.match
              ? { status: "updated", rowIndex: row.rowIndex, id: headerId }
              : { status: "created", rowIndex: row.rowIndex, id: headerId };
          }

          const payload = config.buildPayload(row.values, lookups, companyId);
          if (row.action === "update" && row.match) {
            // Only overwrite fields this row actually provided a value for.
            // buildPayload fills in defaults for unmapped fields (e.g. a
            // blank Status maps to "active") which is correct for a brand
            // new row, but applying those same defaults to an UPDATE would
            // silently null out or reset real existing data on the matched
            // record just because this particular export didn't include
            // that column — an import should never destroy data it wasn't
            // actually given.
            const updatePayload: Record<string, any> = {};
            for (const field of config.fields) {
              const raw = row.values[field.key];
              if (raw === undefined || raw === null || String(raw).trim() === "") continue;
              // A lookup field can have a non-blank RAW value (the typed
              // client name, say) that still failed to resolve to a real
              // record — already flagged as a warning in Preview. Never let
              // that null out whatever the existing record's real link
              // currently is; only apply it when resolution actually
              // succeeded.
              if (field.type === "lookup" && payload[field.key] == null) continue;
              updatePayload[field.key] = payload[field.key];
            }
            const { error: e } = await supabase.from(config.table).update(updatePayload).eq("id", row.match.id);
            if (e) throw e;
            return { status: "updated", rowIndex: row.rowIndex, id: row.match.id };
          } else {
            const { data, error: e } = await supabase.from(config.table).insert(payload).select("id").single();
            if (e) throw e;
            return { status: "created", rowIndex: row.rowIndex, id: data.id };
          }
        } catch (e: any) {
          // Postgres 23505 (unique_violation) — most entities have no
          // DB-level uniqueness at all (dedup is purely app-level, via
          // matchKeysFor above), but some do (e.g. suppliers' UNIQUE
          // (company_id, supplier_name)). The app-level dedup check only
          // catches a collision against rows that already existed in the
          // DB before this run started — it can't catch two rows in the
          // SAME upload that normalize to the same key, since neither
          // exists yet when Preview builds its index. Whichever row loses
          // that race here fails this one row with a legible message
          // instead of raw Postgres text — never the whole import.
          const message = e?.code === "23505"
            ? "A record with this same name already exists — skipped to avoid a duplicate."
            : (e.message || "Unknown error");
          return { status: "failed", rowIndex: row.rowIndex, error: message };
        }
      }));
      results.push(...chunkResults);
      setProgress({ done: results.length, total: toProcess.length });
    }

    // Rows never attempted against the DB still get an outcome entry, so
    // the result screen accounts for every uploaded row. A validation/
    // routing error means "excluded before import even started" — a
    // completely different, non-alarming outcome from "failed" (attempted
    // and the database rejected it) — see the RowOutcome comment in
    // types.ts for why these used to be conflated and why that mattered.
    for (const row of previewRows) {
      if (row.errors.length > 0) results.push({ status: "excluded", rowIndex: row.rowIndex, reason: row.errors.join("; ") });
      else if (row.action === "skip") results.push({ status: "skipped", rowIndex: row.rowIndex, reason: row.match ? "Matched an existing record" : "Skipped by user" });
    }

    // Self-referencing links (e.g. Chart of Accounts' Parent Account) can
    // only resolve once every row in this batch has a real id — runs
    // once here, after every row has been attempted, still before the
    // user sees "Done." A failure here doesn't retroactively undo the
    // accounts already created above (those succeeded independently); it
    // surfaces as a page-level error so it's visible, not silent.
    if (config.resolveSelfReferentialLinks) {
      const successfulOutcomes = results
        .filter((r): r is Extract<RowOutcome, { status: "created" | "updated" }> => r.status === "created" || r.status === "updated")
        .map(r => ({ rowIndex: r.rowIndex, id: r.id }));
      try {
        await config.resolveSelfReferentialLinks(successfulOutcomes, previewRows, companyId);
      } catch (e: any) {
        setError(`Records were created successfully, but linking parent accounts afterward failed: ${e.message || "Unknown error"}`);
      }
    }

    setOutcomes(results);
    setStep("result");
    onEntityComplete?.(results);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <StepIndicator current={step} />

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

      {step === "upload" && <UploadStep config={config} onFile={handleFile} />}

      {step === "map" && parsedFile && (
        <MapStep
          config={config}
          parsedFile={parsedFile}
          mapping={mapping}
          onChange={setColumnMapping}
          missingRequired={missingRequired}
          loading={loadingPreview}
          onBack={() => setStep("upload")}
          onNext={goToPreview}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          config={config}
          rows={previewRows}
          counts={counts}
          onRowAction={setRowAction}
          onBulkDuplicateAction={bulkSetDuplicateAction}
          onBack={() => setStep("map")}
          onImport={runImport}
        />
      )}

      {step === "importing" && (
        <Card>
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Spinner size={28} />
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Importing {config.label.toLowerCase()}... {progress.done} / {progress.total}
            </div>
            <div className="w-full max-w-sm">
              <Progress value={progress.done} max={Math.max(progress.total, 1)} />
            </div>
          </div>
        </Card>
      )}

      {step === "result" && (
        <ResultStep config={config} outcomes={outcomes} onImportAnother={resetAll} />
      )}
    </div>
  );
}

// ─── Header auto-match ─────────────────────────────────────────────────────

function autoMapHeaders(headers: string[], config: EntityImportConfig): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();

  // Pass 1: exact normalized match only, checked against every field before
  // falling back to fuzzy. Doing exact-match as its own first pass (rather
  // than per-header first-field-wins) matters because a short, generic alias
  // like "name" is a *substring* of "Contact Name", "Company Name", etc. —
  // without this pass, whichever field lists "name" as a candidate would
  // greedily grab every "*Name" header via loose containment before a header
  // that's an exact match for a more specific field (e.g. contact_name's own
  // "contact name" alias) ever gets a chance.
  for (const header of headers) {
    for (const field of config.fields) {
      // multiSource fields (e.g. address) are exempt from the "already
      // claimed" check — several headers are meant to auto-map to them at
      // once (Billing Address, Billing City, Billing Country, ...).
      if (claimed.has(field.key) && !field.multiSource) continue;
      const candidates = [field.label, ...(field.aliases || [])];
      if (candidates.some(c => normalizeForMatch(c) === normalizeForMatch(header))) {
        mapping[header] = field.key;
        claimed.add(field.key);
        break;
      }
    }
  }

  // Pass 2: loose containment fallback for anything still unmapped, but only
  // against multi-word candidates — single generic words (the exact case
  // that caused the pass-1 problem above) are excluded here since they're
  // too likely to false-positive-match an unrelated column.
  for (const header of headers) {
    if (mapping[header]) continue;
    let bestField: string | null = null;
    for (const field of config.fields) {
      if (claimed.has(field.key) && !field.multiSource) continue;
      const candidates = [field.label, ...(field.aliases || [])].filter(c => c.trim().includes(" "));
      if (candidates.some(c => headerMatchesAlias(header, c))) { bestField = field.key; break; }
    }
    mapping[header] = bestField;
    if (bestField) claimed.add(bestField);
  }
  return mapping;
}

// ─── Step indicator ─────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border",
            i < idx ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/25"
              : i === idx ? "bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/25"
              : "bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-600 border-slate-200 dark:border-white/[0.07]"
          )}>
            {i < idx && <Check size={11} />}
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className="w-3 h-px bg-slate-300 dark:bg-white/10" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: Upload ─────────────────────────────────────────────────────────

function UploadStep({ config, onFile }: { config: EntityImportConfig; onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <Card>
      <CardHeader title={`Upload ${config.label} File`} subtitle="CSV or Excel (.xlsx/.xls) — exported from Zoho Books or any other system" />
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-colors",
          dragging ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-500/5" : "border-slate-300 dark:border-white/[0.12] hover:border-cyan-500/40"
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Upload size={20} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">Drop a file here, or click to browse</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-600 mt-1">.csv, .xlsx, .xls — up to 5,000 rows</div>
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </label>
    </Card>
  );
}

// ─── Step 2: Map Columns ─────────────────────────────────────────────────────

function MapStep({ config, parsedFile, mapping, onChange, missingRequired, loading, onBack, onNext }: {
  config: EntityImportConfig; parsedFile: ParsedFile; mapping: ColumnMapping;
  onChange: (header: string, fieldKey: string) => void;
  missingRequired: EntityImportConfig["fields"];
  loading: boolean; onBack: () => void; onNext: () => void;
}) {
  const previewRows = parsedFile.rows.slice(0, 3);
  return (
    <Card>
      <CardHeader title="Map Columns"
        subtitle={`${parsedFile.fileName} — ${parsedFile.rows.length} row${parsedFile.rows.length === 1 ? "" : "s"} found. Match each uploaded column to a field, or skip it.`} />

      <div className="space-y-2">
        {parsedFile.headers.map(header => (
          <div key={header} className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{header}</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-600 truncate">
                e.g. {previewRows.map(r => r[header]).filter(Boolean).slice(0, 2).join(", ") || "—"}
              </div>
            </div>
            <ArrowRight size={13} className="text-slate-400 dark:text-slate-700 flex-shrink-0" />
            <Select className="w-52 flex-shrink-0" value={mapping[header] || ""} onChange={e => onChange(header, e.target.value)}>
              <option value="">— Skip this column —</option>
              {config.fields.map(f => (
                <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}{f.multiSource ? " (combines columns)" : ""}{f.isLineItemField ? " (per line item)" : ""}</option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      <MultiSourcePreview config={config} mapping={mapping} />

      {missingRequired.length > 0 && (
        <Alert type="warning" className="mt-4">
          Still need to map: {missingRequired.map(f => f.label).join(", ")}
        </Alert>
      )}

      <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200 dark:border-white/[0.06]">
        <Btn variant="ghost" icon={<ArrowLeft size={13} />} onClick={onBack}>Back</Btn>
        <Btn variant="primary" icon={loading ? <Spinner size={13} /> : <ArrowRight size={13} />}
          disabled={missingRequired.length > 0 || loading} onClick={onNext}>
          {loading ? "Checking for duplicates..." : "Preview Import"}
        </Btn>
      </div>
    </Card>
  );
}

// Shows, for any multiSource field with more than one header currently
// mapped to it, exactly what will be concatenated and in what order — so
// the user can confirm the result before moving on, rather than finding
// out only once real rows show up in Preview.
function MultiSourcePreview({ config, mapping }: { config: EntityImportConfig; mapping: ColumnMapping }) {
  const groups = config.fields
    .filter(f => f.multiSource)
    .map(f => ({ field: f, headers: Object.keys(mapping).filter(h => mapping[h] === f.key) }))
    .filter(g => g.headers.length > 1);

  if (groups.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {groups.map(g => (
        <div key={g.field.key} className="flex items-start gap-2 rounded-lg bg-cyan-50 dark:bg-cyan-500/5 border border-cyan-200 dark:border-cyan-500/20 px-3 py-2 text-[11px]">
          <span className="font-semibold text-cyan-700 dark:text-cyan-400 flex-shrink-0">{g.field.label}:</span>
          <span className="text-slate-600 dark:text-slate-400">
            will combine {g.headers.join(" + ")} (in that order, joined with "{g.field.joinWith ?? ", "}")
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Step 3: Preview & Dedup ─────────────────────────────────────────────────

function PreviewStep({ config, rows, counts, onRowAction, onBulkDuplicateAction, onBack, onImport }: {
  config: EntityImportConfig; rows: PreviewRow[];
  counts: { total: number; errorCount: number; dupCount: number; willCreate: number; willUpdate: number; willSkip: number };
  onRowAction: (rowIndex: number, action: DedupAction) => void;
  onBulkDuplicateAction: (action: DedupAction) => void;
  onBack: () => void; onImport: () => void;
}) {
  // All required fields are shown — Clients/Projects only have one (name),
  // but Expenses has three (date, description, amount), and description in
  // particular is exactly the field most worth a visual check given the
  // whole buildFallback mechanism exists for it. multiSource and lookup
  // fields are prioritized among the optional ones — they're the columns
  // most worth double-checking (a concatenated address reading correctly,
  // a category/client actually resolving) before committing rows to the DB.
  // For a grouped entity (e.g. Invoices), only header-level fields make
  // sense as flat columns — line-item fields (description, quantity, rate)
  // vary per line item within the group and get their own dedicated "Line
  // Items" column instead (see the grouped table branch below).
  const columnCandidates = config.groupByField ? config.fields.filter(f => !f.isLineItemField) : config.fields;
  const requiredDisplay = columnCandidates.filter(f => f.required);
  const optionalFields = columnCandidates.filter(f => !f.required);
  const priorityOptional = optionalFields.filter(f => f.multiSource || f.type === "lookup").concat(optionalFields.filter(f => !f.multiSource && f.type !== "lookup"));
  // The 6-column cap exists to keep an ordinary (one-row-per-record)
  // entity's Preview table from getting overwhelming when there are many
  // optional fields competing for space. A grouped entity (Invoices,
  // Bills) doesn't have that pressure the same way — there's only one row
  // per GROUP, not per underlying CSV row, and its header fields are
  // often exactly the numbers worth double-checking before import (e.g.
  // Bills' computed status needs Total/Balance visible to sanity-check —
  // both were silently getting cut by this same cap for Invoices too,
  // discovered while reviewing this for Bills, not something new here).
  const displayFields = config.groupByField ? requiredDisplay.concat(priorityOptional) : requiredDisplay.concat(priorityOptional).slice(0, 6);
  const importCount = counts.willCreate + counts.willUpdate;

  return (
    <Card padding={false}>
      <div className="p-4 border-b border-slate-200 dark:border-white/[0.06]">
        <CardHeader title="Preview" subtitle={`${counts.total} rows read`} />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge color="green">{counts.willCreate} new</Badge>
          {config.dedupEnabled && <Badge color="amber">{counts.dupCount} duplicate{counts.dupCount === 1 ? "" : "s"}</Badge>}
          {counts.errorCount > 0 && <Badge color="red">{counts.errorCount} error{counts.errorCount === 1 ? "" : "s"} (excluded)</Badge>}
          {config.dedupEnabled && counts.dupCount > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-slate-500 dark:text-slate-600">Duplicates:</span>
              <button onClick={() => onBulkDuplicateAction("skip")} className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">Skip all</button>
              <button onClick={() => onBulkDuplicateAction("update")} className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">Update all</button>
            </div>
          )}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              {displayFields.map(f => <Th key={f.key}>{f.label}</Th>)}
              {config.groupByField && <Th>Line Items</Th>}
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <Tr key={row.rowIndex}>
                <Td muted>{row.rowIndex + 1}</Td>
                {displayFields.map(f => {
                  const isFallback = row.fallbackFields.includes(f.key);
                  return (
                    <Td key={f.key} className={row.errors.length > 0 ? "text-red-500" : isFallback ? "italic text-cyan-600 dark:text-cyan-400" : undefined}>
                      <span title={isFallback ? "Derived — the source file left this blank" : undefined}>
                        {row.values[f.key] || "—"}{isFallback && " *"}
                      </span>
                    </Td>
                  );
                })}
                {config.groupByField && (
                  <Td>
                    {(() => {
                      const total = row.lineItems?.length ?? 0;
                      const valid = row.lineItems?.filter(li => li.errors.length === 0).length ?? 0;
                      return valid === total
                        ? <span className="text-[11px] text-slate-600 dark:text-slate-400">{total} line item{total === 1 ? "" : "s"}</span>
                        : <span className="text-[11px] text-amber-500">{valid} of {total} line item{total === 1 ? "" : "s"} — {total - valid} skipped</span>;
                    })()}
                  </Td>
                )}
                <Td>
                  <div className="flex flex-col gap-1 items-start">
                    {row.errors.length > 0 ? (
                      <Badge color="red" dot>{row.errors[0]}</Badge>
                    ) : row.match ? (
                      <Badge color="amber" dot>Matches "{row.match.label}"</Badge>
                    ) : (
                      <Badge color="green" dot>New</Badge>
                    )}
                    {row.fallbackFields.length > 0 && (
                      <span className="text-[9px] text-cyan-600 dark:text-cyan-400">* {row.fallbackFields.length} field{row.fallbackFields.length === 1 ? "" : "s"} derived — blank in file</span>
                    )}
                    {row.warnings.length > 0 && (
                      <span className="text-[9px] text-amber-500" title={row.warnings.join("; ")}>{row.warnings[0]}</span>
                    )}
                  </div>
                </Td>
                <Td>
                  {row.errors.length > 0 ? (
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">Excluded</span>
                  ) : row.match ? (
                    <Select className="w-36 text-[11px] py-1" value={row.action}
                      onChange={e => onRowAction(row.rowIndex, e.target.value as DedupAction)}>
                      <option value="skip">Skip (keep existing)</option>
                      <option value="update">Update existing</option>
                      <option value="create">Create duplicate</option>
                    </Select>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-slate-600">Create</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-white/[0.06]">
        <Btn variant="ghost" icon={<ArrowLeft size={13} />} onClick={onBack}>Back</Btn>
        <Btn variant="primary" icon={<Check size={13} />} disabled={importCount === 0} onClick={onImport}>
          Import {importCount} {config.label.toLowerCase()}
        </Btn>
      </div>
    </Card>
  );
}

// ─── Step 5: Result ───────────────────────────────────────────────────────────

function ResultStep({ config, outcomes, onImportAnother }: {
  config: EntityImportConfig; outcomes: RowOutcome[]; onImportAnother: () => void;
}) {
  const created = outcomes.filter(o => o.status === "created").length;
  const updated = outcomes.filter(o => o.status === "updated").length;
  const skipped = outcomes.filter(o => o.status === "skipped").length;
  const excluded = outcomes.filter((o): o is Extract<RowOutcome, { status: "excluded" }> => o.status === "excluded");
  const failed = outcomes.filter((o): o is Extract<RowOutcome, { status: "failed" }> => o.status === "failed");

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Check size={18} className="text-emerald-500" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import complete</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-600">{config.label} — {outcomes.length} rows processed</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <ResultStat label="Created" value={created} color="text-emerald-500" />
        <ResultStat label="Updated" value={updated} color="text-blue-500" />
        <ResultStat label="Excluded" value={excluded.length} color="text-amber-500" />
        <ResultStat label="Skipped" value={skipped} color="text-slate-500" />
        <ResultStat label="Failed" value={failed.length} color="text-red-500" />
      </div>

      {excluded.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-amber-500 mb-2 flex items-center gap-1.5">
            {excluded.length} row{excluded.length === 1 ? "" : "s"} excluded before import — working as designed, not an error
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 divide-y divide-amber-100 dark:divide-amber-500/10 max-h-64 overflow-y-auto">
            {excluded.map(x => (
              <div key={x.rowIndex} className="px-3 py-2 text-[11px]">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Row {x.rowIndex + 1}: </span>
                <span className="text-amber-600 dark:text-amber-400">{x.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Rows that failed — attempted, and the database rejected them</div>
          <div className="rounded-lg border border-red-200 dark:border-red-500/20 divide-y divide-red-100 dark:divide-red-500/10 max-h-64 overflow-y-auto">
            {failed.map(f => (
              <div key={f.rowIndex} className="px-3 py-2 text-[11px]">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Row {f.rowIndex + 1}: </span>
                <span className="text-red-500">{f.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
        <Btn variant="ghost" icon={<RefreshCw size={13} />} onClick={onImportAnother}>Import Another File</Btn>
      </div>
    </Card>
  );
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">{label}</div>
      <div className={cn("text-xl font-bold", color)}>{value}</div>
    </div>
  );
}
