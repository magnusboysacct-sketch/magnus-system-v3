// src/pages/BOQPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";
import { ImportTakeoffModal } from "../components/ImportTakeoffModal";
import { generateProcurementFromBOQ } from "../lib/procurement";
import { generateEstimateFromBOQ } from "../lib/estimates";

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

type BoqHeaderRow = {
  id: string;
  project_id: string;
  status: string;
  version: number;
  updated_at: string;
};

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
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();

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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => routeProjectId || resolveProjectId());

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

  const [importTakeoffModal, setImportTakeoffModal] = useState<{
    open: boolean;
    sectionId: string | null;
    itemId: string | null;
  }>({
    open: false,
    sectionId: null,
    itemId: null,
  });

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
      console.log("[BOQ Load] Loading BOQ for project:", projectId);

      const { data: headers, error: headerErr } = await supabase
        .from("boq_headers")
        .select("id,project_id,status,version,updated_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .order("version", { ascending: false })
        .limit(1);

      if (headerErr) throw headerErr;

      const header = Array.isArray(headers) ? (headers[0] as BoqHeaderRow | undefined) : undefined;
      if (!header) {
        console.log("[BOQ Load] No existing BOQ found for project");
        setBoqId(null);
        setStatus("draft");
        setSections([]);
        return;
      }

      console.log("[BOQ Load] Found BOQ header:", header.id);
      setBoqId(header.id);
      setStatus(header.status as "draft" | "approved");

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
            "id,section_id,sort_order,pick_type,pick_category,pick_item,pick_variant,cost_item_id,item_name,description,unit_id,qty,rate"
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
      console.log("[BOQ Save] ========== Starting save process ==========");
      console.log("[BOQ Save] Current local boqId:", boqId);
      console.log("[BOQ Save] Project ID:", projectId);
      console.log("[BOQ Save] Target status:", nextStatus);
      console.log("[BOQ Save] Sections count:", sections.length);

      let headerId = boqId;
      let versionNumber = 1;
      let operationType: "INSERT" | "UPDATE" = "INSERT";

      // Step 1: Determine if we need to INSERT or UPDATE
      if (!headerId) {
        console.log("[BOQ Save] No local boqId - checking for existing BOQ in database...");

        // Check if a BOQ already exists for this project
        const { data: existingBoqs, error: checkErr } = await supabase
          .from("boq_headers")
          .select("id, version, status")
          .eq("project_id", projectId)
          .order("version", { ascending: false })
          .limit(1);

        if (checkErr) {
          console.error("[BOQ Save] Failed to check for existing BOQs:", checkErr);
          throw checkErr;
        }

        const existingBoq = Array.isArray(existingBoqs) && existingBoqs.length > 0 ? existingBoqs[0] : null;

        if (existingBoq) {
          console.log("[BOQ Save] Found existing BOQ:", existingBoq);

          // If we're saving a draft and a draft already exists, reuse it
          if (nextStatus === "draft" && existingBoq.status === "draft") {
            console.log("[BOQ Save] Reusing existing draft BOQ");
            headerId = String(existingBoq.id);
            versionNumber = numOr(existingBoq.version, 1);
            operationType = "UPDATE";
          } else {
            // Create a new version
            versionNumber = numOr(existingBoq.version, 0) + 1;
            operationType = "INSERT";
            console.log("[BOQ Save] Creating new version:", versionNumber);
          }
        } else {
          console.log("[BOQ Save] No existing BOQ found - will create first version");
          versionNumber = 1;
          operationType = "INSERT";
        }
      } else {
        console.log("[BOQ Save] Have local boqId - will UPDATE existing BOQ");
        operationType = "UPDATE";

        // Fetch the existing BOQ to get its version number
        const { data: existingBoq, error: fetchErr } = await supabase
          .from("boq_headers")
          .select("id, version, project_id")
          .eq("id", headerId)
          .single();

        if (fetchErr) {
          console.error("[BOQ Save] Failed to fetch existing BOQ:", fetchErr);
          throw fetchErr;
        }

        versionNumber = numOr(existingBoq.version, 1);
        console.log("[BOQ Save] Existing BOQ version:", versionNumber);

        // Verify the BOQ belongs to the current project
        if (String(existingBoq.project_id) !== projectId) {
          const errorMsg = `BOQ ${headerId} belongs to a different project!`;
          console.error("[BOQ Save]", errorMsg);
          throw new Error(errorMsg);
        }
      }

      console.log("[BOQ Save] Operation type:", operationType);
      console.log("[BOQ Save] Version number:", versionNumber);

      // Step 2: Create or update the BOQ header in boq_headers table
      if (operationType === "INSERT") {
        console.log("[BOQ Save] INSERTING new BOQ header with version:", versionNumber);

        // Double-check the version doesn't exist (defensive guard)
        const { data: versionCheck, error: versionCheckErr } = await supabase
          .from("boq_headers")
          .select("id")
          .eq("project_id", projectId)
          .eq("version", versionNumber)
          .maybeSingle();

        if (versionCheckErr) {
          console.error("[BOQ Save] Version check failed:", versionCheckErr);
          throw versionCheckErr;
        }

        if (versionCheck) {
          const errorMsg = `Cannot INSERT: BOQ version ${versionNumber} already exists for project ${projectId}. This should not happen!`;
          console.error("[BOQ Save]", errorMsg);
          throw new Error(errorMsg);
        }

        const { data: ins, error: insErr } = await supabase
          .from("boq_headers")
          .insert([{ project_id: projectId, status: nextStatus, version: versionNumber }])
          .select("id, version")
          .single();

        if (insErr) {
          console.error("[BOQ Save] Failed to INSERT BOQ header:", insErr);
          throw insErr;
        }

        headerId = String((ins as any).id);
        versionNumber = numOr((ins as any).version, versionNumber);
        console.log("[BOQ Save] Successfully INSERTED BOQ header:");
        console.log("[BOQ Save]   - ID:", headerId);
        console.log("[BOQ Save]   - Version:", versionNumber);
        setBoqId(headerId);
      } else {
        console.log("[BOQ Save] UPDATING existing BOQ header:", headerId);
        const { error: upErr } = await supabase
          .from("boq_headers")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", headerId);

        if (upErr) {
          console.error("[BOQ Save] Failed to UPDATE BOQ header:", upErr);
          throw upErr;
        }
        console.log("[BOQ Save] Successfully UPDATED BOQ header");
      }

      // Step 3: Verify the BOQ header exists before inserting sections
      console.log("[BOQ Save] Verifying BOQ header exists:", headerId);
      const { data: verifyHeader, error: verifyErr } = await supabase
        .from("boq_headers")
        .select("id, version, project_id")
        .eq("id", headerId)
        .single();

      if (verifyErr || !verifyHeader) {
        const errorMsg = `BOQ header verification failed! Header ID ${headerId} does not exist in boq_headers table.`;
        console.error("[BOQ Save]", errorMsg);
        throw new Error(errorMsg);
      }
      console.log("[BOQ Save] BOQ header verified successfully:");
      console.log("[BOQ Save]   - ID:", verifyHeader.id);
      console.log("[BOQ Save]   - Version:", verifyHeader.version);
      console.log("[BOQ Save]   - Project ID:", verifyHeader.project_id);

      // Step 4: Delete existing sections
      console.log("[BOQ Save] Deleting existing sections for boq_id:", headerId);
      const { error: delSecErr } = await supabase
        .from("boq_sections")
        .delete()
        .eq("boq_id", headerId);

      if (delSecErr) {
        console.error("[BOQ Save] Failed to delete sections:", delSecErr);
        throw delSecErr;
      }
      console.log("[BOQ Save] Existing sections deleted");

      // Step 5: Insert sections
      if (sections.length > 0) {
        const sectionPayload = sections.map((s, idx) => {
          const payload = {
            id: s.id,
            boq_id: headerId,
            sort_order: idx,
            master_category_id: s.masterCategoryId,
            title: s.title ?? "New Section",
            scope: s.scope ?? "",
          };
          console.log("[BOQ Save] Section payload [" + idx + "]:", {
            id: payload.id,
            boq_id: payload.boq_id,
            title: payload.title,
          });
          return payload;
        });

        console.log("[BOQ Save] Inserting", sectionPayload.length, "sections...");
        const { error: secInsErr } = await supabase
          .from("boq_sections")
          .insert(sectionPayload);

        if (secInsErr) {
          console.error("[BOQ Save] Failed to insert sections:", secInsErr);
          throw secInsErr;
        }
        console.log("[BOQ Save] Sections inserted successfully");
      } else {
        console.log("[BOQ Save] No sections to insert");
      }

      // Step 6: Insert items
      const itemPayload: any[] = [];
      for (const s of sections) {
        for (let i = 0; i < s.items.length; i++) {
          const it = s.items[i];
          const payload = {
            id: it.id,
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
          };
          itemPayload.push(payload);
        }
      }

      if (itemPayload.length > 0) {
        console.log("[BOQ Save] Inserting", itemPayload.length, "items...");
        itemPayload.forEach((item, idx) => {
          if (idx < 3) {
            // Log first 3 items only to avoid console spam
            console.log("[BOQ Save] Item payload [" + idx + "]:", {
              id: item.id,
              section_id: item.section_id,
              item_name: item.item_name,
            });
          }
        });

        const { error: itemInsErr } = await supabase
          .from("boq_section_items")
          .insert(itemPayload);

        if (itemInsErr) {
          console.error("[BOQ Save] Failed to insert items:", itemInsErr);
          throw itemInsErr;
        }
        console.log("[BOQ Save] Items inserted successfully");
      } else {
        console.log("[BOQ Save] No items to insert");
      }

      setStatus(nextStatus);
      console.log("[BOQ Save] ========== Save completed successfully! ==========");

      // light touch: update autosave indicator if user is using auto-save
      if (autoSaveOn) setLastAutoSaveAt(new Date().toLocaleString());
    } catch (e: any) {
      console.error("[BOQ Save] ========== Save failed! ==========");
      console.error("[BOQ Save] Error:", e);
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

  function handleImportTakeoff(groupName: string, metric: string, value: number) {
    if (!importTakeoffModal.sectionId || !importTakeoffModal.itemId) return;

    updateItem(importTakeoffModal.sectionId, importTakeoffModal.itemId, {
      qty: value,
    });
  }

  function approveAndLock() {
    void saveBoqToSupabase("approved");
  }

  async function generateEstimateFromBoq() {
    if (status !== "approved") {
      setPersistError("You must approve the BOQ first.");
      return;
    }

    if (!routeProjectId || !boqId) {
      setPersistError("Please save the BOQ first.");
      return;
    }

    setPersistLoading(true);
    setPersistError(null);

    try {
      const result = await generateEstimateFromBOQ(routeProjectId, boqId);

      if (result.success) {
        console.log("[BOQ] Successfully generated estimate:", result.estimateId);
        setTimeout(() => {
          nav(`/projects/${routeProjectId}/estimates`);
        }, 500);
      } else {
        setPersistError(`Failed to generate estimate: ${result.error}`);
      }
    } catch (e: any) {
      setPersistError(`Error generating estimate: ${e?.message || String(e)}`);
    } finally {
      setPersistLoading(false);
    }
  }

  async function handleGenerateProcurement() {
    if (!routeProjectId) {
      setPersistError("Please select a project first");
      return;
    }

    const confirmGenerate = window.confirm(
      "This will regenerate the procurement list from the current BOQ. Any existing procurement items will be replaced. Continue?"
    );

    if (!confirmGenerate) return;

    setPersistLoading(true);
    setPersistError(null);

    try {
      const result = await generateProcurementFromBOQ(routeProjectId);

      if (result.success) {
        console.log("[BOQ] Successfully generated procurement:", result.count, "items");
        setTimeout(() => {
          nav(`/projects/${routeProjectId}/procurement`);
        }, 500);
      } else {
        setPersistError(`Failed to generate procurement: ${result.error}`);
      }
    } catch (e: any) {
      setPersistError(`Error generating procurement: ${e?.message || String(e)}`);
    } finally {
      setPersistLoading(false);
    }
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

  // Determine current project context
  const currentProject = projects.find(p => p.id === (routeProjectId || activeProjectId));

  // Sync activeProjectId when route changes
  useEffect(() => {
    if (routeProjectId && routeProjectId !== activeProjectId) {
      setActiveProjectId(routeProjectId);
    }
  }, [routeProjectId, activeProjectId]);

  return (
    <div className="p-6 space-y-6">
      {/* Project Context Header */}
      {routeProjectId ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">Project Context</div>
              <div className="text-sm font-semibold">
                {currentProject?.name || `Project ${routeProjectId}`}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Project ID: {routeProjectId}
              </div>
            </div>
            <button
              onClick={() => nav(`/projects/${routeProjectId}`)}
              className="px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm"
            >
              Back to Project
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
          <div className="text-sm font-semibold text-amber-300">Global BOQ Mode</div>
          <div className="text-xs text-amber-400/70 mt-1">
            No project context. Select a project below or access BOQ from a project dashboard.
          </div>
        </div>
      )}

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

          <button
            onClick={handleGenerateProcurement}
            disabled={!routeProjectId || sections.length === 0}
            className="px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50"
            title="Generate procurement list from BOQ items"
          >
            Generate Procurement
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
                          <div className="text-xs text-slate-400 mb-1">Qty</div>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={Number.isFinite(it.qty) ? it.qty : 0}
                              disabled={!canEdit}
                              onChange={(e) => updateItem(s.id, it.id, { qty: numOr(e.target.value, 0) })}
                              className="flex-1 px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                            />
                            {canEdit && routeProjectId && (
                              <button
                                onClick={() =>
                                  setImportTakeoffModal({
                                    open: true,
                                    sectionId: s.id,
                                    itemId: it.id,
                                  })
                                }
                                className="px-2 py-2 rounded bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-900/40 text-emerald-300 text-xs"
                                title="Import from Takeoff"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                              </button>
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

      <ImportTakeoffModal
        isOpen={importTakeoffModal.open}
        onClose={() => setImportTakeoffModal({ open: false, sectionId: null, itemId: null })}
        projectId={routeProjectId || ""}
        onImport={handleImportTakeoff}
      />
    </div>
  );
}