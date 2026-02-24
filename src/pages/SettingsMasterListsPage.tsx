import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type Category = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;

  // ✅ NEW: scope lives here
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
  const [activeTab, setActiveTab] = useState<"categories" | "units">("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Form states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitType, setNewUnitType] = useState("other");

  // Search states
  const [categorySearch, setCategorySearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");

  // ✅ NEW: Scope editor states (frontend)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState<string>("");
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeSaveMsg, setScopeSaveMsg] = useState<string>("");

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

  // Load data on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      setScopeSaveMsg("");

      const [categoriesResult, unitsResult] = await Promise.all([
        supabase
          .from("master_categories")
          // ✅ IMPORTANT: include scope_of_work
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
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (unitsResult.error) throw unitsResult.error;

      const cats = (categoriesResult.data || []) as Category[];
      setCategories(cats);
      setUnits((unitsResult.data || []) as Unit[]);

      // ✅ keep editor in sync if a category is already selected
      if (selectedCategoryId) {
        const selected = cats.find((c) => c.id === selectedCategoryId);
        if (selected) {
          setScopeDraft((selected.scope_of_work ?? "").toString());
        } else {
          setSelectedCategoryId(null);
          setScopeDraft("");
        }
      }
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
        // scope_of_work left blank by default
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

  // ✅ NEW: select a category for scope editing
  function selectCategoryForScope(cat: Category) {
    setSelectedCategoryId(cat.id);
    setScopeDraft((cat.scope_of_work ?? "").toString());
    setScopeSaveMsg("");
  }

  // ✅ NEW: save scope_of_work from frontend
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
      // update local list without full reload
      setCategories((prev) =>
        prev.map((c) =>
          c.id === selectedCategoryId ? { ...c, scope_of_work: scopeDraft } : c
        )
      );
    } catch (err) {
      console.error("Failed to save scope:", err);
      setScopeSaveMsg("Failed to save scope.");
    } finally {
      setScopeSaving(false);
      // clear message after a moment
      setTimeout(() => setScopeSaveMsg(""), 2000);
    }
  }

  // Filter data based on search
  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const filteredUnits = units.filter((unit) =>
    unit.name.toLowerCase().includes(unitSearch.toLowerCase())
  );

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings - Master Lists</h1>
        <p className="text-slate-400 mt-1">Manage categories and units used across the system.</p>
      </div>

      {/* Tabs */}
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
      </div>

      {/* Loading/Error */}
      {loading && <p className="text-sm text-slate-400">Loading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Categories Tab */}
      {activeTab === "categories" && !loading && (
        <div className="space-y-4">
          {/* Add Category */}
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

          {/* Search */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
            />
          </div>

          {/* ✅ NEW: Scope Editor Panel */}
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
                  <span className="font-medium text-slate-100">
                    {selectedCategory.name}
                  </span>
                </div>

                <textarea
                  value={scopeDraft}
                  onChange={(e) => setScopeDraft(e.target.value)}
                  rows={5}
                  placeholder="Type the default scope of work for this category..."
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400">
                    This scope will auto-fill when you select this category on the BOQ page.
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

          {/* Categories List */}
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
                            category.is_active
                              ? "text-slate-200"
                              : "text-slate-400 line-through"
                          }`}
                        >
                          {category.name}
                        </span>

                        {/* small indicator if scope exists */}
                        {(category.scope_of_work ?? "").trim().length > 0 ? (
                          <span className="text-xs text-slate-400">
                            • scope set
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            • no scope
                          </span>
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

      {/* Units Tab */}
      {activeTab === "units" && !loading && (
        <div className="space-y-4">
          {/* Add Unit */}
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

          {/* Search */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
            <input
              type="text"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Search units..."
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-400"
            />
          </div>

          {/* Units List */}
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
                            unit.is_active
                              ? "text-slate-200"
                              : "text-slate-400 line-through"
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
    </div>
  );
}