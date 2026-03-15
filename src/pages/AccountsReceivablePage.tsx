import React, { useEffect, useState } from "react";
import { FileText, Plus, DollarSign, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from "lucide-react";
import { fetchClientInvoices, createClientInvoice } from "../lib/finance";
import type { ClientInvoice } from "../lib/finance";

export default function AccountsReceivablePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "overdue" | "paid">("all");
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    invoice_number: "",
    client_id: "",
    project_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    subtotal: "",
    tax_rate: "0",
    notes: "",
    terms: "Net 30",
  });

  useEffect(() => {
    loadInvoices();
    loadClientsAndProjects();
  }, []);

  async function loadInvoices() {
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

      const data = await fetchClientInvoices(profile.company_id);
      setInvoices(data);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadClientsAndProjects() {
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

      const [clientsData, projectsData] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("projects").select("id, name, client_id").order("name"),
      ]);

      if (clientsData.data) setClients(clientsData.data);
      if (projectsData.data) setProjects(projectsData.data);
    } catch (error) {
      console.error("Error loading clients/projects:", error);
    }
  }

  function openCreateModal() {
    setFormData({
      invoice_number: `INV-${Date.now()}`,
      client_id: "",
      project_id: "",
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      subtotal: "",
      tax_rate: "0",
      notes: "",
      terms: "Net 30",
    });
    setShowModal(true);
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

      const subtotal = parseFloat(formData.subtotal);
      const taxRate = parseFloat(formData.tax_rate);
      const taxAmount = subtotal * (taxRate / 100);
      const totalAmount = subtotal + taxAmount;

      await createClientInvoice({
        company_id: profile.company_id,
        client_id: formData.client_id || null,
        project_id: formData.project_id || null,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        balance_due: totalAmount,
        amount_paid: 0,
        status: "draft",
        notes: formData.notes,
        terms: formData.terms,
      });

      setShowModal(false);
      loadInvoices();
    } catch (error) {
      console.error("Error creating invoice:", error);
      alert("Failed to create invoice");
    }
  }

  const filteredInvoices = invoices.filter((inv) => filter === "all" || inv.status === filter);

  const summary = {
    total: invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + Number(i.balance_due), 0),
    overdue: invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + Number(i.balance_due), 0),
    paid: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total_amount), 0),
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable</h1>
          <p className="text-sm text-slate-600">Manage client invoices and payments</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={18} />
          New Invoice
        </button>
      </div>

      <div className="p-8">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5">
                <DollarSign size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Outstanding</div>
                <div className="text-2xl font-bold text-slate-900">${summary.total.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2.5">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Overdue</div>
                <div className="text-2xl font-bold text-red-600">${summary.overdue.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2.5">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Paid (YTD)</div>
                <div className="text-2xl font-bold text-green-600">${summary.paid.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All Invoices</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-slate-400" />
                      <span className="font-mono text-sm font-medium text-slate-900">{inv.invoice_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{inv.clients?.name || "-"}</div>
                    {inv.projects?.name && <div className="text-xs text-slate-500">{inv.projects.name}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inv.invoice_date}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{inv.due_date}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">
                    ${Number(inv.total_amount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                    ${Number(inv.balance_due).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        inv.status === "paid"
                          ? "bg-green-50 text-green-700"
                          : inv.status === "overdue"
                          ? "bg-red-50 text-red-700"
                          : inv.status === "sent"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredInvoices.length === 0 && (
            <div className="py-12 text-center">
              <FileText size={48} className="mx-auto mb-4 text-slate-300" />
              <div className="text-lg font-medium text-slate-900">No invoices found</div>
              <div className="mt-1 text-sm text-slate-600">Create your first client invoice to get started</div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-6 text-xl font-bold text-slate-900">Create New Invoice</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Invoice Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Client *</label>
                  <select
                    required
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="">Select Client</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Project (Optional)</label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">No Project</option>
                  {projects
                    .filter((p) => !formData.client_id || p.client_id === formData.client_id)
                    .map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Subtotal *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.subtotal}
                    onChange={(e) => setFormData({ ...formData, subtotal: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Terms</label>
                <input
                  type="text"
                  value={formData.terms}
                  onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Net 30"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="Additional notes or payment instructions"
                />
              </div>

              {formData.subtotal && (
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal:</span>
                    <span className="font-medium text-slate-900">
                      ${Number(formData.subtotal).toLocaleString()}
                    </span>
                  </div>
                  {formData.tax_rate && Number(formData.tax_rate) > 0 && (
                    <div className="mt-1 flex justify-between text-sm">
                      <span className="text-slate-600">Tax ({formData.tax_rate}%):</span>
                      <span className="font-medium text-slate-900">
                        ${(Number(formData.subtotal) * (Number(formData.tax_rate) / 100)).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-slate-300 pt-2">
                    <span className="font-semibold text-slate-900">Total:</span>
                    <span className="text-lg font-bold text-slate-900">
                      $
                      {(
                        Number(formData.subtotal) +
                        Number(formData.subtotal) * (Number(formData.tax_rate || 0) / 100)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

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
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
