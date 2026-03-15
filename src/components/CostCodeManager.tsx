import { useEffect, useState } from "react";
import { Plus, CreditCard as Edit2, Trash2, Check, X, Download } from "lucide-react";
import {
  fetchCostCodes,
  createCostCode,
  updateCostCode,
  deleteCostCode,
  createStandardCostCodes,
  getCostCodeCategories,
  type CostCode,
} from "../lib/costCodes";

interface Props {
  companyId: string;
}

export default function CostCodeManager({ companyId }: Props) {
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState<CostCode | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState({
    code: "",
    description: "",
    category: "",
    is_billable: true,
    budget_amount: "0",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, [companyId]);

  async function loadData() {
    try {
      setLoading(true);
      const [codes, cats] = await Promise.all([
        fetchCostCodes(companyId),
        getCostCodeCategories(companyId),
      ]);
      setCostCodes(codes);
      setCategories(cats);
    } catch (error) {
      console.error("Error loading cost codes:", error);
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingCode(null);
    setFormData({
      code: "",
      description: "",
      category: "",
      is_billable: true,
      budget_amount: "0",
      notes: "",
    });
    setShowModal(true);
  }

  function openEditModal(code: CostCode) {
    setEditingCode(code);
    setFormData({
      code: code.code,
      description: code.description,
      category: code.category || "",
      is_billable: code.is_billable,
      budget_amount: code.budget_amount.toString(),
      notes: code.notes || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const codeData: Partial<CostCode> = {
        company_id: companyId,
        code: formData.code,
        description: formData.description,
        category: formData.category || null,
        is_billable: formData.is_billable,
        budget_amount: parseFloat(formData.budget_amount) || 0,
        notes: formData.notes || null,
      };

      if (editingCode) {
        await updateCostCode(editingCode.id!, codeData);
      } else {
        await createCostCode(codeData);
      }

      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error("Error saving cost code:", error);
      alert("Failed to save cost code");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this cost code?")) return;

    try {
      await deleteCostCode(id);
      await loadData();
    } catch (error) {
      console.error("Error deleting cost code:", error);
      alert("Failed to delete cost code");
    }
  }

  async function handleImportStandard() {
    if (!confirm("Import standard CSI MasterFormat cost codes? This will add ~20 division-level codes.")) {
      return;
    }

    try {
      const count = await createStandardCostCodes(companyId);
      alert(`Imported ${count} standard cost codes`);
      await loadData();
    } catch (error) {
      console.error("Error importing standard codes:", error);
      alert("Failed to import standard codes. They may already exist.");
    }
  }

  const filteredCodes = costCodes.filter((code) => {
    const matchesCategory = filterCategory === "all" || code.category === filterCategory;
    const matchesSearch =
      searchTerm === "" ||
      code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading cost codes...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cost Code Management</h2>
          <p className="text-sm text-gray-600">Manage job cost codes for tracking expenses</p>
        </div>
        <div className="flex items-center gap-2">
          {costCodes.length === 0 && (
            <button
              onClick={handleImportStandard}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              <Download size={16} />
              Import Standard Codes
            </button>
          )}
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            <Plus size={16} />
            New Cost Code
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search cost codes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded"
          />
        </div>
        <div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Billable</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Budget</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredCodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No cost codes found. Create one or import standard codes.
                </td>
              </tr>
            ) : (
              filteredCodes.map((code) => (
                <tr key={code.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">
                    {code.code}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{code.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{code.category || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    {code.is_billable ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        <Check size={12} />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                        <X size={12} />
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">
                    ${code.budget_amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {code.is_active ? (
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(code)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(code.id!)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCode ? "Edit Cost Code" : "New Cost Code"}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded font-mono"
                    placeholder="e.g., 03-3000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="e.g., Concrete"
                    list="categories"
                  />
                  <datalist id="categories">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g., Cast-in-Place Concrete"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Budget Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.budget_amount}
                    onChange={(e) => setFormData({ ...formData, budget_amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_billable}
                      onChange={(e) =>
                        setFormData({ ...formData, is_billable: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Billable to Client</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Optional notes about this cost code"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingCode ? "Update" : "Create"} Cost Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
