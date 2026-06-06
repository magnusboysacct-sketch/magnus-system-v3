// src/pages/BOQPage.tsx — Full Rebuild v2
// Fixes: denser rows, tighter pick column, better wand button, scope bg, scope inline
// All Supabase wiring 100% preserved.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Sparkles, X, Plus, Trash2, ChevronRight, ChevronDown,
  Save, CheckCircle, Layers, Package, FileSpreadsheet,
  ShoppingCart, Wand2, Download, RefreshCw, AlertCircle,
  FolderOpen, Hash, DollarSign, Search, ArrowLeft, Check, Boxes
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";
import { ImportTakeoffModal } from "../components/ImportTakeoffModal";
import { generateProcurementFromBOQ } from "../lib/procurement";
import { generateEstimateFromBOQ } from "../lib/estimates";
import { useProjectContext } from "../context/ProjectContext";
import { SmartItemSelector } from "../components/SmartItemSelector";
import AIAssistantPanel from "../components/AIAssistantPanel";
import { BOQSuggestionCard } from "../components/BOQSuggestionCard";
import { addSuggestionToBOQ, type BOQSuggestion } from "../lib/boqSuggestions";

// ─── Types ────────────────────────────────────────────────────────────────────

type RateItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  current_rate?: number | null;
  current_currency?: string | null;
};

type BOQItemRow = {
  id: string;
  pick_type: string;
  pick_category: string;
  pick_item: string;
  pick_variant: string;
  cost_item_id: string | null;
  item_name: string;
  description: string;
  unit_id: string | null;
  qty: number;
  rate: number;
};

type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
  collapsed?: boolean;
};

type AssemblyRow = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  category: string | null;
  is_active?: boolean | null;
};

type AssemblyComponentRow = {
  id: string;
  assembly_id: string;
  cost_item_id: string;
  line_type: string;
  quantity_factor: number;
  waste_percent: number;
  sort_order: number;
  notes: string | null;
};

