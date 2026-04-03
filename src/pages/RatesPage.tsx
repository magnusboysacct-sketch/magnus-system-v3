import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import MasterCategorySelect from "../components/master/MasterCategorySelect.tsx";
import MasterUnitSelect from "../components/master/MasterUnitSelect.tsx";
import { buildDefaultVars, computeQuantity } from "../lib/calculatorEngine";
import { SmartItemSelectorButton } from "../components/SmartItemSelectorButton";

// ✅ Standard construction categories (future-proof baseline)
const STANDARD_CATEGORIES = [
  "Cement & Concrete Products",
  "Blocks & Bricks",
  "Timber & Lumber",
  "Plywood / Boards",
  "Reinforcement",
  "General Hardware",
  "Doors & Windows",
  "Plumbing Materials",
  "Electrical Materials",
  "Paints & Coatings",
  "Tools & Equipment",
  "Adhesives & Sealants",
  "Tiles & Flooring",
  "Finishes / Interior",
  "Aggregates & Sand",
  "Roofing Materials",
  "Safety Gear / Site Accessories",
  "Fencing / Outdoor",
  "Cleaning Supplies",
  "Gypsum Material",
  "Fasteners",
  "Miscellaneous",
  "Uncategorized",
] as const;

const ITEM_TYPES = ["Material", "Labor", "Equipment", "Subcontract", "Other"] as const;

const STANDARD_UNITS = [
  "each","ft","m","in",
  "ft²","m²",
  "ft³","m³",
  "yd³",
  "bag","box","roll",
  "lb","kg","ton",
  "gal","L",
  "hour","day","week",
  "sq yd","sq m"
] as const;

type CostItem = {
  id: string;
  item_name: string;
  description: string | null;
  cost_code: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  updated_at: string | null;

  // NEW: from v_cost_items_current
  current_rate: number | null;
  current_currency: string | null;
  current_effective_date: string | null;
  current_source: string | null;
  current_batch_id: string | null;
};

function normCategory(c: string | null | undefined) {
  const t = (c || "").trim();
  return t ? t : "Uncategorized";
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatMoney(n: number | null) {
  if (n == null) return "-";
  if (!isFinite(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** ✅ Custom dark dropdown (fixes "white options" native select issue) */
function CategoryCombobox(props: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allLabel?: string;
}) {
  const { value, options, onChange, allLabel = "All Categories" } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.toLowerCase().includes(qq));
  }, [options, q]);

  const label = value === "__ALL__" ? allLabel : value;

  return (
    <div ref={wrapRef} className="relative w-[260px]">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-left hover:bg-white/10 transition flex items-center justify-between"
      >
        <span className="truncate">{label}</span>
        <span className="opacity-70">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-md border border-white/10 bg-[#0b1220] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search categories…"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          <div className="max-h-72 overflow-auto">
            <button
              type="button"
              onClick={() => {
                onChange("__ALL__");
                setOpen(false);
                setQ("");
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                value === "__ALL__" ? "bg-white/10" : ""
              }`}
            >
              {allLabel}
            </button>

            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                  setQ("");
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                  value === opt ? "bg-white/10" : ""
                }`}
                title={opt}
              >
                {opt}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm opacity-70">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SmartCombobox(props: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  widthClassName?: string; // e.g. "w-full" or "w-[260px]"
}) {
  const { value, options, onChange, placeholder = "Search…", widthClassName = "w-full" } = props;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.toLowerCase().includes(qq));
  }, [options, q]);

  return (
    <div ref={wrapRef} className={`relative ${widthClassName}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm text-left hover:bg-white/10 transition flex items-center justify-between"
      >
        <span className="truncate">{value || "Select…"}</span>
        <span className="opacity-70">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-md border border-white/10 bg-[#0b1220] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          <div className="max-h-72 overflow-auto">
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                  setQ("");
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 ${
                  value === opt ? "bg-white/10" : ""
                }`}
                title={opt}
              >
                {opt}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-3 text-sm opacity-70">No matches.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function slug3(s: string) {
  const t = (s || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  // keep first 2-3 tokens, max 8 chars total
  const joined = t.slice(0, 3).join("").slice(0, 8);
  return joined || "MISC";
}

function typePrefix(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "material") return "MAT";
  if (x === "labor") return "LAB";
  if (x === "equipment") return "EQP";
  if (x === "subcontract") return "SUB";
  return "OTH";
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function nextCodeFor(category: string, itemType: string, existing: CostItem[]) {
  const catKey = slug3(category);
  const pre = typePrefix(itemType);
  const base = `${pre}-${catKey}-`;

  // Find existing codes like "MAT-REIN-001"
  let max = 0;
  for (const it of existing) {
    const c = (it.cost_code || "").toUpperCase();
    if (!c.startsWith(base)) continue;
    const tail = c.slice(base.length);
    const num = Number(tail);
    if (Number.isFinite(num)) max = Math.max(max, num);
  }

  return `${base}${pad3(max + 1)}`;
}

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  // escape quotes + wrap if needed
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: any[][]) {
  const content = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type ImportRow = {
  rowNum: number;
  cost_code: string;
  item_name: string;
  rate: number | null;
  currency: string;
  unit?: string;
  category?: string;
  item_type?: string;
};

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  // Simple CSV parser that supports quotes
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  function pushCell() {
    row.push(cur);
    cur = "";
  }
  function pushRow() {
    rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' ) {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === ",")) {
      pushCell();
      continue;
    }

    if (!inQuotes && (ch === "\n")) {
      pushCell();
      pushRow();
      continue;
    }

    if (!inQuotes && (ch === "\r")) {
      continue;
    }

    cur += ch;
  }

  // last cell
  pushCell();
  if (row.length) pushRow();

  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows };
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function toNum(v: string) {
  const n = Number(String(v || "").replace(/,/g, "").trim());
  return isFinite(n) ? n : null;
}

