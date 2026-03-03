import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function numOr(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqSorted(values) {
  const set = new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function AssembliesPage() {
  // Lists
  const [assemblies, setAssemblies] = useState([]);
  const [assembliesLoading, setAssembliesLoading] = useState(false);
  const [assembliesError, setAssembliesError] = useState(null);
  const [activeAssemblyId, setActiveAssemblyId] = useState(null);

  // Create assembly form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Rate items (for picking components)
  const [rateItems, setRateItems] = useState([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(null);

  // Components
  const [components, setComponents] = useState([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentsError, setComponentsError] = useState(null);

  // Picker (simple version)
  const [pickedCostItemId, setPickedCostItemId] = useState("");

  // New component form
  const [compLineType, setCompLineType] = useState("material");
  const [compQtyFactor, setCompQtyFactor] = useState(1);
  const [compWaste, setCompWaste] = useState(0);
  const [compNotes, setCompNotes] = useState("");

  // ✅ IMPORTANT: loadComponents is a real function (fixes your TS error)
  async function loadComponents(assemblyId) {
    if (!assemblyId) {
      setComponents([]);
      return;
    }

    setComponentsLoading(true);
    setComponentsError(null);
    try {
      const { data, error } = await supabase
        .from("assembly_components")
        .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
        .eq("assembly_id", assemblyId)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      const list = data ?? [];
      const ids = uniqSorted(list.map((x) => x.cost_item_id));

      let byId = new Map();
      if (ids.length) {
        const { data: ci, error: ciErr } = await supabase
          .from("cost_items")
          .select("id,item_name,description,variant,unit,category,item_type")
          .in("id", ids);

        if (ciErr) throw ciErr;
        for (const r of ci ?? []) byId.set(r.id, r);
      }

      const merged = list.map((c) => ({
        ...c,
        cost_item: byId.get(c.cost_item_id) || null,
      }));

      setComponents(merged);
    } catch (e) {
      console.error(e);
      setComponentsError(e?.message || "Failed to load components");
      setComponents([]);
    } finally {
      setComponentsLoading(false);
    }
  }

  // Load assemblies
  useEffect(() => {
    let alive = true;

    (async () => {
      setAssembliesLoading(true);
      setAssembliesError(null);
      try {
        const { data, error } = await supabase
          .from("assemblies")
          .select("id,name,description")
          .order("name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        const list = data ?? [];
        setAssemblies(list);
        if (!activeAssemblyId && list.length) setActiveAssemblyId(list[0].id);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setAssembliesError(e?.message || "Failed to load assemblies");
        setAssemblies([]);
      } finally {
        if (alive) setAssembliesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load rate items
  useEffect(() => {
    let alive = true;

    (async () => {
      setRateLoading(true);
      setRateError(null);
      try {
        const { data, error } = await supabase
          .from("cost_items")
          .select("id,item_name,description,variant,unit,category,item_type")
          .order("item_name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems(data ?? []);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setRateError(e?.message || "Failed to load rate items");
        setRateItems([]);
      } finally {
        if (alive) setRateLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Load components when assembly changes
  useEffect(() => {
    loadComponents(activeAssemblyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAssemblyId]);

  async function createAssembly() {
    const name = newName.trim();
    if (!name) return alert("Enter an assembly name.");

    try {
      const { data, error } = await supabase
        .from("assemblies")
        .insert([{ name, description: newDesc.trim() || null }])
        .select("id,name,description")
        .single();

      if (error) throw error;

      const created = data;
      setAssemblies((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setActiveAssemblyId(created.id);
      setNewName("");
      setNewDesc("");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to create assembly");
    }
  }

  async function addComponent() {
    if (!activeAssemblyId) return alert("Select an assembly first.");
    if (!pickedCostItemId) return alert("Pick a cost item first.");

    try {
      const nextSort = components.length;
      const { error } = await supabase.from("assembly_components").insert([
        {
          assembly_id: activeAssemblyId,
          cost_item_id: pickedCostItemId,
          line_type: compLineType,
          quantity_factor: numOr(compQtyFactor, 1),
          waste_percent: numOr(compWaste, 0),
          sort_order: nextSort,
          notes: compNotes.trim() || null,
        },
      ]);

      if (error) throw error;

      setPickedCostItemId("");
      setCompQtyFactor(1);
      setCompWaste(0);
      setCompNotes("");

      await loadComponents(activeAssemblyId);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to add component");
    }
  }

  async function deleteComponent(id) {
    if (!confirm("Delete this component?")) return;
    try {
      const { error } = await supabase.from("assembly_components").delete().eq("id", id);
      if (error) throw error;
      setComponents((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to delete component");
    }
  }

  const pickedCostItem = useMemo(() => {
    return rateItems.find((r) => r.id === pickedCostItemId) || null;
  }, [rateItems, pickedCostItemId]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Assembly Builder</h1>
        <div className="text-xs text-slate-400 mt-1">Create assemblies and add component lines</div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 space-y-3">
          <div className="p-4 border border-slate-700 rounded bg-slate-950/20 space-y-3">
            <div className="text-sm text-slate-200 font-semibold">Create Assembly</div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400">Name</div>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                placeholder="e.g. Concrete Foundation Package"
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-slate-400">Description</div>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                rows={3}
                placeholder="Optional description"
              />
            </div>

            <button onClick={createAssembly} className="px-3 py-2 rounded bg-blue-700 text-white">
              Create
            </button>

            {assembliesLoading ? <div className="text-xs text-slate-500">Loading assemblies…</div> : null}
            {assembliesError ? <div className="text-xs text-red-400">{assembliesError}</div> : null}
          </div>

          <div className="p-4 border border-slate-700 rounded bg-slate-950/20 space-y-2">
            <div className="text-sm text-slate-200 font-semibold">Select Assembly</div>
            <select
              value={activeAssemblyId || ""}
              onChange={(e) => setActiveAssemblyId(e.target.value || null)}
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
            >
              <option value="">Select…</option>
              {assemblies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-4">
          <div className="p-4 border border-slate-700 rounded bg-slate-950/20 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-200 font-semibold">Add Component</div>
              <div className="text-xs text-slate-500">{rateLoading ? "Loading…" : `${rateItems.length} rate items`}</div>
            </div>

            {rateError ? <div className="text-xs text-red-400">{rateError}</div> : null}

            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-5">
                <div className="text-xs text-slate-400 mb-1">Cost Item</div>
                <select
                  value={pickedCostItemId}
                  onChange={(e) => setPickedCostItemId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="">Pick item…</option>
                  {rateItems.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.item_name}
                      {r.variant ? ` — ${r.variant}` : ""}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 mt-1">
                  {pickedCostItem ? [pickedCostItem.item_type, pickedCostItem.category, pickedCostItem.unit].filter(Boolean).join(" • ") : "—"}
                </div>
              </div>

              <div className="col-span-12 md:col-span-2">
                <div className="text-xs text-slate-400 mb-1">Line Type</div>
                <select
                  value={compLineType}
                  onChange={(e) => setCompLineType(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                >
                  <option value="material">Material</option>
                  <option value="labor">Labor</option>
                  <option value="equipment">Equipment</option>
                  <option value="subcontract">Subcontract</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="col-span-6 md:col-span-2">
                <div className="text-xs text-slate-400 mb-1">Qty Factor</div>
                <input
                  type="number"
                  value={Number.isFinite(compQtyFactor) ? compQtyFactor : 1}
                  onChange={(e) => setCompQtyFactor(numOr(e.target.value, 1))}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>

              <div className="col-span-6 md:col-span-1">
                <div className="text-xs text-slate-400 mb-1">Waste %</div>
                <input
                  type="number"
                  value={Number.isFinite(compWaste) ? compWaste : 0}
                  onChange={(e) => setCompWaste(numOr(e.target.value, 0))}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                />
              </div>

              <div className="col-span-12 md:col-span-2">
                <button
                  onClick={addComponent}
                  disabled={!activeAssemblyId || !pickedCostItemId}
                  className="w-full px-3 py-2 rounded bg-blue-700 text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              <div className="col-span-12">
                <div className="text-xs text-slate-400 mb-1">Notes</div>
                <input
                  value={compNotes}
                  onChange={(e) => setCompNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
                  placeholder="Optional notes"
                />
              </div>
            </div>
          </div>

          <div className="p-4 border border-slate-700 rounded bg-slate-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-200 font-semibold">Components</div>
              <div className="text-xs text-slate-500">{componentsLoading ? "Loading…" : `${components.length} lines`}</div>
            </div>

            {componentsError ? <div className="text-xs text-red-400">{componentsError}</div> : null}

            {components.length === 0 ? (
              <div className="text-sm text-slate-400">No components yet.</div>
            ) : (
              <div className="space-y-2">
                {components.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 items-center border border-slate-800 rounded p-2">
                    <div className="col-span-12 md:col-span-6">
                      <div className="text-sm text-white">{c.cost_item?.item_name || c.cost_item_id}</div>
                      <div className="text-[11px] text-slate-500">
                        {[c.cost_item?.item_type, c.cost_item?.category, c.cost_item?.variant].filter(Boolean).join(" • ") || "—"}
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-2 text-xs text-slate-300">{c.line_type || "—"}</div>
                    <div className="col-span-3 md:col-span-2 text-xs text-slate-300">Qty: {numOr(c.quantity_factor, 0)}</div>
                    <div className="col-span-3 md:col-span-1 text-xs text-slate-300">Waste: {numOr(c.waste_percent, 0)}%</div>
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <button
                        onClick={() => deleteComponent(c.id)}
                        className="h-[34px] w-[34px] rounded bg-red-700 text-white"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                    {c.notes ? <div className="col-span-12 text-[11px] text-slate-500">Notes: {c.notes}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}