type BoqHeaderRow = {
  id: string;
  project_id: string;
  status: string;
  version: number;
  updated_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeId() {
  try {
    const c: any = typeof crypto !== "undefined" ? crypto : null;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqSorted(values: string[]) {
  const set = new Set(values.map((v) => v.trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getCategoryId(c: any): string { return String(c?.id ?? ""); }
function getCategoryLabel(c: any): string { return String(c?.name ?? "Unnamed Category"); }
function getCategoryScope(c: any): string { return String(c?.scope_of_work ?? ""); }
function getUnitId(u: any): string { return String(u?.id ?? ""); }
function getUnitLabel(u: any): string { return String(u?.name ?? "Unit"); }

function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Type chip — color coded, compact
const TYPE_META: Record<string, { bg: string; text: string; border: string; short: string }> = {
  material:    { bg: "bg-blue-500/20",    text: "text-blue-300",    border: "border-blue-500/30",    short: "MAT" },
  labor:       { bg: "bg-amber-500/20",   text: "text-amber-300",   border: "border-amber-500/30",   short: "LAB" },
  labour:      { bg: "bg-amber-500/20",   text: "text-amber-300",   border: "border-amber-500/30",   short: "LAB" },
  equipment:   { bg: "bg-purple-500/20",  text: "text-purple-300",  border: "border-purple-500/30",  short: "EQP" },
  subcontract: { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/30", short: "SUB" },
  other:       { bg: "bg-slate-500/20",   text: "text-slate-400",   border: "border-slate-500/30",   short: "OTH" },
};

function TypeChip({ type }: { type: string }) {
  const key = type.toLowerCase();
  const m = TYPE_META[key] ?? TYPE_META.other;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${m.bg} ${m.text} ${m.border}`}>
      {m.short}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BOQPage() {
  const nav = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject: selectedProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [sections, setSections] = useState<Section[]>([]);
  const [boqId, setBoqId] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    routeProjectId || currentProjectId || resolveProjectId()
  );

  const [autoSaveOn] = useState(true);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);

  const { categories: masterCategories, units: masterUnits, loading: masterLoading, error: masterError } = useMasterLists();

  const canEdit = status === "draft";

  const usableCategories = useMemo(() => {
    const arr = Array.isArray(masterCategories) ? masterCategories : [];
    return arr.filter((c: any) => !!getCategoryId(c));
  }, [masterCategories]);

  const usableUnits = useMemo(() => {
    const arr = Array.isArray(masterUnits) ? masterUnits : [];
    return arr.filter((u: any) => !!getUnitId(u));
  }, [masterUnits]);

  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string>("");
  const [showSmartSelector, setShowSmartSelector] = useState(false);
  const [smartSelectorContext, setSmartSelectorContext] = useState<{ sectionId: string; rowId: string } | null>(null);

  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assemblyComponents, setAssemblyComponents] = useState<AssemblyComponentRow[]>([]);
  const [assemblyLoading, setAssemblyLoading] = useState(false);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);

  type AssemblyModalState = { open: boolean; sectionId: string | null; search: string; selectedAssemblyId: string; qty: string };
  const [asmModal, setAsmModal] = useState<AssemblyModalState>({ open: false, sectionId: null, search: "", selectedAssemblyId: "", qty: "1" });

  const [importTakeoffModal, setImportTakeoffModal] = useState<{ open: boolean; sectionId: string | null; itemId: string | null }>({ open: false, sectionId: null, itemId: null });

  const [aiSuggestionsModal, setAiSuggestionsModal] = useState<{ open: boolean; suggestions: BOQSuggestion[] }>({ open: false, suggestions: [] });
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  // ─── Data Loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    async function loadRateItems() {
      setRateLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).single();
        if (profile?.company_id && alive) setCompanyId(profile.company_id);
      }
      try {
        const { data, error } = await supabase
          .from("v_cost_items_current")
          .select("id,item_name,description,variant,unit,category,item_type,current_rate,current_currency")
          .order("item_name", { ascending: true }).limit(5000);
        if (error) throw error;
        if (!alive) return;
        setRateItems((data ?? []) as RateItem[]);
        setRateSource("v_cost_items_current");
        return;
      } catch (e: any) {
        console.warn("v_cost_items_current failed:", e?.message);
      } finally { if (alive) setRateLoading(false); }
      try {
        setRateLoading(true);
        const { data, error } = await supabase.from("cost_items")
          .select("id,item_name,description,variant,unit,category,item_type")
          .order("item_name", { ascending: true }).limit(5000);
        if (error) throw error;
        if (!alive) return;
        setRateItems((data ?? []) as RateItem[]);
        setRateSource("cost_items");
      } catch (e: any) {
        if (!alive) return;
        setRateError(e?.message ?? "Failed to load rate items");
        setRateItems([]);
      } finally { if (alive) setRateLoading(false); }
    }
    loadRateItems();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const groupsParam = searchParams.get("groups");
    if (!groupsParam) return;
    try {
      const takeoffGroups = JSON.parse(groupsParam);
      if (Array.isArray(takeoffGroups) && takeoffGroups.length > 0) {
        const newSection: Section = {
          id: safeId(), masterCategoryId: null, title: "Takeoff Import",
          scope: "Quantities imported from takeoff measurements",
          items: takeoffGroups.map((group: any) => ({
            id: safeId(), pick_type: "manual", pick_category: "", pick_item: "", pick_variant: "",
            cost_item_id: null, item_name: group.groupName || "Imported Item",
            description: `${group.metric} measurement`, unit_id: null,
            qty: Number(group.value) || 0, rate: 0,
          })),
        };
        setSections((prev) => [...prev, newSection]);
        setSearchParams({});
      }
    } catch (e) { console.error("Failed to parse takeoff groups:", e); }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let alive = true;
    async function loadAssemblies() {
      setAssemblyLoading(true);
      try {
        const { data: aData, error: aErr } = await supabase.from("assemblies")
          .select("id,name,description,unit,category,is_active")
          .order("name", { ascending: true }).limit(5000);
        if (aErr) throw aErr;
        const active = (Array.isArray(aData) ? aData : []).filter((a: any) => a?.is_active !== false);
        const list = active.map((a: any) => ({
          id: String(a.id), name: String(a.name ?? ""),
          description: a.description ? String(a.description) : null,
          unit: a.unit ? String(a.unit) : null,
          category: a.category ? String(a.category) : null,
          is_active: a.is_active ?? true
        })) as AssemblyRow[];
        const { data: cData, error: cErr } = await supabase.from("assembly_components")
          .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
          .order("assembly_id", { ascending: true }).order("sort_order", { ascending: true }).limit(20000);
        if (cErr) throw cErr;
        const comps = (Array.isArray(cData) ? cData : []).map((c: any) => ({
          id: String(c.id), assembly_id: String(c.assembly_id), cost_item_id: String(c.cost_item_id),
          line_type: String(c.line_type ?? "material"), quantity_factor: numOr(c.quantity_factor, 1),
          waste_percent: numOr(c.waste_percent, 0),
          sort_order: Number.isFinite(Number(c.sort_order)) ? Number(c.sort_order) : 0,
          notes: c.notes ? String(c.notes) : null
        })) as AssemblyComponentRow[];
        if (!alive) return;
        setAssemblies(list);
        setAssemblyComponents(comps);
      } catch (e: any) {
        if (!alive) return;
        setAssemblyError(e?.message ?? "Failed to load assemblies");
      } finally { if (alive) setAssemblyLoading(false); }
    }
    loadAssemblies();
    return () => { alive = false; };
  }, []);

  // ─── Persistence ───────────────────────────────────────────────────────────

  async function loadLatestBoqForProject(projectId: string) {
    setPersistLoading(true);
    setPersistError(null);
    try {
      const { data: headers, error: headerErr } = await supabase
        .from("boq_headers").select("id,project_id,status,version,updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .order("version", { ascending: false }).limit(1);
      if (headerErr) throw headerErr;
      const header = Array.isArray(headers) ? (headers[0] as BoqHeaderRow | undefined) : undefined;
      if (!header) { setBoqId(null); setStatus("draft"); setSections([]); return; }
      setBoqId(header.id);
      setStatus(header.status as "draft" | "approved");
      const { data: secRows, error: secErr } = await supabase
        .from("boq_sections").select("id,boq_id,sort_order,master_category_id,title,scope")
        .eq("boq_id", header.id).order("sort_order", { ascending: true });
      if (secErr) throw secErr;
      const secList = Array.isArray(secRows) ? secRows : [];
      const sectionIds = secList.map((s: any) => s.id).filter(Boolean);
      const itemsBySection = new Map<string, any[]>();
      if (sectionIds.length > 0) {
        const { data: itemRows, error: itemErr } = await supabase
          .from("boq_section_items")
          .select("id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate")
          .in("section_id", sectionIds).order("sort_order", { ascending: true });
        if (itemErr) throw itemErr;
        for (const r of (Array.isArray(itemRows) ? itemRows : [])) {
          const sid = String((r as any).section_id ?? "");
          if (!sid) continue;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(r);
        }
      }
      const rebuilt: Section[] = secList.map((s: any) => {
        const sid = String(s.id);
        const items: BOQItemRow[] = (itemsBySection.get(sid) ?? []).map((r: any) => ({
          id: String(r.id ?? safeId()), pick_type: String(r.pick_type ?? ""),
          pick_category: String(r.pick_category ?? ""), pick_item: String(r.pick_item ?? ""),
          pick_variant: String(r.pick_variant ?? ""),
          cost_item_id: r.cost_item_id ? String(r.cost_item_id) : null,
          item_name: String(r.item_name ?? ""), description: String(r.description ?? ""),
          unit_id: r.unit_id ? String(r.unit_id) : null,
          qty: numOr(r.qty, 0), rate: numOr(r.rate, 0)
        }));
        return {
          id: sid, masterCategoryId: s.master_category_id ? String(s.master_category_id) : null,
          title: String(s.title ?? "New Section"), scope: String(s.scope ?? ""),
          items, collapsed: false
        };
      });
      setSections(rebuilt);
    } catch (e: any) {
      setPersistError(e?.message ?? "Failed to load BOQ");
    } finally { setPersistLoading(false); }
  }

  async function saveBoqToSupabase(nextStatus: "draft" | "approved") {
    const projectId = activeProjectId ?? resolveProjectId();
    if (!projectId) { alert("Please select or create a project first."); return; }
    setPersistLoading(true);
    setPersistError(null);
    try {
      let headerId = boqId;
      let versionNumber = 1;
      let operationType: "INSERT" | "UPDATE" = "INSERT";
      if (!headerId) {
        const { data: existingBoqs, error: checkErr } = await supabase
          .from("boq_headers").select("id, version, status")
          .eq("project_id", projectId).order("version", { ascending: false }).limit(1);
        if (checkErr) throw checkErr;
        const existingBoq = Array.isArray(existingBoqs) && existingBoqs.length > 0 ? existingBoqs[0] : null;
        if (existingBoq) {
          if (nextStatus === "draft" && existingBoq.status === "draft") {
            headerId = String(existingBoq.id); versionNumber = numOr(existingBoq.version, 1); operationType = "UPDATE";
          } else { versionNumber = numOr(existingBoq.version, 0) + 1; operationType = "INSERT"; }
        }
      } else {
        operationType = "UPDATE";
        const { data: existingBoq, error: fetchErr } = await supabase
          .from("boq_headers").select("id, version, project_id").eq("id", headerId).single();
        if (fetchErr) throw fetchErr;
        versionNumber = numOr(existingBoq.version, 1);
        if (String(existingBoq.project_id) !== projectId) throw new Error("BOQ belongs to a different project!");
      }
      if (operationType === "INSERT") {
        const { data: versionCheck } = await supabase
          .from("boq_headers").select("id").eq("project_id", projectId).eq("version", versionNumber).maybeSingle();
        if (versionCheck) throw new Error(`BOQ version ${versionNumber} already exists.`);
        const { data: ins, error: insErr } = await supabase
          .from("boq_headers").insert([{ project_id: projectId, status: nextStatus, version: versionNumber }])
          .select("id, version").single();
        if (insErr) throw insErr;
        headerId = String((ins as any).id);
        setBoqId(headerId);
      } else {
        const { error: upErr } = await supabase
          .from("boq_headers").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", headerId);
        if (upErr) throw upErr;
      }
      const { error: delSecErr } = await supabase.from("boq_sections").delete().eq("boq_id", headerId);
      if (delSecErr) throw delSecErr;
      const sectionIdMapping = new Map<string, string>();
      if (sections.length > 0) {
        const sectionPayload = sections.map((s, idx) => ({
          boq_id: headerId, sort_order: idx,
          master_category_id: s.masterCategoryId, title: s.title ?? "New Section", scope: s.scope ?? ""
        }));
        const { data: insertedSections, error: secInsErr } = await supabase
          .from("boq_sections").insert(sectionPayload).select("id, sort_order");
        if (secInsErr) throw secInsErr;
        if (!insertedSections || insertedSections.length === 0) throw new Error("Failed to get inserted section IDs");
        insertedSections.forEach((dbSection) => {
          const clientSection = sections[dbSection.sort_order];
          if (clientSection) sectionIdMapping.set(clientSection.id, dbSection.id);
        });
      }
      const itemPayload: any[] = [];
      for (const s of sections) {
        const dbSectionId = sectionIdMapping.get(s.id);
        if (!dbSectionId) throw new Error(`Section ID mapping failed: ${s.title}`);
        for (let i = 0; i < s.items.length; i++) {
          const it = s.items[i];
          itemPayload.push({
            section_id: dbSectionId, sort_order: i,
            pick_type: it.pick_type ?? "", pick_category: it.pick_category ?? "",
            pick_item: it.pick_item ?? "", pick_variant: it.pick_variant ?? "",
            cost_item_id: it.cost_item_id, item_name: it.item_name ?? "",
            description: it.description ?? "", unit_id: it.unit_id,
            qty: numOr(it.qty, 0), rate: numOr(it.rate, 0)
          });
        }
      }
      if (itemPayload.length > 0) {
        const { error: itemInsErr } = await supabase.from("boq_section_items").insert(itemPayload).select("id, item_name");
        if (itemInsErr) throw itemInsErr;
      }
      setStatus(nextStatus);
      await supabase.rpc("sync_boq_budget_to_cost_events", { p_boq_id: headerId })
        .then(({ error }) => { if (error) console.error("BOQ budget sync failed:", error); });
      await loadLatestBoqForProject(projectId);
      if (autoSaveOn) setLastAutoSaveAt(new Date().toLocaleTimeString());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setPersistError(e?.message ?? "Failed to save BOQ");
      alert(e?.message ?? "Failed to save BOQ");
    } finally { setPersistLoading(false); }
  }

  useEffect(() => {
    const pid = activeProjectId;
    if (!pid) { setBoqId(null); setStatus("draft"); setSections([]); return; }
    void loadLatestBoqForProject(pid);
  }, [activeProjectId]);

  useEffect(() => {
    const nextProjectId = routeProjectId || currentProjectId || resolveProjectId() || null;
    setActiveProjectId(nextProjectId);
  }, [routeProjectId, currentProjectId]);

  useEffect(() => {
    if (routeProjectId && routeProjectId !== activeProjectId) setActiveProjectId(routeProjectId);
  }, [routeProjectId, activeProjectId]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  function addSection() {
    setSections((prev) => [...prev, { id: safeId(), masterCategoryId: null, title: "New Section", scope: "", items: [], collapsed: false }]);
  }

  function deleteSection(id: string) { setSections((prev) => prev.filter((s) => s.id !== id)); }

  function updateSection(id: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function toggleCollapse(id: string) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, collapsed: !s.collapsed } : s));
  }

  function onPickMasterCategory(sectionId: string, categoryId: string) {
    const cat = usableCategories.find((c: any) => getCategoryId(c) === categoryId);
    updateSection(sectionId, {
      masterCategoryId: categoryId,
      title: cat ? getCategoryLabel(cat) : "New Section",
      scope: cat ? getCategoryScope(cat) : ""
    });
  }

  function addItem(sectionId: string) {
    setSections((prev) => prev.map((s) => {
      if (s.id !== sectionId) return s;
      const row: BOQItemRow = {
        id: safeId(), pick_type: "", pick_category: "", pick_item: "", pick_variant: "",
        cost_item_id: null, item_name: "", description: "", unit_id: null, qty: 0, rate: 0
      };
      return { ...s, items: [...s.items, row] };
    }));
  }

  function deleteItem(sectionId: string, itemId: string) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : { ...s, items: s.items.filter((it) => it.id !== itemId) }));
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQItemRow>) {
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : {
      ...s, items: s.items.map((it) => it.id === itemId ? { ...it, ...patch } : it)
    }));
  }

  function handleImportTakeoff(_g: string, _m: string, value: number) {
    if (!importTakeoffModal.sectionId || !importTakeoffModal.itemId) return;
    updateItem(importTakeoffModal.sectionId, importTakeoffModal.itemId, { qty: value });
  }

  // ─── Assembly ──────────────────────────────────────────────────────────────

  function mapLineType(lineType: string) {
    const t = (lineType ?? "").toLowerCase();
    if (t === "material") return "Material";
    if (t === "labour" || t === "labor") return "Labor";
    if (t === "equipment") return "Equipment";
    if (t === "subcontract") return "Subcontract";
    return "Other";
  }

  function matchUnitId(unitName: string | null) {
    if (!unitName) return null;
    const u = usableUnits.find((x: any) => getUnitLabel(x).toLowerCase() === unitName.toLowerCase());
    return u ? getUnitId(u) : null;
  }

  function addAssembly(sectionId: string, assemblyId: string, qtyStr: string) {
    const qtyBase = numOr(qtyStr, 0);
    if (!sectionId || !assemblyId || qtyBase <= 0) { alert("Pick an assembly and enter qty > 0."); return; }
    const comps = assemblyComponents.filter((c) => c.assembly_id === assemblyId).sort((a, b) => a.sort_order - b.sort_order);
    if (comps.length === 0) { alert("This assembly has no components yet."); return; }
    const newRows: BOQItemRow[] = comps.map((c) => {
      const r = rateItems.find((x) => x.id === c.cost_item_id) ?? null;
      const finalQty = qtyBase * numOr(c.quantity_factor, 1) * (1 + numOr(c.waste_percent, 0) / 100);
      return {
        id: safeId(), pick_type: mapLineType(c.line_type),
        pick_category: (r?.category ?? "").trim(), pick_item: (r?.item_name ?? "").trim(),
        pick_variant: (r?.variant ?? "").trim(), cost_item_id: c.cost_item_id,
        item_name: r?.item_name ?? "",
        description: (r?.description ?? "").trim() ? (r?.description ?? "") : c.notes ?? "",
        unit_id: matchUnitId(r?.unit ?? null), qty: Number.isFinite(finalQty) ? finalQty : 0,
        rate: numOr(r?.current_rate ?? 0, 0)
      };
    });
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : { ...s, items: [...s.items, ...newRows] }));
    setAsmModal({ open: false, sectionId: null, search: "", selectedAssemblyId: "", qty: "1" });
  }

  // ─── Picker ────────────────────────────────────────────────────────────────

  type PickerStep = "type" | "category" | "item" | "variant";
  type PickerState = {
    open: boolean; sectionId: string | null; rowId: string | null;
    step: PickerStep; type: string; category: string; item: string; variant: string; search: string;
  };

  const [picker, setPicker] = useState<PickerState>({
    open: false, sectionId: null, rowId: null, step: "type",
    type: "", category: "", item: "", variant: "", search: ""
  });

  const typeOptions = useMemo(() => {
    const discovered = uniqSorted(rateItems.map((r) => (r.item_type ?? "").trim()).filter(Boolean));
    return uniqSorted([...["Material", "Labor", "Equipment", "Subcontract", "Other"], ...discovered]);
  }, [rateItems]);

  function itemsForType(type: string) {
    return !type ? rateItems : rateItems.filter((r) => (r.item_type ?? "").toLowerCase() === type.toLowerCase());
  }
  function catOpts(type: string) { return uniqSorted(itemsForType(type).map((r) => (r.category ?? "").trim()).filter(Boolean)); }
  function itemOpts(type: string, cat: string) {
    return uniqSorted(itemsForType(type).filter((r) => !cat || (r.category ?? "").toLowerCase() === cat.toLowerCase()).map((r) => (r.item_name ?? "").trim()).filter(Boolean));
  }
  function varOpts(type: string, cat: string, itemName: string) {
    return uniqSorted(itemsForType(type).filter((r) => {
      if (cat && (r.category ?? "").toLowerCase() !== cat.toLowerCase()) return false;
      if (itemName && (r.item_name ?? "").toLowerCase() !== itemName.toLowerCase()) return false;
      return true;
    }).map((r) => (r.variant ?? "").trim()).filter(Boolean));
  }
  function findRate(type: string, cat: string, itemName: string, variant: string | null) {
    const list = itemsForType(type).filter((r) => {
      if (cat && (r.category ?? "").toLowerCase() !== cat.toLowerCase()) return false;
      if (itemName && (r.item_name ?? "").toLowerCase() !== itemName.toLowerCase()) return false;
      return true;
    });
    if (variant) { const m = list.find((r) => (r.variant ?? "").toLowerCase() === variant.toLowerCase()); if (m) return m; }
    return list[0] ?? null;
  }

  function openPicker(sectionId: string, rowId: string) {
    const row = sections.find((s) => s.id === sectionId)?.items.find((x) => x.id === rowId);
    setPicker({ open: true, sectionId, rowId, step: "type", type: row?.pick_type ?? "", category: row?.pick_category ?? "", item: row?.pick_item ?? "", variant: row?.pick_variant ?? "", search: "" });
  }

  const pickerOpts = useMemo(() => {
    if (!picker.open) return { list: [] as string[], hasNone: false };
    const q = picker.search.trim().toLowerCase();
    const f = (arr: string[]) => !q ? arr : arr.filter((x) => x.toLowerCase().includes(q));
    if (picker.step === "type") return { list: f(typeOptions), hasNone: false };
    if (picker.step === "category") return { list: f(catOpts(picker.type)), hasNone: false };
    if (picker.step === "item") return { list: f(itemOpts(picker.type, picker.category)), hasNone: false };
    const vl = varOpts(picker.type, picker.category, picker.item);
    return { list: f(vl), hasNone: vl.length === 0 };
  }, [picker.open, picker.step, picker.search, picker.type, picker.category, picker.item, typeOptions, rateItems]);

  async function fetchLatestRate(costItemId: string): Promise<number | null> {
    try {
      const { data, error } = await supabase.from("cost_item_rates")
        .select("rate,effective_date").eq("cost_item_id", costItemId)
        .order("effective_date", { ascending: false }).limit(1);
      if (error) throw error;
      const rate = (Array.isArray(data) ? data[0] : null)?.rate;
      return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    } catch { return null; }
  }

  async function applyRate(sectionId: string, rowId: string, r: RateItem | null) {
    if (!r) return;
    const pickedUnitId = matchUnitId(r.unit ?? null);
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : {
      ...s, items: s.items.map((it) => {
        if (it.id !== rowId) return it;
        const next: BOQItemRow = { ...it, cost_item_id: r.id, item_name: it.item_name.trim() ? it.item_name : r.item_name };
        if (!next.description.trim()) next.description = r.description ?? "";
        if (!next.unit_id && pickedUnitId) next.unit_id = pickedUnitId;
        const viewRate = numOr(r.current_rate ?? 0, 0);
        if (numOr(next.rate) === 0 && viewRate) next.rate = viewRate;
        return next;
      })
    }));
    const hasViewRate = typeof r.current_rate === "number" && Number.isFinite(r.current_rate) && r.current_rate > 0;
    if (hasViewRate) return;
    const latest = await fetchLatestRate(r.id);
    if (!latest) return;
    setSections((prev) => prev.map((s) => s.id !== sectionId ? s : {
      ...s, items: s.items.map((it) => it.id !== rowId ? it : (numOr(it.rate) !== 0 ? it : { ...it, rate: latest }))
    }));
  }

  async function finalizePick(variantValue: string) {
    if (!picker.open || !picker.sectionId || !picker.rowId) return;
    const [ft, fc, fi, fv] = [picker.type.trim(), picker.category.trim(), picker.item.trim(), variantValue.trim()];
    setSections((prev) => prev.map((s) => s.id !== picker.sectionId ? s : {
      ...s, items: s.items.map((it) => it.id !== picker.rowId ? it : {
        ...it, pick_type: ft, pick_category: fc, pick_item: fi, pick_variant: fv,
        item_name: it.item_name.trim() ? it.item_name : fi
      })
    }));
    const r = findRate(ft, fc, fi, fv || null);
    await applyRate(picker.sectionId, picker.rowId, r);
    setPicker({ open: false, sectionId: null, rowId: null, step: "type", type: "", category: "", item: "", variant: "", search: "" });
  }

  function openSmartSelector(sectionId: string, rowId: string) { setSmartSelectorContext({ sectionId, rowId }); setShowSmartSelector(true); }

  function handleSmartSelection(selection: any) {
    if (!smartSelectorContext) return;
    const { sectionId, rowId } = smartSelectorContext;
    const updates: Partial<BOQItemRow> = {
      pick_type: selection.type || "", pick_category: selection.category || "",
      pick_item: selection.item || "", pick_variant: selection.variant || "",
      item_name: selection.itemName || "", cost_item_id: selection.costItemId || null
    };
    if (selection.unit) { const u = usableUnits.find((u: any) => getUnitLabel(u) === selection.unit); if (u) updates.unit_id = getUnitId(u); }
    if (selection.currentRate !== null) updates.rate = selection.currentRate;
    updateItem(sectionId, rowId, updates);
    setShowSmartSelector(false);
    setSmartSelectorContext(null);
  }

  // ─── Generate Actions ──────────────────────────────────────────────────────

  async function generateEstimate() {
    if (status !== "approved") { setPersistError("Approve the BOQ first."); return; }
    if (!routeProjectId || !boqId) { setPersistError("Please save the BOQ first."); return; }
    setPersistLoading(true);
    try {
      const result = await generateEstimateFromBOQ(routeProjectId, boqId);
      if (result.success) setTimeout(() => nav(`/projects/${routeProjectId}/estimates`), 500);
      else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(`Error: ${e?.message}`); } finally { setPersistLoading(false); }
  }

  async function handleGenerateProcurement() {
    if (!routeProjectId) { setPersistError("Select a project first"); return; }
    if (!boqId) { setPersistError("Save the BOQ before generating procurement"); return; }
    if (!window.confirm("This will save the BOQ and regenerate the procurement list. Continue?")) return;
    setPersistLoading(true); setPersistError(null);
    try {
      await saveBoqToSupabase("draft");
      const hasTemp = sections.some(s => s.id.startsWith('id_') || s.items.some(i => i.id.startsWith('id_')));
      if (hasTemp) { setPersistError("Save incomplete. Try saving again."); return; }
      await loadLatestBoqForProject(routeProjectId);
      const result = await generateProcurementFromBOQ(routeProjectId);
      if (result.success) {
        const procId = (result as any).procurementId as string | undefined;
        if (procId) {
          await supabase.rpc("sync_procurement_committed_to_cost_events", { p_procurement_id: procId });
          setTimeout(() => nav(`/projects/${routeProjectId}/procurement?view=document&doc=${procId}`), 500);
        } else setTimeout(() => nav(`/projects/${routeProjectId}/procurement`), 500);
      } else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(`Error: ${e?.message}`); } finally { setPersistLoading(false); }
  }

  async function handleAddSuggestion(suggestion: BOQSuggestion) {
    if (!boqId) { setPersistError("Save the BOQ before adding suggestions"); return; }
    setAddingSuggestion(suggestion.id);
    const result = await addSuggestionToBOQ(suggestion, boqId);
    if (result.success) { setIgnoredSuggestions((prev) => new Set(prev).add(suggestion.id)); await loadLatestBoqForProject(routeProjectId || ""); }
    else setPersistError(result.error || "Failed to add suggestion");
    setAddingSuggestion(null);
  }

  // ─── Totals ────────────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const s of sections) for (const it of s.items) subtotal += numOr(it.qty) * numOr(it.rate);
    return { subtotal };
  }, [sections]);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  // ─── Guard ─────────────────────────────────────────────────────────────────

  if (!currentProjectId && !routeProjectId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-200">No Project Selected</h2>
          <p className="text-slate-400 text-sm">Select a project from the top bar to open the BOQ Builder.</p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] text-slate-100">

      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-30 bg-[#0a0d12]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="px-5 py-2.5 flex items-center justify-between gap-4">

          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-100 leading-tight">BOQ Builder</h1>
                <StatusBadge status={status} />
              </div>
              {selectedProject && <div className="text-[11px] text-slate-500 leading-tight truncate">{selectedProject.name}</div>}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-1.5">
            {persistLoading && <Pill icon={<RefreshCw className="w-3 h-3 animate-spin" />} label="Saving…" color="text-slate-400" />}
            {saveSuccess && !persistLoading && <Pill icon={<CheckCircle className="w-3 h-3" />} label="Saved" color="text-emerald-400" />}
            {persistError && (
              <div className="flex items-center gap-1 text-[11px] text-red-400 max-w-[180px]">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{persistError}</span>
              </div>
            )}

            <TopBtn onClick={() => activeProjectId && loadLatestBoqForProject(activeProjectId)} disabled={!activeProjectId || persistLoading} icon={<RefreshCw className="w-3.5 h-3.5" />} label="Load" />
            <TopBtn onClick={() => void saveBoqToSupabase("draft")} disabled={!activeProjectId || persistLoading} icon={<Save className="w-3.5 h-3.5" />} label="Save Draft" variant="neutral" />
            <TopBtn onClick={() => void saveBoqToSupabase("approved")} disabled={!activeProjectId || persistLoading} icon={<CheckCircle className="w-3.5 h-3.5" />} label="Approve" variant="green" />
            <div className="w-px h-4 bg-white/10 mx-0.5" />
            <TopBtn onClick={generateEstimate} disabled={status !== "approved" || persistLoading} icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Estimate" variant="blue" title={status !== "approved" ? "Approve BOQ first" : ""} />
            <TopBtn onClick={handleGenerateProcurement} disabled={!routeProjectId || sections.length === 0 || persistLoading} icon={<ShoppingCart className="w-3.5 h-3.5" />} label="Procurement" variant="purple" />
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-5 pb-2 flex items-center gap-5">
          <StatPill icon={<Layers className="w-3 h-3" />} label="Sections" value={sections.length} />
          <StatPill icon={<Package className="w-3 h-3" />} label="Items" value={totalItems} />
          <StatPill icon={<DollarSign className="w-3 h-3" />} label="Subtotal" value={`$${fmt(totals.subtotal)}`} highlight />
          {lastAutoSaveAt && <span className="text-[10px] text-slate-700 ml-auto">Saved {lastAutoSaveAt}</span>}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-5 py-4 space-y-3 max-w-[1440px] mx-auto">

        {/* Errors / loading */}
        {(masterError || rateError || assemblyError) && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {masterError || rateError || assemblyError}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button
            onClick={addSection}
            disabled={!canEdit || !activeProjectId}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Section
          </button>
          <button onClick={() => nav("/settings/master-lists")} className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
            Edit Categories →
          </button>
        </div>

        {/* Empty */}
        {sections.length === 0 && !persistLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-7 h-7 text-slate-600" />
            </div>
            <h3 className="text-sm font-medium text-slate-300 mb-1.5">No sections yet</h3>
            <p className="text-xs text-slate-600 mb-5 max-w-xs">Start by adding a section. Each section groups related line items.</p>
            <button onClick={addSection} disabled={!canEdit || !activeProjectId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add First Section
            </button>
          </div>
        )}

        {/* Sections */}
        {sections.map((section, sIdx) => {
          const sectionTotal = section.items.reduce((sum, it) => sum + numOr(it.qty) * numOr(it.rate), 0);
          return (
            <div key={section.id} className="rounded-xl border border-white/[0.08] bg-[#0e1117] overflow-hidden">

              {/* Section header */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.03] border-b border-white/[0.06]">
                <button onClick={() => toggleCollapse(section.id)} className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 p-0.5">
                  {section.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[10px] font-bold text-slate-700 w-4 text-center flex-shrink-0">{sIdx + 1}</span>

                <select
                  value={section.masterCategoryId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => onPickMasterCategory(section.id, e.target.value)}
                  className="bg-white/[0.05] border border-white/10 rounded-md px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50 max-w-[160px] flex-shrink-0"
                >
                  <option value="">Category…</option>
                  {usableCategories.map((c: any) => (
                    <option key={getCategoryId(c)} value={getCategoryId(c)}>{getCategoryLabel(c)}</option>
                  ))}
                </select>

                <input
                  value={section.title}
                  disabled={!canEdit}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-semibold text-slate-100 placeholder-slate-700 focus:outline-none disabled:opacity-60 min-w-0"
                  placeholder="Section title"
                />

                <div className="flex items-center gap-2.5 flex-shrink-0 ml-auto">
                  <span className="text-[11px] text-slate-600">{section.items.length} item{section.items.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs font-bold text-slate-200">${fmt(sectionTotal)}</span>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <SectionBtn onClick={() => addItem(section.id)} icon={<Plus className="w-3 h-3" />} label="Item" />
                      <SectionBtn onClick={() => setAsmModal({ open: true, sectionId: section.id, search: "", selectedAssemblyId: "", qty: "1" })} disabled={assemblyLoading} icon={<Boxes className="w-3 h-3" />} label="Assembly" />
                      <button onClick={() => deleteSection(section.id)} className="p-1 rounded hover:bg-red-500/15 text-slate-700 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Scope — inline, subtle background */}
              {!section.collapsed && (
                <div className="px-3.5 py-1.5 bg-white/[0.015] border-b border-white/[0.04]">
                  <input
                    value={section.scope}
                    disabled={!canEdit}
                    onChange={(e) => updateSection(section.id, { scope: e.target.value })}
                    className="w-full bg-transparent text-[11px] text-slate-500 placeholder-slate-700 focus:outline-none focus:text-slate-400 disabled:opacity-50"
                    placeholder="Section scope / remarks…"
                  />
                </div>
              )}

              {/* Items */}
              {!section.collapsed && (
                <div>
                  {section.items.length === 0 ? (
                    <div className="px-4 py-4 text-center text-[11px] text-slate-700">
                      No items — click <span className="text-cyan-500/70">+ Item</span> or <span className="text-cyan-500/70">Assembly</span> above.
                    </div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="grid px-3.5 py-1.5 border-b border-white/[0.05] text-[9px] font-bold uppercase tracking-widest text-slate-700"
                        style={{ gridTemplateColumns: "56px 1fr 180px 88px 76px 76px 84px 28px" }}>
                        <span>Type</span>
                        <span>Item / Description</span>
                        <span>Pick</span>
                        <span>Unit</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Rate</span>
                        <span className="text-right">Amount</span>
                        <span />
                      </div>

                      {/* Rows */}
                      {section.items.map((item) => {
                        const amount = numOr(item.qty) * numOr(item.rate);
                        const pickLabel = [item.pick_type, item.pick_category, item.pick_item, item.pick_variant]
                          .map(x => (x ?? "").trim()).filter(Boolean).join(" › ");

                        return (
                          <div
                            key={item.id}
                            className="grid px-3.5 py-1.5 border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors group items-center"
                            style={{ gridTemplateColumns: "56px 1fr 180px 88px 76px 76px 84px 28px" }}
                          >
                            {/* Type */}
                            <div>
                              {item.pick_type ? <TypeChip type={item.pick_type} /> : <span className="text-[10px] text-slate-800">—</span>}
                            </div>

                            {/* Item + desc */}
                            <div className="pr-2 space-y-0.5 min-w-0">
                              <input
                                value={item.item_name}
                                disabled={!canEdit}
                                onChange={(e) => updateItem(section.id, item.id, { item_name: e.target.value })}
                                className="w-full bg-transparent text-xs font-medium text-slate-200 placeholder-slate-700 focus:outline-none disabled:opacity-60"
                                placeholder="Item name…"
                              />
                              <input
                                value={item.description}
                                disabled={!canEdit}
                                onChange={(e) => updateItem(section.id, item.id, { description: e.target.value })}
                                className="w-full bg-transparent text-[10px] text-slate-600 placeholder-slate-800 focus:outline-none disabled:opacity-60"
                                placeholder="Description…"
                              />
                            </div>

                            {/* Pick */}
                            <div className="pr-2 space-y-0.5">
                              {pickLabel && (
                                <div className="text-[9px] text-slate-600 truncate leading-tight" title={pickLabel}>{pickLabel}</div>
                              )}
                              <div className="flex gap-1">
                                <button
                                  onClick={() => openPicker(section.id, item.id)}
                                  disabled={!canEdit || rateLoading}
                                  className="flex-1 px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/[0.08] text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors truncate"
                                >
                                  Pick…
                                </button>
                                {companyId && (
                                  <button
                                    onClick={() => openSmartSelector(section.id, item.id)}
                                    disabled={!canEdit || rateLoading}
                                    title="Smart Selector — guided item search"
                                    className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-600/25 to-violet-600/25 hover:from-cyan-600/45 hover:to-violet-600/45 border border-cyan-500/25 hover:border-cyan-400/40 text-cyan-300 disabled:opacity-40 transition-all group/wand"
                                  >
                                    <Wand2 className="w-3 h-3 group-hover/wand:scale-110 transition-transform" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Unit */}
                            <div className="pr-1">
                              <select
                                value={item.unit_id ?? ""}
                                disabled={!canEdit}
                                onChange={(e) => updateItem(section.id, item.id, { unit_id: e.target.value || null })}
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                              >
                                <option value="">—</option>
                                {usableUnits.map((u: any) => (
                                  <option key={getUnitId(u)} value={getUnitId(u)}>{getUnitLabel(u)}</option>
                                ))}
                              </select>
                            </div>

                            {/* Qty */}
                            <div className="flex items-center gap-0.5">
                              <input
                                type="number"
                                value={Number.isFinite(item.qty) ? item.qty : 0}
                                disabled={!canEdit}
                                onChange={(e) => updateItem(section.id, item.id, { qty: numOr(e.target.value, 0) })}
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-right text-slate-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                              />
                              {canEdit && routeProjectId && (
                                <button
                                  onClick={() => setImportTakeoffModal({ open: true, sectionId: section.id, itemId: item.id })}
                                  className="p-0.5 rounded hover:bg-emerald-500/15 text-slate-700 hover:text-emerald-400 transition-colors flex-shrink-0"
                                  title="Import from Takeoff"
                                >
                                  <Download className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>

                            {/* Rate */}
                            <div>
                              <input
                                type="number"
                                value={Number.isFinite(item.rate) ? item.rate : 0}
                                disabled={!canEdit}
                                onChange={(e) => updateItem(section.id, item.id, { rate: numOr(e.target.value, 0) })}
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-right text-slate-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
                              />
                            </div>

                            {/* Amount */}
                            <div className="text-right text-xs font-semibold text-slate-200 pr-1">
                              ${fmt(amount)}
                            </div>

                            {/* Delete */}
                            <div className="flex justify-center">
                              <button
                                onClick={() => deleteItem(section.id, item.id)}
                                disabled={!canEdit}
                                className="p-0.5 rounded hover:bg-red-500/15 text-transparent group-hover:text-slate-700 hover:!text-red-400 transition-colors disabled:hidden"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Section subtotal */}
                      <div className="flex items-center justify-end gap-3 px-3.5 py-2 bg-white/[0.01]">
                        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Section Total</span>
                        <span className="text-xs font-bold text-slate-300">${fmt(sectionTotal)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Grand total */}
        {sections.length > 0 && (
          <div className="flex items-center justify-end gap-4 px-5 py-3.5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04]">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Grand Total</span>
            <span className="text-xl font-bold text-cyan-300">${fmt(totals.subtotal)}</span>
          </div>
        )}
      </div>

      {/* ── Picker Modal ── */}
      {picker.open && (
        <ModalShell onClose={() => setPicker(p => ({ ...p, open: false }))} title="Rate Library" subtitle={buildBreadcrumb(picker)}>
          <div className="flex gap-1 mb-4">
            {(["type", "category", "item", "variant"] as PickerStep[]).map((s, i) => {
              const done = (s === "type" && !!picker.type) || (s === "category" && !!picker.category) || (s === "item" && !!picker.item);
              const active = picker.step === s;
              const accessible = i === 0 || (i === 1 && !!picker.type) || (i === 2 && !!picker.category) || (i === 3 && !!picker.item);
              return (
                <button key={s} onClick={() => accessible && setPicker(p => ({ ...p, step: s, search: "" }))} disabled={!accessible}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${active ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : done ? "bg-white/[0.06] border-white/10 text-slate-400" : "bg-transparent border-white/[0.05] text-slate-700 cursor-not-allowed"}`}>
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}{done ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input value={picker.search} onChange={(e) => setPicker(p => ({ ...p, search: e.target.value }))} autoFocus
              className="w-full pl-8 pr-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-500/50"
              placeholder={`Search ${picker.step}…`} />
          </div>
          <div className="rounded-lg border border-white/[0.07] overflow-hidden max-h-64 overflow-y-auto">
            {picker.step === "variant" && pickerOpts.hasNone ? (
              <div className="p-4 space-y-2">
                <p className="text-xs text-slate-400">No variants — continue without one.</p>
                <button onClick={() => void finalizePick("")} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors">
                  Use No Variant
                </button>
              </div>
            ) : pickerOpts.list.length === 0 ? (
              <div className="p-4 text-xs text-slate-600 text-center">No matches.</div>
            ) : (
              pickerOpts.list.map((opt) => (
                <button key={opt}
                  onClick={() => {
                    if (picker.step === "type") setPicker(p => ({ ...p, type: opt, category: "", item: "", variant: "", step: "category", search: "" }));
                    else if (picker.step === "category") setPicker(p => ({ ...p, category: opt, item: "", variant: "", step: "item", search: "" }));
                    else if (picker.step === "item") setPicker(p => ({ ...p, item: opt, variant: "", step: "variant", search: "" }));
                    else void finalizePick(opt);
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-white/[0.05] border-b border-white/[0.04] last:border-0 flex items-center justify-between group transition-colors">
                  <span className="text-xs text-slate-300">{opt}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-400 transition-colors" />
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => {
                const steps: PickerStep[] = ["type", "category", "item", "variant"];
                const idx = steps.indexOf(picker.step);
                if (idx > 0) setPicker(p => ({ ...p, step: steps[idx - 1], search: "" }));
              }}
              disabled={picker.step === "type"}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <span className="text-[10px] text-slate-700">{rateItems.length} items in library</span>
          </div>
        </ModalShell>
      )}

      {/* ── Assembly Modal ── */}
      {asmModal.open && (
        <ModalShell onClose={() => setAsmModal({ open: false, sectionId: null, search: "", selectedAssemblyId: "", qty: "1" })} title="Add From Assembly" subtitle="Explode an assembly into BOQ line items">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input value={asmModal.search} onChange={(e) => setAsmModal(p => ({ ...p, search: e.target.value }))} autoFocus
                  className="w-full pl-8 pr-3 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-slate-200 placeholder-slate-700 focus:outline-none focus:border-cyan-500/50"
                  placeholder="Search assemblies…" />
              </div>
            </div>
            <input value={asmModal.qty} onChange={(e) => setAsmModal(p => ({ ...p, qty: e.target.value }))} type="number"
              className="px-2 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
              placeholder="Qty" />
          </div>
          {assemblyError && <p className="text-xs text-red-400 mb-2">{assemblyError}</p>}
          <div className="rounded-lg border border-white/[0.07] overflow-hidden max-h-64 overflow-y-auto">
            {assemblies.filter(a => {
              const q = asmModal.search.trim().toLowerCase();
              return !q || (a.name ?? "").toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q);
            }).map(a => {
              const selected = asmModal.selectedAssemblyId === a.id;
              const cc = assemblyComponents.filter(c => c.assembly_id === a.id).length;
              return (
                <button key={a.id} onClick={() => setAsmModal(p => ({ ...p, selectedAssemblyId: a.id }))}
                  className={`w-full text-left px-3.5 py-2.5 border-b border-white/[0.04] last:border-0 flex items-center justify-between transition-colors ${selected ? "bg-cyan-500/10" : "hover:bg-white/[0.03]"}`}>
                  <div>
                    <div className="text-xs font-medium text-slate-200">{a.name}</div>
                    <div className="text-[10px] text-slate-600">{a.category && `${a.category} · `}{cc} component{cc !== 1 ? "s" : ""}{a.unit && ` · ${a.unit}`}</div>
                  </div>
                  {selected && <Check className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] text-slate-600">{asmModal.selectedAssemblyId ? "Ready to add" : "Select an assembly first"}</span>
            <button
              onClick={() => asmModal.sectionId && asmModal.selectedAssemblyId && addAssembly(asmModal.sectionId, asmModal.selectedAssemblyId, asmModal.qty)}
              disabled={!asmModal.sectionId || !asmModal.selectedAssemblyId}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Lines
            </button>
          </div>
        </ModalShell>
      )}

      {/* ── AI Suggestions Modal ── */}
      {aiSuggestionsModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111318] rounded-2xl border border-white/10 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">AI BOQ Suggestions</h3>
                  <p className="text-xs text-slate-500">{aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length} items recommended</p>
                </div>
              </div>
              <button onClick={() => setAiSuggestionsModal({ open: false, suggestions: [] })} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">All suggestions added or ignored.</p>
              ) : (
                <div className="space-y-3">
                  {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).map(s => (
                    <BOQSuggestionCard key={s.id} suggestion={s} onAdd={handleAddSuggestion}
                      onIgnore={(id) => setIgnoredSuggestions(p => new Set(p).add(id))} isAdding={addingSuggestion === s.id} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Smart Selector ── */}
      {showSmartSelector && companyId && (
        <SmartItemSelector companyId={companyId} onSelect={handleSmartSelection}
          onCancel={() => { setShowSmartSelector(false); setSmartSelectorContext(null); }}
          title="Smart Item Selector" />
      )}

      {/* ── Import Takeoff ── */}
      <ImportTakeoffModal isOpen={importTakeoffModal.open}
        onClose={() => setImportTakeoffModal({ open: false, sectionId: null, itemId: null })}
        projectId={routeProjectId || ""} onImport={handleImportTakeoff} />

      {/* ── AI Assistant ── */}
      <AIAssistantPanel context="boq"
        currentData={{
          itemCount: totalItems,
          missingUnits: sections.reduce((sum, s) => sum + s.items.filter(i => !i.unit_id).length, 0),
          hasContingency: sections.some(s => s.items.some(i => i.item_name.toLowerCase().includes("contingency"))),
          boqItems: sections.flatMap(s => s.items.map(item => ({ id: item.id, item_code: "", description: item.item_name, unit: "", quantity: item.qty || 0, rate: item.rate || 0, category: s.title || "" }))),
        }}
        projectId={routeProjectId || undefined}
        onAction={(action, data) => {
          if (action === "Import from Takeoff") setImportTakeoffModal({ open: true, sectionId: sections[0]?.id || null, itemId: null });
          else if (action === "Create Assembly") nav("/assemblies");
          else if (action === "Export to Procurement") handleGenerateProcurement();
          else if (action === "show_ai_suggestions" && data.suggestions) setAiSuggestionsModal({ open: true, suggestions: data.suggestions });
          else if (data.route) nav(data.route);
        }} />
    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
      status === "approved" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/25"
    }`}>{status}</span>
  );
}

function StatPill({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className={highlight ? "text-cyan-500" : "text-slate-700"}>{icon}</span>
      <span className="text-[10px] text-slate-600">{label}</span>
      <span className={`text-[10px] font-bold ${highlight ? "text-cyan-300" : "text-slate-400"}`}>{value}</span>
    </div>
  );
}

function Pill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1 text-[11px] ${color}`}>
      {icon}<span>{label}</span>
    </div>
  );
}

type TopBtnVariant = "default" | "neutral" | "green" | "blue" | "purple";
function TopBtn({ onClick, disabled, icon, label, variant = "default", title }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string; variant?: TopBtnVariant; title?: string }) {
  const styles: Record<TopBtnVariant, string> = {
    default: "bg-white/[0.05] hover:bg-white/10 text-slate-300 border-white/10",
    neutral: "bg-slate-700/80 hover:bg-slate-600 text-white border-white/10",
    green:   "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30",
    blue:    "bg-blue-600 hover:bg-blue-500 text-white border-blue-500/30",
    purple:  "bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30",
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border disabled:opacity-40 transition-colors ${styles[variant]}`}>
      {icon}{label}
    </button>
  );
}

function SectionBtn({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-[10px] text-slate-400 disabled:opacity-40 transition-colors">
      {icon}{label}
    </button>
  );
}

function ModalShell({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0f1218] rounded-2xl border border-white/[0.09] shadow-2xl max-w-xl w-full max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07]">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {subtitle && <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function buildBreadcrumb(p: { type: string; category: string; item: string; variant: string }) {
  return [p.type, p.category, p.item, p.variant].map(x => (x ?? "").trim()).filter(Boolean).join(" › ");
}
