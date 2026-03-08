// src/pages/BOQPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists.ts";
import { saveBoq as persistBoq, loadLatestBoqForProject as loadLatestBoqForProjectFromDb, type BoqStatus } from "../boq/boqPersistence.ts";
<<<<<<< Updated upstream
import { usePlan } from "../hooks/usePlan";
import PaywallModal from "../components/PaywallModal";
import { generateBOQPacket, printBOQPacket } from "../boq/printPacket";
=======
import { runBoqCalc } from "../lib/boqCalc";
>>>>>>> Stashed changes

type RateItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
  calculator_json?: any | null
  calculator_inputs?: Record<string, number> | null;

  // from v_cost_items_current only
  current_rate?: number | null;
  current_currency?: string | null;
};

type BOQItemRow = {
  id: string;

  // picker selections
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

<<<<<<< Updated upstream
  qty_source?: "manual" | "takeoff";
  takeoff_group_id?: string;
  takeoff_metric?: "line_ft" | "area_ft2" | "volume_yd3" | "count_ea";
=======
  calculator_inputs?: Record<string, number> | null;
>>>>>>> Stashed changes
};

type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
};

type BoqHeaderRow = {
  id: string;
  project_id: string;
  status: "draft" | "approved";
  version: number;
  created_at?: string;
  updated_at?: string;
};

type ProjectRow = {
  id: string;
  name: string | null;
};

// ----- Assemblies (PlanSwift-style) -----
type AssemblyRow = {
  id: string;
  name: string;
  description?: string | null;
  unit_id?: string | null; // optional
};

type AssemblyComponentRow = {
  id?: string;
  assembly_id: string;
  cost_item_id: string;
  qty: number;
  sort_order?: number | null;
};

// UUID v4 fallback (still valid for uuid columns)
function uuidv4Fallback() {
  // RFC4122 version 4 compliant-ish
  // https://stackoverflow.com/a/2117523 (classic pattern), adapted without crypto requirement
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = typeof crypto !== "undefined" ? crypto : null;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return uuidv4Fallback();
}

