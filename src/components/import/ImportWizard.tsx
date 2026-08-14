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
import { headerMatchesAlias, normalizeForMatch } from "../../lib/import/matching";
import type {
  EntityImportConfig, ParsedFile, ColumnMapping, PreviewRow,
  ExistingRecord, RowOutcome, DedupAction, LookupMaps,
} from "../../lib/import/types";
import { Card, CardHeader, Btn, Badge, Select, Alert, Table, Th, Tr, Td, Progress, Spinner, cn } from "../ui";
import { Upload, ArrowLeft, ArrowRight, Check, AlertTriangle, RefreshCw } from "lucide-react";

type Step = "upload" | "map" | "preview" | "importing" | "result";

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

      const rows: PreviewRow[] = parsedFile.rows.map((row, rowIndex) => {
        const values: Record<string, any> = {};
        // Group mapped headers by target field, preserving the uploaded
        // file's own column order — matters for multiSource fields (e.g.
        // address), whose parts get concatenated in that order (a real
        // export's Billing Address/City/State/Country columns are already
        // in a sensible left-to-right order, so this reads naturally
        // without needing a separate explicit-ordering UI).
        const headersByField = new Map<string, string[]>();
        for (const header of parsedFile.headers) {
          const fieldKey = mapping[header];
          if (!fieldKey) continue;
          if (!headersByField.has(fieldKey)) headersByField.set(fieldKey, []);
          headersByField.get(fieldKey)!.push(header);
        }
        for (const field of config.fields) {
          const headers = headersByField.get(field.key);
          if (!headers || headers.length === 0) continue;
          if (field.multiSource && headers.length > 1) {
            const joinWith = field.joinWith ?? ", ";
            const parts = headers.map(h => (row[h] ?? "").trim()).filter(Boolean);
            values[field.key] = parts.join(joinWith);
          } else {
            values[field.key] = row[headers[0]] ?? "";
          }
        }

        // Format errors on a REQUIRED field block the row — there's no
        // usable fallback. A format error on an OPTIONAL field must not
        // block the whole row from importing (a malformed status/email
        // value on one row shouldn't stop everything else on that row from
        // being saved) — instead, drop just that field's value back to
        // unmapped so buildPayload's own default takes over, and note it as
        // a (non-blocking) warning surfaced in the preview table.
        const errors: string[] = [];
        const warnings: string[] = [];
        const fallbackFields: string[] = [];
        for (const field of config.fields) {
          let v = values[field.key];
          const isBlank = v === undefined || v === null || String(v).trim() === "";
          if (field.required && isBlank) {
            // Required-but-commonly-blank fields (e.g. expenses.description)
            // get one chance at a config-supplied fallback derived from the
            // row's other mapped values before this row is excluded outright.
            const fallback = config.buildFallback?.(field.key, values);
            if (fallback && String(fallback).trim() !== "") {
              values[field.key] = fallback;
              v = fallback;
              fallbackFields.push(field.key);
            } else {
              errors.push(`${field.label} is required`);
              continue;
            }
          }
          if (v !== undefined && v !== null && String(v).trim() !== "" && config.validateField) {
            const err = config.validateField(field, v);
            if (err) {
              if (field.required) errors.push(`${field.label}: ${err}`);
              else { warnings.push(`${field.label}: ${err} — left blank`); delete values[field.key]; }
            }
          }
        }

        let match: ExistingRecord | null = null;
        if (config.dedupEnabled) {
          for (const key of config.matchKeysFor(values)) {
            const found = key ? existingIndex.get(key) : undefined;
            if (found) { match = found; break; }
          }
        }

        const action: DedupAction = errors.length > 0 ? "skip" : (match ? "skip" : "create");
        return { rowIndex, values, errors, warnings, fallbackFields, match, action };
      });

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

    // Sequential in small chunks — not a single bulk insert, since "update"
    // rows need individual .update().eq('id', ...) calls and per-row failure
    // reporting is the whole point (no all-or-nothing transaction).
    const CHUNK = 10;
    for (let i = 0; i < toProcess.length; i += CHUNK) {
      const chunk = toProcess.slice(i, i + CHUNK);
      const chunkResults = await Promise.all(chunk.map(async (row): Promise<RowOutcome> => {
        try {
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
              if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
                updatePayload[field.key] = payload[field.key];
              }
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
          return { status: "failed", rowIndex: row.rowIndex, error: e.message || "Unknown error" };
        }
      }));
      results.push(...chunkResults);
      setProgress({ done: results.length, total: toProcess.length });
    }

    // Skipped rows (by explicit action or validation error) still get an
    // outcome entry, so the result screen accounts for every uploaded row.
    for (const row of previewRows) {
      if (row.errors.length > 0) results.push({ status: "failed", rowIndex: row.rowIndex, error: row.errors.join("; ") });
      else if (row.action === "skip") results.push({ status: "skipped", rowIndex: row.rowIndex, reason: row.match ? "Matched an existing record" : "Skipped by user" });
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
                <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}{f.multiSource ? " (combines columns)" : ""}</option>
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
  // multiSource fields are always shown when present — they're the columns
  // most worth a visual double-check (e.g. confirming a concatenated
  // address actually reads correctly) before committing rows to the DB.
  const requiredDisplay = config.fields.filter(f => f.required).slice(0, 1);
  const optionalFields = config.fields.filter(f => !f.required);
  const priorityOptional = optionalFields.filter(f => f.multiSource).concat(optionalFields.filter(f => !f.multiSource));
  const displayFields = requiredDisplay.concat(priorityOptional).slice(0, 4);
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <ResultStat label="Created" value={created} color="text-emerald-500" />
        <ResultStat label="Updated" value={updated} color="text-blue-500" />
        <ResultStat label="Skipped" value={skipped} color="text-slate-500" />
        <ResultStat label="Failed" value={failed.length} color="text-red-500" />
      </div>

      {failed.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Rows that failed</div>
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
