// src/pages/BOQPage.tsx � v3 Rebuild: staff-friendly, search-first picker, clear UX
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Trash2, ChevronRight, ChevronDown, Save, CheckCircle,
  FileSpreadsheet, ShoppingCart, Download, RefreshCw, AlertCircle,
  FolderOpen, DollarSign, Search, X, Check, Boxes, Sparkles,
  BookOpen, Package, Users, Wrench, Layers, AlertTriangle, Wand2,
  Bot, ChevronLeft, Loader, Zap, Star, MessageSquare
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";
import { ImportTakeoffModal } from "../components/ImportTakeoffModal";
import { generateProcurementFromBOQ } from "../lib/procurement";
import { generateEstimateFromBOQ } from "../lib/estimates";
import { useProjectContext } from "../context/ProjectContext";
import { SmartItemSelector } from "../components/SmartItemSelector";
import { magnusAI } from "../lib/magnusAI";
import { BOQSuggestionCard } from "../components/BOQSuggestionCard";
import { addSuggestionToBOQ, type BOQSuggestion } from "../lib/boqSuggestions";

// --- Types --------------------------------------------------------------------
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
  rate_source?: "library" | "manual" | "assembly" | "";
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
  id: string; name: string; description: string | null;
  unit: string | null; category: string | null; is_active?: boolean | null;
};
type AssemblyComponentRow = {
  id: string; assembly_id: string; cost_item_id: string; line_type: string;
  quantity_factor: number; waste_percent: number; sort_order: number; notes: string | null;
};
type BoqHeaderRow = {
  id: string; project_id: string; status: string; version: number; updated_at: string;
};

