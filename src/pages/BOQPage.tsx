// src/pages/BOQPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";

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

function safeId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
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

/** -----------------------------
 *  BOQ Persistence helpers
 *  ----------------------------- */
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
  const [boqVersion, setBoqVersion] = useState<number>(1);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // ✅ Project picker state
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => resolveProjectId());

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

  // ✅ Load projects for picker
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
        setRateLoading(false);
        return;
      } catch (e: any) {
        console.warn("v_cost_items_current failed, falling back to cost_items:", e?.message ?? e);
      }

      try {
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

  /** -----------------------------
   *  Save / Load BOQ (Supabase)
   *  ----------------------------- */
  async function loadLatestBoqForProject(projectId: string) {
    setPersistLoading(true);
    setPersistError(null);

    try {
      // Load latest header
      const { data: headers, error: headerErr } = await supabase
        .from("boqs")
        .select("id,project_id,status,version,updated_at,created_at")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("version", { ascending: false })
        .limit(1);

      if (headerErr) throw headerErr;

      const header = Array.isArray(headers) ? (headers[0] as any) : null;

      if (!header?.id) {
        setBoqId(null);
        setBoqVersion(1);
        setStatus("draft");
        setSections([]);
        return;
      }

      setBoqId(String(header.id));
      setBoqVersion(Number(header.version ?? 1));
      setStatus((header.status ?? "draft") as any);

      // Load sections
      const { data: secRows, error: secErr } = await supabase
        .from("boq_sections")
        .select("id,boq_id,sort_order,master_category_id,title,scope")
        .eq("boq_id", header.id)
        .order("sort_order", { ascending: true });

      if (secErr) throw secErr;

      const secList = Array.isArray(secRows) ? secRows : [];
      const sectionIds = secList.map((s: any) => s.id).filter(Boolean);

      // Load items for these sections
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

      // Rebuild UI state (keep UI IDs = DB ids)
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

  async function getLatestBoqHeaderForProject(projectId: string): Promise<{ id: string; version: number; status: "draft" | "approved" } | null> {
    const { data, error } = await supabase
      .from("boqs")
      .select("id,version,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.id) return null;
    return { id: String(row.id), version: Number(row.version ?? 1), status: (row.status ?? "draft") as any };
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
    // If we have a boqId, verify it still exists. If not, force-create a new header.
    let boqIdToUse: string | null = boqId;

    if (boqIdToUse) {
      const { data: existing, error: existsErr } = await supabase
        .from("boqs")
        .select("id")
        .eq("id", boqIdToUse)
        .maybeSingle();

      if (existsErr) throw existsErr;

      if (!existing?.id) {
        // stale / deleted / never-created id in UI state
        boqIdToUse = null;
        setBoqId(null);
      }
    }

    // Build payload for RPC (server generates ids + sort_order)
    const payload = {
      sections: sections.map((s) => ({
        masterCategoryId: s.masterCategoryId ?? "",
        title: s.title ?? "New Section",
        scope: s.scope ?? "",
        items: (s.items ?? []).map((it) => ({
          pick_type: it.pick_type ?? "",
          pick_category: it.pick_category ?? "",
          pick_item: it.pick_item ?? "",
          pick_variant: it.pick_variant ?? "",
          cost_item_id: it.cost_item_id ?? "",
          item_name: it.item_name ?? "",
          description: it.description ?? "",
          unit_id: it.unit_id ?? "",
          qty: numOr(it.qty, 0),
          rate: numOr(it.rate, 0),
        })),
      })),
    };

    const { data: savedId, error } = await supabase.rpc("save_boq", {
      p_project_id: projectId,
      p_status: nextStatus,
      p_version: boqVersion && boqVersion > 0 ? boqVersion : 1,
      p_payload: payload,
      p_boq_id: boqIdToUse, // null -> create new header
    });

    if (error) throw error;
    if (!savedId) throw new Error("save_boq did not return a BOQ id.");

    setBoqId(String(savedId));
    setStatus(nextStatus);

    // Re-load so UI matches DB exactly
    await loadLatestBoqForProject(projectId);
  } catch (e: any) {
    console.error("saveBoqToSupabase failed:", e);
    setPersistError(e?.message ?? "Failed to save BOQ");
    alert(e?.message ?? "Failed to save BOQ");
  } finally {
    setPersistLoading(false);
  }
}

  // ✅ When project changes: save to localStorage + load latest boq
  async function setActiveProject(projectId: string | null) {
    const next = projectId && projectId.trim() ? projectId.trim() : null;
    setActiveProjectId(next);

    if (next) localStorage.setItem("active_project_id", next);
    else localStorage.removeItem("active_project_id");

    // reset BOQ state and reload for the chosen project
    setBoqId(null);
    setStatus("draft");
    setSections([]);
    if (next) await loadLatestBoqForProject(next);
  }

  // ✅ Create project (minimal prompt UI)
  async function createProject() {
    const name = window.prompt("Enter project name:");
    if (!name || !name.trim()) return;

    try {
      const { data, error } = await supabase
        .from("projects")
        .insert([{ name: name.trim() }])
        .select("id,name")
        .single();

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

  // ✅ Auto-load if localStorage already has active_project_id
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

  function itemsForType(type: string) {
    if (!type) return rateItems;
    return rateItems.filter((r) => (r.item_type ?? "").toLowerCase() === type.toLowerCase());
  }

  function categoryOptions(type: string) {
    const list = itemsForType(type);
    return uniqSorted(list.map((r) => (r.category ?? "").trim()).filter(Boolean));
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
    if (list.length === 1) return list[0];
    return list[0] ?? null;
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
      const rate = row?.rate;
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

    const hasViewRate =
      typeof r.current_rate === "number" && Number.isFinite(r.current_rate) && r.current_rate > 0;
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

  const typeOptions = useMemo(() => {
    const discovered = uniqSorted(rateItems.map((r) => (r.item_type ?? "").trim()).filter(Boolean));
    const common = ["Material", "Labor", "Equipment", "Subcontract", "Other"];
    return uniqSorted([...common, ...discovered]);
  }, [rateItems]);

  const totals = useMemo(() => {
    let subtotal = 0;
    for (const s of sections) for (const it of s.items) subtotal += numOr(it.qty) * numOr(it.rate);
    return { subtotal };
  }, [sections]);

  function goEditScopes() { nav("/settings/master-lists"); }

  function generateEstimateFromBoq() {
    if (status !== "approved") { alert("You must approve BOQ first."); return; }
    alert("Estimate generated from BOQ (placeholder).");
  }

  async function cloneToNextDraft() {
    alert("Clone to Draft not wired yet (temporary).");
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">BOQ Builder</h1>

        <div className="flex gap-2">
          <button onClick={() => {
            const hasAnySections = sections.length > 0;
            const hasAnyItems = sections.some((s) => (s.items?.length ?? 0) > 0);
            if (!hasAnySections || !hasAnyItems) {
              alert("Add at least one section and one item before approving.");
              return;
            }
            void saveBoqToSupabase("approved");
          }} className="px-3 py-2 rounded bg-slate-800 text-white">
            Approve
          </button>

          {status === "approved" && (
            <button
              onClick={() => void cloneToNextDraft()}
              className="px-3 py-2 rounded bg-slate-700 text-white"
            >
              Clone to Draft
            </button>
          )}

          <button
            onClick={generateEstimateFromBoq}
            disabled={status !== "approved"}
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Generate Estimate
          </button>
        </div>
      </div>

      {/* ✅ Project picker row (minimal + consistent styling) */}
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="space-y-1 w-full md:max-w-[520px]">
          <div className="text-xs text-slate-400">Project (required)</div>
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

        <button
          onClick={() => void createProject()}
          className="px-3 py-2 rounded bg-slate-800 text-white"
        >
          Create Project
        </button>
      </div>

      <div className="text-sm text-slate-500">
        Status: <strong>{status}</strong> (v{boqVersion}) • Sections: <strong>{sections.length}</strong> • Subtotal:{" "}
        <strong>{totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
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

      <div className="flex gap-2">
        <button
          onClick={addSection}
          disabled={!canEdit || !activeProjectId}
          className="px-3 py-2 rounded bg-slate-700 text-white disabled:opacity-50"
        >
          Add Section
        </button>

        <button onClick={goEditScopes} className="px-3 py-2 rounded bg-slate-800 text-white">
          Edit Scopes
        </button>
      </div>

      {/* --------- BOQ Sections Builder --------- */}
      <div className="space-y-6">
        {sections.length === 0 ? (
          <div className="text-sm text-slate-400">
            No sections yet. Click <strong>Add Section</strong>.
          </div>
        ) : (
          sections.map((section, idx) => (
            <div key={section.id} className="p-4 border border-slate-700 rounded space-y-4">
              {/* Section Header */}
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-3">
                  <div className="flex gap-3 items-start">
                    <div className="flex-1 max-w-xs">
                      <div className="text-xs text-slate-400 mb-1">Section Category</div>
                      <select
                        value={section.masterCategoryId ?? ""}
                        onChange={(e) => onPickMasterCategory(section.id, e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                      >
                        <option value="">Select category…</option>
                        {usableCategories.map((cat: any) => (
                          <option key={getCategoryId(cat)} value={getCategoryId(cat)}>
                            {getCategoryLabel(cat)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400 mb-1">Section Name</div>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => updateSection(section.id, { title: e.target.value })}
                        disabled={!canEdit}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50"
                        placeholder="Section name"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400 mb-1">Scope of Work (section only)</div>
                      <textarea
                        value={section.scope}
                        onChange={(e) => updateSection(section.id, { scope: e.target.value })}
                        disabled={!canEdit}
                        rows={2}
                        className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-50 resize-none"
                        placeholder="Scope description for this section"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteSection(section.id)}
                  disabled={!canEdit}
                  className="ml-3 px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-50"
                >
                  Delete Section
                </button>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium text-slate-300">Items</h4>
                  <button
                    onClick={() => addItem(section.id)}
                    disabled={!canEdit}
                    className="px-2 py-1 rounded bg-slate-700 text-white text-xs disabled:opacity-50"
                  >
                    Add Item
                  </button>
                </div>

                {section.items.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No items in this section.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Category</th>
                          <th className="pb-2">Item</th>
                          <th className="pb-2">Variant</th>
                          <th className="pb-2">Description</th>
                          <th className="pb-2">Unit</th>
                          <th className="pb-2">Qty</th>
                          <th className="pb-2">Rate</th>
                          <th className="pb-2">Amount</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-800">
                            <td className="py-2 pr-2">
                              <select
                                value={item.pick_type}
                                onChange={(e) => {
                                  updateItem(section.id, item.id, {
                                    pick_type: e.target.value,
                                    pick_category: "",
                                    pick_item: "",
                                    pick_variant: "",
                                    cost_item_id: null,
                                  });
                                }}
                                disabled={!canEdit}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                              >
                                <option value="">Select type</option>
                                {typeOptions.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                value={item.pick_category}
                                onChange={(e) => {
                                  updateItem(section.id, item.id, {
                                    pick_category: e.target.value,
                                    pick_item: "",
                                    pick_variant: "",
                                    cost_item_id: null,
                                  });
                                }}
                                disabled={!canEdit || !item.pick_type}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                              >
                                <option value="">Select category</option>
                                {categoryOptions(item.pick_type).map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                value={item.pick_item}
                                onChange={(e) => {
                                  const newItem = e.target.value;
                                  updateItem(section.id, item.id, {
                                    pick_item: newItem,
                                    pick_variant: "",
                                    cost_item_id: null,
                                  });
                                  const rateItem = findFinalRateItem(item.pick_type, item.pick_category, newItem, null);
                                  if (rateItem) void applyRateItem(section.id, item.id, rateItem);
                                }}
                                disabled={!canEdit || !item.pick_category}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                              >
                                <option value="">Select item</option>
                                {itemOptions(item.pick_type, item.pick_category).map((itemName) => (
                                  <option key={itemName} value={itemName}>
                                    {itemName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                value={item.pick_variant}
                                onChange={(e) => {
                                  updateItem(section.id, item.id, {
                                    pick_variant: e.target.value,
                                    cost_item_id: null,
                                  });
                                  const rateItem = findFinalRateItem(item.pick_type, item.pick_category, item.pick_item, e.target.value);
                                  if (rateItem) void applyRateItem(section.id, item.id, rateItem);
                                }}
                                disabled={!canEdit || !item.pick_item}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                              >
                                <option value="">Select variant</option>
                                {variantOptions(item.pick_type, item.pick_category, item.pick_item).map((variant) => (
                                  <option key={variant} value={variant}>
                                    {variant}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateItem(section.id, item.id, { description: e.target.value })}
                                disabled={!canEdit}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                                placeholder="Description"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                value={item.unit_id ?? ""}
                                onChange={(e) => updateItem(section.id, item.id, { unit_id: e.target.value || null })}
                                disabled={!canEdit}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                              >
                                <option value="">Select unit</option>
                                {usableUnits.map((unit: any) => (
                                  <option key={getUnitId(unit)} value={getUnitId(unit)}>
                                    {getUnitLabel(unit)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) => updateItem(section.id, item.id, { qty: Number(e.target.value) || 0 })}
                                disabled={!canEdit}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                                placeholder="0"
                                step="any"
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                type="number"
                                value={item.rate}
                                onChange={(e) => updateItem(section.id, item.id, { rate: Number(e.target.value) || 0 })}
                                disabled={!canEdit}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white text-xs disabled:opacity-50"
                                placeholder="0"
                                step="any"
                              />
                            </td>
                            <td className="py-2 pr-2 text-right">
                              {(numOr(item.qty) * numOr(item.rate)).toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-2">
                              <button
                                onClick={() => deleteItem(section.id, item.id)}
                                disabled={!canEdit}
                                className="px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}