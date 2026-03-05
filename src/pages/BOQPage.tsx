// src/pages/BOQPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists.ts";
import { saveBoq as persistBoq, loadLatestBoqForProject as loadLatestBoqForProjectFromDb, type BoqStatus } from "../boq/boqPersistence.ts";

type RateItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;

  // from v_cost_items_current only
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

  qty_source?: "manual" | "takeoff";
  takeoff_group_id?: string;
  takeoff_metric?: "line_ft" | "area_ft2" | "volume_yd3" | "count_ea";
};

type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
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
  line_type: string; // material/labour/equipment/subcontract/other
  quantity_factor: number;
  waste_percent: number;
  sort_order: number;
  notes: string | null;
};

function safeId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

type ProjectRow = {
  id: string;
  name: string | null;
};

function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export default function BOQPage() {
  const nav = useNavigate();

  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [sections, setSections] = useState<Section[]>([]);

  // Persistence state
  const [boqId, setBoqId] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Project picker state
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => resolveProjectId());

  // Auto-save state (UI only right now)
  const [autoSaveOn, setAutoSaveOn] = useState(true);
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
          .select("id,item_name,description,variant,unit,category,item_type,current_rate,current_currency")
          .order("item_name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as RateItem[]);
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
          .from("cost_items")
          .select("id,item_name,description,variant,unit,category,item_type")
          .order("item_name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as RateItem[]);
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

  // -----------------------------
  // Assemblies (PlanSwift-style)
  // -----------------------------
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assemblyComponents, setAssemblyComponents] = useState<AssemblyComponentRow[]>([]);
  const [assemblyLoading, setAssemblyLoading] = useState(false);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);

  type AssemblyModalState = {
    open: boolean;
    sectionId: string | null;
    search: string;
    selectedAssemblyId: string;
    qty: string; // keep as string for input
  };

  const [asmModal, setAsmModal] = useState<AssemblyModalState>({
    open: false,
    sectionId: null,
    search: "",
    selectedAssemblyId: "",
    qty: "1",
  });

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
      setAssemblyLoading(true);
      setAssemblyError(null);

      try {
        const { data: aData, error: aErr } = await supabase
          .from("assemblies")
          .select("id,name,description,unit,category,is_active")
          .order("name", { ascending: true })
          .limit(5000);

        if (aErr) throw aErr;

        const active = (Array.isArray(aData) ? aData : []).filter((a: any) => a?.is_active !== false);
        const list = active.map((a: any) => ({
          id: String(a.id),
          name: String(a.name ?? ""),
          description: a.description ? String(a.description) : null,
          unit: a.unit ? String(a.unit) : null,
          category: a.category ? String(a.category) : null,
          is_active: a.is_active ?? true,
        })) as AssemblyRow[];

        const { data: cData, error: cErr } = await supabase
          .from("assembly_components")
          .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
          .order("assembly_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(20000);

        if (cErr) throw cErr;

        const comps = (Array.isArray(cData) ? cData : []).map((c: any) => ({
          id: String(c.id),
          assembly_id: String(c.assembly_id),
          cost_item_id: String(c.cost_item_id),
          line_type: String(c.line_type ?? "material"),
          quantity_factor: numOr(c.quantity_factor, 1),
          waste_percent: numOr(c.waste_percent, 0),
          sort_order: Number.isFinite(Number(c.sort_order)) ? Number(c.sort_order) : 0,
          notes: c.notes ? String(c.notes) : null,
        })) as AssemblyComponentRow[];

        if (!alive) return;
        setAssemblies(list);
        setAssemblyComponents(comps);
      } catch (e: any) {
        console.error("loadAssemblies failed:", e);
        if (!alive) return;
        setAssemblyError(e?.message ?? "Failed to load assemblies");
        setAssemblies([]);
        setAssemblyComponents([]);
      } finally {
        if (alive) setAssemblyLoading(false);
      }
    }

    loadAssemblies();
    return () => {
      alive = false;
    };
  }, []);

  function openAssemblyModal(sectionId: string) {
    setAsmModal({
      open: true,
      sectionId,
      search: "",
      selectedAssemblyId: "",
      qty: "1",
    });
  }

  function closeAssemblyModal() {
    setAsmModal({
      open: false,
      sectionId: null,
      search: "",
      selectedAssemblyId: "",
      qty: "1",
    });
  }

  function mapLineTypeToPickType(lineType: string) {
    const t = (lineType ?? "").toLowerCase();
    if (t === "material") return "Material";
    if (t === "labour" || t === "labor") return "Labor";
    if (t === "equipment") return "Equipment";
    if (t === "subcontract") return "Subcontract";
    return "Other";
  }

  function matchUnitIdByName(unitName: string | null) {
    if (!unitName) return null;
    const u = usableUnits.find((x: any) => getUnitLabel(x).toLowerCase() === unitName.toLowerCase());
    return u ? getUnitId(u) : null;
  }

  function addAssemblyToSectionUI(sectionId: string, assemblyId: string, qtyStr: string) {
    const qtyBase = numOr(qtyStr, 0);
    if (!sectionId || !assemblyId || qtyBase <= 0) {
      alert("Pick an assembly and enter a quantity greater than 0.");
      return;
    }

    const comps = assemblyComponents
      .filter((c) => c.assembly_id === assemblyId)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    if (comps.length === 0) {
      alert("This assembly has no components yet.");
      return;
    }

    const newRows: BOQItemRow[] = comps.map((c) => {
      const r = rateItems.find((x) => x.id === c.cost_item_id) ?? null;

      const pickType = mapLineTypeToPickType(c.line_type);
      const pickCategory = (r?.category ?? "").trim();
      const pickItem = (r?.item_name ?? "").trim();
      const pickVariant = (r?.variant ?? "").trim();

      const unitName = r?.unit ?? null;
      const unitId = matchUnitIdByName(unitName);

      const waste = numOr(c.waste_percent, 0);
      const factor = numOr(c.quantity_factor, 1);
      const finalQty = qtyBase * factor * (1 + waste / 100);

      const viewRate = numOr(r?.current_rate ?? 0, 0);

      return {
        id: safeId(),

        pick_type: pickType,
        pick_category: pickCategory,
        pick_item: pickItem,
        pick_variant: pickVariant,

        cost_item_id: c.cost_item_id,

        item_name: r?.item_name ?? "",
        description: (r?.description ?? "").trim() ? (r?.description ?? "") : c.notes ?? "",
        unit_id: unitId,

        qty: Number.isFinite(finalQty) ? finalQty : 0,
        rate: viewRate,
      };
    });

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return { ...s, items: [...s.items, ...newRows] };
      })
    );

    closeAssemblyModal();
  }

  // -----------------------------