// --- Helpers ------------------------------------------------------------------
function safeId() {
  try { const c: any = typeof crypto !== "undefined" ? crypto : null; if (c?.randomUUID) return c.randomUUID(); } catch {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function getCategoryId(c: any): string { return String(c?.id ?? ""); }
function getCategoryLabel(c: any): string { return String(c?.name ?? "Unnamed Category"); }
function getCategoryScope(c: any): string { return String(c?.scope_of_work ?? ""); }
function getUnitId(u: any): string { return String(u?.id ?? ""); }
function getUnitLabel(u: any): string { return String(u?.name ?? "Unit"); }
function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) { const v = localStorage.getItem(k); if (v?.trim()) return v.trim(); }
  return null;
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}
function fmtNum(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Type config --------------------------------------------------------------
const TYPE_CFG: Record<string, { pill: string; icon: React.ReactNode; short: string }> = {
  material:    { pill: "bg-blue-500/15 text-blue-300 border-blue-500/25",     icon: <Package size={9}/>,  short: "MAT" },
  labor:       { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25",  icon: <Users size={9}/>,    short: "LAB" },
  labour:      { pill: "bg-amber-500/15 text-amber-300 border-amber-500/25",  icon: <Users size={9}/>,    short: "LAB" },
  equipment:   { pill: "bg-purple-500/15 text-purple-300 border-purple-500/25",icon: <Wrench size={9}/>,  short: "EQP" },
  subcontract: { pill: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",icon:<Layers size={9}/>,short: "SUB" },
  other:       { pill: "bg-slate-500/15 text-slate-400 border-slate-500/25",  icon: <Boxes size={9}/>,    short: "OTH" },
};
function TypeChip({ type }: { type: string }) {
  const cfg = TYPE_CFG[type.toLowerCase()] ?? TYPE_CFG.other;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${cfg.pill}`}>
      {cfg.icon}{cfg.short}
    </span>
  );
}

// --- Find Item Modal ----------------------------------------------------------
function FindItemModal({
  rateItems, onSelect, onClose
}: {
  rateItems: RateItem[];
  onSelect: (item: RateItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rateItems.filter(r => {
      const matchType = !typeFilter || (r.item_type || "").toLowerCase() === typeFilter.toLowerCase();
      const matchSearch = !q ||
        (r.item_name || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.variant || "").toLowerCase().includes(q);
      return matchType && matchSearch;
    }).slice(0, 80);
  }, [rateItems, search, typeFilter]);

  const types = useMemo(() => {
    const set = new Set(rateItems.map(r => r.item_type || "").filter(Boolean));
    return Array.from(set).sort();
  }, [rateItems]);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1117] rounded-2xl border border-white/[0.08] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <BookOpen size={14} className="text-blue-400"/>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100">Find Item from Rate Library</div>
              <div className="text-[11px] text-slate-500">{rateItems.length} items available � rate auto-fills</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition">
            <X size={15}/>
          </button>
        </div>

        {/* Search + type filter */}
        <div className="px-5 pt-4 pb-3 space-y-3 border-b border-white/[0.06]">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, category, or description�"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition"/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setTypeFilter("")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${!typeFilter ? "bg-blue-600 text-white border-blue-500" : "bg-white/[0.04] text-slate-500 border-white/[0.07] hover:text-slate-300"}`}>
              All ({rateItems.length})
            </button>
            {types.map(t => {
              const cfg = TYPE_CFG[t.toLowerCase()] ?? TYPE_CFG.other;
              const count = rateItems.filter(r => (r.item_type||"").toLowerCase() === t.toLowerCase()).length;
              return (
                <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${typeFilter === t ? cfg.pill : "bg-white/[0.04] text-slate-500 border-white/[0.07] hover:text-slate-300"}`}>
                  {t} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Package size={20} className="text-slate-700"/>
              <p className="text-slate-500 text-sm">No items match your search</p>
              <p className="text-slate-700 text-xs">Try a different keyword or clear filters</p>
            </div>
          ) : filtered.map((item, idx) => {
            const cfg = TYPE_CFG[(item.item_type||"").toLowerCase()] ?? TYPE_CFG.other;
            const hasRate = item.current_rate != null && item.current_rate > 0;
            return (
              <button key={item.id} onClick={() => onSelect(item)}
                className={`w-full text-left px-5 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] transition group flex items-center gap-4 ${idx === 0 ? "" : ""}`}>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase flex-shrink-0 ${cfg.pill}`}>
                  {cfg.icon}{cfg.short}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition truncate">{item.item_name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.category && <span className="text-[10px] text-slate-600">{item.category}</span>}
                    {item.variant && <span className="text-[10px] text-slate-700">� {item.variant}</span>}
                    {item.description && <span className="text-[10px] text-slate-700 truncate">� {item.description}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {hasRate ? (
                    <div>
                      <div className="text-sm font-bold text-green-400">{fmtMoney(item.current_rate!)}</div>
                      <div className="text-[10px] text-slate-600">per {item.unit || "unit"}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-700 italic">No rate</div>
                  )}
                </div>
                <ChevronRight size={13} className="text-slate-700 group-hover:text-slate-400 transition flex-shrink-0"/>
              </button>
            );
          })}
          {filtered.length === 80 && (
            <div className="px-5 py-3 text-[11px] text-slate-600 text-center">Showing first 80 results � refine your search to see more</div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Component -----------------------------------------------------------
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
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPanelLoading, setAiPanelLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{role:"ai"|"user";text:string;actions?:{label:string;onClick:()=>void}[]}[]>([]);
  const [aiInput, setAiInput] = useState("");

  const { categories: masterCategories, units: masterUnits } = useMasterLists();
  const canEdit = status === "draft";

  const usableCategories = useMemo(() => {
    return (Array.isArray(masterCategories) ? masterCategories : []).filter((c: any) => !!getCategoryId(c));
  }, [masterCategories]);
  const usableUnits = useMemo(() => {
    return (Array.isArray(masterUnits) ? masterUnits : []).filter((u: any) => !!getUnitId(u));
  }, [masterUnits]);

  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");

  // Find item modal
  const [findModal, setFindModal] = useState<{ open: boolean; sectionId: string; rowId: string } | null>(null);

  // Smart selector
  const [showSmartSelector, setShowSmartSelector] = useState(false);
  const [smartSelectorCtx, setSmartSelectorCtx] = useState<{ sectionId: string; rowId: string } | null>(null);

  // Assembly modal
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assemblyComponents, setAssemblyComponents] = useState<AssemblyComponentRow[]>([]);
  type AsmModal = { open: boolean; sectionId: string | null; search: string; selectedId: string; qty: string };
  const [asmModal, setAsmModal] = useState<AsmModal>({ open: false, sectionId: null, search: "", selectedId: "", qty: "1" });

  const [importTakeoffModal, setImportTakeoffModal] = useState<{ open: boolean; sectionId: string | null; itemId: string | null }>({ open: false, sectionId: null, itemId: null });
  const [aiSuggestionsModal, setAiSuggestionsModal] = useState<{ open: boolean; suggestions: BOQSuggestion[] }>({ open: false, suggestions: [] });
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  // --- Load rate items -------------------------------------------------------
  useEffect(() => {
    let alive = true;
    async function load() {
      setRateLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).single();
        if (p?.company_id && alive) setCompanyId(p.company_id);
      }
      try {
        const { data, error } = await supabase.from("v_cost_items_current")
          .select("id,item_name,description,variant,unit,category,item_type,current_rate,current_currency")
          .order("item_name", { ascending: true }).limit(5000);
        if (error) throw error;
        if (alive) setRateItems((data ?? []) as RateItem[]);
      } catch {
        try {
          const { data } = await supabase.from("cost_items")
            .select("id,item_name,description,variant,unit,category,item_type")
            .order("item_name", { ascending: true }).limit(5000);
          if (alive) setRateItems((data ?? []) as RateItem[]);
        } catch (e: any) { console.error("Failed to load rate items:", e); }
      } finally { if (alive) setRateLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // --- Load assemblies -------------------------------------------------------
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { data: aData } = await supabase.from("assemblies")
          .select("id,name,description,unit,category,is_active").order("name").limit(5000);
        const active = (aData || []).filter((a: any) => a?.is_active !== false);
        const { data: cData } = await supabase.from("assembly_components")
          .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
          .order("sort_order").limit(20000);
        if (!alive) return;
        setAssemblies(active.map((a: any) => ({ id: String(a.id), name: String(a.name ?? ""), description: a.description ? String(a.description) : null, unit: a.unit ? String(a.unit) : null, category: a.category ? String(a.category) : null, is_active: a.is_active ?? true })));
        setAssemblyComponents((cData || []).map((c: any) => ({ id: String(c.id), assembly_id: String(c.assembly_id), cost_item_id: String(c.cost_item_id), line_type: String(c.line_type ?? "material"), quantity_factor: numOr(c.quantity_factor, 1), waste_percent: numOr(c.waste_percent, 0), sort_order: numOr(c.sort_order, 0), notes: c.notes ? String(c.notes) : null })));
      } catch (e) { console.error("Assembly load error:", e); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // --- Takeoff import --------------------------------------------------------
  useEffect(() => {
    const groupsParam = searchParams.get("groups");
    if (!groupsParam) return;
    try {
      const groups = JSON.parse(groupsParam);
      if (Array.isArray(groups) && groups.length > 0) {
        setSections(prev => [...prev, {
          id: safeId(), masterCategoryId: null, title: "Takeoff Import",
          scope: "Quantities imported from takeoff measurements",
          items: groups.map((g: any) => ({ id: safeId(), pick_type: "manual", pick_category: "", pick_item: "", pick_variant: "", cost_item_id: null, item_name: g.name || g.groupName || "Imported Item", description: `${g.metric} measurement`, unit_id: null, qty: Number(g.value) || 0, rate: 0, rate_source: "" }))
        }]);
        setSearchParams({});
      }
    } catch (e) { console.error("Takeoff parse error:", e); }
  }, [searchParams, setSearchParams]);

  // --- BOQ Persistence -------------------------------------------------------
  async function loadLatestBoq(projectId: string) {
    setPersistLoading(true); setPersistError(null);
    try {
      const { data: headers, error: hErr } = await supabase.from("boq_headers")
        .select("id,project_id,status,version,updated_at").eq("project_id", projectId)
        .order("updated_at", { ascending: false }).order("version", { ascending: false }).limit(1);
      if (hErr) throw hErr;
      const header = (Array.isArray(headers) ? headers[0] : undefined) as BoqHeaderRow | undefined;
      if (!header) { setBoqId(null); setStatus("draft"); setSections([]); return; }
      setBoqId(header.id); setStatus(header.status as "draft" | "approved");
      const { data: secRows, error: sErr } = await supabase.from("boq_sections")
        .select("id,boq_id,sort_order,master_category_id,title,scope").eq("boq_id", header.id).order("sort_order");
      if (sErr) throw sErr;
      const secList = Array.isArray(secRows) ? secRows : [];
      const sectionIds = secList.map((s: any) => s.id).filter(Boolean);
      const itemsBySection = new Map<string, any[]>();
      if (sectionIds.length > 0) {
        const { data: itemRows, error: iErr } = await supabase.from("boq_section_items")
          .select("id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate")
          .in("section_id", sectionIds).order("sort_order");
        if (iErr) throw iErr;
        for (const r of (itemRows || [])) {
          const sid = String((r as any).section_id ?? "");
          if (!sid) continue;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(r);
        }
      }
      setSections(secList.map((s: any) => ({
        id: String(s.id), masterCategoryId: s.master_category_id ? String(s.master_category_id) : null,
        title: String(s.title ?? "New Section"), scope: String(s.scope ?? ""), collapsed: false,
        items: (itemsBySection.get(String(s.id)) ?? []).map((r: any) => ({
          id: String(r.id ?? safeId()), pick_type: String(r.pick_type ?? ""),
          pick_category: String(r.pick_category ?? ""), pick_item: String(r.pick_item ?? ""),
          pick_variant: String(r.pick_variant ?? ""), cost_item_id: r.cost_item_id ? String(r.cost_item_id) : null,
          item_name: String(r.item_name ?? ""), description: String(r.description ?? ""),
          unit_id: r.unit_id ? String(r.unit_id) : null,
          qty: numOr(r.qty, 0), rate: numOr(r.rate, 0), rate_source: ""
        }))
      })));
    } catch (e: any) { setPersistError(e?.message ?? "Failed to load BOQ"); }
    finally { setPersistLoading(false); }
  }

  async function saveBoq(nextStatus: "draft" | "approved") {
    const projectId = activeProjectId ?? resolveProjectId();
    if (!projectId) { alert("Please select a project first."); return; }
    setPersistLoading(true); setPersistError(null);
    try {
      let headerId = boqId;
      let versionNumber = 1;
      let opType: "INSERT" | "UPDATE" = "INSERT";
      if (!headerId) {
        const { data: existing } = await supabase.from("boq_headers").select("id,version,status").eq("project_id", projectId).order("version", { ascending: false }).limit(1);
        const ex = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
        if (ex) {
          if (nextStatus === "draft" && ex.status === "draft") { headerId = String(ex.id); versionNumber = numOr(ex.version, 1); opType = "UPDATE"; }
          else { versionNumber = numOr(ex.version, 0) + 1; opType = "INSERT"; }
        }
      } else {
        opType = "UPDATE";
        const { data: ex } = await supabase.from("boq_headers").select("id,version,project_id").eq("id", headerId).single();
        versionNumber = numOr(ex?.version, 1);
        if (String(ex?.project_id) !== projectId) throw new Error("BOQ belongs to a different project!");
      }
      if (opType === "INSERT") {
        const { data: vCheck } = await supabase.from("boq_headers").select("id").eq("project_id", projectId).eq("version", versionNumber).maybeSingle();
        if (vCheck) throw new Error(`BOQ version ${versionNumber} already exists.`);
        const { data: ins, error: insErr } = await supabase.from("boq_headers").insert([{ project_id: projectId, status: nextStatus, version: versionNumber }]).select("id,version").single();
        if (insErr) throw insErr;
        headerId = String((ins as any).id); setBoqId(headerId);
      } else {
        const { error: upErr } = await supabase.from("boq_headers").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", headerId);
        if (upErr) throw upErr;
      }
      const { error: delErr } = await supabase.from("boq_sections").delete().eq("boq_id", headerId);
      if (delErr) throw delErr;
      const sectionIdMap = new Map<string, string>();
      if (sections.length > 0) {
        const { data: insertedSecs, error: secErr } = await supabase.from("boq_sections")
          .insert(sections.map((s, i) => ({ boq_id: headerId, sort_order: i, master_category_id: s.masterCategoryId, title: s.title ?? "New Section", scope: s.scope ?? "" })))
          .select("id,sort_order");
        if (secErr) throw secErr;
        (insertedSecs || []).forEach((db: any) => { const cs = sections[db.sort_order]; if (cs) sectionIdMap.set(cs.id, db.id); });
      }
      const itemPayload: any[] = [];
      for (const s of sections) {
        const dbSid = sectionIdMap.get(s.id);
        if (!dbSid) throw new Error(`Section mapping failed: ${s.title}`);
        s.items.forEach((it, i) => itemPayload.push({ section_id: dbSid, sort_order: i, pick_type: it.pick_type ?? "", pick_category: it.pick_category ?? "", pick_item: it.pick_item ?? "", pick_variant: it.pick_variant ?? "", cost_item_id: it.cost_item_id, item_name: it.item_name ?? "", description: it.description ?? "", unit_id: it.unit_id, qty: numOr(it.qty, 0), rate: numOr(it.rate, 0) }));
      }
      if (itemPayload.length > 0) {
        const { error: iErr } = await supabase.from("boq_section_items").insert(itemPayload).select("id,item_name");
        if (iErr) throw iErr;
      }
      setStatus(nextStatus);
      await supabase.rpc("sync_boq_budget_to_cost_events", { p_boq_id: headerId }).then(({ error }) => { if (error) console.error("BOQ sync error:", error); });
      await loadLatestBoq(projectId);
      setLastAutoSaveAt(new Date().toLocaleTimeString());
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) { setPersistError(e?.message ?? "Failed to save"); alert(e?.message ?? "Failed to save BOQ"); }
    finally { setPersistLoading(false); }
  }

  useEffect(() => {
    const pid = activeProjectId;
    if (!pid) { setBoqId(null); setStatus("draft"); setSections([]); return; }
    if (searchParams.get("groups")) return; // skip auto-load, takeoff import effect will handle this
    void loadLatestBoq(pid);
  }, [activeProjectId]);

  useEffect(() => {
    const next = routeProjectId || currentProjectId || resolveProjectId() || null;
    setActiveProjectId(next);
  }, [routeProjectId, currentProjectId]);

  // --- Mutations -------------------------------------------------------------
  function addSection() { setSections(prev => [...prev, { id: safeId(), masterCategoryId: null, title: "New Section", scope: "", items: [], collapsed: false }]); }
  function deleteSection(id: string) { setSections(prev => prev.filter(s => s.id !== id)); }
  function updateSection(id: string, patch: Partial<Section>) { setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)); }
  function toggleCollapse(id: string) { setSections(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s)); }

  function onPickCategory(sectionId: string, catId: string) {
    const cat = usableCategories.find((c: any) => getCategoryId(c) === catId);
    updateSection(sectionId, { masterCategoryId: catId, title: cat ? getCategoryLabel(cat) : "New Section", scope: cat ? getCategoryScope(cat) : "" });
  }

  function addItem(sectionId: string) {
    setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: [...s.items, { id: safeId(), pick_type: "", pick_category: "", pick_item: "", pick_variant: "", cost_item_id: null, item_name: "", description: "", unit_id: null, qty: 0, rate: 0, rate_source: "" }] }));
  }
  function deleteItem(sectionId: string, itemId: string) { setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: s.items.filter(it => it.id !== itemId) })); }
  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQItemRow>) { setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: s.items.map(it => it.id === itemId ? { ...it, ...patch } : it) })); }

  // --- Find Item Handler -----------------------------------------------------
  function handleFindItem(selected: RateItem) {
    if (!findModal) return;
    const { sectionId, rowId } = findModal;
    const unitObj = usableUnits.find((u: any) => getUnitLabel(u).toLowerCase() === (selected.unit || "").toLowerCase());
    updateItem(sectionId, rowId, {
      pick_type: selected.item_type || "",
      pick_category: selected.category || "",
      pick_item: selected.item_name || "",
      pick_variant: selected.variant || "",
      cost_item_id: selected.id,
      item_name: selected.item_name || "",
      description: selected.description || "",
      unit_id: unitObj ? getUnitId(unitObj) : null,
      rate: numOr(selected.current_rate ?? 0, 0),
      rate_source: "library",
    });
    setFindModal(null);
  }

  // --- Smart Selector Handler ------------------------------------------------
  function handleSmartSelection(sel: any) {
    if (!smartSelectorCtx) return;
    const { sectionId, rowId } = smartSelectorCtx;
    const updates: Partial<BOQItemRow> = {
      pick_type: sel.type || "", pick_category: sel.category || "",
      pick_item: sel.item || "", pick_variant: sel.variant || "",
      item_name: sel.itemName || "", cost_item_id: sel.costItemId || null, rate_source: "library",
    };
    if (sel.unit) { const u = usableUnits.find((u: any) => getUnitLabel(u) === sel.unit); if (u) updates.unit_id = getUnitId(u); }
    if (sel.currentRate != null) updates.rate = sel.currentRate;
    updateItem(sectionId, rowId, updates);
    setShowSmartSelector(false); setSmartSelectorCtx(null);
  }

  // --- Assembly Handler ------------------------------------------------------
  function mapLineType(t: string) {
    const x = (t || "").toLowerCase();
    if (x === "material") return "Material";
    if (x === "labour" || x === "labor") return "Labor";
    if (x === "equipment") return "Equipment";
    if (x === "subcontract") return "Subcontract";
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
    const comps = assemblyComponents.filter(c => c.assembly_id === assemblyId).sort((a, b) => a.sort_order - b.sort_order);
    if (comps.length === 0) { alert("This assembly has no components yet."); return; }
    const newRows: BOQItemRow[] = comps.map(c => {
      const r = rateItems.find(x => x.id === c.cost_item_id) ?? null;
      const finalQty = qtyBase * numOr(c.quantity_factor, 1) * (1 + numOr(c.waste_percent, 0) / 100);
      return { id: safeId(), pick_type: mapLineType(c.line_type), pick_category: (r?.category ?? "").trim(), pick_item: (r?.item_name ?? "").trim(), pick_variant: (r?.variant ?? "").trim(), cost_item_id: c.cost_item_id, item_name: r?.item_name ?? "", description: (r?.description ?? "").trim() || c.notes || "", unit_id: matchUnitId(r?.unit ?? null), qty: Number.isFinite(finalQty) ? finalQty : 0, rate: numOr(r?.current_rate ?? 0, 0), rate_source: "assembly" };
    });
    setSections(prev => prev.map(s => s.id !== sectionId ? s : { ...s, items: [...s.items, ...newRows] }));
    setAsmModal({ open: false, sectionId: null, search: "", selectedId: "", qty: "1" });
  }

  // --- Generate Actions ------------------------------------------------------
  async function generateEstimate() {
    if (status !== "approved") { setPersistError("Approve the BOQ first."); return; }
    if (!routeProjectId || !boqId) { setPersistError("Save the BOQ first."); return; }
    setPersistLoading(true);
    try {
      const result = await generateEstimateFromBOQ(routeProjectId, boqId);
      if (result.success) setTimeout(() => nav(`/projects/${routeProjectId}/estimates`), 500);
      else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(e?.message); } finally { setPersistLoading(false); }
  }

  async function handleGenerateProcurement() {
    if (!routeProjectId) { setPersistError("Select a project first"); return; }
    if (!boqId) { setPersistError("Save the BOQ before generating procurement"); return; }
    if (!window.confirm("Save BOQ and regenerate procurement list. Continue?")) return;
    setPersistLoading(true); setPersistError(null);
    try {
      await saveBoq("draft");
      await loadLatestBoq(routeProjectId);
      const result = await generateProcurementFromBOQ(routeProjectId);
      if (result.success) {
        const procId = (result as any).procurementId as string | undefined;
        if (procId) { await supabase.rpc("sync_procurement_committed_to_cost_events", { p_procurement_id: procId }); setTimeout(() => nav(`/projects/${routeProjectId}/procurement?view=document&doc=${procId}`), 500); }
        else setTimeout(() => nav(`/projects/${routeProjectId}/procurement`), 500);
      } else setPersistError(`Failed: ${result.error}`);
    } catch (e: any) { setPersistError(e?.message); } finally { setPersistLoading(false); }
  }

  async function handleAddSuggestion(suggestion: BOQSuggestion) {
    if (!boqId) { setPersistError("Save the BOQ before adding suggestions"); return; }
    setAddingSuggestion(suggestion.id);
    const result = await addSuggestionToBOQ(suggestion, boqId);
    if (result.success) { setIgnoredSuggestions(prev => new Set(prev).add(suggestion.id)); await loadLatestBoq(routeProjectId || ""); }
    else setPersistError(result.error || "Failed to add suggestion");
    setAddingSuggestion(null);
  }

  // --- Totals ----------------------------------------------------------------
  const totals = useMemo(() => {
    let subtotal = 0;
    for (const s of sections) for (const it of s.items) subtotal += numOr(it.qty) * numOr(it.rate);
    return { subtotal };
  }, [sections]);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const missingRates = sections.reduce((sum, s) => sum + s.items.filter(it => it.qty > 0 && it.rate === 0).length, 0);
  const missingUnits = sections.reduce((sum, s) => sum + s.items.filter(it => !it.unit_id).length, 0);

  // --- BOQ AI Actions -------------------------------------------------------
  function addAiMessage(text: string, actions?: {label:string;onClick:()=>void}[]) {
    setAiMessages(prev => [...prev, { role: "ai", text, actions }]);
  }

  async function aiCheckBOQ() {
    setAiPanelLoading(true);
    const issues: string[] = [];
    const missingRateItems = sections.flatMap(s => s.items.filter(it => it.qty > 0 && it.rate === 0).map(it => it.item_name || "Unnamed item"));
    const emptyItems = sections.flatMap(s => s.items.filter(it => !it.item_name.trim()).map(() => s.title));
    const emptySections = sections.filter(s => s.items.length === 0).map(s => s.title);
    if (missingRateItems.length > 0) issues.push(`?? ${missingRateItems.length} item${missingRateItems.length>1?"s":""} have qty but no rate: ${missingRateItems.slice(0,3).join(", ")}${missingRateItems.length>3?` +${missingRateItems.length-3} more`:""}`);
    if (emptySections.length > 0) issues.push(`?? ${emptySections.length} empty section${emptySections.length>1?"s":""}: ${emptySections.join(", ")}`);
    if (emptyItems.length > 0) issues.push(`?? ${emptyItems.length} item${emptyItems.length>1?"s":""} with no name`);
    if (issues.length === 0) {
      addAiMessage("? Your BOQ looks good! All items have names, rates, and quantities. Ready to approve.");
    } else {
      addAiMessage(`Found ${issues.length} issue${issues.length>1?"s":""}:\n\n${issues.join("\n\n")}`);
    }
    setAiPanelLoading(false);
  }

  async function aiSuggestMissingItems() {
    if (sections.length === 0) { addAiMessage("Add some sections and items to your BOQ first, then I can suggest what you might be missing."); return; }
    setAiPanelLoading(true);
    try {
      const boqSummary = sections.map(s => `${s.title}: ${s.items.map(it => it.item_name).filter(Boolean).join(", ")}`).join("\n");
      const text = await magnusAI.chat(
        `You are a Jamaica construction estimating expert. Review this BOQ and suggest any commonly missing items for each section. Be specific and practical for Jamaica construction.
        
BOQ Summary:
${boqSummary}

Available items in rate library: ${rateItems.slice(0,20).map(r=>r.item_name).join(", ")}

Respond in plain English, section by section. Keep it brief and actionable. Max 150 words.`
      );
      addAiMessage(String(text));
    } catch(e:any) { addAiMessage("Could not get suggestions right now. Please try again."); }
    setAiPanelLoading(false);
  }

  async function aiFillMissingRates() {
    const noRate = sections.flatMap(s => s.items.filter(it => it.rate === 0 && it.item_name.trim()));
    if (noRate.length === 0) { addAiMessage("All your items already have rates set. Nothing to fill!"); return; }
    setAiPanelLoading(true);
    addAiMessage(`Getting Jamaica market rates for ${noRate.length} item${noRate.length>1?"s":""}...`);
    let filled = 0;
    for (const item of noRate.slice(0, 5)) {
      try {
        const text = await magnusAI.chat(
          `Jamaica construction price. Item: "${item.item_name}". Respond ONLY with JSON: {"price_jmd":1500,"unit":"each"}`
        );
        const clean = String(text).replace(/\`\`\`json|\`\`\`/g,"").trim();
        const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
        if (s !== -1 && e !== -1) {
          const p = JSON.parse(clean.slice(s, e+1));
          const rate = Number(p.price_jmd) || 0;
          if (rate > 0) {
            sections.forEach(sec => sec.items.forEach(it => {
              if (it.id === item.id) updateItem(sec.id, it.id, { rate });
            }));
            filled++;
          }
        }
      } catch {}
    }
    addAiMessage(`? Filled rates for ${filled} item${filled>1?"s":""}${noRate.length>5?` (first 5 of ${noRate.length} � run again for more)`:""}.`);
    setAiPanelLoading(false);
  }

  async function aiChat(message: string) {
    if (!message.trim()) return;
    setAiMessages(prev => [...prev, { role: "user", text: message }]);
    setAiInput("");
    setAiPanelLoading(true);
    try {
      const boqContext = `BOQ has ${sections.length} sections, ${totalItems} items, total ${fmtMoney(totals.subtotal)}.`;
      const text = await magnusAI.chat(
        `You are a Jamaica construction BOQ assistant for Magnus Boys Construction. 
${boqContext}
User asks: "${message}"
Answer briefly and practically. If they ask to add items, explain they need to use the Add Section / Find Item buttons.`
      );
      addAiMessage(String(text));
    } catch { addAiMessage("Sorry, I could not process that. Please try again."); }
    setAiPanelLoading(false);
  }

  // --- No project guard ------------------------------------------------------
  if (!currentProjectId && !routeProjectId) {
    return (
      <div className="min-h-screen bg-[#080b10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-slate-600 mx-auto" />
          <h2 className="text-xl font-semibold text-slate-200">No Project Selected</h2>
          <p className="text-slate-400 text-sm">Select a project from the top bar to open the BOQ Builder.</p>
        </div>
      </div>
    );
  }

  // --- Render ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100">

      {/* -- Sticky Header -- */}
      <div className="sticky top-0 z-30 bg-[#0d1117]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-900/30">
              <FileSpreadsheet className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-100">BOQ Builder</h1>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${status === "approved" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-amber-500/15 text-amber-300 border-amber-500/25"}`}>{status}</span>
              </div>
              {selectedProject && <div className="text-[11px] text-slate-500 truncate">{selectedProject.name}</div>}
            </div>
          </div>

          {/* Right � action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {persistLoading && <span className="text-[11px] text-slate-500 flex items-center gap-1"><RefreshCw size={11} className="animate-spin"/>Saving�</span>}
            {saveSuccess && !persistLoading && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle size={11}/>Saved</span>}
            {persistError && <span className="text-[11px] text-red-400 flex items-center gap-1 max-w-[160px] truncate"><AlertCircle size={11}/>{persistError}</span>}

            <button onClick={() => activeProjectId && loadLatestBoq(activeProjectId)} disabled={!activeProjectId || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-slate-300 font-medium disabled:opacity-40 transition">
              <RefreshCw size={12}/> Load
            </button>
            <button onClick={() => void saveBoq("draft")} disabled={!activeProjectId || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-white/[0.08] text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <Save size={12}/> Save Draft
            </button>
            <button onClick={() => void saveBoq("approved")} disabled={!activeProjectId || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <CheckCircle size={12}/> Approve
            </button>
            <div className="w-px h-4 bg-white/[0.08] mx-0.5"/>
            <button onClick={generateEstimate} disabled={status !== "approved" || persistLoading}
              title={status !== "approved" ? "Approve BOQ first" : ""}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <FileSpreadsheet size={12}/> Estimate
            </button>
            <button onClick={handleGenerateProcurement} disabled={!routeProjectId || sections.length === 0 || persistLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-[11px] text-white font-semibold disabled:opacity-40 transition">
              <ShoppingCart size={12}/> Procurement
            </button>
            <div className="w-px h-4 bg-white/[0.08] mx-0.5"/>
            <button
              onClick={() => { setShowAIPanel(true); if(aiMessages.length===0) addAiMessage("Hi! I am your BOQ Assistant. I can check your BOQ for issues, suggest missing items, fill in missing rates, or answer any questions. What would you like to do?", [{label:"Check BOQ",onClick:aiCheckBOQ},{label:"Suggest Missing Items",onClick:aiSuggestMissingItems},{label:"Fill Missing Rates",onClick:aiFillMissingRates}]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-[11px] text-white font-bold transition shadow-sm">
              <Bot size={12}/> AI Assistant
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-5 pb-2.5 flex items-center gap-5 flex-wrap">
          {[
            { icon: <Layers size={11}/>, label: "Sections", value: sections.length, color: "text-slate-400" },
            { icon: <Package size={11}/>, label: "Items", value: totalItems, color: "text-slate-400" },
            { icon: <DollarSign size={11}/>, label: "Total", value: fmtMoney(totals.subtotal), color: "text-cyan-300" },
          ].map(({ icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="text-slate-700">{icon}</span>
              <span className="text-[10px] text-slate-600">{label}</span>
              <span className={`text-[10px] font-bold ${color}`}>{value}</span>
            </div>
          ))}
          {missingRates > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5">
              <AlertTriangle size={10}/> {missingRates} item{missingRates > 1 ? "s" : ""} missing rate
            </div>
          )}
          {lastAutoSaveAt && <span className="text-[10px] text-slate-700 ml-auto">Last saved {lastAutoSaveAt}</span>}
        </div>
      </div>

      {/* -- Body -- */}
      <div className="px-5 py-4 space-y-3 max-w-[1440px] mx-auto">

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button onClick={addSection} disabled={!canEdit || !activeProjectId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition">
            <Plus size={13}/> Add Section
          </button>
          <button onClick={() => nav("/settings/master-lists")} className="text-[11px] text-slate-600 hover:text-slate-400 transition">
            Edit Categories ?
          </button>
        </div>

        {/* Empty state */}
        {sections.length === 0 && !persistLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-4">
              <FileSpreadsheet size={24} className="text-slate-600"/>
            </div>
            <h3 className="text-sm font-semibold text-slate-300 mb-1.5">No sections yet</h3>
            <p className="text-xs text-slate-600 mb-5 max-w-xs">Start by adding a section. Each section groups related items � e.g. "Foundations", "Blockwork", "Roofing".</p>
            <button onClick={addSection} disabled={!canEdit || !activeProjectId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-xs font-semibold disabled:opacity-40 transition">
              <Plus size={13}/> Add First Section
            </button>
          </div>
        )}

        {/* Sections */}
        {sections.map((section, sIdx) => {
          const sectionTotal = section.items.reduce((sum, it) => sum + numOr(it.qty) * numOr(it.rate), 0);
          const sectionWarnings = section.items.filter(it => it.qty > 0 && it.rate === 0).length;
          return (
            <div key={section.id} className="rounded-xl border border-white/[0.07] bg-[#0d1117] overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
                <button onClick={() => toggleCollapse(section.id)} className="text-slate-600 hover:text-slate-300 transition flex-shrink-0">
                  {section.collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                </button>
                <span className="text-[10px] font-bold text-slate-700 w-5 text-center flex-shrink-0">{sIdx + 1}</span>

                <select value={section.masterCategoryId ?? ""} disabled={!canEdit} onChange={e => onPickCategory(section.id, e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1 text-[11px] text-slate-400 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50 max-w-[160px] flex-shrink-0">
                  <option value="">Category�</option>
                  {usableCategories.map((c: any) => <option key={getCategoryId(c)} value={getCategoryId(c)}>{getCategoryLabel(c)}</option>)}
                </select>

                <input value={section.title} disabled={!canEdit} onChange={e => updateSection(section.id, { title: e.target.value })}
                  className="flex-1 bg-transparent text-sm font-bold text-slate-100 placeholder-slate-700 focus:outline-none disabled:opacity-60 min-w-0"
                  placeholder="Section title�"/>

                <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                  {sectionWarnings > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle size={10}/>{sectionWarnings} missing rate</span>
                  )}
                  <span className="text-[11px] text-slate-600">{section.items.length} item{section.items.length !== 1 ? "s" : ""}</span>
                  <span className="text-sm font-bold text-slate-200">{fmtMoney(sectionTotal)}</span>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => addItem(section.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-[10px] text-cyan-400 font-semibold transition">
                        <Plus size={10}/> Item
                      </button>
                      <button onClick={() => setAsmModal({ open: true, sectionId: section.id, search: "", selectedId: "", qty: "1" })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-[10px] text-slate-400 transition">
                        <Boxes size={10}/> Assembly
                      </button>
                      <button onClick={() => deleteSection(section.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-700 hover:text-red-400 transition">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Scope */}
              {!section.collapsed && (
                <div className="px-4 py-1.5 bg-white/[0.01] border-b border-white/[0.04]">
                  <input value={section.scope} disabled={!canEdit} onChange={e => updateSection(section.id, { scope: e.target.value })}
                    className="w-full bg-transparent text-[11px] text-slate-600 placeholder-slate-800 focus:outline-none focus:text-slate-400 disabled:opacity-50"
                    placeholder="Section scope / description (e.g. All 6&quot; block walls including mortar and ties)�"/>
                </div>
              )}

              {/* Items */}
              {!section.collapsed && (
                <div>
                  {section.items.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-xs text-slate-700 mb-3">No items yet in this section</p>
                      <button onClick={() => addItem(section.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-xs text-cyan-400 font-semibold transition">
                        <Plus size={11}/> Add Item
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Column headers */}
                      <div className="grid px-4 py-2 border-b border-white/[0.04] text-[9px] font-bold uppercase tracking-widest text-slate-700"
                        style={{ gridTemplateColumns: "44px 1fr 160px 80px 80px 90px 90px 32px" }}>
                        <span>Type</span>
                        <span>Item / Description</span>
                        <span>From Library</span>
                        <span>Unit</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Rate (JMD)</span>
                        <span className="text-right">Amount</span>
                        <span/>
                      </div>

                      {/* Item rows */}
                      {section.items.map(item => {
                        const amount = numOr(item.qty) * numOr(item.rate);
                        const isMissingRate = item.qty > 0 && item.rate === 0;
                        const linkedItem = item.pick_item || item.cost_item_id;
                        return (
                          <div key={item.id}
                            className={`grid px-4 py-2 border-b border-white/[0.03] hover:bg-white/[0.02] transition group items-center ${isMissingRate ? "bg-amber-500/[0.02]" : ""}`}
                            style={{ gridTemplateColumns: "44px 1fr 160px 80px 80px 90px 90px 32px" }}>

                            {/* Type chip */}
                            <div>
                              {item.pick_type
                                ? <TypeChip type={item.pick_type}/>
                                : <span className="text-[10px] text-slate-800">�</span>}
                            </div>

                            {/* Item name + description */}
                            <div className="pr-3 space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <input value={item.item_name} disabled={!canEdit}
                                  onChange={e => updateItem(section.id, item.id, { item_name: e.target.value, rate_source: "manual" })}
                                  className="flex-1 bg-transparent text-xs font-semibold text-slate-200 placeholder-slate-700 focus:outline-none disabled:opacity-60 min-w-0"
                                  placeholder="Item name�"/>
                                {isMissingRate && <span title="Missing rate � qty set but no rate"><AlertTriangle size={10} className="text-amber-500 flex-shrink-0" /></span>}
                              </div>
                              <input value={item.description} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { description: e.target.value })}
                                className="w-full bg-transparent text-[10px] text-slate-600 placeholder-slate-800 focus:outline-none disabled:opacity-60"
                                placeholder="Description�"/>
                              {item.rate_source === "library" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15 font-medium">Library</span>
                              )}
                              {item.rate_source === "assembly" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15 font-medium">Assembly</span>
                              )}
                              {item.rate_source === "manual" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 border border-slate-500/15 font-medium">Manual</span>
                              )}
                            </div>

                            {/* Library picker */}
                            <div className="pr-2 space-y-1">
                              {linkedItem && (
                                <div className="text-[9px] text-slate-600 truncate" title={item.pick_item || ""}>
                                  {item.pick_item || "Linked"}
                                </div>
                              )}
                              <div className="flex gap-1">
                                <button onClick={() => setFindModal({ open: true, sectionId: section.id, rowId: item.id })}
                                  disabled={!canEdit || rateLoading}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-400 font-semibold disabled:opacity-40 transition">
                                  <Search size={9}/> Find Item
                                </button>
                                {companyId && (
                                  <button onClick={() => { setSmartSelectorCtx({ sectionId: section.id, rowId: item.id }); setShowSmartSelector(true); }}
                                    disabled={!canEdit || rateLoading} title="Smart guided selector"
                                    className="p-1.5 rounded-lg bg-gradient-to-r from-cyan-600/20 to-violet-600/20 hover:from-cyan-600/40 hover:to-violet-600/40 border border-cyan-500/25 text-cyan-400 disabled:opacity-40 transition">
                                    <Wand2 size={11}/>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Unit */}
                            <div className="pr-1">
                              <select value={item.unit_id ?? ""} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { unit_id: e.target.value || null })}
                                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-1.5 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50">
                                <option value="">�</option>
                                {usableUnits.map((u: any) => <option key={getUnitId(u)} value={getUnitId(u)}>{getUnitLabel(u)}</option>)}
                              </select>
                            </div>

                            {/* Qty */}
                            <div className="flex items-center gap-0.5 pr-1">
                              <input type="number" value={Number.isFinite(item.qty) ? item.qty : 0} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { qty: numOr(e.target.value, 0) })}
                                className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-1.5 py-1 text-[10px] text-right text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-50"/>
                              {canEdit && routeProjectId && (
                                <button onClick={() => setImportTakeoffModal({ open: true, sectionId: section.id, itemId: item.id })}
                                  className="p-0.5 rounded hover:bg-emerald-500/15 text-slate-700 hover:text-emerald-400 transition flex-shrink-0" title="Import from Takeoff">
                                  <Download size={10}/>
                                </button>
                              )}
                            </div>

                            {/* Rate */}
                            <div className="pr-1">
                              <input type="number" value={Number.isFinite(item.rate) ? item.rate : 0} disabled={!canEdit}
                                onChange={e => updateItem(section.id, item.id, { rate: numOr(e.target.value, 0), rate_source: "manual" })}
                                className={`w-full bg-white/[0.04] border rounded-lg px-1.5 py-1 text-[10px] text-right font-semibold focus:outline-none disabled:opacity-50 transition ${isMissingRate ? "border-amber-500/40 text-amber-500" : "border-white/[0.07] text-green-400 focus:border-cyan-500/40"}`}/>
                            </div>

                            {/* Amount */}
                            <div className="text-right text-xs font-bold text-slate-200 pr-1">
                              {fmtMoney(amount)}
                            </div>

                            {/* Delete */}
                            <div className="flex justify-center">
                              <button onClick={() => deleteItem(section.id, item.id)} disabled={!canEdit}
                                className="p-1 rounded-lg text-transparent group-hover:text-slate-700 hover:!text-red-400 hover:bg-red-500/10 transition disabled:hidden">
                                <X size={12}/>
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Section total */}
                      <div className="flex items-center justify-end gap-3 px-4 py-2.5 bg-white/[0.01] border-t border-white/[0.04]">
                        <span className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Section Total</span>
                        <span className="text-sm font-bold text-slate-300">{fmtMoney(sectionTotal)}</span>
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
          <div className="flex items-center justify-end gap-4 px-5 py-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04]">
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Grand Total</div>
              <div className="text-2xl font-bold text-cyan-300">{fmtMoney(totals.subtotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* -- Find Item Modal -- */}
      {findModal && (
        <FindItemModal rateItems={rateItems} onSelect={handleFindItem} onClose={() => setFindModal(null)}/>
      )}

      {/* -- Assembly Modal -- */}
      {asmModal.open && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] rounded-2xl border border-white/[0.08] shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-100">Add From Assembly</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Explodes an assembly into individual line items</div>
              </div>
              <button onClick={() => setAsmModal({ open: false, sectionId: null, search: "", selectedId: "", qty: "1" })} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="p-5 space-y-3 flex-1 overflow-y-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
                  <input autoFocus value={asmModal.search} onChange={e => setAsmModal(p => ({ ...p, search: e.target.value }))}
                    placeholder="Search assemblies�"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50"/>
                </div>
                <input value={asmModal.qty} onChange={e => setAsmModal(p => ({ ...p, qty: e.target.value }))} type="number"
                  className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/50 text-right"
                  placeholder="Qty"/>
              </div>
              <div className="rounded-xl border border-white/[0.07] overflow-hidden max-h-72 overflow-y-auto">
                {assemblies.filter(a => {
                  const q = asmModal.search.trim().toLowerCase();
                  return !q || (a.name||"").toLowerCase().includes(q) || (a.category||"").toLowerCase().includes(q);
                }).map(a => {
                  const selected = asmModal.selectedId === a.id;
                  const cc = assemblyComponents.filter(c => c.assembly_id === a.id).length;
                  return (
                    <button key={a.id} onClick={() => setAsmModal(p => ({ ...p, selectedId: a.id }))}
                      className={`w-full text-left px-4 py-3 border-b border-white/[0.04] last:border-0 flex items-center justify-between transition ${selected ? "bg-cyan-500/10" : "hover:bg-white/[0.03]"}`}>
                      <div>
                        <div className="text-sm font-semibold text-slate-200">{a.name}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{a.category && `${a.category} � `}{cc} component{cc !== 1 ? "s" : ""}{a.unit && ` � ${a.unit}`}</div>
                      </div>
                      {selected && <Check size={14} className="text-cyan-400 flex-shrink-0"/>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.07]">
              <span className="text-[11px] text-slate-600">{asmModal.selectedId ? "Ready to add" : "Select an assembly"}</span>
              <button onClick={() => asmModal.sectionId && asmModal.selectedId && addAssembly(asmModal.sectionId, asmModal.selectedId, asmModal.qty)}
                disabled={!asmModal.sectionId || !asmModal.selectedId}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40 transition">
                <Plus size={12}/> Add Lines
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- AI Suggestions Modal -- */}
      {aiSuggestionsModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] rounded-2xl border border-white/[0.08] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.07]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles size={16} className="text-white"/>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">AI BOQ Suggestions</div>
                  <div className="text-[11px] text-slate-500">{aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length} items recommended</div>
                </div>
              </div>
              <button onClick={() => setAiSuggestionsModal({ open: false, suggestions: [] })} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition"><X size={15}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">All suggestions added or ignored.</p>
              ) : (
                <div className="space-y-3">
                  {aiSuggestionsModal.suggestions.filter(s => !ignoredSuggestions.has(s.id)).map(s => (
                    <BOQSuggestionCard key={s.id} suggestion={s} onAdd={handleAddSuggestion}
                      onIgnore={id => setIgnoredSuggestions(p => new Set(p).add(id))} isAdding={addingSuggestion === s.id}/>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -- Smart Selector -- */}
      {showSmartSelector && companyId && (
        <SmartItemSelector companyId={companyId} onSelect={handleSmartSelection}
          onCancel={() => { setShowSmartSelector(false); setSmartSelectorCtx(null); }} title="Smart Item Selector"/>
      )}

      {/* -- BOQ AI Panel -- */}
      {showAIPanel && (
        <div className="fixed right-0 top-0 h-full w-96 bg-[#0d1117] border-l border-white/[0.08] shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] bg-gradient-to-r from-purple-900/40 to-blue-900/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <Bot size={15} className="text-white"/>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">BOQ AI Assistant</div>
                <div className="text-[10px] text-slate-500">Powered by Magnus AI</div>
              </div>
            </div>
            <button onClick={() => setShowAIPanel(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-slate-300 transition">
              <X size={15}/>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-3 border-b border-white/[0.06] grid grid-cols-3 gap-2">
            {[
              {label:"Check BOQ",icon:<Zap size={11}/>,color:"text-amber-400",action:aiCheckBOQ},
              {label:"Suggest Items",icon:<Star size={11}/>,color:"text-purple-400",action:aiSuggestMissingItems},
              {label:"Fill Rates",icon:<Sparkles size={11}/>,color:"text-emerald-400",action:aiFillMissingRates},
            ].map(({label,icon,color,action})=>(
              <button key={label} onClick={()=>{action();}}
                className="flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] transition">
                <span className={color}>{icon}</span>
                <span className="text-[9px] text-slate-400 font-semibold text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {aiMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot size={24} className="text-slate-700 mx-auto mb-2"/>
                <p className="text-xs text-slate-600">Click a quick action above or type a question below</p>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[12px] leading-relaxed ${msg.role==="user"?"bg-blue-600 text-white":"bg-white/[0.06] border border-white/[0.08] text-slate-200"}`}>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-white/[0.1]">
                      {msg.actions.map(a => (
                        <button key={a.label} onClick={a.onClick}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-[10px] text-purple-300 font-semibold transition">
                          <Zap size={9}/>{a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {aiPanelLoading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <Loader size={12} className="text-purple-400 animate-spin"/>
                  <span className="text-[11px] text-slate-500">Thinking�</span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/[0.07]">
            <div className="flex gap-2">
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&aiChat(aiInput)}
                placeholder="Ask anything about your BOQ�"
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-purple-500/50"/>
              <button onClick={()=>aiChat(aiInput)} disabled={!aiInput.trim()||aiPanelLoading}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 transition">
                <MessageSquare size={14}/>
              </button>
            </div>
            <p className="text-[9px] text-slate-700 mt-1.5 text-center">Press Enter to send � AI uses Jamaica construction knowledge</p>
          </div>
        </div>
      )}

      {/* -- Import Takeoff -- */}
      <ImportTakeoffModal isOpen={importTakeoffModal.open}
        onClose={() => setImportTakeoffModal({ open: false, sectionId: null, itemId: null })}
        projectId={routeProjectId || ""}
        onImport={(_g: string, _m: string, value: number) => {
          if (!importTakeoffModal.sectionId || !importTakeoffModal.itemId) return;
          updateItem(importTakeoffModal.sectionId, importTakeoffModal.itemId, { qty: value });
        }}/>

      {/* -- AI Assistant -- */}
    </div>
  );
}
