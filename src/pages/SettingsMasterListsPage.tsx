import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  toggleSupplierStatus,
  type Supplier as SupplierType,
} from "../lib/suppliers";
import {
  fetchHardwareLumberProduct,
  saveScrapedProduct,
} from "../lib/supplierProductScraping";

type ScrapedProductPreview = {
  ItemNumber: string;
  MaterialName: string;
  Description: string;
  CostEach: number | null;
  Unit?: string;
};

type SaveResult = {
  success: boolean;
  warnings?: string[];
};

type Category = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  scope_of_work?: string | null;
};

type Unit = {
  id: string;
  name: string;
  unit_type: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export default function SettingsMasterListsPage() {
  const [activeTab, setActiveTab] = useState<"categories" | "units" | "suppliers">("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitType, setNewUnitType] = useState("other");

  const [categorySearch, setCategorySearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierType | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    website: "",
    payment_terms: "",
    notes: "",
  });

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState<string>("");
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeSaveMsg, setScopeSaveMsg] = useState<string>("");

  const [hlSupplier, setHlSupplier] = useState<SupplierType | null>(null);
  const [scrapingInput, setScrapingInput] = useState<string>("");
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapedPreview, setScrapedPreview] = useState<ScrapedProductPreview | null>(null);
  const [scrapingError, setScrapingError] = useState<string>("");
  const [isSavingProduct, setIsSavingProduct] = useState<boolean>(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const unitTypes = [
    { value: "length", label: "Length" },
    { value: "area", label: "Area" },
    { value: "volume", label: "Volume" },
    { value: "weight", label: "Weight" },
    { value: "count", label: "Count" },
    { value: "packaging", label: "Packaging" },
    { value: "time", label: "Time" },
    { value: "work", label: "Work" },
    { value: "other", label: "Other" },
  ];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      setScopeSaveMsg("");

      const [categoriesResult, unitsResult, suppliersData] = await Promise.all([
        supabase
          .from("master_categories")
          .select("id, name, is_active, sort_order, created_at, scope_of_work")
          .order("is_active", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("master_units")
          .select("*")
          .order("is_active", { ascending: false })
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        listSuppliers(),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (unitsResult.error) throw unitsResult.error;

      const cats = (categoriesResult.data || []) as Category[];
      setCategories(cats);
      setUnits((unitsResult.data || []) as Unit[]);
      setSuppliers(suppliersData);

      if (selectedCategoryId) {
        const selected = cats.find((c) => c.id === selectedCategoryId);
        if (selected) {
          setScopeDraft((selected.scope_of_work ?? "").toString());
        } else {
          setSelectedCategoryId(null);
          setScopeDraft("");
        }
      }

      const hardwareLumberSupplier = suppliersData.find(
        (s) => s.supplier_name && s.supplier_name.trim().toLowerCase() === "hardware & lumber"
      );

      if (!hardwareLumberSupplier) {
        console.error("Hardware & Lumber supplier not found in database");
        setHlSupplier(null);
      } else {
        console.log("Hardware & Lumber supplier resolved:", {
          found: !!hardwareLumberSupplier,
          supplierId: hardwareLumberSupplier?.id,
          supplierName: hardwareLumberSupplier?.supplier_name,
        });
        setHlSupplier(hardwareLumberSupplier);
      }

      console.log("FINAL_SUPPLIER", hardwareLumberSupplier);
    } catch (err) {
      console.error("Failed to load master lists:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;

    try {
      const { error } = await supabase.from("master_categories").insert({
        name: newCategoryName.trim(),
        is_active: true,
        sort_order: categories.length + 1,
      });

      if (error) throw error;
      setNewCategoryName("");
      await loadData();
    } catch (err) {
      console.error("Failed to add category:", err);
      setError("Failed to add category");
    }
  }

  async function addUnit() {
    if (!newUnitName.trim()) return;

    try {
      const { error } = await supabase.from("master_units").insert({
        name: newUnitName.trim(),
        unit_type: newUnitType,
        is_active: true,
        sort_order: units.length + 1,
      });

      if (error) throw error;
      setNewUnitName("");
      setNewUnitType("other");
      await loadData();
    } catch (err) {
      console.error("Failed to add unit:", err);
      setError("Failed to add unit");
    }
  }

  async function toggleCategory(id: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from("master_categories")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      await loadData();
    } catch (err) {
      console.error("Failed to toggle category:", err);
      setError("Failed to update category");
    }
  }

  async function toggleUnit(id: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from("master_units")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;
      await loadData();
    } catch (err) {
      console.error("Failed to toggle unit:", err);
      setError("Failed to update unit");
    }
  }

  function selectCategoryForScope(cat: Category) {
    setSelectedCategoryId(cat.id);
    setScopeDraft((cat.scope_of_work ?? "").toString());
    setScopeSaveMsg("");
  }

  async function saveSelectedScope() {
    if (!selectedCategoryId) return;

    try {
      setScopeSaving(true);
      setScopeSaveMsg("");

      const { error } = await supabase
        .from("master_categories")
        .update({ scope_of_work: scopeDraft })
        .eq("id", selectedCategoryId);

      if (error) throw error;

      setScopeSaveMsg("Scope saved.");
      setCategories((prev) =>
        prev.map((c) => (c.id === selectedCategoryId ? { ...c, scope_of_work: scopeDraft } : c))
      );
    } catch (err) {
      console.error("Failed to save scope:", err);
      setScopeSaveMsg("Failed to save scope.");
    } finally {
      setScopeSaving(false);
      setTimeout(() => setScopeSaveMsg(""), 2000);
    }
  }

  function openAddSupplierForm() {
    setEditingSupplier(null);
    setSupplierForm({
      supplier_name: "",
      contact_name: "",
      email: "",
      phone: "",
      address: "",
      website: "",
      payment_terms: "",
      notes: "",
    });
    setShowSupplierForm(true);
  }

  function openEditSupplierForm(supplier: SupplierType) {
    setEditingSupplier(supplier);
    setSupplierForm({
      supplier_name: supplier.supplier_name,
      contact_name: supplier.contact_name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      website: (supplier as any).website || "",
      payment_terms: supplier.payment_terms || "",
      notes: supplier.notes || "",
    });
    setShowSupplierForm(true);
  }

  function closeSupplierForm() {
    setShowSupplierForm(false);
    setEditingSupplier(null);
    setSupplierForm({
      supplier_name: "",
      contact_name: "",
      email: "",
      phone: "",
      address: "",
      website: "",
      payment_terms: "",
      notes: "",
    });
  }

  async function handleFetchProduct() {
    if (!scrapingInput.trim()) {
      setScrapingError("Please enter a Hardware & Lumber product URL");
      return;
    }

    setIsScraping(true);
    setScrapingError("");
    setScrapedPreview(null);
    setSaveResult(null);

    try {
      const result = await fetchHardwareLumberProduct(scrapingInput.trim());

      if (result.success) {
        setScrapedPreview({
          ItemNumber: result.itemNumber || "",
          MaterialName: result.materialName || "",
          Description: result.description || "",
          CostEach: result.costEach ?? null,
          Unit: result.unit || "",
        });
      } else {
        setScrapingError(result.error || "Failed to fetch product");
      }
    } catch (err) {
      console.error("Error fetching product:", err);
      setScrapingError(err instanceof Error ? err.message : "Failed to fetch product");
    } finally {
      setIsScraping(false);
    }
  }

  async function handleSaveProduct() {
    if (!scrapedPreview) {
      setScrapingError("Missing product data");
      return;
    }

    setIsSavingProduct(true);
    setSaveResult(null);
    setScrapingError("");

    try {
      if (!hlSupplier || !hlSupplier.id) {
        throw new Error("Hardware & Lumber supplier not configured in database");
      }

      const supplierId = hlSupplier.id;
      const supplierName = hlSupplier.supplier_name;

      console.log("SAVE_DEBUG", {
        supplierId,
        supplierName,
        itemNumber: scrapedPreview.ItemNumber,
        materialName: scrapedPreview.MaterialName,
        description: scrapedPreview.Description,
        costEach: scrapedPreview.CostEach,
        unit: scrapedPreview.Unit || "each",
        url: scrapingInput,
      });

      const result = await saveScrapedProduct({
        supplierId,
        supplierName,
        itemNumber: scrapedPreview.ItemNumber,
        materialName: scrapedPreview.MaterialName,
        description: scrapedPreview.Description,
        costEach: scrapedPreview.CostEach,
        unit: scrapedPreview.Unit || "each",
        url: scrapingInput,
      });

      if (result) {
        setSaveResult({ success: true });
        setScrapedPreview(null);
        setScrapingInput("");
        setScrapingError("");
        await loadData();
      } else {
        setScrapingError("Failed to save product - no data returned");
      }
    } catch (err) {
      console.error("Error saving product:", err);

      let errorMessage = "Failed to save product";

      if (err instanceof Error && err.message) {
        errorMessage = err.message;
      } else if (typeof err === "string") {
        errorMessage = err;
      } else if (err && typeof err === "object") {
        const errorObj = err as Record<string, unknown>;
        const parts: string[] = [];

        if (typeof errorObj.code === "string" && errorObj.code) {
          parts.push(`Code: ${errorObj.code}`);
        }
        if (typeof errorObj.details === "string" && errorObj.details) {
          parts.push(`Details: ${errorObj.details}`);
        }
        if (typeof errorObj.hint === "string" && errorObj.hint) {
          parts.push(`Hint: ${errorObj.hint}`);
        }
        if (typeof errorObj.message === "string" && errorObj.message) {
          parts.unshift(errorObj.message);
        }

        errorMessage =
          parts.length > 0 ? parts.join(" | ") : `${errorMessage} - ${JSON.stringify(err)}`;
      }

      setScrapingError(errorMessage);
    } finally {
      setIsSavingProduct(false);
    }
  }

  function clearProductForm() {
    setScrapingInput("");
    setScrapedPreview(null);
    setScrapingError("");
    setSaveResult(null);
  }

  async function saveSupplier() {
    if (!supplierForm.supplier_name.trim()) {
      setError("Supplier name is required");
      return;
    }

    try {
      setError("");
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, supplierForm);
      } else {
        await createSupplier(supplierForm);
      }
      closeSupplierForm();
      await loadData();
    } catch (err) {
      console.error("Failed to save supplier:", err);
      setError(err instanceof Error ? err.message : "Failed to save supplier");
    }
  }

  async function handleDeleteSupplier(id: string, name: string) {
    if (!confirm(`Delete supplier "${name}"?`)) return;

    try {
      setError("");
      await deleteSupplier(id);
      await loadData();
    } catch (err) {
      console.error("Failed to delete supplier:", err);
      setError(err instanceof Error ? err.message : "Failed to delete supplier");
    }
  }

  async function handleToggleSupplier(id: string, currentStatus: boolean) {
    try {
      setError("");
      await toggleSupplierStatus(id, !currentStatus);
      await loadData();
    } catch (err) {
      console.error("Failed to toggle supplier:", err);
      setError(err instanceof Error ? err.message : "Failed to update supplier");
    }
  }

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const filteredUnits = units.filter((unit) =>
    unit.name.toLowerCase().includes(unitSearch.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter((supplier: SupplierType) => {
    const searchLower = supplierSearch.toLowerCase();
    return (
      supplier.supplier_name.toLowerCase().includes(searchLower) ||
      (supplier.contact_name || "").toLowerCase().includes(searchLower) ||
      (supplier.email || "").toLowerCase().includes(searchLower) ||
      (supplier.phone || "").toLowerCase().includes(searchLower)
    );
  });

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings - Master Lists</h1>
        <p className="text-slate-400 mt-1">Manage categories and units used across system.</p>
      </div>

      <div className="flex border-b border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "categories"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300"
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab("units")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "units"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300"
          }`}
        >
          Units
        </button>
        <button
          onClick={() => setActiveTab("suppliers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "suppliers"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-300"
          }`}
        >
          Suppliers
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {activeTab === "categories" && !loading && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Add New Category</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="Category name"
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
              />
              <button
                onClick={addCategory}
                disabled={!newCategoryName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
            />
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Category Scope of Work</h3>

            {!selectedCategory ? (
              <p className="text-sm text-slate-400">
                Select a category below to edit its default scope.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-slate-300">
                  Editing scope for:{" "}
                  <span className="font-medium text-slate-100">{selectedCategory.name}</span>
                </div>

                <textarea
                  value={scopeDraft}
                  onChange={(e) => setScopeDraft(e.target.value)}
                  rows={5}
                  placeholder="Type in default scope of work for this category..."
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    This scope will auto-fill when you select this category on BOQ page.
                    {scopeSaveMsg ? (
                      <span className="ml-2 text-slate-200">{scopeSaveMsg}</span>
                    ) : null}
                  </div>

                  <button
                    onClick={saveSelectedScope}
                    disabled={scopeSaving || !selectedCategoryId}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white"
                  >
                    {scopeSaving ? "Saving..." : "Save Scope"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Categories</h3>
            {filteredCategories.length === 0 ? (
              <p className="text-sm text-slate-400">No categories found</p>
            ) : (
              <div className="space-y-2">
                {filteredCategories.map((category) => {
                  const isSelected = selectedCategoryId === category.id;

                  return (
                    <div
                      key={category.id}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                        isSelected ? "bg-slate-700/80 ring-1 ring-blue-500/50" : "bg-slate-700/50"
                      }`}
                      onClick={() => selectCategoryForScope(category)}
                      title="Click to edit scope"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            category.is_active ? "bg-green-500" : "bg-slate-500"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            category.is_active ? "text-slate-200" : "text-slate-400 line-through"
                          }`}
                        >
                          {category.name}
                        </span>

                        {(category.scope_of_work ?? "").trim().length > 0 ? (
                          <span className="text-xs text-slate-400">• scope set</span>
                        ) : (
                          <span className="text-xs text-slate-500">• no scope</span>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCategory(category.id, category.is_active);
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          category.is_active
                            ? "bg-red-600 hover:bg-red-500 text-white"
                            : "bg-green-600 hover:bg-green-500 text-white"
                        }`}
                      >
                        {category.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "units" && !loading && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Add New Unit</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUnit()}
                placeholder="Unit name"
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
              />
              <select
                value={newUnitType}
                onChange={(e) => setNewUnitType(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
              >
                {unitTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <button
                onClick={addUnit}
                disabled={!newUnitName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <input
              type="text"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Search units..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
            />
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Units</h3>
            {filteredUnits.length === 0 ? (
              <p className="text-sm text-slate-400">No units found</p>
            ) : (
              <div className="space-y-2">
                {filteredUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between p-2 bg-slate-700/50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          unit.is_active ? "bg-green-500" : "bg-slate-500"
                        }`}
                      />
                      <div>
                        <span
                          className={`text-sm ${
                            unit.is_active ? "text-slate-200" : "text-slate-400 line-through"
                          }`}
                        >
                          {unit.name}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          (
                          {unitTypes.find((t) => t.value === unit.unit_type)?.label ||
                            unit.unit_type}
                          )
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleUnit(unit.id, unit.is_active)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        unit.is_active
                          ? "bg-red-600 hover:bg-red-500 text-white"
                          : "bg-green-600 hover:bg-green-500 text-white"
                      }`}
                    >
                      {unit.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "suppliers" && !loading && (
        <div className="space-y-4">
          {showSupplierForm && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-3">
                {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Supplier Name *</label>
                  <input
                    type="text"
                    value={supplierForm.supplier_name}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, supplier_name: e.target.value })
                    }
                    placeholder="Supplier name"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Contact Name</label>
                  <input
                    type="text"
                    value={supplierForm.contact_name}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, contact_name: e.target.value })
                    }
                    placeholder="Contact name"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Website</label>
                  <input
                    type="url"
                    value={supplierForm.website}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, website: e.target.value })
                    }
                    placeholder="https://example.com"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="Phone number"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Address</label>
                  <input
                    type="text"
                    value={supplierForm.address}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, address: e.target.value })
                    }
                    placeholder="Physical address"
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Payment Terms</label>
                  <input
                    type="text"
                    value={supplierForm.payment_terms}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, payment_terms: e.target.value })
                    }
                    placeholder="Net 30, COD, etc."
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Notes</label>
                  <textarea
                    value={supplierForm.notes}
                    onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                    placeholder="Additional notes about this supplier"
                    rows={3}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={closeSupplierForm}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSupplier}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
                >
                  {editingSupplier ? "Update" : "Create"}
                </button>
              </div>
            </div>
          )}

          {!showSupplierForm && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
              <button
                onClick={openAddSupplierForm}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
              >
                Add New Supplier
              </button>
            </div>
          )}

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
            />
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Import Supplier Product</h3>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scrapingInput}
                  onChange={(e) => setScrapingInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetchProduct()}
                  placeholder="Paste Hardware & Lumber product URL..."
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                  disabled={isScraping}
                />
                <button
                  onClick={handleFetchProduct}
                  disabled={isScraping || !scrapingInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white"
                >
                  {isScraping ? "Fetching..." : "Fetch Product"}
                </button>
              </div>

              {scrapingError && (
                <div className="bg-red-900/20 border border-red-700/50 rounded px-3 py-2">
                  <p className="text-sm text-red-400">{scrapingError}</p>
                </div>
              )}

              {scrapedPreview && (
                <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-slate-200 mb-3">Product Preview</h4>
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-slate-400">Item Number:</span>
                      <p className="text-slate-200">{scrapedPreview.ItemNumber}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Material Name:</span>
                      <p className="text-slate-200">{scrapedPreview.MaterialName}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Cost Each:</span>
                      <p className="text-slate-200">
                        {scrapedPreview.CostEach !== null
                          ? scrapedPreview.CostEach.toFixed(2)
                          : "Price not found"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Description:</span>
                      <p className="text-slate-200">{scrapedPreview.Description}</p>
                    </div>
                    {scrapedPreview.Unit ? (
                      <div>
                        <span className="text-xs text-slate-400">Unit:</span>
                        <p className="text-slate-200">{scrapedPreview.Unit}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleSaveProduct}
                      disabled={isSavingProduct}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white"
                    >
                      {isSavingProduct ? "Saving..." : "Save to Library"}
                    </button>
                    <button
                      onClick={clearProductForm}
                      className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded text-sm text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {saveResult && saveResult.success && (
                <div className="bg-green-900/20 border border-green-700/50 rounded px-3 py-2">
                  <p className="text-sm text-green-400">
                    ✓ Product successfully saved to library!
                    {saveResult.warnings && saveResult.warnings.length > 0 && (
                      <span className="block text-xs text-green-300 mt-1">
                        {saveResult.warnings.join(", ")}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-200 mb-3">Suppliers</h3>
            {filteredSuppliers.length === 0 ? (
              <p className="text-sm text-slate-400">No suppliers found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 px-2 text-slate-300">Name</th>
                      <th className="text-left py-2 px-2 text-slate-300">Contact</th>
                      <th className="text-left py-2 px-2 text-slate-300">Website</th>
                      <th className="text-left py-2 px-2 text-slate-300">Email</th>
                      <th className="text-left py-2 px-2 text-slate-300">Phone</th>
                      <th className="text-right py-2 px-2 text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map((supplier: SupplierType) => (
                      <tr key={supplier.id} className="border-b border-slate-700">
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                supplier.is_active ? "bg-green-500" : "bg-slate-500"
                              }`}
                            />
                            <span
                              className={`text-sm ${
                                supplier.is_active
                                  ? "text-slate-200"
                                  : "text-slate-400 line-through"
                              }`}
                            >
                              {supplier.supplier_name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-slate-300">{supplier.contact_name || "-"}</td>
                        <td className="py-2 px-2 text-slate-300">
                          {(supplier as any).website ? (
                            <a
                              href={(supplier as any).website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {(supplier as any).website}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-2 px-2 text-slate-300">{supplier.email || "-"}</td>
                        <td className="py-2 px-2 text-slate-300">{supplier.phone || "-"}</td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => openEditSupplierForm(supplier)}
                              className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleSupplier(supplier.id, supplier.is_active)}
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                supplier.is_active
                                  ? "bg-red-600 hover:bg-red-500 text-white"
                                  : "bg-green-600 hover:bg-green-500 text-white"
                              }`}
                            >
                              {supplier.is_active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteSupplier(supplier.id, supplier.supplier_name)
                              }
                              className="px-2 py-1 bg-red-600/80 hover:bg-red-500 rounded text-xs text-white"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}