export default function RatesPage() {
  const [items, setItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>("");

  // ✅ Toolbar state
  const [categoryFilter, setCategoryFilter] = useState<string>("__ALL__");
  const [search, setSearch] = useState("");

  const TYPE_ALL = "__ALL_TYPES__";

  const [typeFilter, setTypeFilter] = useState<Record<string, boolean>>(() => ({
    Material: true,
    Labor: true,
    Equipment: true,
    Subcontract: true,
    Other: true,
  }));

  function toggleType(t: string) {
    setTypeFilter((prev) => ({ ...prev, [t]: !prev[t] }));
  }

  function setOnlyType(t: string) {
    setTypeFilter({
      Material: false,
      Labor: false,
      Equipment: false,
      Subcontract: false,
      Other: false,
      [t]: true,
    });
  }

  function setAllTypes(on: boolean) {
    setTypeFilter({
      Material: on,
      Labor: on,
      Equipment: on,
      Subcontract: on,
      Other: on,
    });
  }

  const selectedTypeCount = useMemo(() => {
    return Object.values(typeFilter).filter(Boolean).length;
  }, [typeFilter]);

  // ✅ Inline edit (rate)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>("");

  // ✅ Inline edit (category + type)
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatValue, setEditingCatValue] = useState<string>("");
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeValue, setEditingTypeValue] = useState<string>("");

  // ✅ Inline edit (description + cost_code)
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editingDescValue, setEditingDescValue] = useState<string>("");
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeValue, setEditingCodeValue] = useState<string>("");

  // ✅ Buttons (placeholders for future)
  const [busy, setBusy] = useState(false);

  // ✅ Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<"add"|"edit">("add");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [autoCode, setAutoCode] = useState(true);

  // Bulk update state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("Bulk rate update");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkMode, setBulkMode] = useState<"percent" | "add" | "set">("percent");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [lastBulkBatches, setLastBulkBatches] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importTitle, setImportTitle] = useState("CSV import");
  const [importReason, setImportReason] = useState("");
  const [importCsvName, setImportCsvName] = useState<string>("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importMatched, setImportMatched] = useState<
    { src: ImportRow; matchId: string; matchName: string }[]
  >([]);
  const [importUnmatched, setImportUnmatched] = useState<ImportRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const todayISO = new Date().toISOString().slice(0, 10);
  const [bulkEffectiveDate, setBulkEffectiveDate] = useState<string>(todayISO);
  const [importEffectiveDate, setImportEffectiveDate] = useState<string>(todayISO);

  function openBulk() {
    setBulkTitle(
      bulkMode === "percent"
        ? "Bulk update (+% / -%)"
        : bulkMode === "add"
        ? "Bulk update (+amount / -amount)"
        : "Bulk update (set value)"
    );
    setBulkReason("");
    setBulkValue("");
    setBulkOpen(true);
  }

  async function applyBulk() {
    const n = Number(bulkValue);
    if (!isFinite(n)) return;

    // If category filter is __ALL__ => pass null so function applies to all
    const cat = categoryFilter === "__ALL__" ? null : categoryFilter;

    setBusy(true);
    try {
      // IMPORTANT:
      // Our SQL function accepts ONE type at a time (p_type_filter text).
      // So we call it once per selected type.
      for (const t of selectedTypes) {
        const { data, error } = await supabase.rpc("bulk_update_rates", {
          p_title: bulkTitle,
          p_reason: bulkReason || null,
          p_type_filter: t,
          p_category_filter: cat,
          p_mode: bulkMode,
          p_value: n,
          p_effective_date: bulkEffectiveDate,
        });

        if (error) {
          console.error("bulk_update_rates error:", error);
          alert(`Bulk update failed for ${t}: ${error.message}`);
          return;
        }

        console.log("Bulk batch created:", data);

        const batchId = data as string; // supabase returns uuid as string
        setLastBulkBatches((prev) => [batchId, ...prev].slice(0, 10));
      }

      console.log("Last bulk batches:", lastBulkBatches);

      setBulkOpen(false);

      // reload after bulk update
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function undoLastBulk() {
  if (lastBulkBatches.length === 0) return;

  if (!confirm("Undo last bulk update?")) return;

  setBusy(true);
  try {
    let totalDeleted = 0;

    for (const batchId of lastBulkBatches) {
      const { data, error } = await supabase.rpc("undo_rate_batch", {
        p_batch_id: batchId,
      });

      if (error) {
        console.error("undo_rate_batch error:", error);
        continue;
      }

      totalDeleted += data || 0;
    }

    console.log("Total rows reverted:", totalDeleted);

    setLastBulkBatches([]);

    await reload();
  } finally {
    setBusy(false);
  }
}

  function exportCurrentViewCsv() {
    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");

    const catLabel = categoryFilter === "__ALL__" ? "AllCategories" : categoryFilter.replace(/\s+/g, "_");
    const filename = `rate-library_${catLabel}_${y}-${m}-${d}.csv`;

    const header = [
      "Item",
      "Variant",
      "Description",
      "Cost Code",
      "Category",
      "Type",
      "Unit",
      "Rate",
      "Currency",
      "Last Updated",
    ];

    const dataRows = filteredItems.map((it) => [
      it.item_name || "",
      it.variant || "",
      it.description || "",
      it.cost_code || "",
      normCategory(it.category),
      it.item_type || "",
      it.unit || "",
      it.current_rate ?? "",
      it.current_currency ?? "JMD",
      it.updated_at || "",
    ]);

    downloadCsv(filename, [header, ...dataRows]);
  }

  function exportByTypeCsv(forcedType: string | null, label: string) {
    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");

    const catLabel = categoryFilter === "__ALL__" ? "AllCategories" : categoryFilter.replace(/\s+/g, "_");
    const typeLabel = forcedType ? forcedType.replace(/\s+/g, "_") : "CurrentView";

    const filename = `rate-library_${label}_${catLabel}_${typeLabel}_${y}-${m}-${d}.csv`;

    const header = [
      "Item",
      "Description",
      "Cost Code",
      "Category",
      "Type",
      "Unit",
      "Rate",
      "Currency",
      "Last Updated",
    ];

    // Respect current view filters first (category + search already in filteredItems)
    let rows = filteredItems;

    // Then force type if requested
    if (forcedType) {
      rows = rows.filter((it) => (it.item_type || "").toLowerCase() === forcedType.toLowerCase());
    }

    const dataRows = rows.map((it) => [
      it.item_name || "",
      it.description || "",
      it.cost_code || "",
      normCategory(it.category),
      it.item_type || "",
      it.unit || "",
      it.current_rate ?? "",
      it.current_currency ?? "JMD",
      it.updated_at || "",
    ]);

    downloadCsv(filename, [header, ...dataRows]);
  }

  async function exportAllTypesSeparate() {
    // This will download multiple files (one per type)
    for (const t of ITEM_TYPES) {
      exportByTypeCsv(t, "ByType");
    }
  }

  function downloadTemplateCurrentView() {
    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");

    const catLabel = categoryFilter === "__ALL__" ? "AllCategories" : categoryFilter.replace(/\s+/g, "_");
    const filename = `rate-template_${catLabel}_${y}-${m}-${d}.csv`;

    const header = ["cost_code","item_name","rate","currency","unit","category","item_type"];

    const dataRows = filteredItems.map((it) => [
      it.cost_code || "",
      it.item_name || "",
      it.current_rate ?? "",
      (it.current_currency || "JMD").toUpperCase(),
      it.unit || "",
      normCategory(it.category),
      it.item_type || "",
    ]);

    downloadCsv(filename, [header, ...dataRows]);
  }

  function openImport() {
    setImportOpen(true);
    setImportTitle("CSV import");
    setImportReason("");
    setImportCsvName("");
    setImportRows([]);
    setImportMatched([]);
    setImportUnmatched([]);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function closeImport() {
    setImportOpen(false);
  }

  function buildLookupMaps() {
    const byCode = new Map<string, CostItem>();
    const byName = new Map<string, CostItem>();

    for (const it of items) {
      const cc = (it.cost_code || "").trim().toLowerCase();
      const nm = (it.item_name || "").trim().toLowerCase();
      if (cc) byCode.set(cc, it);
      if (nm) byName.set(nm, it);
    }
    return { byCode, byName };
  }

  function computeImportMatches(rows: ImportRow[]) {
    const { byCode, byName } = buildLookupMaps();
    const matched: { src: ImportRow; matchId: string; matchName: string }[] = [];
    const unmatched: ImportRow[] = [];

    for (const r of rows) {
      const cc = (r.cost_code || "").trim().toLowerCase();
      const nm = (r.item_name || "").trim().toLowerCase();

      let hit: CostItem | undefined;
      if (cc) hit = byCode.get(cc);
      if (!hit && nm) hit = byName.get(nm);

      if (hit && r.rate != null) {
        matched.push({ src: r, matchId: hit.id, matchName: hit.item_name });
      } else {
        unmatched.push(r);
      }
    }

    setImportMatched(matched);
    setImportUnmatched(unmatched);
  }

  async function onPickImportFile(file: File) {
    setImportCsvName(file.name);

    const text = await file.text();
    const { headers, rows } = parseCsvText(text);

    const H = headers.map(normalizeHeader);
    const idx = (name: string) => H.indexOf(name);

    // Accept flexible columns:
    // cost_code OR item_name required, rate required
    const iCost = idx("cost_code");
    const iName = idx("item_name");
    const iVariant = idx("variant");
    const iRate = idx("rate");
    const iCur = idx("currency");
    const iUnit = idx("unit");
    const iCat = idx("category");
    const iType = idx("type"); // allow "type"
    const iItemType = idx("item_type"); // also allow "item_type"

    const parsed: ImportRow[] = rows
      .map((r, k) => {
        const cost_code = iCost >= 0 ? (r[iCost] || "").trim() : "";
        const item_name = iName >= 0 ? (r[iName] || "").trim() : "";
        const variant = iVariant >= 0 ? (r[iVariant] || "").trim() : "";
        const rate = iRate >= 0 ? toNum(r[iRate] || "") : null;
        const currency = (iCur >= 0 ? (r[iCur] || "").trim() : "JMD") || "JMD";
        const unit = iUnit >= 0 ? (r[iUnit] || "").trim() : "";
        const category = iCat >= 0 ? (r[iCat] || "").trim() : "";
        const item_type =
          iItemType >= 0 ? (r[iItemType] || "").trim()
          : iType >= 0 ? (r[iType] || "").trim()
          : "";

        return {
          rowNum: k + 2, // header is row 1
          cost_code,
          item_name,
          rate,
          currency,
          unit: unit || undefined,
          category: category || undefined,
          item_type: item_type || undefined,
        };
      })
      .filter((r) => (r.cost_code || r.item_name)); // keep rows that have an identifier

    setImportRows(parsed);
    computeImportMatches(parsed);
  }

  async function applyImport() {
    if (importMatched.length === 0) return;

    setBusy(true);
    try {
      // 1) create batch
      const { data: batch, error: bErr } = await supabase
        .from("rate_update_batches")
        .insert({
          title: importTitle || "CSV import",
          reason: importReason || null,
        })
        .select("id")
        .single();

      if (bErr) {
        console.error("batch insert error:", bErr);
        alert(bErr.message);
        return;
      }

      const batchId = batch.id as string;

      // 2) insert rates (history ledger)
      const payload = importMatched.map((m) => ({
        cost_item_id: m.matchId,
        rate: m.src.rate,
        currency: (m.src.currency || "JMD").toUpperCase(),
        effective_date: importEffectiveDate,
        source: "import",
        batch_id: batchId,
        note: importReason || `CSV: ${importCsvName || "import"}`,
      }));

      const { error: rErr } = await supabase.from("cost_item_rates").insert(payload);

      if (rErr) {
        console.error("rates insert error:", rErr);
        alert(rErr.message);
        return;
      }

      // Push to undo stack (so Undo Last Bulk can undo import too)
      setLastBulkBatches((prev) => [batchId, ...prev].slice(0, 10));

      closeImport();
      await reload();
      console.log("Import batch created:", batchId);
    } finally {
      setBusy(false);
    }
  }

  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCode, setFCode] = useState("");
  const [fVariant, setFVariant] = useState("");
  const [fCategory, setFCategory] = useState<string>(STANDARD_CATEGORIES[0] ?? "Uncategorized");
  const [fType, setFType] = useState<string>(ITEM_TYPES[0]);
  const [fUnit, setFUnit] = useState<string>("each");
  const [fRate, setFRate] = useState<string>("");
  const [fCalcJson, setFCalcJson] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [previewMsg, setPreviewMsg] = useState<string>("");
  const [formulaType, setFormulaType] = useState<string>("");
  const [formulaInput, setFormulaInput] = useState<string>("");
  const [formulaPreview, setFormulaPreview] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();
        if (profile?.company_id && alive) {
          setCompanyId(profile.company_id);
        }
      }

      const baseSelect = "id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";
      const fullSelect = "id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";

      let resp = await supabase
        .from("v_cost_items_current")
        .select(fullSelect)
        .order("item_name", { ascending: true });

      console.log("RATE_LIBRARY_SOURCE: v_cost_items_current (initial)");
      console.log("RATE_LIBRARY_DATA", resp.data, resp.error);

      if (resp.error) {
        console.error("RatesPage load error (fullSelect):", resp.error);
        alert("Rates load failed: " + (resp.error.message || JSON.stringify(resp.error)));
        resp = await supabase
          .from("v_cost_items_current")
          .select(baseSelect)
          .order("item_name", { ascending: true });
        if (resp.error) {
          console.error("RatesPage load error (baseSelect):", resp.error);
          alert("Rates load failed: " + (resp.error.message || JSON.stringify(resp.error)));
        }
      }

      if (!alive) return;

      // Merge variant data from cost_items
      const items = resp.data as any[];
      if (items && items.length > 0) {
        const ids = items.map(item => item.id);
        const variants = await supabase
          .from("cost_items")
          .select("id,variant")
          .in("id", ids);

        if (variants.data && !variants.error) {
          const variantMap = new Map(variants.data.map((v: any) => [v.id, v.variant]));
          const itemsWithVariants = items.map(item => ({
            ...item,
            variant: (variantMap.get(item.id) || "") as string
          }));
          setItems(itemsWithVariants as CostItem[]);
        } else {
          const itemsWithVariants = items.map(item => ({
            ...item,
            variant: "" as string
          }));
          setItems(itemsWithVariants as CostItem[]);
        }
      } else {
        setItems([]);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Make load() available for Save handler
  const reload = () => {
    let alive = true;

    async function load() {
      setLoading(true);
      const baseSelect = "id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";
      const fullSelect = "id,item_name,description,cost_code,unit,category,item_type,updated_at,calc_engine_json,current_rate,current_currency,current_effective_date,current_source,current_batch_id";

      let resp = await supabase
        .from("v_cost_items_current")
        .select(fullSelect)
        .order("item_name", { ascending: true });

      console.log("RATE_LIBRARY_SOURCE: v_cost_items_current (reload)");
      console.log("RATE_LIBRARY_DATA", resp.data, resp.error);

      if (resp.error) {
        console.error("RatesPage load error (fullSelect):", resp.error);
        alert("Rates load failed: " + (resp.error.message || JSON.stringify(resp.error)));
        resp = await supabase
          .from("v_cost_items_current")
          .select(baseSelect)
          .order("item_name", { ascending: true });
        if (resp.error) {
          console.error("RatesPage load error (baseSelect):", resp.error);
          alert("Rates load failed: " + (resp.error.message || JSON.stringify(resp.error)));
        }
      }

      if (!alive) return;

      // Merge variant data from cost_items
      const items = resp.data as any[];
      if (items && items.length > 0) {
        const ids = items.map(item => item.id);
        const variants = await supabase
          .from("cost_items")
          .select("id,variant")
          .in("id", ids);

        if (variants.data && !variants.error) {
          const variantMap = new Map(variants.data.map((v: any) => [v.id, v.variant]));
          const itemsWithVariants = items.map(item => ({
            ...item,
            variant: (variantMap.get(item.id) || "") as string
          }));
          setItems(itemsWithVariants as CostItem[]);
        } else {
          const itemsWithVariants = items.map(item => ({
            ...item,
            variant: "" as string
          }));
          setItems(itemsWithVariants as CostItem[]);
        }
      } else {
        setItems([]);
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  };

  useEffect(() => {
    if (!isModalOpen) return;
    if (!autoCode) return;

    const gen = nextCodeFor(fCategory || "Uncategorized", fType || "Other", items);
    setFCode(gen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, autoCode, fCategory, fType]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement;
      // close if clicking outside any export panel
      if (!t.closest("[data-export-menu]")) setExportOpen(false);
    }
    if (exportOpen) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportOpen]);

  // ✅ Options: standard first (stable order), then extras (alphabetical)
  const categoryOptions = useMemo(() => {
    const base = [...STANDARD_CATEGORIES];
    const baseSet = new Set<string>(base);
    const extras: string[] = [];

    for (const it of items) {
      const c = normCategory(it.category);
      if (!baseSet.has(c)) extras.push(c);
    }

    const uniqueExtras = Array.from(new Set(extras)).sort((a, b) =>
      a.localeCompare(b)
    );

    return [...base, ...uniqueExtras];
  }, [items]);

  const unitOptions = useMemo(() => {
    const base = Array.from(new Set(STANDARD_UNITS as unknown as string[]));
    const baseSet = new Set<string>(base);
    const extras: string[] = [];

    for (const it of items) {
      const u = (it.unit || "").trim();
      if (u && !baseSet.has(u)) extras.push(u);
    }

    extras.sort((a,b) => a.localeCompare(b));
    return [...base, ...Array.from(new Set(extras))];
  }, [items]);

  function openAdd() {
    setMode("add");
    setActiveId(null);
    setFName("");
    setFDesc("");
    setFCode((prev) => {
      // generate only if empty or autoCode enabled
      const cat = STANDARD_CATEGORIES[0] ?? "Uncategorized";
      const typ = ITEM_TYPES[0];
      const gen = nextCodeFor(cat, typ, items);
      return autoCode ? gen : prev;
    });
    setFCategory(STANDARD_CATEGORIES[0] ?? "Uncategorized");
    setFType(ITEM_TYPES[0]);
    setFUnit(unitOptions[0] ?? "each");
    setFRate("");
    setIsModalOpen(true);
  }

  function openEdit(item: CostItem) {
    setMode("edit");
    setActiveId(item.id);
    setFName(item.item_name || "");
    setFDesc(item.description || "");
    setFCode(item.cost_code || "");
    setFCategory(normCategory(item.category));
    setFType(item.item_type || ITEM_TYPES[0]);
    setFUnit((item.unit || "").trim() || (unitOptions[0] ?? "each"));
    setFRate(item.current_rate == null ? "" : String(item.current_rate));
    setFVariant(item.variant || "");
    
    // Parse calc_engine_json if exists
    const calcJson = (item as any).calc_engine_json;
    if (calcJson) {
      try {
        const parsed = typeof calcJson === 'string' ? JSON.parse(calcJson) : calcJson;
        if (parsed.vars && parsed.vars.length > 0) {
          if (parsed.vars.some((v: any) => v.key === 'length')) {
            setFormulaType('length');
            setFormulaInput(parsed.formulas?.qty || 'length');
          } else if (parsed.vars.some((v: any) => v.key === 'area')) {
            setFormulaType('area');
            setFormulaInput(parsed.formulas?.qty || 'area');
          } else if (parsed.vars.some((v: any) => v.key === 'volume') || (parsed.vars.length === 3 && parsed.vars.some((v: any) => v.key === 'length'))) {
            setFormulaType('volume');
            setFormulaInput(parsed.formulas?.qty || 'length * width * height');
          } else if (parsed.vars.some((v: any) => v.key === 'count')) {
            setFormulaType('count');
            setFormulaInput(parsed.formulas?.qty || 'count');
          } else {
            setFormulaType('');
            setFormulaInput('');
          }
        }
      } catch {
        setFormulaType('');
        setFormulaInput('');
      }
    } else {
      setFormulaType('');
      setFormulaInput('');
    }
    
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setFName("");
    setFDesc("");
    setFCode("");
    setFVariant("");
    setFCategory(STANDARD_CATEGORIES[0] ?? "Uncategorized");
    setFType(ITEM_TYPES[0]);
    setFUnit("each");
    setFRate("");
    setFormulaType("");
    setFormulaInput("");
    setFormulaPreview(null);
    setActiveId(null);
    setMode("add");
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((it) => {
      const cat = normCategory(it.category);

      if (categoryFilter !== "__ALL__" && cat !== categoryFilter) return false;

      const type = (it.item_type || "Other").trim();
      const safeType = (ITEM_TYPES as unknown as string[]).includes(type) ? type : "Other";
      if (!typeFilter[safeType]) return false;

      if (!q) return true;

      const name = (it.item_name || "").toLowerCase();
      const variant = (it.variant || "").toLowerCase();
      const unit = (it.unit || "").toLowerCase();
      const rateStr = it.current_rate == null ? "" : String(it.current_rate);

      return (
        name.includes(q) ||
          variant.includes(q) ||
          unit.includes(q) ||
          cat.toLowerCase().includes(q) ||
          rateStr.includes(q)
      );
    });
  }, [items, categoryFilter, search, typeFilter]);

  /** ✅ Bulk Update scope helpers (MUST be below filteredItems) */
  const selectedTypes = useMemo(() => {
    // If you don't have type toggles yet, default to all
    // If you DO have `typeFilter` state, it should be a Record<string, boolean>
    const anyTypeFilter = (typeof (typeFilter as any) !== "undefined") ? (typeFilter as any) : null;

    if (!anyTypeFilter) return [...ITEM_TYPES];

    const chosen = ITEM_TYPES.filter((t) => !!anyTypeFilter[t]);
    return chosen.length ? chosen : [...ITEM_TYPES];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* keep this if you have typeFilter: */ (typeof (typeFilter as any) !== "undefined") ? (typeFilter as any) : null]);

  const bulkTargetCount = useMemo(() => {
    return filteredItems.filter((x) => x.current_rate != null).length;
  }, [filteredItems]);

  function buildCalcJson(type: string, formula: string) {
    if (!type || !formula) return null;
    
    const base = { version: 1, qty_expr: "qty" };
    
    switch (type) {
      case 'length':
        return {
          ...base,
          vars: [{ key: "length", label: "Length" }],
          formulas: { qty: formula }
        };
      case 'area':
        return {
          ...base,
          vars: [{ key: "area", label: "Area" }],
          formulas: { qty: formula }
        };
      case 'volume':
        return {
          ...base,
          vars: [
            { key: "length" },
            { key: "width" },
            { key: "height" }
          ],
          formulas: { qty: formula }
        };
      case 'count':
        return {
          ...base,
          vars: [{ key: "count" }],
          formulas: { qty: formula }
        };
      default:
        return null;
    }
  }

  function previewFormula(type: string, formula: string) {
    if (!type || !formula) {
      setFormulaPreview(null);
      return;
    }
    
    let vars: any = {};
    switch (type) {
      case 'length':
        vars = { length: 10 };
        break;
      case 'area':
        vars = { area: 100 };
        break;
      case 'volume':
        vars = { length: 10, width: 5, height: 2 };
        break;
      case 'count':
        vars = { count: 1 };
        break;
    }
    
    const result = computeQuantity(formula, vars, { roundTo: 2, clampZero: true });
    setFormulaPreview(result.ok ? result.value : null);
  }

  async function saveRate(itemId: string, nextRate: number) {
    setBusy(true);
    try {
      const ratePayload = {
        cost_item_id: itemId,
        rate: nextRate,
        currency: "JMD",
        effective_date: new Date().toISOString().slice(0, 10),
        source: "manual_edit",
      };

      console.log("RATE_INSERTED", ratePayload);

      const { error } = await supabase
        .from("cost_item_rates")
        .insert(ratePayload);

      if (error) {
        console.error("Rate update error:", error);
        return;
      }

      // Reload data to get updated current rate
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(itemId: string, nextCategory: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("cost_items")
        .update({ category: nextCategory })
        .eq("id", itemId);

      if (error) {
        console.error("Category update error:", error);
        return;
      }

      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((r) =>
          r.id === itemId ? { ...r, category: nextCategory, updated_at: nowIso } : r
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveItemType(itemId: string, nextType: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("cost_items")
        .update({ item_type: nextType })
        .eq("id", itemId);

      if (error) {
        console.error(
          "Item type update error (column may not exist yet):",
          error
        );
        return;
      }

      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((r) =>
          r.id === itemId ? { ...r, item_type: nextType, updated_at: nowIso } : r
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveDescription(itemId: string, nextDesc: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("cost_items")
        .update({ description: nextDesc })
        .eq("id", itemId);

      if (error) {
        console.error("Description update error (column may not exist yet):", error);
        return;
      }

      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((r) =>
          r.id === itemId ? { ...r, description: nextDesc, updated_at: nowIso } : r
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCostCode(itemId: string, nextCode: string) {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("cost_items")
        .update({ cost_code: nextCode })
        .eq("id", itemId);

      if (error) {
        console.error("Cost code update error (column may not exist yet):", error);
        return;
      }

      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((r) =>
          r.id === itemId ? { ...r, cost_code: nextCode, updated_at: nowIso } : r
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold">Rate Library</h1>
          <div className="text-sm opacity-70">
            Cost items, categories, units, last-updated, rate history.
          </div>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-2">
          <button
            className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-3 py-2 text-sm transition"
            type="button"
            onClick={openAdd}
            disabled={busy}
          >
            Add Rate
          </button>
          <div className="relative" data-export-menu>
          <button
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm transition"
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            disabled={busy || loading || filteredItems.length === 0}
            title={filteredItems.length ? "Export options" : "Nothing to export"}
          >
            Export ▾
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-2 w-[260px] rounded-lg border border-white/10 bg-[#0b1220] shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2 text-xs opacity-70 border-b border-white/10">
                Exports respect Category + Search filters.
              </div>

              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  openImport();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Import CSV (preview)
              </button>

              <button
                type="button"
                onClick={() => {
                  downloadTemplateCurrentView();
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Download Template (Current View)
              </button>

              <div className="h-px bg-white/10" />

              <button
                type="button"
                onClick={() => {
                  exportCurrentViewCsv();
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Export Current View
              </button>

              <div className="h-px bg-white/10" />

              <button
                type="button"
                onClick={() => {
                  exportByTypeCsv("Material", "MaterialsOnly");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Materials only
              </button>

              <button
                type="button"
                onClick={() => {
                  exportByTypeCsv("Labor", "LaborOnly");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Labor only
              </button>

              <button
                type="button"
                onClick={() => {
                  exportByTypeCsv("Equipment", "EquipmentOnly");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Equipment only
              </button>

              <button
                type="button"
                onClick={() => {
                  exportByTypeCsv("Subcontract", "SubcontractOnly");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Subcontract only
              </button>

              <button
                type="button"
                onClick={() => {
                  exportByTypeCsv("Other", "OtherOnly");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Other only
              </button>

              <div className="h-px bg-white/10" />

              <button
                type="button"
                onClick={async () => {
                  await exportAllTypesSeparate();
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10"
              >
                Export ALL Types (separate files)
              </button>

              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 opacity-80"
              >
                Close
              </button>
            </div>
          )}
        </div>
          <button
            className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-3 py-2 text-sm transition"
            type="button"
            onClick={openBulk}
            disabled={busy}
          >
            Bulk Update
          </button>
          <button
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm transition"
            type="button"
            onClick={undoLastBulk}
            disabled={busy || lastBulkBatches.length === 0}
            title={lastBulkBatches.length ? `Last: ${lastBulkBatches[0]}` : "No bulk batch yet"}
          >
            Undo Last Bulk
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm opacity-80">Category</div>
        <CategoryCombobox
          value={categoryFilter}
          options={categoryOptions}
          onChange={setCategoryFilter}
        />

        <div className="text-sm opacity-80 ml-2">Search</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item, category, unit, or rate…"
          className="flex-1 min-w-[260px] bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
        />

        <div className="text-sm opacity-70 ml-auto">
          {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-sm opacity-80 mr-2">Type</div>

        <button
          type="button"
          onClick={() => setAllTypes(true)}
          className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-xs"
        >
          All
        </button>

        <button
          type="button"
          onClick={() => setAllTypes(false)}
          className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-2 text-xs"
        >
          None
        </button>

        {ITEM_TYPES.map((t) => {
          const on = !!typeFilter[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              onDoubleClick={() => setOnlyType(t)}  // PlanSwift-like: double-click isolates
              className={[
                "border rounded-md px-3 py-2 text-xs transition",
                on
                  ? "bg-white/15 border-white/20"
                  : "bg-white/5 border-white/10 opacity-70 hover:opacity-100 hover:bg-white/10",
              ].join(" ")}
              title="Click to toggle. Double-click to show only this type."
            >
              {t}
            </button>
          );
        })}

        <div className="text-xs opacity-60 ml-auto">
          {selectedTypeCount} selected
        </div>
      </div>

      {/* Table */}
      <div className="border border-white/10 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm opacity-70">Loading rates...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left border-b border-white/10">
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Variant</th>
                  <th className="py-3 px-4">Cost Code</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Rate</th>
                  <th className="py-3 px-4">Actions</th>
                  <th className="py-3 px-4">Last Updated</th>
                </tr>
              </thead>

              <tbody>
  {filteredItems.map((item) => {
    const calcJson = (item as any).calc_engine_json;
    let formulaBadge = null;
    
    if (calcJson) {
      try {
        const parsed = typeof calcJson === 'string' ? JSON.parse(calcJson) : calcJson;
        if (parsed.vars && parsed.vars.length > 0) {
          const varKeys = parsed.vars.map((v: any) => v.key);
          if (varKeys.includes('count')) {
            formulaBadge = <span className="px-2 py-1 text-[10px] bg-orange-500/20 text-orange-300 rounded">Count</span>;
          } else if (varKeys.includes('area')) {
            formulaBadge = <span className="px-2 py-1 text-[10px] bg-green-500/20 text-green-300 rounded">Area</span>;
          } else if (varKeys.includes('length') && varKeys.includes('width') && varKeys.includes('height')) {
            formulaBadge = <span className="px-2 py-1 text-[10px] bg-purple-500/20 text-purple-300 rounded">Volume</span>;
          } else if (varKeys.includes('length')) {
            formulaBadge = <span className="px-2 py-1 text-[10px] bg-blue-500/20 text-blue-300 rounded">Length</span>;
          }
        }
      } catch {
        // Invalid JSON, show no badge
      }
    }

    return (
      <tr key={item.id} className="border-b border-white/5">
        {/* Item */}
        <td className="py-3 px-4">
          <div className="font-medium">{item.item_name}</div>
          <div className="mt-1 flex items-center gap-2">
            {formulaBadge || <span className="px-2 py-1 text-[10px] opacity-30 rounded">No formula</span>}
          </div>
        </td>

        {/* Description */}
        <td className="py-3 px-4">
          {editingDescId === item.id ? (
            <input
              autoFocus
              value={editingDescValue}
              onChange={(e) => setEditingDescValue(e.target.value)}
              onBlur={() => setEditingDescId(null)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") return setEditingDescId(null);
                if (e.key === "Enter") {
                  await saveDescription(item.id, editingDescValue);
                  setEditingDescId(null);
                }
              }}
              className="bg-white/5 border border-white/10 rounded px-2 py-1 w-[320px] max-w-[45vw] outline-none focus:ring-1 focus:ring-white/20"
              placeholder="—"
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingDescId(item.id);
                setEditingDescValue(item.description || "");
              }}
              className="text-left cursor-pointer hover:opacity-80 disabled:opacity-50 w-[320px] max-w-[45vw] truncate"
              title={item.description || ""}
            >
              {item.description ? item.description : "—"}
            </button>
          )}
        </td>

        {/* Variant */}
        <td className="py-3 px-4">{item.variant || "—"}</td>

        {/* Cost Code */}
        <td className="py-3 px-4">
          {editingCodeId === item.id ? (
            <input
              autoFocus
              value={editingCodeValue}
              onChange={(e) => setEditingCodeValue(e.target.value)}
              onBlur={() => setEditingCodeId(null)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") return setEditingCodeId(null);
                if (e.key === "Enter") {
                  await saveCostCode(item.id, editingCodeValue.trim());
                  setEditingCodeId(null);
                }
              }}
              className="bg-white/5 border border-white/10 rounded px-2 py-1 w-44 outline-none focus:ring-1 focus:ring-white/20"
              placeholder="—"
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingCodeId(item.id);
                setEditingCodeValue(item.cost_code || "");
              }}
              className="cursor-pointer hover:opacity-80 disabled:opacity-50"
              title="Click to edit cost code"
            >
              {item.cost_code ? item.cost_code : "—"}
            </button>
          )}
        </td>

        {/* Category */}
        <td className="py-3 px-4">
          {editingCatId === item.id ? (
            <select
              autoFocus
              value={editingCatValue}
              onChange={(e) => setEditingCatValue(e.target.value)}
              onBlur={() => setEditingCatId(null)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") setEditingCatId(null);
                if (e.key === "Enter") {
                  const v = (editingCatValue || "").trim() || "Uncategorized";
                  await saveCategory(item.id, v);
                  setEditingCatId(null);
                }
              }}
              className="bg-[#0b1220] border border-white/10 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-white/20"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingCatId(item.id);
                setEditingCatValue(normCategory(item.category));
              }}
              className="cursor-pointer hover:opacity-80 disabled:opacity-50"
              title="Click to edit category"
            >
              {normCategory(item.category)}
            </button>
          )}
        </td>

        {/* Type */}
        <td className="py-3 px-4">
          {editingTypeId === item.id ? (
            <select
              autoFocus
              value={editingTypeValue}
              onChange={(e) => setEditingTypeValue(e.target.value)}
              onBlur={() => setEditingTypeId(null)}
              onKeyDown={async (e) => {
                if (e.key === "Escape") setEditingTypeId(null);
                if (e.key === "Enter") {
                  await saveItemType(item.id, editingTypeValue || "Other");
                  setEditingTypeId(null);
                }
              }}
              className="bg-[#0b1220] border border-white/10 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-white/20"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingTypeId(item.id);
                setEditingTypeValue(item.item_type || "Material");
              }}
              className="cursor-pointer hover:opacity-80 disabled:opacity-50"
              title="Click to edit type"
            >
              {item.item_type || "-"}
            </button>
          )}
        </td>

        {/* Unit */}
        <td className="py-3 px-4">{item.unit || "-"}</td>

        {/* Rate */}
        <td className="py-3 px-4">{formatMoney(item.current_rate)}</td>

        {/* Actions */}
        <td className="py-3 px-4">
          <div className="flex gap-2">
            <button
              type="button"
              className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-3 py-1 text-xs"
              onClick={() => openEdit(item)}
              disabled={busy}
            >
              Edit
            </button>
            <button
              type="button"
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-1 text-xs"
              onClick={async () => {
                if (!confirm("Delete this rate?")) return;
                setBusy(true);
                try {
                  const { error } = await supabase
                    .from("cost_items")
                    .delete()
                    .eq("id", item.id);
                  if (error) {
                    console.error("Delete error:", error);
                    return;
                  }
                  setItems((prev) => prev.filter((r) => r.id !== item.id));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </td>

        {/* Last Updated */}
        <td className="py-3 px-4">{formatDate(item.updated_at)}</td>
      </tr>
    );
  })}

  {filteredItems.length === 0 && (
    <tr>
      <td className="py-8 px-4 text-sm opacity-70" colSpan={10}>
        No results.
      </td>
    </tr>
  )}
</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-base font-semibold">
                {mode === "add" ? "Add Rate" : "Edit Rate"}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {mode === "add" && companyId && (
                <div className="pb-4 border-b border-white/10">
                  <SmartItemSelectorButton
                    companyId={companyId}
                    onSelect={(selection) => {
                      if (selection.itemName) setFName(selection.itemName);
                      if (selection.category) setFCategory(selection.category);
                      if (selection.unit) setFUnit(selection.unit);
                      if (selection.variant) {
                        setFVariant(selection.variant);
                      }
                      if (selection.currentRate !== null) {
                        setFRate(selection.currentRate.toString());
                      }
                    }}
                    className="w-full"
                    label="🪄 Use Smart Selector (Guided Selection)"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs opacity-70 mb-1">Item</div>
                  <input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. Ready Mix Concrete"
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Variant</div>
                  <input
                    value={fVariant}
                    onChange={(e) => setFVariant(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. 2x4x16 Treated or 6&quot; Standard Grey"
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Cost Code</div>
                  <input
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. CON-001"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      id="autoCode"
                      type="checkbox"
                      checked={autoCode}
                      onChange={(e) => setAutoCode(e.target.checked)}
                    />
                    <label htmlFor="autoCode" className="text-xs opacity-70">
                      Auto-generate Cost Code from Type + Category
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Category</div>
                  <select
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {STANDARD_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Type</div>
                  <select
                    value={fType}
                    onChange={(e) => setFType(e.target.value)}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Unit</div>
                  <select
                    value={fUnit}
                    onChange={(e) => setFUnit(e.target.value)}
                    className="w-full bg-[#0b1220] border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Rate</div>
                  <input
                    value={fRate}
                    onChange={(e) => setFRate(e.target.value)}
                    type="number"
                    step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. 18500"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Description</div>
              {/* Advanced: Calculator Engine */}
              <div className="mt-3 border border-white/10 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v: boolean) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-white/5 hover:bg-white/10 transition"
                >
                  <div className="text-sm font-semibold">Advanced</div>
                  <div className="opacity-70">{showAdvanced ? "▾" : "▸"}</div>
                </button>

                {showAdvanced && (
                  <div className="p-4 bg-[#07101d] space-y-3">
                    <div>
                      <div className="text-xs opacity-70 mb-1">Formula Type</div>
                      <select
                        value={formulaType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setFormulaType(newType);
                          
                          // Set default formula based on type
                          let defaultFormula = '';
                          switch (newType) {
                            case 'length':
                              defaultFormula = 'length';
                              break;
                            case 'area':
                              defaultFormula = 'area';
                              break;
                            case 'volume':
                              defaultFormula = 'length * width * height';
                              break;
                            case 'count':
                              defaultFormula = 'count';
                              break;
                          }
                          setFormulaInput(defaultFormula);
                          previewFormula(newType, defaultFormula);
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                      >
                        <option value="">Select formula type...</option>
                        <option value="length">Length</option>
                        <option value="area">Area</option>
                        <option value="volume">Volume</option>
                        <option value="count">Count</option>
                      </select>
                    </div>
                    
                    {formulaType && (
                      <div>
                        <div className="text-xs opacity-70 mb-1">Formula</div>
                        <input
                          value={formulaInput}
                          onChange={(e) => {
                            setFormulaInput(e.target.value);
                            previewFormula(formulaType, e.target.value);
                          }}
                          placeholder="Enter formula..."
                          className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20 font-mono"
                        />
                        <div className="text-[11px] opacity-60 mt-1">
                          Variables: {formulaType === 'volume' ? 'length, width, height' : formulaType}
                        </div>
                      </div>
                    )}
                    
                    {formulaPreview !== null && (
                      <div className="flex items-center gap-2">
                        <div className="text-xs opacity-70">Preview Quantity:</div>
                        <div className="text-sm font-semibold text-green-400">
                          {formulaPreview.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

                <input
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={closeModal}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy || !fName.trim()}
                onClick={async () => {
                  const name = fName.trim();
                  if (!name) return;

                  const payload = {
                    item_name: fName.trim(),
                    description: fDesc.trim() || null,
                    variant: fVariant.trim() || null,
                    cost_code: fCode.trim() || null,
                    category: (fCategory || "Uncategorized").trim(),
                    item_type: (fType || "Other").trim(),
                    unit: (fUnit || "each").trim(),
                    updated_at: new Date().toISOString(),
                  };

                  // Calculator Engine JSON (optional)
                  let calc_engine_json: any = null;
                  if (formulaType && formulaInput) {
                    calc_engine_json = buildCalcJson(formulaType, formulaInput);
                  }

                  (payload as any).calc_engine_json = calc_engine_json;

                  setBusy(true);
                  try {
                    if (mode === "add") {
                      // Insert into cost_items (without unit_rate)
                      const { data: newItem, error: insertError } = await supabase
                        .from("cost_items")
                        .insert(payload)
                        .select("id,item_name,description,cost_code,category,item_type,unit,updated_at")
                        .single();

                      if (insertError) {
                        console.error("Insert error:", insertError);
                        return;
                      }

                      // Insert rate into cost_item_rates if provided
                      if (fRate.trim()) {
                        const ratePayload = {
                          cost_item_id: (newItem as any).id,
                          rate: Number(fRate),
                          currency: "JMD",
                          effective_date: new Date().toISOString().slice(0, 10),
                          source: "manual",
                          note: null
                        };

                        const { error: rateError } = await supabase
                          .from("cost_item_rates")
                          .insert(ratePayload);

                        if (rateError) {
                          console.error("Rate insert error:", rateError);
                        }
                      }

                      // Reload data
                      reload();
                      closeModal();
                    } else {
                      if (!activeId) return;

                      // Update cost_items (without unit_rate)
                      const { data: updatedItem, error: updateError } = await supabase
                        .from("cost_items")
                        .update(payload)
                        .eq("id", activeId)
                        .select("id,item_name,description,cost_code,category,item_type,unit,updated_at")
                        .single();

                      if (updateError) {
                        console.error("Update error:", updateError);
                        return;
                      }

                      // Insert new rate if provided
                      if (fRate.trim()) {
                        const ratePayload = {
                          cost_item_id: activeId,
                          rate: Number(fRate),
                          currency: "JMD",
                          effective_date: new Date().toISOString().slice(0, 10),
                          source: "manual",
                          note: null
                        };

                        const { error: rateError } = await supabase
                          .from("cost_item_rates")
                          .insert(ratePayload);

                        if (rateError) {
                          console.error("Rate insert error:", rateError);
                        }
                      }

                      // Reload data
                      reload();
                      closeModal();
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {mode === "add" ? "Save" : "Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-base font-semibold">Bulk Update Rates</div>
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="text-sm opacity-80">
                This will update <b>{bulkTargetCount}</b> item(s) in the current view (only items with an existing rate).
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">Title (batch name)</div>
                  <input
                    value={bulkTitle}
                    onChange={(e) => setBulkTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. Materials +8% March 2026"
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Reason / Note (optional)</div>
                  <input
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. Supplier price increase"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs opacity-70 mb-1">Mode</div>
                    <select
                      value={bulkMode}
                      onChange={(e) => setBulkMode(e.target.value as any)}
                      className="w-full bg-[#0b1220] border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    >
                      <option value="percent">Percent (+/- %)</option>
                      <option value="add">Add amount (+/-)</option>
                      <option value="set">Set value</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs opacity-70 mb-1">
                      Value {bulkMode === "percent" ? "(e.g. 8 or -3)" : bulkMode === "add" ? "(e.g. 250 or -100)" : "(e.g. 18500)"}
                    </div>
                    <input
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      type="number"
                      step="0.01"
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                      placeholder={bulkMode === "percent" ? "8" : bulkMode === "add" ? "250" : "18500"}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Effective Date</div>
                  <input
                    type="date"
                    value={bulkEffectiveDate}
                    onChange={(e) => setBulkEffectiveDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>

                <div className="text-xs opacity-60">
                  Scope: current Category filter + currently selected Type toggles.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy || !bulkValue.trim() || bulkTargetCount === 0}
                onClick={applyBulk}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="text-base font-semibold">Import CSV (Preview)</div>
              <button type="button" onClick={closeImport} className="opacity-70 hover:opacity-100">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  onPickImportFile(f);
                  e.currentTarget.value = ""; // allow re-pick same file
                }}
              />

              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[260px]">
                  <div className="text-xs opacity-70 mb-1">Batch Title</div>
                  <input
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. Rapid True Value price list update"
                  />
                </div>

                <div className="flex-1 min-w-[260px]">
                  <div className="text-xs opacity-70 mb-1">Reason / Note</div>
                  <input
                    value={importReason}
                    onChange={(e) => setImportReason(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                    placeholder="e.g. Supplier increase"
                  />
                </div>

                <div className="min-w-[180px]">
                  <div className="text-xs opacity-70 mb-1">Effective Date</div>
                  <input
                    type="date"
                    value={importEffectiveDate}
                    onChange={(e) => setImportEffectiveDate(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm"
                  disabled={busy}
                >
                  Choose CSV
                </button>
              </div>

              <div className="text-sm opacity-80">
                File: <span className="opacity-100">{importCsvName || "—"}</span>
                <span className="ml-4 opacity-70">Rows: {importRows.length}</span>
                <span className="ml-4 opacity-70">Matched: {importMatched.length}</span>
                <span className="ml-4 opacity-70">Unmatched: {importUnmatched.length}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs bg-white/5 border-b border-white/10">
                    Matched (will update)
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5">
                        <tr className="text-left border-b border-white/10">
                          <th className="py-2 px-3">Row</th>
                          <th className="py-2 px-3">Cost Code</th>
                          <th className="py-2 px-3">CSV Item</th>
                          <th className="py-2 px-3">Variant</th>
                          <th className="py-2 px-3">Match</th>
                          <th className="py-2 px-3">Rate</th>
                          <th className="py-2 px-3">Cur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importMatched.slice(0, 200).map((m) => (
                          <tr key={m.src.rowNum} className="border-b border-white/5">
                            <td className="py-2 px-3 opacity-70">{m.src.rowNum}</td>
                            <td className="py-2 px-3">{m.src.cost_code || "—"}</td>
                            <td className="py-2 px-3">{m.src.item_name || "—"}</td>
                            <td className="py-2 px-3 opacity-80">{m.matchName}</td>
                            <td className="py-2 px-3">{m.src.rate ?? "—"}</td>
                            <td className="py-2 px-3">{(m.src.currency || "JMD").toUpperCase()}</td>
                          </tr>
                        ))}
                        {importMatched.length > 200 && (
                          <tr>
                            <td className="py-2 px-3 opacity-60" colSpan={6}>
                              Showing first 200 matches…
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 text-xs bg-white/5 border-b border-white/10">
                    Unmatched / Invalid (not applied)
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5">
                        <tr className="text-left border-b border-white/10">
                          <th className="py-2 px-3">Row</th>
                          <th className="py-2 px-3">Cost Code</th>
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-3">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importUnmatched.slice(0, 200).map((r) => (
                          <tr key={r.rowNum} className="border-b border-white/5">
                            <td className="py-2 px-3 opacity-70">{r.rowNum}</td>
                            <td className="py-2 px-3">{r.cost_code || "—"}</td>
                            <td className="py-2 px-3">{r.item_name || "—"}</td>
                            <td className="py-2 px-3">{r.rate ?? "—"}</td>
                          </tr>
                        ))}
                        {importUnmatched.length > 200 && (
                          <tr>
                            <td className="py-2 px-3 opacity-60" colSpan={4}>
                              Showing first 200 unmatched…
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="text-xs opacity-60">
                CSV columns supported: cost_code, item_name, rate, currency, unit, category, type/item_type
                (cost_code is best match; item_name is fallback).
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
              <button
                type="button"
                onClick={closeImport}
                className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm"
                disabled={busy || importMatched.length === 0}
                onClick={applyImport}
                title={importMatched.length ? "Apply matched updates as a batch" : "No matches to apply"}
              >
                Apply Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Small note */}
      <div className="mt-3 text-xs opacity-60">
        Tip: Click a rate to edit. Next upgrades: Add Rate modal, category editing, unit editing, import/export, rate history.
      </div>
    </div>
  );
}










