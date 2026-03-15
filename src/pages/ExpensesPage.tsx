import React, { useEffect, useState } from "react";
import { Receipt, Plus, Upload, Check, X } from "lucide-react";
import { fetchExpenses, createExpense, approveExpense } from "../lib/finance";
import type { Expense } from "../lib/finance";

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const [formData, setFormData] = useState({
    expense_date: new Date().toISOString().split("T")[0],
    vendor: "",
    description: "",
    amount: "",
    payment_method: "credit_card",
    notes: "",
  });

  useEffect(() => {
    loadExpenses();
  }, []);

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

      await createExpense({
        company_id: profile.company_id,
        ...formData,
        amount: parseFloat(formData.amount),
      });

      setShowModal(false);
      loadExpenses();
      setFormData({
        expense_date: new Date().toISOString().split("T")[0],
        vendor: "",
        description: "",
        amount: "",
        payment_method: "credit_card",
        notes: "",
      });
    } catch (error) {
      console.error("Error creating expense:", error);
      alert("Failed to create expense");
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
          onClick={() => setShowModal(true)}
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
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
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
                    {exp.notes && <div className="text-xs text-slate-500">{exp.notes}</div>}
                  </td>
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
                    {exp.status === "pending" && (
                      <button
                        onClick={() => handleApprove(exp.id)}
                        className="text-sm font-medium text-green-600 hover:text-green-700"
                      >
                        Approve
                      </button>
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-xl font-bold text-slate-900">Add Expense</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Date *</label>
                <input
                  type="date"
                  required
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description *</label>
                <input
                  type="text"
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Office supplies, fuel, etc."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Vendor</label>
                <input
                  type="text"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="ach">ACH</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
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
                  Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