function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqSorted(values: string[]) {
  const set = new Set(values.map((v) => v.trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Categories */
function getCategoryId(c: any): string {
  return String(c?.id ?? "");
}
function getCategoryLabel(c: any): string {
  return String(c?.name ?? "Unnamed Category");
}
function getCategoryScope(c: any): string {
  return String(c?.scope_of_work ?? "");
}

/** Units */
function getUnitId(u: any): string {
  return String(u?.id ?? "");
}
function getUnitLabel(u: any): string {
  return String(u?.name ?? "Unit");
}

function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function buildCalcInputsFromItem(it: any) {
  // Best-effort: map common BOQ fields into calc variables
  // Keep item + description separate; we do NOT duplicate text.
  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    // common takeoff vars (adjust later if your BOQ uses different keys)
    Length: num(it.length ?? it.Length ?? it.qty_length),
    Width: num(it.width ?? it.Width ?? it.qty_width),
    Height: num(it.height ?? it.Height ?? it.qty_height),
    Depth: num(it.depth ?? it.Depth ?? it.qty_depth),

    Area: num(it.area ?? it.Area ?? it.qty_area),
    Volume: num(it.volume ?? it.Volume ?? it.qty_volume),

    Count: num(it.count ?? it.Count ?? it.qty_count),

    // allow manual qty to be used by formulas if needed
    Qty: num(it.qty ?? it.Qty),

    // optional knobs
    Waste: num(it.waste_pct ?? it.waste ?? it.Waste),
    Multiply: num(it.multiply ?? it.Multiplier ?? it.multiplier),
  };
}

export default function BOQPage() {
  const nav = useNavigate();

  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [sections, setSections] = useState<Section[]>([]);
  const [calculatorItem, setCalculatorItem] = useState<RateItem | null>(null);
  const [calculatorInputs, setCalculatorInputs] = useState<Record<string, number>>({});
  const [calculatorTarget, setCalculatorTarget] = useState<{ sectionId: string; rowId: string } | null>(null);

  const { hasFeature } = usePlan();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");

  // Company and user info for export
  const [companyName, setCompanyName] = useState<string>("Company Name");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  // Persistence state
  const [boqId, setBoqId] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Project picker state
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => resolveProjectId());

  // Auto-save indicator (UI only for now)
  const [autoSaveOn] = useState(true);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);

  const {
    categories: masterCategories,
    units: masterUnits,
    loading: masterLoading,
    error: masterError,
  } = useMasterLists();

  const canEdit = status === "draft";

  const usableCategories = useMemo(() => {
    const arr = Array.isArray(masterCategories) ? masterCategories : [];
    return arr.filter((c: any) => !!getCategoryId(c));
  }, [masterCategories]);

  const usableUnits = useMemo(() => {
    const arr = Array.isArray(masterUnits) ? masterUnits : [];
    return arr.filter((u: any) => !!getUnitId(u));
  }, [masterUnits]);

  // Load company settings and user info
  useEffect(() => {
    let alive = true;

    async function loadCompanyAndUser() {
      try {
        const [companyRes, userRes] = await Promise.all([
          supabase.from("company_settings").select("company_name,logo_url").single(),
          supabase.auth.getUser()
        ]);

        if (!alive) return;

        if (companyRes.data) {
          setCompanyName(companyRes.data.company_name || "Company Name");
          setLogoUrl(companyRes.data.logo_url || null);
        }

        if (userRes.data?.user) {
          setUserEmail(userRes.data.user.email || "");
        }
      } catch (e) {
        console.error("Failed to load company/user info:", e);
      }
    }

    loadCompanyAndUser();
    return () => {
      alive = false;
    };
  }, []);

  // Load projects
  useEffect(() => {
    let alive = true;
    async function loadProjects() {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id,name")
          .order("name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;
        setProjects((data ?? []) as ProjectRow[]);
      } catch (e: any) {
        console.error("loadProjects failed:", e);
        if (!alive) return;
        setProjectsError(e?.message ?? "Failed to load projects");
        setProjects([]);
      } finally {
        if (alive) setProjectsLoading(false);
      }
    }
    loadProjects();
    return () => {
      alive = false;
    };
  }, []);

  // Rate items
  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState<"v_cost_items_current" | "cost_items" | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadRateItems() {
      setRateLoading(true);
      setRateError(null);

      try {
       const { data, error } = await supabase
  .from("v_cost_items_current")
  .select("id,item_name,description,unit,category,item_type,calculator_json,current_rate,current_currency")
  .order("item_name", { ascending: true })
  .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as unknown as RateItem[]);
        setRateSource("v_cost_items_current");
        return;
      } catch (e: any) {
        console.warn("v_cost_items_current failed, falling back to cost_items:", e?.message ?? e);
      } finally {
        if (alive) setRateLoading(false);
      }

      try {
        setRateLoading(true);
       const { data, error } = await supabase
  .from("assemblies")
  .select("id,name,description")
  .order("name", { ascending: true })
  .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as unknown as RateItem[]);
        setRateSource("cost_items");
      } catch (e: any) {
        console.error("Failed to load rate items:", e);
        if (!alive) return;
        setRateError(e?.message ?? "Failed to load rate items");
        setRateItems([]);
        setRateSource(null);
      } finally {
        if (alive) setRateLoading(false);
      }
    }

    loadRateItems();
    return () => {
      alive = false;
    };
  }, []);

  // ----- Assemblies load -----
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [asmLoading, setAsmLoading] = useState(false);
  const [asmError, setAsmError] = useState<string | null>(null);

  type TakeoffLinkModalState = {
    open: boolean;
    sectionId: string | null;
    itemId: string | null;
    selectedGroupId: string;
    selectedMetric: "line_ft" | "area_ft2" | "volume_yd3" | "count_ea";
  };

  const [takeoffLinkModal, setTakeoffLinkModal] = useState<TakeoffLinkModalState>({
    open: false,
    sectionId: null,
    itemId: null,
    selectedGroupId: "",
    selectedMetric: "area_ft2",
  });

  const [takeoffGroups, setTakeoffGroups] = useState<Array<{
    id: string;
    name: string;
    color: string;
  }>>([]);

  const [takeoffTotals, setTakeoffTotals] = useState<Record<string, {
    line_ft: number;
    area_ft2: number;
    volume_yd3: number;
    count_ea: number;
  }>>({});

  useEffect(() => {
    function loadTakeoffData() {
      try {
        const groupsStr = localStorage.getItem("takeoff_groups");
        const totalsStr = localStorage.getItem("takeoff_group_totals");

        if (groupsStr) {
          setTakeoffGroups(JSON.parse(groupsStr));
        }

        if (totalsStr) {
          setTakeoffTotals(JSON.parse(totalsStr));
        }
      } catch (e) {
        console.error("Failed to load takeoff data:", e);
      }
    }

    loadTakeoffData();

    const interval = setInterval(loadTakeoffData, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSections(prev => prev.map(section => ({
      ...section,
      items: section.items.map(item => {
        if (item.qty_source === "takeoff" && item.takeoff_group_id && item.takeoff_metric) {
          const groupTotal = takeoffTotals[item.takeoff_group_id];
          if (groupTotal) {
            const newQty = groupTotal[item.takeoff_metric] || 0;
            if (newQty !== item.qty) {
              return { ...item, qty: newQty };
            }
          }
        }
        return item;
      })
    })));
  }, [takeoffTotals]);

  useEffect(() => {
    let alive = true;
    async function loadAssemblies() {
      setAsmLoading(true);
      setAsmError(null);
      try {
        const { data, error } = await supabase
          .from("assemblies")
          .select("id,name,description")
          .order("name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;
        setAssemblies((data ?? []) as AssemblyRow[]);
      } catch (e: any) {
        console.warn("loadAssemblies failed:", e?.message ?? e);
        if (!alive) return;
        setAsmError(e?.message ?? "Failed to load assemblies");
        setAssemblies([]);
      } finally {
        if (alive) setAsmLoading(false);
      }
    }
    loadAssemblies();
    return () => {
      alive = false;
    };
  }, []);

  async function loadLatestBoqForProject(projectId: string) {
    setPersistLoading(true);
    setPersistError(null);

    try {
      const { data: headers, error: headerErr } = await supabase
        .from("boqs")
        .select("id,project_id,status,version,updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .order("version", { ascending: false })
        .limit(1);

      if (headerErr) throw headerErr;

      const header = Array.isArray(headers) ? (headers[0] as BoqHeaderRow | undefined) : undefined;
      if (!header) {
        setBoqId(null);
        setStatus("draft");
        setSections([]);
        return;
      }

      setBoqId(header.id);
      setStatus(header.status);

      const { data: secRows, error: secErr } = await supabase
        .from("boq_sections")
        .select("id,boq_id,sort_order,master_category_id,title,scope")
        .eq("boq_id", header.id)
        .order("sort_order", { ascending: true });

      if (secErr) throw secErr;

      const secList = Array.isArray(secRows) ? secRows : [];
      const sectionIds = secList.map((s: any) => s.id).filter(Boolean);

      const itemsBySection = new Map<string, any[]>();

      if (sectionIds.length > 0) {
        const { data: itemRows, error: itemErr } = await supabase
         .from("boq_section_items")
.select(
  "id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate,calculator_inputs"
)
          .in("section_id", sectionIds)
          .order("sort_order", { ascending: true });

        if (itemErr) throw itemErr;

        const list = Array.isArray(itemRows) ? itemRows : [];
        for (const r of list) {
          const sid = String((r as any).section_id ?? "");
          if (!sid) continue;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(r);
        }
      }

      const rebuilt: Section[] = secList.map((s: any) => {
        const sid = String(s.id);
        const itemsRaw = itemsBySection.get(sid) ?? [];
        const items: BOQItemRow[] = itemsRaw.map((r: any) => ({
          id: String(r.id ?? safeId()),
          pick_type: String(r.pick_type ?? ""),
          pick_category: String(r.pick_category ?? ""),
          pick_item: String(r.pick_item ?? ""),
          pick_variant: String(r.pick_variant ?? ""),
          cost_item_id: r.cost_item_id ? String(r.cost_item_id) : null,
          item_name: String(r.item_name ?? ""),
          description: String(r.description ?? ""),
          unit_id: r.unit_id ? String(r.unit_id) : null,
          qty: numOr(r.qty, 0),
          rate: numOr(r.rate, 0),
          calculator_inputs: r.calculator_inputs ?? null,
        }));

        return {
          id: sid,
          masterCategoryId: s.master_category_id ? String(s.master_category_id) : null,
          title: String(s.title ?? "New Section"),
          scope: String(s.scope ?? ""),
          items,
        };
      });

      setSections(rebuilt);
    } catch (e: any) {
      console.error("loadLatestBoqForProject failed:", e);
      setPersistError(e?.message ?? "Failed to load BOQ");
    } finally {
      setPersistLoading(false);
    }
  }

  async function saveBoqToSupabase(nextStatus: "draft" | "approved") {
    const projectId = activeProjectId ?? resolveProjectId();
    if (!projectId) {
      alert("Please select or create a project first.");
      return;
    }

    setPersistLoading(true);
    setPersistError(null);

    try {
      let headerId = boqId;

      if (!headerId) {
        const { data: ins, error: insErr } = await supabase
          .from("boqs")
          .insert([{ project_id: projectId, status: nextStatus, version: 1 }])
          .select("id")
          .single();

        if (insErr) throw insErr;
        headerId = String((ins as any).id);
        setBoqId(headerId);
      } else {
        const { error: upErr } = await supabase.from("boqs").update({ status: nextStatus }).eq("id", headerId);
        if (upErr) throw upErr;
      }

      // ? IMPORTANT: delete items FIRST (avoids FK failures if no cascade)
      const existingSectionIds = sections.map((s) => s.id).filter(Boolean);
      if (existingSectionIds.length > 0) {
        const { error: delItemsErr } = await supabase.from("boq_section_items").delete().in("section_id", existingSectionIds);
        if (delItemsErr) throw delItemsErr;
      }

      const { error: delSecErr } = await supabase.from("boq_sections").delete().eq("boq_id", headerId);
      if (delSecErr) throw delSecErr;

      // Ensure section ids are valid UUIDs if your DB uses uuid
      const sectionPayload = sections.map((s, idx) => ({
        id: s.id || safeId(),
        boq_id: headerId,
        sort_order: idx,
        master_category_id: s.masterCategoryId,
        title: s.title ?? "New Section",
        scope: s.scope ?? "",
      }));

      const { error: secInsErr } = await supabase.from("boq_sections").insert(sectionPayload);
      if (secInsErr) throw secInsErr;

      const itemPayload: any[] = [];
      for (const s of sections) {
        for (let i = 0; i < s.items.length; i++) {
          const it = s.items[i];
          itemPayload.push({
            id: it.id || safeId(),
            section_id: s.id,
            sort_order: i,

            pick_type: it.pick_type ?? "",
            pick_category: it.pick_category ?? "",
            pick_item: it.pick_item ?? "",
            pick_variant: it.pick_variant ?? "",

            cost_item_id: it.cost_item_id,

            item_name: it.item_name ?? "",
            description: it.description ?? "",
            unit_id: it.unit_id,

            qty: numOr(it.qty, 0),
            rate: numOr(it.rate, 0),

            calculator_inputs: it.calculator_inputs ?? null,
          });
        }
      }

      if (itemPayload.length > 0) {
        const { error: itemInsErr } = await supabase.from("boq_section_items").insert(itemPayload);
        if (itemInsErr) throw itemInsErr;
      }

      setStatus(nextStatus);
      setLastAutoSaveAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error("saveBoqToSupabase failed:", e);
      setPersistError(e?.message ?? "Failed to save BOQ");
      alert(e?.message ?? "Failed to save BOQ");
    } finally {
      setPersistLoading(false);
    }
  }

  async function setActiveProject(projectId: string | null) {
    const next = projectId && projectId.trim() ? projectId.trim() : null;
    setActiveProjectId(next);

    if (next) localStorage.setItem("active_project_id", next);
    else localStorage.removeItem("active_project_id");

    setBoqId(null);
    setStatus("draft");
    setSections([]);
    if (next) await loadLatestBoqForProject(next);
  }

  async function createProject() {
    const name = window.prompt("Enter project name:");
    if (!name || !name.trim()) return;

    try {
      const { data, error } = await supabase.from("projects").insert([{ name: name.trim() }]).select("id,name").single();
      if (error) throw error;

      const created = data as ProjectRow;
      setProjects((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
        return next;
      });

      await setActiveProject(created.id);
    } catch (e: any) {
      console.error("createProject failed:", e);
      alert(e?.message ?? "Failed to create project");
    }
  }

  useEffect(() => {
    const pid = resolveProjectId();
    if (!pid) return;
    setActiveProjectId(pid);
    void loadLatestBoqForProject(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addSection() {
    setSections((prev) => [...prev, { id: safeId(), masterCategoryId: null, title: "New Section", scope: "", items: [] }]);
  }

  function deleteSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSection(id: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function onPickMasterCategory(sectionId: string, categoryId: string) {
    const cat = usableCategories.find((c: any) => getCategoryId(c) === categoryId);
    updateSection(sectionId, {
      masterCategoryId: categoryId,
      title: cat ? getCategoryLabel(cat) : "New Section",
      scope: cat ? getCategoryScope(cat) : "",
    });
  }

  function addItem(sectionId: string) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const row: BOQItemRow = {
          id: safeId(),
          pick_type: "",
          pick_category: "",
          pick_item: "",
          pick_variant: "",
          cost_item_id: null,
          item_name: "",
          description: "",
          unit_id: null,
          qty: 0,
          rate: 0,
        };
        return { ...s, items: [...s.items, row] };
      })
    );
  }

  function deleteItem(sectionId: string, itemId: string) {
    setSections((prev) => prev.map((s) => (s.id !== sectionId ? s : { ...s, items: s.items.filter((it) => it.id !== itemId) })));
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQItemRow>) {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId ? s : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
      )
    );
  }

  function openTakeoffLinkModal(sectionId: string, itemId: string) {
    if (!hasFeature("boqTakeoffLinking")) {
      setPaywallFeature("BOQ â†” Takeoff Linking");
      setShowPaywall(true);
      return;
    }

    const section = sections.find(s => s.id === sectionId);
    const item = section?.items.find(it => it.id === itemId);

    setTakeoffLinkModal({
      open: true,
      sectionId,
      itemId,
      selectedGroupId: item?.takeoff_group_id || (takeoffGroups[0]?.id || ""),
      selectedMetric: item?.takeoff_metric || "area_ft2",
    });
  }

  async function handleExportPacket() {
    if (!hasFeature("takeoffExport")) {
      setPaywallFeature("Export Packet (PDF)");
      setShowPaywall(true);
      return;
    }

    const currentProject = projects.find(p => p.id === activeProjectId);
    const projectName = currentProject?.name || "Untitled Project";

    let clientName = "Client Name";
    if (activeProjectId) {
      try {
        const { data } = await supabase
          .from("projects")
          .select("client_id, clients(name)")
          .eq("id", activeProjectId)
          .single();

        if (data && data.clients && typeof data.clients === "object" && "name" in data.clients) {
          clientName = (data.clients as any).name || "Client Name";
        }
      } catch (e) {
        console.error("Failed to fetch client name:", e);
      }
    }

    const html = generateBOQPacket(
      sections,
      { name: companyName, logoUrl },
      { name: projectName, clientName },
      userEmail
    );

    printBOQPacket(html);
  }

  function linkItemToTakeoff() {
    const { sectionId, itemId, selectedGroupId, selectedMetric } = takeoffLinkModal;
    if (!sectionId || !itemId || !selectedGroupId) return;

    const groupTotal = takeoffTotals[selectedGroupId];
    const qty = groupTotal ? (groupTotal[selectedMetric] || 0) : 0;

    updateItem(sectionId, itemId, {
      qty_source: "takeoff",
      takeoff_group_id: selectedGroupId,
      takeoff_metric: selectedMetric,
      qty,
    });

    setTakeoffLinkModal({
      open: false,
      sectionId: null,
      itemId: null,
      selectedGroupId: "",
      selectedMetric: "area_ft2",
    });
  }

  function unlinkItemFromTakeoff(sectionId: string, itemId: string) {
    updateItem(sectionId, itemId, {
      qty_source: "manual",
      takeoff_group_id: undefined,
      takeoff_metric: undefined,
    });
  }

  function approveAndLock() {
    void saveBoqToSupabase("approved");
  }

  function generateEstimateFromBoq() {
    if (status !== "approved") {
      alert("You must approve the BOQ first.");
      return;
    }
    alert("Estimate generated from BOQ (placeholder).");
  }

  function goEditScopes() {
    nav("/settings/master-lists");
  }

  function matchUnitIdByName(unitName: string | null) {
    if (!unitName) return null;
    const u = usableUnits.find((x: any) => getUnitLabel(x).toLowerCase() === unitName.toLowerCase());
    return u ? getUnitId(u) : null;
  }

  async function fetchLatestRate(costItemId: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from("cost_item_rates")
        .select("rate,effective_date")
        .eq("cost_item_id", costItemId)
        .order("effective_date", { ascending: false })
        .limit(1);

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      const rate = (row as any)?.rate;
      return typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    } catch (e) {
      console.error("fetchLatestRate failed:", e);
      return null;
    }
  }

  async function applyRateItem(sectionId: string, rowId: string, r: RateItem | null) {
    if (!r) return;

    const pickedUnitId = matchUnitIdByName(r.unit ?? null);

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: s.items.map((it) => {
            if (it.id !== rowId) return it;

            const next: BOQItemRow = {
              ...it,
              cost_item_id: r.id,
              item_name: it.item_name.trim() ? it.item_name : r.item_name,
            };

            if (!next.description.trim()) next.description = r.description ?? "";
            if (!next.unit_id && pickedUnitId) next.unit_id = pickedUnitId;

            const viewRate = numOr(r.current_rate ?? 0, 0);
            if (numOr(next.rate) === 0 && viewRate) next.rate = viewRate;

            return next;
          }),
        };
      })
    );

    const hasViewRate = typeof r.current_rate === "number" && Number.isFinite(r.current_rate) && r.current_rate > 0;
    if (hasViewRate) return;

    const latest = await fetchLatestRate(r.id);
    if (!latest) return;

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: s.items.map((it) => {
            if (it.id !== rowId) return it;
            if (numOr(it.rate) !== 0) return it;
            return { ...it, rate: latest };
          }),
        };
      })
    );
  }

  // -----------------------------
  // Modern Step Picker (Type ? Category ? Item ? Variant)
  // -----------------------------
  type PickerStep = "type" | "category" | "item" | "variant";
  type PickerState = {
    open: boolean;
    sectionId: string | null;
    rowId: string | null;
    step: PickerStep;
    type: string;
    category: string;
    item: string;
    variant: string;
    search: string;
  };

  const [picker, setPicker] = useState<PickerState>({
    open: false,
    sectionId: null,
    rowId: null,
    step: "type",
    type: "",
    category: "",
    item: "",
    variant: "",
    search: "",
  });

  const typeOptions = useMemo(() => {
    const discovered = uniqSorted(rateItems.map((r) => (r.item_type ?? "").trim()).filter(Boolean));
    const common = ["Material", "Labor", "Equipment", "Subcontract", "Other"];
    return uniqSorted([...common, ...discovered]);
  }, [rateItems]);

  function itemsForType(type: string) {
    if (!type) return rateItems;
    return rateItems.filter((r) => (r.item_type ?? "").toLowerCase() === type.toLowerCase());
  }

  function categoryOptions(type: string) {
    return uniqSorted(itemsForType(type).map((r) => (r.category ?? "").trim()).filter(Boolean));
  }

  function itemOptions(type: string, category: string) {
    const list = itemsForType(type).filter((r) => {
      if (!category) return true;
      return (r.category ?? "").toLowerCase() === category.toLowerCase();
    });
    return uniqSorted(list.map((r) => (r.item_name ?? "").trim()).filter(Boolean));
  }

  function variantOptions(type: string, category: string, itemName: string) {
    const list = itemsForType(type).filter((r) => {
      if (category && (r.category ?? "").toLowerCase() !== category.toLowerCase()) return false;
      if (itemName && (r.item_name ?? "").toLowerCase() !== itemName.toLowerCase()) return false;
      return true;
    });
    return uniqSorted(list.map((r) => (r.variant ?? "").trim()).filter(Boolean));
  }

  function findFinalRateItem(type: string, category: string, itemName: string, variant: string | null) {
    const list = itemsForType(type).filter((r) => {
      if (category && (r.category ?? "").toLowerCase() !== category.toLowerCase()) return false;
      if (itemName && (r.item_name ?? "").toLowerCase() !== itemName.toLowerCase()) return false;
      return true;
    });

    if (variant) {
      const match = list.find((r) => (r.variant ?? "").toLowerCase() === variant.toLowerCase());
      if (match) return match;
    }
    return list[0] ?? null;
  }

  function openPicker(sectionId: string, rowId: string) {
    const sec = sections.find((s) => s.id === sectionId);
    const row = sec?.items.find((x) => x.id === rowId);

    setPicker({
      open: true,
      sectionId,
      rowId,
      step: "type",
      type: row?.pick_type ?? "",
      category: row?.pick_category ?? "",
      item: row?.pick_item ?? "",
      variant: row?.pick_variant ?? "",
      search: "",
    });
  }

  function closePicker() {
    setPicker({
      open: false,
      sectionId: null,
      rowId: null,
      step: "type",
      type: "",
      category: "",
      item: "",
      variant: "",
      search: "",
    });
  }

  function goPickerStep(step: PickerStep) {
    setPicker((p) => ({ ...p, step, search: "" }));
  }

  function pickType(v: string) {
    setPicker((p) => ({ ...p, type: v, category: "", item: "", variant: "", step: "category", search: "" }));
  }
  function pickCategory(v: string) {
    setPicker((p) => ({ ...p, category: v, item: "", variant: "", step: "item", search: "" }));
  }
  function pickItem(v: string) {
    setPicker((p) => ({ ...p, item: v, variant: "", step: "variant", search: "" }));
  }

  function stepTitle(step: PickerStep) {
    if (step === "type") return "Type";
    if (step === "category") return "Category";
    if (step === "item") return "Item";
    return "Variant";
  }

  function stepDone(step: PickerStep) {
    if (step === "type") return !!picker.type.trim();
    if (step === "category") return !!picker.category.trim();
    if (step === "item") return !!picker.item.trim();
    return true;
  }

  function pickerBreadcrumb() {
    const parts: string[] = [];
    if (picker.type) parts.push(picker.type);
    if (picker.category) parts.push(picker.category);
    if (picker.item) parts.push(picker.item);
    if (picker.variant) parts.push(picker.variant);
    return parts.join(" ? ");
  }

  const pickerOptions = useMemo(() => {
    if (!picker.open) return { list: [] as string[], hasNone: false };
    const q = picker.search.trim().toLowerCase();
    const filter = (arr: string[]) => (!q ? arr : arr.filter((x) => x.toLowerCase().includes(q)));

    if (picker.step === "type") return { list: filter(typeOptions), hasNone: false };
    if (picker.step === "category") return { list: filter(categoryOptions(picker.type)), hasNone: false };
    if (picker.step === "item") return { list: filter(itemOptions(picker.type, picker.category)), hasNone: false };

    const vlist = variantOptions(picker.type, picker.category, picker.item);
    return { list: filter(vlist), hasNone: vlist.length === 0 };
  }, [picker.open, picker.step, picker.search, picker.type, picker.category, picker.item, typeOptions, rateItems]);

  async function finalizePick(variantValue: string) {
    const sectionId = picker.sectionId;
    const rowId = picker.rowId;
    if (!picker.open || !sectionId || !rowId) return;

    const finalType = picker.type.trim();
    const finalCategory = picker.category.trim();
    const finalItem = picker.item.trim();
    const finalVariant = variantValue.trim(); // can be ""

    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              items: s.items.map((it) =>
                it.id !== rowId
                  ? it
                  : {
                      ...it,
                      pick_type: finalType,
                      pick_category: finalCategory,
                      pick_item: finalItem,
                      pick_variant: finalVariant,
                      item_name: it.item_name.trim() ? it.item_name : finalItem,
                    }
              ),
            }
      )
    );

    const r = findFinalRateItem(finalType, finalCategory, finalItem, finalVariant ? finalVariant : null);
    await applyRateItem(sectionId, rowId, r);

    console.log("FINAL PICK:", {
  picked: { finalType, finalCategory, finalItem, finalVariant },
  found: r?.item_name,
  calcType: typeof (r as any)?.calculator_json,
  calcValue: (r as any)?.calculator_json,
});
    if (r?.calculator_json) {
  setCalculatorItem(r);
  setCalculatorTarget({ sectionId, rowId });
  setCalculatorInputs({});
}

    closePicker();
  }

  // -----------------------------
  // Assemblies Picker (expand to items)
  // -----------------------------
  type AssemblyPickerState = {
    open: boolean;
    sectionId: string | null;
    search: string;
  };

  const [asmPicker, setAsmPicker] = useState<AssemblyPickerState>({
    open: false,
    sectionId: null,
    search: "",
  });

  function openAssemblyPicker(sectionId: string) {
    setAsmPicker({ open: true, sectionId, search: "" });
  }
  function closeAssemblyPicker() {
    setAsmPicker({ open: false, sectionId: null, search: "" });
  }

  const filteredAssemblies = useMemo(() => {
    const q = asmPicker.search.trim().toLowerCase();
    const list = assemblies ?? [];
    if (!q) return list;
    return list.filter((a) => (a.name ?? "").toLowerCase().includes(q));
  }, [assemblies, asmPicker.search]);

  async function addAssemblyToSection(sectionId: string, assemblyId: string) {
    try {
      const asm = assemblies.find((a) => a.id === assemblyId);
      if (!asm) return;

      const { data, error } = await supabase
        .from("assembly_components")
        .select("assembly_id,cost_item_id,qty,sort_order")
        .eq("assembly_id", assemblyId)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const comps = (data ?? []) as AssemblyComponentRow[];
      if (comps.length === 0) {
        alert("This assembly has no components yet.");
        return;
      }

      const newRows: BOQItemRow[] = comps.map((c) => {
        const r = rateItems.find((x) => x.id === c.cost_item_id) ?? null;
        const pickedUnitId = matchUnitIdByName(r?.unit ?? null);

        return {
          id: safeId(),

          pick_type: r?.item_type ?? "Assembly",
          pick_category: r?.category ?? "",
          pick_item: r?.item_name ?? asm.name,
          pick_variant: r?.variant ?? "",

          cost_item_id: r?.id ?? c.cost_item_id,

          item_name: r?.item_name ?? asm.name,
          description: String(r?.description ?? asm.description ?? ""),
          unit_id: pickedUnitId ?? null,
          qty: numOr(c.qty, 1),
          rate: numOr(r?.current_rate ?? 0, 0),
        };
      });

      setSections((prev) => prev.map((s) => (s.id !== sectionId ? s : { ...s, items: [...s.items, ...newRows] })));

      for (const row of newRows) {
        if (!row.cost_item_id) continue;
        if (numOr(row.rate) !== 0) continue;
        const latest = await fetchLatestRate(row.cost_item_id);
        if (!latest) continue;

        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== sectionId) return s;
            return {
              ...s,
              items: s.items.map((it) => (it.id === row.id ? { ...it, rate: latest } : it)),
            };
          })
        );
      }

      closeAssemblyPicker();
    } catch (e: any) {
      console.error("addAssemblyToSection failed:", e);
      alert(e?.message ?? "Failed to add assembly");
    }
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const s of sections) for (const it of s.items) subtotal += numOr(it.qty) * numOr(it.rate);
    return { subtotal };
  }, [sections]);

  function loadLatestClick() {
    if (!activeProjectId) {
      alert("Select a project first.");
      return;
    }
    void loadLatestBoqForProject(activeProjectId);
  }

  function saveDraftClick() {
    void saveBoqToSupabase("draft");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">BOQ Builder</h1>
          <div className="text-xs text-slate-400 mt-1">Stable BOQ + Step Picker + Assemblies</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadLatestClick}
            disabled={!activeProjectId || persistLoading}
            className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
          >
            Load Latest
          </button>

          <button
            onClick={saveDraftClick}
            disabled={!activeProjectId || persistLoading}
            className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
          >
            Save Draft
          </button>

          <button
            onClick={approveAndLock}
            disabled={!activeProjectId || persistLoading}
            className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
          >
            Approve
          </button>

          <button
            onClick={generateEstimateFromBoq}
            disabled={status !== "approved"}
            className="px-3 py-2 rounded bg-blue-700 text-white disabled:opacity-50"
          >
            Generate Estimate
          </button>

          <button
            onClick={handleExportPacket}
            disabled={!activeProjectId || sections.length === 0}
            className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 disabled:hover:bg-emerald-700"
          >
            Export Packet (PDF)
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="space-y-1 w-full md:max-w-[620px]">
          <div className="text-xs text-slate-300">Project (required)</div>
          <select
            value={activeProjectId ?? ""}
            disabled={projectsLoading}
            onChange={(e) => void setActiveProject(e.target.value || null)}
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.id}
              </option>
            ))}
          </select>
          {projectsError ? <div className="text-xs text-red-400">Projects failed: {projectsError}</div> : null}
        </div>

        <button onClick={() => void createProject()} className="px-3 py-2 rounded bg-slate-700 text-white">
          Create Project
        </button>
      </div>

      <div className="text-sm text-slate-400">
        Status: <span className="font-semibold">{status}</span> • Sections:{" "}
        <span className="font-semibold">{sections.length}</span> • Subtotal:{" "}
        <span className="font-semibold">{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>

      <div className="text-sm text-slate-400">
        Auto-save: <span className="font-semibold">{autoSaveOn ? "On" : "Off"}</span>
        {lastAutoSaveAt ? <span className="text-slate-500"> • Last: {lastAutoSaveAt}</span> : null}
      </div>

      {persistLoading ? (
        <div className="text-xs text-slate-500">Saving/Loading BOQ…</div>
      ) : persistError ? (
        <div className="text-xs text-red-400">BOQ persistence error: {persistError}</div>
      ) : boqId ? (
        <div className="text-xs text-slate-500">BOQ loaded: {boqId}</div>
      ) : activeProjectId ? (
        <div className="text-xs text-slate-500">No saved BOQ found for this project yet.</div>
      ) : (
        <div className="text-xs text-slate-500">Select a project to load/save BOQs.</div>
      )}

      {masterLoading ? (
        <div className="text-sm text-slate-400">Loading master lists…</div>
      ) : masterError ? (
        <div className="text-sm text-red-400">Master lists failed: {masterError}</div>
      ) : (
        <div className="text-xs text-slate-500">
          Categories: {usableCategories.length} • Units: {usableUnits.length}
        </div>
      )}

      {rateLoading ? (
        <div className="text-xs text-slate-500">Loading rate items…</div>
      ) : rateError ? (
        <div className="text-xs text-red-400">Rate items failed: {rateError}</div>
      ) : (
        <div className="text-xs text-slate-500">
          Rate items: {rateItems.length}
          {rateSource ? ` • source: ${rateSource}` : ""}
        </div>
      )}

      <div className="text-xs text-slate-500">
        Assemblies: {assemblies.length} • Components: (loaded on pick)
        {asmLoading ? " • loading…" : ""}
        {asmError ? <span className="text-red-400"> • {asmError}</span> : null}
      </div>

      <div className="flex gap-2">
        <button
          onClick={addSection}
          disabled={!canEdit || !activeProjectId}
          className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
        >
          Add Section
        </button>

        <button onClick={goEditScopes} className="px-3 py-2 rounded bg-slate-700 text-white">
          Edit Scopes
        </button>
      </div>

      <div className="space-y-6">
        {sections.length === 0 ? (
          <div className="text-sm text-slate-400">
            No sections yet. Click <strong>Add Section</strong>.
          </div>
        ) : (
          sections.map((s) => (
            <div key={s.id} className="p-4 border border-slate-700 rounded space-y-4 bg-slate-950/20">
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="text-sm text-slate-300 w-[120px]">Section Category</div>

                <select
                  value={s.masterCategoryId ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => onPickMasterCategory(s.id, e.target.value)}
                  className="w-full lg:max-w-[320px] px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                >
                  <option value="">Select…</option>
                  {usableCategories.map((c: any) => (
                    <option key={getCategoryId(c)} value={getCategoryId(c)}>
                      {getCategoryLabel(c)}
                    </option>
                  ))}
                </select>

                <input
                  value={s.title}
                  disabled={!canEdit}
                  onChange={(e) => updateSection(s.id, { title: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                  placeholder="New Section"
                />

                <div className="flex gap-2 lg:ml-auto">
                  <button
                    onClick={() => addItem(s.id)}
                    disabled={!canEdit}
                    className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                  >
                    Add Item
                  </button>

                  <button
                    onClick={() => openAssemblyPicker(s.id)}
                    disabled={!canEdit || asmLoading}
                    className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                    title="Pick an assembly and expand its components into BOQ items"
                  >
                    Add Assembly
                  </button>

                  <button
                    onClick={() => deleteSection(s.id)}
                    disabled={!canEdit}
                    className="px-3 py-2 rounded bg-red-700 text-white disabled:opacity-50"
                  >
                    Delete Section
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-slate-400">Section scope/remarks (prints later)</div>
                <textarea
                  value={s.scope}
                  disabled={!canEdit}
                  onChange={(e) => updateSection(s.id, { scope: e.target.value })}
                  className="w-full px-3 py-3 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                  rows={4}
                  placeholder="Section scope/remarks (prints later)"
                />
              </div>

              <div className="space-y-3">
                {s.items.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    No items yet. Click <strong>Add Item</strong> (or <strong>Add Assembly</strong>).
                  </div>
                ) : (
                  s.items.map((it) => {
                    const amount = numOr(it.qty) * numOr(it.rate);
                    const pickLabel = [it.pick_type, it.pick_category, it.pick_item, it.pick_variant]
                      .map((x) => (x ?? "").trim())
                      .filter(Boolean)
                      .join(" ? ");

                    return (
                      <div key={it.id} className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-12 md:col-span-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => openPicker(s.id, it.id)}
                            disabled={!canEdit || rateLoading}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50 text-left"
                            title="Pick from Rate Library (Type ? Category ? Item ? Variant)"
                          >
                            Pick item…
                          </button>
                          <div className="text-[11px] text-slate-400 break-words">{pickLabel || "—"}</div>
                        </div>

                        <div className="col-span-12 md:col-span-2">
                          <div className="text-xs text-slate-400 mb-1">Item</div>
                          <input
                            value={it.item_name}
                            disabled={!canEdit}
                            onChange={(e) => updateItem(s.id, it.id, { item_name: e.target.value })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                            placeholder="Item"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-3">
                          <div className="text-xs text-slate-400 mb-1">Description</div>
                          <textarea
                            value={it.description}
                            disabled={!canEdit}
                            onChange={(e) => updateItem(s.id, it.id, { description: e.target.value })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                            rows={2}
                            placeholder="Description"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-2">
                          <div className="text-xs text-slate-400 mb-1">Unit…</div>
                          <select
                            value={it.unit_id ?? ""}
                            disabled={!canEdit}
                            onChange={(e) => updateItem(s.id, it.id, { unit_id: e.target.value || null })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                          >
                            <option value="">Unit…</option>
                            {usableUnits.map((u: any) => (
                              <option key={getUnitId(u)} value={getUnitId(u)}>
                                {getUnitLabel(u)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-6 md:col-span-1">
                          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                            <span>Qty</span>
                            {it.qty_source === "takeoff" && (
                              it.takeoff_group_id && !takeoffGroups.find(g => g.id === it.takeoff_group_id) ? (
                                <span className="text-amber-400 text-[10px] flex items-center gap-1" title="Linked group not found">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                  Missing
                                </span>
                              ) : (
                                <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                  Linked
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={Number.isFinite(it.qty) ? it.qty : 0}
                              disabled={!canEdit || it.qty_source === "takeoff"}
                              onChange={(e) => updateItem(s.id, it.id, { qty: numOr(e.target.value, 0) })}
                              className={`flex-1 px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50 ${
                                it.qty_source === "takeoff" ? "bg-emerald-950/30 border-emerald-900/40" : ""
                              }`}
                              title={
                                it.qty_source === "takeoff" && it.takeoff_group_id
                                  ? `Linked to: ${takeoffGroups.find(g => g.id === it.takeoff_group_id)?.name || 'Unknown'} - ${
                                      it.takeoff_metric === "line_ft" ? "Line (ft)" :
                                      it.takeoff_metric === "area_ft2" ? "Area (ftÂ²)" :
                                      it.takeoff_metric === "volume_yd3" ? "Volume (ydÂ³)" :
                                      "Count (ea)"
                                    }`
                                  : undefined
                              }
                            />
                            {canEdit && (
                              it.qty_source === "takeoff" ? (
                                <button
                                  type="button"
                                  onClick={() => unlinkItemFromTakeoff(s.id, it.id)}
                                  className="px-2 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs"
                                  title="Unlink from takeoff"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                  </svg>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openTakeoffLinkModal(s.id, it.id)}
                                  className="px-2 py-2 rounded bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-900/40 text-emerald-200 text-xs"
                                  title="Link to takeoff"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                  </svg>
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        <div className="col-span-6 md:col-span-1">
                          <div className="text-xs text-slate-400 mb-1">Rate</div>
                          <input
                            type="number"
                            value={Number.isFinite(it.rate) ? it.rate : 0}
                            disabled={!canEdit}
                            onChange={(e) => updateItem(s.id, it.id, { rate: numOr(e.target.value, 0) })}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-1 flex items-end gap-2">
                          <div className="flex-1">
                            <div className="text-xs text-slate-400 mb-1">Amt</div>
                            <div className="px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white">
                              {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteItem(s.id, it.id)}
                            disabled={!canEdit}
                            className="h-[42px] w-[42px] rounded bg-red-700 text-white disabled:opacity-50"
                            title="Delete item"
                          >
                            ×
                          </button>
                        </div>

                        {it.cost_item_id ? (
                          <div className="col-span-12 text-[11px] text-slate-500">Cost item id: {it.cost_item_id}</div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Step Picker Modal */}
      {picker.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Pick Item</div>
                <div className="text-xs text-slate-400">
                  {pickerBreadcrumb() ? pickerBreadcrumb() : "Type ? Category ? Item ? Variant"}
                </div>
              </div>
              <button onClick={closePicker} className="px-3 py-2 rounded bg-slate-800 text-white">
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => goPickerStep("type")}
                  className={`px-3 py-2 rounded border ${
                    picker.step === "type" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  1. Type{stepDone("type") ? " ?" : ""}
                </button>

                <button
                  onClick={() => (stepDone("type") ? goPickerStep("category") : null)}
                  disabled={!stepDone("type")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${
                    picker.step === "category" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  2. Category{stepDone("category") ? " ?" : ""}
                </button>

                <button
                  onClick={() => (stepDone("category") ? goPickerStep("item") : null)}
                  disabled={!stepDone("category")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${
                    picker.step === "item" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  3. Item{stepDone("item") ? " ?" : ""}
                </button>

                <button
                  onClick={() => (stepDone("item") ? goPickerStep("variant") : null)}
                  disabled={!stepDone("item")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${
                    picker.step === "variant" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  4. Variant
                </button>
              </div>

              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1 space-y-1">
                  <div className="text-xs text-slate-400">Search {stepTitle(picker.step)}</div>
                  <input
                    value={picker.search}
                    onChange={(e) => setPicker((p) => ({ ...p, search: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    placeholder={`Search ${stepTitle(picker.step)}…`}
                    autoFocus
                  />
                </div>
                <div className="text-xs text-slate-500">{rateLoading ? "Loading rate items…" : `${rateItems.length} rate items`}</div>
              </div>

              <div className="border border-slate-800 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 text-sm font-medium">
                  Step {picker.step === "type" ? "1" : picker.step === "category" ? "2" : picker.step === "item" ? "3" : "4"}:{" "}
                  {stepTitle(picker.step)}
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {picker.step === "variant" && pickerOptions.hasNone ? (
                    <div className="p-3">
                      <div className="text-sm text-slate-200">No variants found for this item.</div>
                      <div className="text-xs text-slate-400 mt-1">Continue with “No variant”.</div>
                      <div className="mt-3">
                        <button onClick={() => void finalizePick("")} className="px-3 py-2 rounded bg-blue-700 text-white">
                          Use No Variant
                        </button>
                      </div>
                    </div>
                  ) : pickerOptions.list.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400">No matches.</div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {pickerOptions.list.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            if (picker.step === "type") pickType(opt);
                            else if (picker.step === "category") pickCategory(opt);
                            else if (picker.step === "item") pickItem(opt);
                            else void finalizePick(opt);
                          }}
                          className="w-full text-left px-3 py-3 hover:bg-slate-900"
                        >
                          <div className="text-sm">{opt}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    if (picker.step === "variant") goPickerStep("item");
                    else if (picker.step === "item") goPickerStep("category");
                    else if (picker.step === "category") goPickerStep("type");
                  }}
                  disabled={picker.step === "type"}
                  className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                >
                  Back
                </button>

                <div className="text-xs text-slate-500">
                  {picker.step === "variant" ? "Pick a variant (or No Variant) to fill the row." : "Select an option to continue."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Calculator Modal */}
{calculatorItem && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-md rounded border border-slate-700 bg-slate-950 text-white shadow-xl">

      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="text-sm font-semibold">
          {calculatorItem.item_name}
        </div>

        <button
          onClick={() => setCalculatorItem(null)}
          className="px-3 py-1 rounded bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="px-4 pb-4 flex justify-end gap-2">

  <button
    onClick={() => setCalculatorItem(null)}
    className="px-3 py-2 rounded bg-slate-800 text-white"
  >
    Cancel
  </button>

  <button
    onClick={() => {
      if (!calculatorTarget) return;

      const { sectionId, rowId } = calculatorTarget;

      if (!calculatorItem?.calculator_json) return;

const result = (runBoqCalc(
  calculatorItem.calculator_json,
  calculatorInputs
) ?? { ok:false, qty:0, outputs:{}, errors:[], warnings:[] });if (!result.ok) {
  alert("Calculator error: " + result.errors?.join(", "));
  return;
}

const qty = result.qty;
      setSections((prev) =>
        prev.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                items: s.items.map((it) =>
                  it.id !== rowId
                    ? it
                    : {
                        ...it,
                       qty: Math.round(qty),
    calculator_inputs: calculatorInputs,
                      }
                ),
              }
        )
      );

      setCalculatorItem(null);
      setCalculatorTarget(null);
    }}
    className="px-3 py-2 rounded bg-blue-700 text-white"
  >
    Apply
  </button>

</div>


        {calculatorItem.calculator_json?.inputs?.map((inp: any) => {
  const k = inp.key ?? inp.name;
  return (
    <div key={k} className="space-y-1">
      <div className="text-xs text-slate-400">{inp.label || k}</div>

      <input
        type="number"
        value={calculatorInputs[k] ?? ""}
        onChange={(e) =>
          setCalculatorInputs((prev) => ({
            ...prev,
            [k]: Number(e.target.value),
          }))
        }
        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
      />
    </div>
  );
})}

      </div>
    </div>
  </div>
)}

      {/* Assembly Picker Modal */}
      {asmPicker.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Pick Assembly</div>
                <div className="text-xs text-slate-400">Choose an assembly to expand into BOQ items</div>
              </div>
              <button onClick={closeAssemblyPicker} className="px-3 py-2 rounded bg-slate-800 text-white">
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1 space-y-1">
                  <div className="text-xs text-slate-400">Search Assemblies</div>
                  <input
                    value={asmPicker.search}
                    onChange={(e) => setAsmPicker((p) => ({ ...p, search: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    placeholder="Search assemblies…"
                    autoFocus
                  />
                </div>
                <div className="text-xs text-slate-500">{asmLoading ? "Loading…" : `${assemblies.length} assemblies`}</div>
              </div>

              <div className="border border-slate-800 rounded overflow-hidden">
                <div className="max-h-[420px] overflow-auto">
                  {filteredAssemblies.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400">No matches.</div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {filteredAssemblies.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            if (!asmPicker.sectionId) return;
                            void addAssemblyToSection(asmPicker.sectionId, a.id);
                          }}
                          className="w-full text-left px-3 py-3 hover:bg-slate-900"
                        >
                          <div className="text-sm font-medium">{a.name}</div>
                          {a.description ? <div className="text-xs text-slate-400 mt-1">{a.description}</div> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-500">Tip: Assemblies expand into items so they save/print like normal BOQ rows.</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Takeoff Link Modal */}
      {takeoffLinkModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Link to Takeoff</div>
                <div className="text-xs text-slate-400">Connect this BOQ item quantity to a takeoff group total</div>
              </div>
              <button
                onClick={() => setTakeoffLinkModal({ ...takeoffLinkModal, open: false })}
                className="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-sm"
              >
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {takeoffGroups.length === 0 ? (
                <div className="text-sm text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded p-3">
                  No takeoff data found. Please create measurements in the Takeoff page first.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Takeoff Group</label>
                    <select
                      value={takeoffLinkModal.selectedGroupId}
                      onChange={(e) => setTakeoffLinkModal({ ...takeoffLinkModal, selectedGroupId: e.target.value })}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="">Select group...</option>
                      {takeoffGroups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-400">Metric</label>
                    <select
                      value={takeoffLinkModal.selectedMetric}
                      onChange={(e) => setTakeoffLinkModal({
                        ...takeoffLinkModal,
                        selectedMetric: e.target.value as "line_ft" | "area_ft2" | "volume_yd3" | "count_ea"
                      })}
                      className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="line_ft">Line (ft)</option>
                      <option value="area_ft2">Area (ftÂ²)</option>
                      <option value="volume_yd3">Volume (ydÂ³)</option>
                      <option value="count_ea">Count (ea)</option>
                    </select>
                  </div>

                  {takeoffLinkModal.selectedGroupId && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded p-3">
                      <div className="text-xs text-slate-400 mb-1">Preview Value</div>
                      <div className="text-lg font-semibold text-emerald-400">
                        {(() => {
                          const total = takeoffTotals[takeoffLinkModal.selectedGroupId];
                          if (!total) return "0";
                          const value = total[takeoffLinkModal.selectedMetric] || 0;
                          return value.toFixed(2);
                        })()}
                        <span className="text-sm text-slate-400 ml-2">
                          {takeoffLinkModal.selectedMetric === "line_ft" && "ft"}
                          {takeoffLinkModal.selectedMetric === "area_ft2" && "ftÂ²"}
                          {takeoffLinkModal.selectedMetric === "volume_yd3" && "ydÂ³"}
                          {takeoffLinkModal.selectedMetric === "count_ea" && "ea"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        from: {takeoffGroups.find(g => g.id === takeoffLinkModal.selectedGroupId)?.name}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setTakeoffLinkModal({ ...takeoffLinkModal, open: false })}
                      className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={linkItemToTakeoff}
                      disabled={!takeoffLinkModal.selectedGroupId}
                      className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
                    >
                      Link
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        featureName={paywallFeature}
      />
    </div>
  );
}
