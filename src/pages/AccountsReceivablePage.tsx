import React, { useEffect, useState } from "react";
import { FileText, Plus, DollarSign, CircleAlert as AlertCircle, CircleCheck as CheckCircle, X, Trash2, Eye } from "lucide-react";
import {
  fetchClientInvoices,
  createClientInvoice,
  fetchInvoiceLineItems,
  createInvoiceLineItems,
  deleteInvoiceLineItem,
  fetchInvoicePayments,
  createClientPayment,
  updateInvoiceAfterPayment,
  updateClientInvoice
} from "../lib/finance";
import type { ClientInvoice, ClientInvoiceLineItem, ClientPayment } from "../lib/finance";
import ContractProgressBilling from "../components/ContractProgressBilling";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";

interface LineItem {
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  amount: number;
}

export default function AccountsReceivablePage() {
  const financeAccess = useFinanceAccess();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "partial" | "overdue" | "paid">("all");
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceLineItems, setInvoiceLineItems] = useState<ClientInvoiceLineItem[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<ClientPayment[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [showProgressBilling, setShowProgressBilling] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);

  const [formData, setFormData] = useState({
    invoice_number: "",
    client_id: "",
    project_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    tax_rate: "0",
    notes: "",
    terms: "Net 30",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: "1", unit: "ea", rate: "", amount: 0 },
  ]);

  const [paymentData, setPaymentData] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    amount: "",
    payment_method: "check" as const,
    reference_number: "",
    notes: "",
  });

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

  useEffect(() => {
    loadInvoices();
    loadClientsAndProjects();
    loadContracts();
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

      setCompanyId(profile.company_id);
      const data = await fetchClientInvoices(profile.company_id);
      setInvoices(data);
    } catch (error) {
      console.error("Error loading invoices:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadContracts() {
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

      const { data } = await supabase
        .from("client_contracts")
        .select("*, projects(name), clients(name)")
        .eq("company_id", profile.company_id)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (data) setContracts(data);
    } catch (error) {
      console.error("Error loading contracts:", error);
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
        supabase.from("clients").select("id, name").eq("company_id", profile.company_id).order("name"),
        supabase.from("projects").select("id, name, client_id").eq("company_id", profile.company_id).order("name"),
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
      tax_rate: "0",
      notes: "",
      terms: "Net 30",
    });
    setLineItems([{ description: "", quantity: "1", unit: "ea", rate: "", amount: 0 }]);
    setShowModal(true);
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: "", quantity: "1", unit: "ea", rate: "", amount: 0 }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItem, value: string) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === "quantity" || field === "rate") {
      const qty = parseFloat(updated[index].quantity) || 0;
      const rate = parseFloat(updated[index].rate) || 0;
      updated[index].amount = qty * rate;
    }

    setLineItems(updated);
  }

  function calculateTotals() {
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = parseFloat(formData.tax_rate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    return { subtotal, taxAmount, total };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (!companyId) return;

      const { subtotal, taxAmount, total } = calculateTotals();

      const invoice = await createClientInvoice({
        company_id: companyId,
        client_id: formData.client_id || null,
        project_id: formData.project_id || null,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal: subtotal,
        tax_rate: parseFloat(formData.tax_rate),
        tax_amount: taxAmount,
        total_amount: total,
        balance_due: total,
        amount_paid: 0,
        status: "draft",
        notes: formData.notes,
        terms: formData.terms,
      });

      // Create line items
      const lineItemsToCreate = lineItems
        .filter(item => item.description && item.rate)
        .map((item, index) => ({
          invoice_id: invoice.id,
          company_id: companyId,
          line_number: index + 1,
          description: item.description,
          quantity: parseFloat(item.quantity),
          unit: item.unit,
          rate: parseFloat(item.rate),
          amount: item.amount,
        }));

      if (lineItemsToCreate.length > 0) {
        await createInvoiceLineItems(lineItemsToCreate);
      }

      setShowModal(false);
      loadInvoices();
    } catch (error) {
      console.error("Error creating invoice:", error);
      alert("Failed to create invoice");
    }
  }

  async function openDetailModal(invoice: any) {
    try {
      setSelectedInvoice(invoice);
      const [items, payments] = await Promise.all([
        fetchInvoiceLineItems(invoice.id),
        fetchInvoicePayments(invoice.id),
      ]);
      setInvoiceLineItems(items);
      setInvoicePayments(payments);
      setShowDetailModal(true);
    } catch (error) {
      console.error("Error loading invoice details:", error);
    }
  }

  function openPaymentModal(invoice: any) {
    setSelectedInvoice(invoice);
    setPaymentData({
      payment_date: new Date().toISOString().split("T")[0],
      amount: invoice.balance_due.toString(),
      payment_method: "check",
      reference_number: "",
      notes: "",
    });
    setShowPaymentModal(true);
  }

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (!selectedInvoice || !companyId) return;

      await createClientPayment({
        company_id: companyId,
        client_id: selectedInvoice.client_id,
        invoice_id: selectedInvoice.id,
        payment_number: `PAY-${Date.now()}`,
        payment_date: paymentData.payment_date,
        amount: parseFloat(paymentData.amount),
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number || null,
        notes: paymentData.notes || null,
      });

      await updateInvoiceAfterPayment(selectedInvoice.id);

      setShowPaymentModal(false);
      loadInvoices();

      if (showDetailModal) {
        const payments = await fetchInvoicePayments(selectedInvoice.id);
        setInvoicePayments(payments);
      }
    } catch (error) {
      console.error("Error recording payment:", error);
      alert("Failed to record payment");
    }
  }

  const filteredInvoices = invoices.filter((inv) => filter === "all" || inv.status === filter);

  const summary = {
    total: invoices.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + Number(i.balance_due), 0),
    overdue: invoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + Number(i.balance_due), 0),
    paid: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total_amount), 0),
  };

  const totals = calculateTotals();

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable</h1>
          <p className="text-sm text-slate-600">Manage client invoices and payments</p>
        </div>
        <div className="flex items-center gap-3">
          {contracts.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedContract?.id || ""}
                onChange={(e) => {
                  const contract = contracts.find(c => c.id === e.target.value);
                  setSelectedContract(contract || null);
                  setShowProgressBilling(!!contract);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Select Contract for Progress Billing</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contract_number} - {contract.projects?.name || "No Project"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={18} />
            New Invoice
          </button>
        </div>
      </div>

      <div className="p-8">
        {showProgressBilling && selectedContract ? (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <ContractProgressBilling
              contractId={selectedContract.id}
              companyId={companyId}
              projectId={selectedContract.project_id}
              clientId={selectedContract.client_id}
              onInvoiceCreated={() => {
                loadInvoices();
                setShowProgressBilling(false);
                setSelectedContract(null);
              }}
            />
          </div>
        ) : null}

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
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All Invoices</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partial</option>
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
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Actions
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
                          : inv.status === "partial"
                          ? "bg-yellow-50 text-yellow-700"
                          : inv.status === "sent"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => openDetailModal(inv)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View
                    </button>
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
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Client *</label>
                  <select
                    required
                    value={formData.client_id}
                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-900">Line Items</label>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(index, "description", e.target.value)}
                        className="col-span-5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        value={item.unit}
                        onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                        className="col-span-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => updateLineItem(index, "rate", e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                      />
                      <div className="col-span-1 flex items-center justify-end text-sm font-medium text-slate-900">
                        ${item.amount.toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="col-span-1 flex items-center justify-center text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Payment Terms</label>
                  <input
                    type="text"
                    value={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                    placeholder="Net 30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  placeholder="Additional notes"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium text-slate-900">${totals.subtotal.toFixed(2)}</span>
                </div>
                {totals.taxAmount > 0 && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-600">Tax ({formData.tax_rate}%):</span>
                    <span className="font-medium text-slate-900">${totals.taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between border-t border-slate-300 pt-2">
                  <span className="font-semibold text-slate-900">Total:</span>
                  <span className="text-lg font-bold text-slate-900">${totals.total.toFixed(2)}</span>
                </div>
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
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Invoice Details</h2>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-sm text-slate-600">Invoice Number</div>
                <div className="font-mono font-semibold text-slate-900">{selectedInvoice.invoice_number}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Status</div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    selectedInvoice.status === "paid"
                      ? "bg-green-50 text-green-700"
                      : selectedInvoice.status === "overdue"
                      ? "bg-red-50 text-red-700"
                      : selectedInvoice.status === "partial"
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {selectedInvoice.status}
                </span>
              </div>
              <div>
                <div className="text-sm text-slate-600">Client</div>
                <div className="font-medium text-slate-900">{selectedInvoice.clients?.name || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Project</div>
                <div className="font-medium text-slate-900">{selectedInvoice.projects?.name || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Invoice Date</div>
                <div className="font-medium text-slate-900">{selectedInvoice.invoice_date}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Due Date</div>
                <div className="font-medium text-slate-900">{selectedInvoice.due_date}</div>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="mb-6">
                <div className="text-sm text-slate-600 mb-1">Notes</div>
                <div className="text-sm text-slate-900">{selectedInvoice.notes}</div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Line Items</h3>
              {invoiceLineItems.length > 0 ? (
                <div className="space-y-2">
                  {invoiceLineItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{item.description}</div>
                        <div className="text-xs text-slate-500">
                          {item.quantity} {item.unit} × ${Number(item.rate).toFixed(2)}
                        </div>
                      </div>
                      <div className="font-medium text-slate-900">${Number(item.amount).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No line items</div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4 mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-medium text-slate-900">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
              </div>
              {selectedInvoice.tax_amount > 0 && (
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">Tax ({selectedInvoice.tax_rate}%):</span>
                  <span className="font-medium text-slate-900">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-slate-200 pt-2 mb-2">
                <span className="text-slate-900">Total:</span>
                <span className="text-slate-900">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-600">Paid:</span>
                <span className="font-medium text-green-600">${Number(selectedInvoice.amount_paid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t border-slate-200 pt-2">
                <span className="text-slate-900">Balance Due:</span>
                <span className="text-blue-600">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
                {selectedInvoice.balance_due > 0 && (
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      openPaymentModal(selectedInvoice);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    + Record Payment
                  </button>
                )}
              </div>
              {invoicePayments.length > 0 ? (
                <div className="space-y-2">
                  {invoicePayments.map((payment) => (
                    <div key={payment.id} className="flex justify-between text-sm border-b border-slate-100 pb-2">
                      <div>
                        <div className="font-medium text-slate-900">{payment.payment_date}</div>
                        <div className="text-xs text-slate-500 capitalize">
                          {payment.payment_method.replace("_", " ")}
                          {payment.reference_number && ` - ${payment.reference_number}`}
                        </div>
                      </div>
                      <div className="font-medium text-green-600">${Number(payment.amount).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No payments recorded</div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 mt-6">
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="mb-6 rounded-lg bg-slate-50 p-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">Invoice:</span>
                <span className="font-mono font-medium text-slate-900">{selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Balance Due:</span>
                <span className="font-bold text-blue-600">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentData.payment_date}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment Method *</label>
                <select
                  required
                  value={paymentData.payment_method}
                  onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  <option value="check">Check</option>
                  <option value="ach">ACH</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Reference Number</label>
                <input
                  type="text"
                  value={paymentData.reference_number}
                  onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  placeholder="Check #, Transaction ID, etc."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400"
                  placeholder="Additional payment notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
