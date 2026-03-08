import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type AssemblyRow = {
  id: string;
  name: string;
  description: string | null;
};

type CostItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;
};

type ComponentRow = {
  id: string;
  assembly_id: string;
  cost_item_id: string;
  line_type: string | null;
  quantity_factor: number | null;
  waste_percent: number | null;
  sort_order: number | null;
  notes: string | null;
  cost_item?: CostItem | null;
};

function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqSorted(values: string[]) {
  const set = new Set(values.map((v) => v.trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function AssembliesPage() {
  // Lists
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assembliesLoading, setAssembliesLoading] = useState(false);
  const [assembliesError, setAssembliesError] = useState<string | null>(null);

  const [activeAssemblyId, setActiveAssemblyId] = useState<string | null>(null);

  // Create assembly form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Rate items (for picking components)
  const [rateItems, setRateItems] = useState<CostItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Components
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [componentsLoading, setComponentsLoading] = useState(false);
  const [componentsError, setComponentsError] = useState<string | null>(null);

  // Picker (Type → Category → Item → Variant)
  type PickerStep = "type" | "category" | "item" | "variant";
  type PickerState = {
    open: boolean;
    step: PickerStep;
    type: string;
    category: string;
    item: string;
    variant: string;
    search: string;
  };

  const [picker, setPicker] = useState<PickerState>({
    open: false,
    step: "type",
    type: "",
    category: "",
    item: "",
    variant: "",
    search: "",
  });

  const [pickedCostItem, setPickedCostItem] = useState<CostItem | null>(null);

  // New component form
  const [compLineType, setCompLineType] = useState("material");
  const [compQtyFactor, setCompQtyFactor] = useState<number>(1);
  const [compWaste, setCompWaste] = useState<number>(0);
  const [compNotes, setCompNotes] = useState("");

  // Load assemblies
  useEffect(() => {
    let alive = true;
    async function loadAssemblies() {
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
        const list = (data ?? []) as AssemblyRow[];
        setAssemblies(list);
        if (!activeAssemblyId && list.length > 0) setActiveAssemblyId(list[0].id);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setAssembliesError(e?.message ?? "Failed to load assemblies");
        setAssemblies([]);
      } finally {
        if (alive) setAssembliesLoading(false);
      }
    }
    loadAssemblies();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load rate items
  useEffect(() => {
    let alive = true;
    async function loadRateItems() {
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
        setRateItems((data ?? []) as CostItem[]);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setRateError(e?.message ?? "Failed to load rate items");
        setRateItems([]);
      } finally {
        if (alive) setRateLoading(false);
      }
    }
    loadRateItems();
    return () => {
      alive = false;
    };
  }, []);

  // Load components for active assembly
  async function loadComponents() {
  if (!activeAssemblyId) {
    setComponents([]);
    return;
  }

  setComponentsLoading(true);
  setComponentsError(null);

  try {
    const { data, error } = await supabase
      .from("assembly_components")
      .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
      .eq("assembly_id", activeAssemblyId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const list = (data ?? []) as ComponentRow[];
    const ids = uniqSorted(list.map((x) => x.cost_item_id));

    const byId = new Map<string, CostItem>();

    if (ids.length > 0) {
      const { data: ci, error: ciErr } = await supabase
        .from("cost_items")
        .select("id,item_name,description,variant,unit,category,item_type")
        .in("id", ids);

      if (ciErr) throw ciErr;

      for (const r of (ci ?? []) as CostItem[]) byId.set(r.id, r);
    }

    const merged = list.map((c) => ({
      ...c,
      cost_item: byId.get(c.cost_item_id) ?? null,
    }));

    setComponents(merged);
  } catch (e: any) {
    console.error(e);
    setComponentsError(e?.message ?? "Failed to load components");
    setComponents([]);
  } finally {
    setComponentsLoading(false);
  }
}

useEffect(() => {
  void loadComponents();
}, [activeAssemblyId]);

  async function createAssembly() {
    const name = newName.trim();
    if (!name) {
      alert("Enter an assembly name.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("assemblies")
        .insert([{ name, description: newDesc.trim() || null }])
        .select("id,name,description")
        .single();

      if (error) throw error;

      const created = data as AssemblyRow;
      setAssemblies((prev) => {
        const next = [...prev, created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });

      setActiveAssemblyId(created.id);
      setNewName("");
      setNewDesc("");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to create assembly");
    }
  }

  async function addComponent() {
    if (!activeAssemblyId) {
      alert("Select an assembly first.");
      return;
    }
    if (!pickedCostItem) {
      alert("Pick a cost item first.");
      return;
    }

    try {
      const nextSort = components.length;

      const { data, error } = await supabase.from("assembly_components").insert([
        {
          assembly_id: activeAssemblyId,
          cost_item_id: pickedCostItem.id,
          line_type: compLineType,
          quantity_factor: numOr(compQtyFactor, 1),
          waste_percent: numOr(compWaste, 0),
          sort_order: nextSort,
          notes: compNotes.trim() || null,
        },
      ]);

      if (error) throw error;

      
     
// refresh
      setPickedCostItem(null);
      setCompQtyFactor(1);
      setCompWaste(0);
      setCompNotes("");
      // reload by toggling id (simple refresh)
      setActiveAssemblyId((x) => (x ? String(x) : x));
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to add component");
    }
  }

  async function deleteComponent(id: string) {
    if (!confirm("Delete this component?")) return;
    try {
      const { error } = await supabase.from("assembly_components").delete().eq("id", id);
      if (error) throw error;
      setComponents((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to delete component");
    }
  }

  // ----- Picker helpers -----
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

  function openPicker() {
    setPicker({ open: true, step: "type", type: "", category: "", item: "", variant: "", search: "" });
  }
  function closePicker() {
    setPicker({ open: false, step: "type", type: "", category: "", item: "", variant: "", search: "" });
  }
  function goStep(step: PickerStep) {
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
    const finalType = picker.type.trim();
    const finalCategory = picker.category.trim();
    const finalItem = picker.item.trim();
    const finalVariant = variantValue.trim(); // can be ""

    const r = findFinalRateItem(finalType, finalCategory, finalItem, finalVariant ? finalVariant : null);
    setPickedCostItem(r);
    closePicker();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Assembly Builder</h1>
          <div className="text-xs text-slate-400 mt-1">Create assemblies and add component lines (PlanSwift style)</div>
        </div>
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

            <button onClick={() => void createAssembly()} className="px-3 py-2 rounded bg-blue-700 text-white">
              Create
            </button>

            {assembliesLoading ? <div className="text-xs text-slate-500">Loading assemblies…</div> : null}
            {assembliesError ? <div className="text-xs text-red-400">{assembliesError}</div> : null}
          </div>

          <div className="p-4 border border-slate-700 rounded bg-slate-950/20 space-y-2">
            <div className="text-sm text-slate-200 font-semibold">Select Assembly</div>
            <select
              value={activeAssemblyId ?? ""}
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
              <div className="text-xs text-slate-500">{rateLoading ? "Loading rate items…" : `${rateItems.length} rate items`}</div>
            </div>

            {rateError ? <div className="text-xs text-red-400">{rateError}</div> : null}

            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-5">
                <div className="text-xs text-slate-400 mb-1">Cost Item</div>
                <button
                  type="button"
                  onClick={openPicker}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white text-left"
                >
                  {pickedCostItem ? pickedCostItem.item_name : "Pick item…"}
                </button>
                <div className="text-[11px] text-slate-500 mt-1">
                  {pickedCostItem ? [pickedCostItem.item_type, pickedCostItem.category, pickedCostItem.variant].filter(Boolean).join(" • ") : "—"}
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
                  onClick={() => void addComponent()}
                  disabled={!activeAssemblyId || !pickedCostItem}
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
              <div className="text-xs text-slate-500">
                {componentsLoading ? "Loading…" : `${components.length} lines`}
              </div>
            </div>

            {componentsError ? <div className="text-xs text-red-400">{componentsError}</div> : null}

            {components.length === 0 ? (
              <div className="text-sm text-slate-400">No components yet.</div>
            ) : (
              <div className="space-y-2">
                {components.map((c) => (
                  <div key={c.id} className="grid grid-cols-12 gap-2 items-center border border-slate-800 rounded p-2">
                    <div className="col-span-12 md:col-span-5">
                      <div className="text-sm text-white">{c.cost_item?.item_name ?? c.cost_item_id}</div>
                      <div className="text-[11px] text-slate-500">
                        {[c.cost_item?.item_type, c.cost_item?.category, c.cost_item?.variant].filter(Boolean).join(" • ") || "—"}
                      </div>
                    </div>
                    <div className="col-span-6 md:col-span-2 text-xs text-slate-300">{c.line_type ?? "—"}</div>
                    <div className="col-span-3 md:col-span-2 text-xs text-slate-300">Qty: {numOr(c.quantity_factor, 0)}</div>
                    <div className="col-span-3 md:col-span-2 text-xs text-slate-300">Waste: {numOr(c.waste_percent, 0)}%</div>
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <button
                        onClick={() => void deleteComponent(c.id)}
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

      {/* Picker Modal */}
      {picker.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded border border-slate-700 bg-slate-950 text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="space-y-1">
                <div className="text-sm font-semibold">Pick Cost Item</div>
                <div className="text-xs text-slate-400">Type → Category → Item → Variant</div>
              </div>
              <button onClick={closePicker} className="px-3 py-2 rounded bg-slate-800 text-white">
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => goStep("type")}
                  className={`px-3 py-2 rounded border ${picker.step === "type" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"}`}
                >
                  1. Type{stepDone("type") ? " ✓" : ""}
                </button>

                <button
                  onClick={() => (stepDone("type") ? goStep("category") : null)}
                  disabled={!stepDone("type")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${picker.step === "category" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"}`}
                >
                  2. Category{stepDone("category") ? " ✓" : ""}
                </button>

                <button
                  onClick={() => (stepDone("category") ? goStep("item") : null)}
                  disabled={!stepDone("category")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${picker.step === "item" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"}`}
                >
                  3. Item{stepDone("item") ? " ✓" : ""}
                </button>

                <button
                  onClick={() => (stepDone("item") ? goStep("variant") : null)}
                  disabled={!stepDone("item")}
                  className={`px-3 py-2 rounded border disabled:opacity-50 ${picker.step === "variant" ? "bg-slate-800 border-slate-600" : "bg-slate-900 border-slate-800"}`}
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
                <div className="text-xs text-slate-500">{rateLoading ? "Loading…" : `${rateItems.length} items`}</div>
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
                    if (picker.step === "variant") goStep("item");
                    else if (picker.step === "item") goStep("category");
                    else if (picker.step === "category") goStep("type");
                  }}
                  disabled={picker.step === "type"}
                  className="px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                >
                  Back
                </button>

                <div className="text-xs text-slate-500">
                  {picker.step === "variant" ? "Pick a variant (or No Variant) to select the cost item." : "Select an option to continue."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


