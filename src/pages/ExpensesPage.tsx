import React, { useEffect, useState } from "react";
import { Receipt, Plus, Upload, Check, X, Eye, FileText, DollarSign, Image as ImageIcon } from "lucide-react";
import { fetchExpenses, createExpense, approveExpense } from "../lib/finance";
import { ReceiptUpload } from "../components/ReceiptUpload";
import { OCRPreview } from "../components/OCRPreview";
import { linkReceiptToExpense, getExpenseReceipts, getReceiptUrl, type OCRResult } from "../lib/receiptOCR";
import type { Expense } from "../lib/finance";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import AIAssistantPanel from "../components/AIAssistantPanel";
import { AIReceiptCategorizer } from "../components/AIReceiptCategorizer";

export default function ExpensesPage() {
  const financeAccess = useFinanceAccess();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [projects, setProjects] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [uploadedReceiptId, setUploadedReceiptId] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [showOcrPreview, setShowOcrPreview] = useState(false);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [showAICategorizer, setShowAICategorizer] = useState(false);
  const [pendingOCRData, setPendingOCRData] = useState<OCRResult | null>(null);

  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split("T")[0],
    project_id: "",
    category_id: "",
    vendor: "",
    description: "",
    amount: "",
    payment_method: "credit_card",
    receipt_url: "",
    notes: "",
  });

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewExpenses) {
    return <FinanceAccessDenied />;
  }

  useEffect(() => {
    loadExpenses();
    loadProjectsAndCategories();
    loadUserInfo();
  }, []);

  async function loadUserInfo() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        setUserId(user.id);
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  }

  async function loadExpenses() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const data = await fetchExpenses(profile.company_id);
      setExpenses(data);
    } catch (error) {
      console.error("Error loading expenses:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadProjectsAndCategories() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const [projectsData, categoriesData] = await Promise.all([
        supabase.from("projects").select("id, name").eq("company_id", profile.company_id).order("name"),
        supabase.from("expense_categories").select("id, name").eq("company_id", profile.company_id).order("name"),
      ]);

      if (projectsData.data) setProjects(projectsData.data);
      if (categoriesData.data) setCategories(categoriesData.data);
    } catch (error) {
      console.error("Error loading projects/categories:", error);
    }
  }

  function openCreateModal() {
    setEditingExpense(null);
    setUploadedReceiptId(null);
    setOcrResult(null);
    setShowOcrPreview(false);
    setFormData({
      expense_date: new Date().toISOString().split("T")[0],
      project_id: "",
      category_id: "",
      vendor: "",
      description: "",
      amount: "",
      payment_method: "credit_card",
      receipt_url: "",
      notes: "",
    });
    setShowModal(true);
  }

  function openEditModal(expense: any) {
    setEditingExpense(expense);
    setUploadedReceiptId(null);
    setOcrResult(null);
    setShowOcrPreview(false);
    setFormData({
      expense_date: expense.expense_date,
      project_id: expense.project_id || "",
      category_id: expense.category_id || "",
      vendor: expense.vendor || "",
      description: expense.description,
      amount: expense.amount.toString(),
      payment_method: expense.payment_method || "credit_card",
      receipt_url: expense.receipt_url || "",
      notes: expense.notes || "",
    });
    setShowModal(true);
  }

  async function openDetailModal(expense: any) {
    setSelectedExpense(expense);
    setShowDetailModal(true);

    try {
      const receipts = await getExpenseReceipts(expense.id);
      const urls: Record<string, string> = {};
      for (const receipt of receipts) {
        const url = await getReceiptUrl(receipt.storage_path);
        urls[receipt.id] = url;
      }
      setReceiptUrls(urls);
    } catch (error) {
      console.error("Error loading receipt URLs:", error);
    }
  }

  function handleReceiptUploadComplete(receiptId: string, result: OCRResult | null) {
    setUploadedReceiptId(receiptId);
    setOcrResult(result);

    if (result) {
      setShowOcrPreview(true);
    }
  }

  function handleAcceptOCR() {
    if (!ocrResult) return;

    setFormData({
      ...formData,
      vendor: ocrResult.vendor || formData.vendor,
      expense_date: ocrResult.date || formData.expense_date,
      amount: ocrResult.amount ? ocrResult.amount.toString() : formData.amount,
      description: formData.description || `Receipt from ${ocrResult.vendor || 'vendor'}`,
      notes: ocrResult.receiptNumber
        ? `Receipt #: ${ocrResult.receiptNumber}${formData.notes ? '\n' + formData.notes : ''}`
        : formData.notes,
    });

    setPendingOCRData(ocrResult);
    setShowOcrPreview(false);
    setShowAICategorizer(true);
  }

  function handleAICategorization(categorization: { category: string; description: string; vendorType?: string }) {
    const matchedCategory = categories.find(c => c.name === categorization.category);

    setFormData({
      ...formData,
      category_id: matchedCategory?.id || formData.category_id,
      description: categorization.description,
    });
    setShowAICategorizer(false);
    setPendingOCRData(null);
  }

  function handleEditManually() {
    setShowOcrPreview(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;

      const payload = {
        company_id: profile.company_id,
        expense_date: formData.expense_date,
        project_id: formData.project_id || null,
        category_id: formData.category_id || null,
        vendor: formData.vendor || null,
        description: formData.description,
        amount: parseFloat(formData.amount),
        payment_method: formData.payment_method || null,
        receipt_url: formData.receipt_url || null,
        notes: formData.notes || null,
        status: "pending" as const,
      };

      let expenseId: string;

      if (editingExpense) {
        await supabase.from("expenses").update(payload).eq("id", editingExpense.id);
        expenseId = editingExpense.id;
      } else {
        const { data: newExpense, error } = await supabase
          .from("expenses")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        expenseId = newExpense.id;
      }

      if (uploadedReceiptId) {
        await linkReceiptToExpense(uploadedReceiptId, expenseId);
      }

      setShowModal(false);
      loadExpenses();
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Failed to save expense");
    }
  }

  async function handleApprove(id: string) {
    try {
      await approveExpense(id);
      loadExpenses();
    } catch (error) {
      console.error("Error approving expense:", error);
    }
  }

  async function handleReject(id: string) {
    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("expenses").update({ status: "rejected" }).eq("id", id);
      loadExpenses();
    } catch (error) {
      console.error("Error rejecting expense:", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this expense?")) return;

    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("expenses").delete().eq("id", id);
      loadExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert("Failed to delete expense");
    }
  }

  const filteredExpenses = expenses.filter((exp) => filter === "all" || exp.status === filter);

  const summary = {
    total: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    pending: expenses.filter((e) => e.status === "pending").length,
    approved: expenses.filter((e) => e.status === "approved").reduce((sum, e) => sum + Number(e.amount), 0),
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-sm text-slate-600">Track and manage business expenses</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={18} />
          Add Expense
        </button>
      </div>

      <div className="p-8">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-600">Total Expenses</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">${summary.total.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-600">Pending Approval</div>
            <div className="mt-2 text-2xl font-bold text-orange-600">{summary.pending}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-medium text-slate-600">Approved</div>
            <div className="mt-2 text-2xl font-bold text-green-600">${summary.approved.toLocaleString()}</div>
          </div>
        </div>

        <div className="mb-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All Expenses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Vendor
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Project
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.expense_date}</td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{exp.description}</div>
                    {exp.payment_method && (
                      <div className="text-xs text-slate-500 capitalize">{exp.payment_method.replace("_", " ")}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.expense_categories?.name || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.vendor || "-"}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{exp.projects?.name || "-"}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">
                    ${Number(exp.amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        exp.status === "approved"
                          ? "bg-green-50 text-green-700"
                          : exp.status === "rejected"
                          ? "bg-red-50 text-red-700"
                          : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDetailModal(exp)}
                      className="mr-3 text-sm font-medium text-slate-600 hover:text-slate-900"
                    >
                      View
                    </button>
                    {exp.status === "pending" && (
                      <>
                        <button
                          onClick={() => openEditModal(exp)}
                          className="mr-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleApprove(exp.id)}
                          className="mr-3 text-sm font-medium text-green-600 hover:text-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(exp.id)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredExpenses.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">No expenses found</div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-xl font-bold text-slate-900">
              {editingExpense ? "Edit Expense" : "Add Expense"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingExpense && companyId && userId && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Receipt Upload (Optional)
                  </label>
                  <ReceiptUpload
                    companyId={companyId}
                    userId={userId}
                    onUploadComplete={handleReceiptUploadComplete}
                  />
                </div>
              )}

              {showOcrPreview && ocrResult && (
                <OCRPreview
                  ocrResult={ocrResult}
                  onAccept={handleAcceptOCR}
                  onEdit={handleEditManually}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  placeholder="Office supplies, fuel, equipment rental, etc."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Vendor</label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                    placeholder="Vendor name"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Project (Optional)</label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                >
                  <option value="">No Project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="ach">ACH</option>
                  <option value="wire">Wire Transfer</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  placeholder="Additional notes about this expense"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {editingExpense ? "Update" : "Create"} Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Expense Details</h2>
                <p className="text-sm text-slate-600">{selectedExpense.expense_date}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm text-slate-600">Amount</div>
                  <div className="text-3xl font-bold text-slate-900">
                    ${Number(selectedExpense.amount).toLocaleString()}
                  </div>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1.5 text-sm font-medium capitalize ${
                    selectedExpense.status === "approved"
                      ? "bg-green-50 text-green-700"
                      : selectedExpense.status === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-orange-50 text-orange-700"
                  }`}
                >
                  {selectedExpense.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Description</div>
                  <div className="text-sm text-slate-900">{selectedExpense.description}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Payment Method
                  </div>
                  <div className="text-sm capitalize text-slate-900">
                    {selectedExpense.payment_method?.replace("_", " ") || "-"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Category</div>
                  <div className="text-sm text-slate-900">{selectedExpense.expense_categories?.name || "-"}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Vendor</div>
                  <div className="text-sm text-slate-900">{selectedExpense.vendor || "-"}</div>
                </div>
              </div>

              {selectedExpense.project_id && (
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Project</div>
                  <div className="text-sm text-slate-900">{selectedExpense.projects?.name || "-"}</div>
                </div>
              )}

              {Object.keys(receiptUrls).length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Receipts</div>
                  <div className="space-y-2">
                    {Object.entries(receiptUrls).map(([id, url]) => (
                      <a
                        key={id}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm font-medium text-blue-600 hover:bg-slate-50"
                      >
                        <ImageIcon size={16} />
                        View Receipt
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {selectedExpense.receipt_url && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Legacy Receipt</div>
                  <a
                    href={selectedExpense.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                  >
                    <FileText size={16} />
                    View Receipt
                  </a>
                </div>
              )}

              {selectedExpense.notes && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Notes</div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    {selectedExpense.notes}
                  </div>
                </div>
              )}

              {selectedExpense.approved_by && (
                <div className="rounded-lg border border-slate-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-700">
                    <Check size={16} />
                    Approved on {new Date(selectedExpense.approved_at).toLocaleDateString()}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                {selectedExpense.status === "pending" && (
                  <>
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        openEditModal(selectedExpense);
                      }}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        handleApprove(selectedExpense.id);
                        setShowDetailModal(false);
                      }}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        handleReject(selectedExpense.id);
                        setShowDetailModal(false);
                      }}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AIAssistantPanel
        context="expense"
        currentData={{
          isNewExpense: showModal && !editingExpense,
          missingCostCodes: expenses.filter((e) => !e.cost_code_id).length,
          hasExpenses: expenses.length > 0,
          duplicateWarning: false,
        }}
        onAction={(action, data) => {
          if (action === "Upload Receipt") {
            setShowModal(true);
          } else if (action === "View Budget") {
            window.location.href = "/finance";
          }
        }}
      />

      <AIReceiptCategorizer
        isOpen={showAICategorizer}
        onClose={() => {
          setShowAICategorizer(false);
          setPendingOCRData(null);
        }}
        onAccept={handleAICategorization}
        vendor={pendingOCRData?.vendor || formData.vendor}
        amount={pendingOCRData?.amount || parseFloat(formData.amount) || 0}
        ocrText={pendingOCRData?.rawText}
      />
    </>
  );
}