// Persistence
// -----------------------------
async function loadLatestBoqForProject(projectId: string) {
  setPersistLoading(true);
  setPersistError(null);

  try {
    const loaded = await loadLatestBoqForProjectFromDb(projectId);
    if (!loaded) {
      setBoqId(null);
      setStatus("draft");
      setSections([]);
      return;
    }

    setBoqId(loaded.header.id);
    setStatus(loaded.header.status);
    setSections(loaded.sections as any);
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
    const savedId = await persistBoq({
      boqId: boqId ?? null,
      projectId,
      status: nextStatus as BoqStatus,
      sections: sections as any,
    });

    setBoqId(savedId);
    setStatus(nextStatus);

    // reload from DB (captures computed qty_calculated)
    await loadLatestBoqForProject(projectId);

    if (autoSaveOn) setLastAutoSaveAt(new Date().toLocaleString());
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
    setSections((prev) =>
      prev.map((s) => (s.id !== sectionId ? s : { ...s, items: s.items.filter((it) => it.id !== itemId) }))
    );
  }

  function updateItem(sectionId: string, itemId: string, patch: Partial<BOQItemRow>) {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId ? s : { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
      )
    );
  }

  function openTakeoffLinkModal(sectionId: string, itemId: string) {
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
  // Modern Step Picker (Type → Category → Item → Variant)
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
    return parts.join(" → ");
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

    closePicker();
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
          <div className="text-xs text-slate-400 mt-1">
            Simple + stable version (separate buttons, no popover/event-listener code)
          </div>
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

      <div className="text-xs text-slate-500">
        Auto-save: <span className="font-semibold">{autoSaveOn ? "On" : "Off"}</span>
        {lastAutoSaveAt ? (
          <>
            {" "}
            • Last: <span className="font-semibold">{lastAutoSaveAt}</span>
          </>
        ) : null}
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

      {assemblyLoading ? (
        <div className="text-xs text-slate-500">Loading assemblies…</div>
      ) : assemblyError ? (
        <div className="text-xs text-red-400">Assemblies failed: {assemblyError}</div>
      ) : (
        <div className="text-xs text-slate-500">
          Assemblies: {assemblies.length} • Components: {assemblyComponents.length}
        </div>
      )}

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
                    onClick={() => openAssemblyModal(s.id)}
                    disabled={!canEdit || assemblyLoading}
                    className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                    title="Add from Assembly (PlanSwift-style)"
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
                    No items yet. Click <strong>Add Item</strong>.
                  </div>
                ) : (
                  s.items.map((it) => {
                    const amount = numOr(it.qty) * numOr(it.rate);
                    const pickLabel = [it.pick_type, it.pick_category, it.pick_item, it.pick_variant]
                      .map((x) => (x ?? "").trim())
                      .filter(Boolean)
                      .join(" → ");

                    return (
                      <div key={it.id} className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-12 md:col-span-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => openPicker(s.id, it.id)}
                            disabled={!canEdit || rateLoading}
                            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50 text-left"
                            title="Pick from Rate Library (Type → Category → Item → Variant)"
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
                                      it.takeoff_metric === "area_ft2" ? "Area (ft²)" :
                                      it.takeoff_metric === "volume_yd3" ? "Volume (yd³)" :
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

      {/* Picker modal */}
      {picker.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Pick Item</div>
                <div className="text-xs text-slate-400">
                  {pickerBreadcrumb() ? pickerBreadcrumb() : "Type → Category → Item → Variant"}
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
                  1. Type{stepDone("type") ? " ✓" : ""}
                </button>

                <button
                  onClick={() => (stepDone("type") ? goPickerStep("category") : null)}
                  disabled={!stepDone("type")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${
                    picker.step === "category" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  2. Category{stepDone("category") ? " ✓" : ""}
                </button>

                <button
                  onClick={() => (stepDone("category") ? goPickerStep("item") : null)}
                  disabled={!stepDone("category")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${
                    picker.step === "item" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"
                  }`}
                >
                  3. Item{stepDone("item") ? " ✓" : ""}
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

      {/* Assembly modal */}
      {asmModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Add From Assembly</div>
                <div className="text-xs text-slate-400">Select an assembly and quantity, then explode into BOQ lines.</div>
              </div>
              <button onClick={closeAssemblyModal} className="px-3 py-2 rounded bg-slate-800 text-white">
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {assemblyError ? <div className="text-xs text-red-400">Assemblies error: {assemblyError}</div> : null}

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-8 space-y-1">
                  <div className="text-xs text-slate-400">Search Assembly</div>
                  <input
                    value={asmModal.search}
                    onChange={(e) => setAsmModal((p) => ({ ...p, search: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    placeholder="Search assembly…"
                    autoFocus
                  />
                </div>

                <div className="col-span-12 md:col-span-4 space-y-1">
                  <div className="text-xs text-slate-400">Assembly Qty</div>
                  <input
                    value={asmModal.qty}
                    onChange={(e) => setAsmModal((p) => ({ ...p, qty: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="border border-slate-800 rounded overflow-hidden">
                <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 text-sm font-medium">
                  Assemblies ({assemblies.length})
                </div>

                <div className="max-h-[360px] overflow-auto">
                  {assemblies
                    .filter((a) => {
                      const q = asmModal.search.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (a.name ?? "").toLowerCase().includes(q) ||
                        (a.category ?? "").toLowerCase().includes(q) ||
                        (a.description ?? "").toLowerCase().includes(q)
                      );
                    })
                    .map((a) => {
                      const selected = asmModal.selectedAssemblyId === a.id;
                      const compCount = assemblyComponents.filter((c) => c.assembly_id === a.id).length;

                      return (
                        <button
                          key={a.id}
                          onClick={() => setAsmModal((p) => ({ ...p, selectedAssemblyId: a.id }))}
                          className={`w-full text-left px-3 py-3 hover:bg-slate-900 border-b border-slate-800 ${
                            selected ? "bg-slate-900" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{a.name}</div>
                              <div className="text-xs text-slate-400">
                                {(a.category ? `${a.category} • ` : "")}
                                {compCount} lines
                                {a.unit ? ` • unit: ${a.unit}` : ""}
                              </div>
                              {a.description ? <div className="text-xs text-slate-500 mt-1">{a.description}</div> : null}
                            </div>
                            {selected ? <div className="text-xs text-blue-400">Selected</div> : null}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-slate-500">{asmModal.selectedAssemblyId ? "Ready to add." : "Select an assembly first."}</div>

                <button
                  onClick={() =>
                    asmModal.sectionId && asmModal.selectedAssemblyId
                      ? addAssemblyToSectionUI(asmModal.sectionId, asmModal.selectedAssemblyId, asmModal.qty)
                      : null
                  }
                  disabled={!asmModal.sectionId || !asmModal.selectedAssemblyId}
                  className="px-3 py-2 rounded bg-blue-700 text-white disabled:opacity-50"
                >
                  Add Assembly Lines
                </button>
              </div>
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
                      <option value="area_ft2">Area (ft²)</option>
                      <option value="volume_yd3">Volume (yd³)</option>
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
                          {takeoffLinkModal.selectedMetric === "area_ft2" && "ft²"}
                          {takeoffLinkModal.selectedMetric === "volume_yd3" && "yd³"}
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
    </div>
  );
}








