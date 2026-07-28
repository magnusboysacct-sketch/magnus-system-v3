import React, { useEffect, useState } from "react";
import { FileText, Plus, DollarSign, CircleAlert as AlertCircle, CircleCheck as CheckCircle, X, Trash2, Eye, Bell, MessageCircle, Mail, Save, Pencil } from "lucide-react";
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
import { useProjectContext } from "../context/ProjectContext";

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
  const { userRole } = useProjectContext();
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
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [thankYouData, setThankYouData] = useState<{client: any; amount: number; invoiceNumber: string} | null>(null);
  const [reminderForm, setReminderForm] = useState({ reminder_enabled: true, reminder_days_before: 3, reminder_repeat_days: 7 });
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
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

  const [editingInvoice, setEditingInvoice] = useState<ClientInvoice | null>(null);
  const [editForm, setEditForm] = useState({
    invoice_date: "",
    due_date: "",
    tax_rate: 0,
    notes: "",
    terms: "",
    status: "",
  });

  useEffect(() => {
    loadInvoices();
    loadClientsAndProjects();
    loadContracts();
  }, []);

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-500 dark:text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCompanyReports) {
    return <FinanceAccessDenied />;
  }

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

      const [clientsData, projectsData, companyData] = await Promise.all([
        supabase.from("clients").select("id, name, contact_name, email, phone").eq("company_id", profile.company_id).order("name"),
        supabase.from("projects").select("id, name, client_id").eq("company_id", profile.company_id).order("name"),
        supabase.from("company_settings").select("company_name,logo_url,phone,email,payment_notifications_enabled").eq("company_id", profile.company_id).maybeSingle(),
      ]);

      if (clientsData.data) setClients(clientsData.data);
      if (companyData.data) { setCompanySettings(companyData.data); setNotificationsEnabled(companyData.data.payment_notifications_enabled !== false); }
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
      setReminderForm({ reminder_enabled: invoice.reminder_enabled !== false, reminder_days_before: invoice.reminder_days_before ?? 3, reminder_repeat_days: invoice.reminder_repeat_days ?? 7 });
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
      if (notificationsEnabled) {
        const client = clients.find(c => c.id === selectedInvoice.client_id);
        if (client && (client.email || client.phone)) {
          setThankYouData({ client, amount: parseFloat(paymentData.amount), invoiceNumber: selectedInvoice.invoice_number });
          setShowThankYouModal(true);
        }
      }
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

  async function deleteInvoice(invoice: ClientInvoice) {
    if (!window.confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) return;
    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("client_invoice_line_items").delete().eq("invoice_id", invoice.id);
      await supabase.from("client_payments").delete().eq("invoice_id", invoice.id);
      const { error } = await supabase.from("client_invoices").delete().eq("id", invoice.id);
      if (error) throw error;
      await loadInvoices();
      if (selectedInvoice?.id === invoice.id) setSelectedInvoice(null);
    } catch (e: any) {
      alert("Failed to delete invoice: " + e.message);
    }
  }

  function openEditInvoice(invoice: ClientInvoice) {
    setEditingInvoice(invoice);
    setEditForm({
      invoice_date: invoice.invoice_date || "",
      due_date: invoice.due_date || "",
      tax_rate: invoice.tax_rate || 0,
      notes: invoice.notes || "",
      terms: invoice.terms || "",
      status: invoice.status || "draft",
    });
  }

  async function saveEditInvoice() {
    if (!editingInvoice) return;
    try {
      await updateClientInvoice(editingInvoice.id, {
        invoice_date: editForm.invoice_date,
        due_date: editForm.due_date,
        tax_rate: editForm.tax_rate,
        notes: editForm.notes.trim() || null,
        terms: editForm.terms.trim() || null,
        status: editForm.status as ClientInvoice["status"],
      });
      await loadInvoices();
      setEditingInvoice(null);
    } catch (e: any) {
      alert("Failed to update invoice: " + e.message);
    }
  }

  async function deletePayment(paymentId: string, invoiceId: string) {
    if (!window.confirm("Delete this payment record? This cannot be undone.")) return;
    try {
      const { supabase } = await import("../lib/supabase");
      const { error } = await supabase.from("client_payments").delete().eq("id", paymentId);
      if (error) throw error;
      await updateInvoiceAfterPayment(invoiceId);
      await loadInvoices();
      if (selectedInvoice?.id === invoiceId) {
        const payments = await fetchInvoicePayments(invoiceId);
        setInvoicePayments(payments);
      }
    } catch (e: any) {
      alert("Failed to delete payment: " + e.message);
    }
  }

  function buildReminderMessage(invoice: any, client: any) {
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(n);
    const isOverdue = new Date(invoice.due_date) < new Date();
    return `Hi ${client.contact_name || client.name},\n\n${isOverdue ? "This is a friendly reminder that" : "This is a reminder that"} Invoice #${invoice.invoice_number} for ${fmt(Number(invoice.balance_due))} ${isOverdue ? "is now overdue" : `is due on ${new Date(invoice.due_date).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}`}.\n\nPlease arrange payment at your earliest convenience. Let us know if you have any questions.\n\nThank you,\n${companySettings?.company_name || "Magnus Boys Construction"}`;
  }

  function sendReminderWhatsApp(invoice: any) {
    const client = clients.find(c => c.id === invoice.client_id);
    if (!client?.phone) { alert("This client has no phone number on file."); return; }
    const msg = buildReminderMessage(invoice, client);
    const phone = client.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone ? `1${phone}` : ""}?text=${encodeURIComponent(msg)}`, "_blank");
    markReminderSent(invoice.id);
  }

  function sendReminderEmail(invoice: any) {
    const client = clients.find(c => c.id === invoice.client_id);
    if (!client?.email) { alert("This client has no email on file."); return; }
    const subject = encodeURIComponent(`Payment Reminder - Invoice #${invoice.invoice_number}`);
    const body = encodeURIComponent(buildReminderMessage(invoice, client));
    window.open(`mailto:${client.email}?subject=${subject}&body=${body}`, "_blank");
    markReminderSent(invoice.id);
  }

  async function markReminderSent(invoiceId: string) {
    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("client_invoices").update({ last_reminder_sent_at: new Date().toISOString() }).eq("id", invoiceId);
      setReminderSent(true);
      setTimeout(() => setReminderSent(false), 3000);
    } catch {}
  }

  async function saveReminderSettings(invoiceId: string) {
    setSavingReminder(true);
    try {
      const { supabase } = await import("../lib/supabase");
      await supabase.from("client_invoices").update({
        reminder_enabled: reminderForm.reminder_enabled,
        reminder_days_before: reminderForm.reminder_days_before,
        reminder_repeat_days: reminderForm.reminder_repeat_days,
      }).eq("id", invoiceId);
      setSelectedInvoice((prev: any) => prev ? { ...prev, ...reminderForm } : prev);
      loadInvoices();
    } catch (e) {
      console.error("Error saving reminder settings:", e);
    } finally {
      setSavingReminder(false);
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
          <p className="text-sm text-slate-500 dark:text-slate-600">Manage client invoices and payments</p>
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
            className="flex items-center gap-2 rounded-xl bg-slate-800 dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
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

        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5 flex-shrink-0">
                <DollarSign size={20} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-600 truncate">Outstanding</div>
                <div className="text-lg sm:text-2xl font-bold text-slate-900 truncate">${summary.total.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2.5 flex-shrink-0">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-600 truncate">Overdue</div>
                <div className="text-lg sm:text-2xl font-bold text-red-600 truncate">${summary.overdue.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-5 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2.5 flex-shrink-0">
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-600 truncate">Paid (YTD)</div>
                <div className="text-lg sm:text-2xl font-bold text-green-600 truncate">${summary.paid.toLocaleString()}</div>
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

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full" style={{ minWidth: 640 }}>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-slate-600 dark:text-slate-400" />
                      <span className="font-mono text-sm font-medium text-slate-900">{inv.invoice_number}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{inv.clients?.name || "-"}</div>
                    {inv.projects?.name && <div className="text-xs text-slate-500">{inv.projects.name}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-600">{inv.invoice_date}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-600">{inv.due_date}</td>
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
                          : "bg-slate-100 text-slate-400 dark:text-slate-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openDetailModal(inv)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openEditInvoice(inv)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        <Pencil size={13}/>
                      </button>
                      {userRole === "director" && (
                        <button
                          onClick={() => deleteInvoice(inv)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredInvoices.length === 0 && (
            <div className="py-12 text-center">
              <FileText size={48} className="mx-auto mb-4 text-slate-700 dark:text-slate-300" />
              <div className="text-lg font-medium text-slate-900">No invoices found</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-600">Create your first client invoice to get started</div>
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
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Invoice Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Client *</label>
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
                <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Project (Optional)</label>
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
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Due Date *</label>
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
                        className="col-span-5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        value={item.unit}
                        onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                        className="col-span-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => updateLineItem(index, "rate", e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                      />
                      <div className="col-span-1 flex items-center justify-end text-sm font-medium text-slate-900">
                        ${item.amount.toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLineItem(index)}
                        className="col-span-1 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Payment Terms</label>
                  <input
                    type="text"
                    value={formData.terms}
                    onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                    placeholder="Net 30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                  placeholder="Additional notes"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-600">Subtotal:</span>
                  <span className="font-medium text-slate-900">${totals.subtotal.toFixed(2)}</span>
                </div>
                {totals.taxAmount > 0 && (
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-600">Tax ({formData.tax_rate}%):</span>
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
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 dark:bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
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
              <button onClick={() => setShowDetailModal(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-500 dark:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Invoice Number</div>
                <div className="font-mono font-semibold text-slate-900">{selectedInvoice.invoice_number}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Status</div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    selectedInvoice.status === "paid"
                      ? "bg-green-50 text-green-700"
                      : selectedInvoice.status === "overdue"
                      ? "bg-red-50 text-red-700"
                      : selectedInvoice.status === "partial"
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-slate-100 text-slate-400 dark:text-slate-700"
                  }`}
                >
                  {selectedInvoice.status}
                </span>
              </div>
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Client</div>
                <div className="font-medium text-slate-900">{selectedInvoice.clients?.name || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Project</div>
                <div className="font-medium text-slate-900">{selectedInvoice.projects?.name || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Invoice Date</div>
                <div className="font-medium text-slate-900">{selectedInvoice.invoice_date}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-600">Due Date</div>
                <div className="font-medium text-slate-900">{selectedInvoice.due_date}</div>
              </div>
            </div>

            {selectedInvoice.notes && (
              <div className="mb-6">
                <div className="text-sm text-slate-500 dark:text-slate-600 mb-1">Notes</div>
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
                <span className="text-slate-500 dark:text-slate-600">Subtotal:</span>
                <span className="font-medium text-slate-900">${Number(selectedInvoice.subtotal).toFixed(2)}</span>
              </div>
              {selectedInvoice.tax_amount > 0 && (
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500 dark:text-slate-600">Tax ({selectedInvoice.tax_rate}%):</span>
                  <span className="font-medium text-slate-900">${Number(selectedInvoice.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-slate-200 pt-2 mb-2">
                <span className="text-slate-900">Total:</span>
                <span className="text-slate-900">${Number(selectedInvoice.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-500 dark:text-slate-600">Paid:</span>
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
                    <div key={payment.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                      <div>
                        <div className="font-medium text-slate-900">{payment.payment_date}</div>
                        <div className="text-xs text-slate-500 capitalize">
                          {payment.payment_method.replace("_", " ")}
                          {payment.reference_number && ` - ${payment.reference_number}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="font-medium text-green-600">${Number(payment.amount).toFixed(2)}</div>
                        {userRole === "director" && (
                          <button onClick={() => deletePayment(payment.id!, selectedInvoice.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-300 hover:text-red-400 transition-colors">
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">No payments recorded</div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={14} className="text-slate-500"/>
                <h3 className="text-sm font-semibold text-slate-900">Payment Reminders</h3>
              </div>
              <div className="rounded-lg bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400 dark:text-slate-700">Enable reminders for this invoice</span>
                  <button onClick={()=>setReminderForm(f=>({...f, reminder_enabled: !f.reminder_enabled}))}
                    className={`w-10 h-5 rounded-full transition-colors relative ${reminderForm.reminder_enabled?"bg-blue-600":"bg-slate-300"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${reminderForm.reminder_enabled?"left-5":"left-0.5"}`}/>
                  </button>
                </div>
                {reminderForm.reminder_enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-600 block mb-1">Remind before due (days)</label>
                      <input type="number" min="0" value={reminderForm.reminder_days_before}
                        onChange={e=>setReminderForm(f=>({...f, reminder_days_before: parseInt(e.target.value)||0}))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"/>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 dark:text-slate-600 block mb-1">Repeat every (days, if unpaid)</label>
                      <input type="number" min="0" value={reminderForm.reminder_repeat_days}
                        onChange={e=>setReminderForm(f=>({...f, reminder_repeat_days: parseInt(e.target.value)||0}))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"/>
                    </div>
                  </div>
                )}
                <button onClick={()=>saveReminderSettings(selectedInvoice.id)} disabled={savingReminder}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">
                  <Save size={12}/> {savingReminder?"Saving...":"Save Reminder Settings"}
                </button>
                {selectedInvoice.last_reminder_sent_at && (
                  <div className="text-[11px] text-slate-500">Last sent: {new Date(selectedInvoice.last_reminder_sent_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                  <button onClick={()=>sendReminderWhatsApp(selectedInvoice)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition">
                    <MessageCircle size={13}/> Send via WhatsApp
                  </button>
                  <button onClick={()=>sendReminderEmail(selectedInvoice)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition">
                    <Mail size={13}/> Send via Email
                  </button>
                </div>
                {reminderSent && (
                  <div className="text-xs text-emerald-600 font-medium text-center">Reminder marked as sent ?</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 mt-6">
              <button
                onClick={() => setShowDetailModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-700 hover:bg-slate-50"
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
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-500 dark:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="mb-6 rounded-lg bg-slate-50 p-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500 dark:text-slate-600">Invoice:</span>
                <span className="font-mono font-medium text-slate-900">{selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-600">Balance Due:</span>
                <span className="font-bold text-blue-600">${Number(selectedInvoice.balance_due).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={paymentData.payment_date}
                    onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Amount *</label>
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
                <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Payment Method *</label>
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
                <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Reference Number</label>
                <input
                  type="text"
                  value={paymentData.reference_number}
                  onChange={(e) => setPaymentData({ ...paymentData, reference_number: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                  placeholder="Check #, Transaction ID, etc."
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400 dark:text-slate-700">Notes</label>
                <textarea
                  rows={2}
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-600 dark:text-slate-400"
                  placeholder="Additional payment notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-400 dark:text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 dark:bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:hover:bg-slate-800"
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Thank You Notification Modal */}
      {showThankYouModal && thankYouData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Payment Received</h2>
              <button onClick={() => { setShowThankYouModal(false); setThankYouData(null); }} className="text-slate-600 dark:text-slate-400 hover:text-slate-500 dark:text-slate-600">
                <X size={18}/>
              </button>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-600 mb-4">
              Send {thankYouData.client.contact_name || thankYouData.client.name} a thank you message?
            </p>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4 text-sm text-slate-400 dark:text-slate-700 whitespace-pre-line">
{`Hi ${thankYouData.client.contact_name || thankYouData.client.name},

Thank you! We've received your payment of ${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(thankYouData.amount)} for Invoice #${thankYouData.invoiceNumber}.

We appreciate your business.

${companySettings?.company_name || "Magnus Boys Construction"}`}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {thankYouData.client.phone && (
                <button
                  onClick={() => {
                    const msg = `Hi ${thankYouData.client.contact_name||thankYouData.client.name},\n\nThank you! We've received your payment of ${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(thankYouData.amount)} for Invoice #${thankYouData.invoiceNumber}.\n\nWe appreciate your business.\n\n${companySettings?.company_name||"Magnus Boys Construction"}`;
                    const phone = thankYouData.client.phone.replace(/\D/g,"");
                    window.open(`https://wa.me/${phone?`1${phone}`:""}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold transition"
                >
                  WhatsApp
                </button>
              )}
              {thankYouData.client.email && (
                <button
                  onClick={() => {
                    const subject = encodeURIComponent(`Payment Received - Invoice #${thankYouData.invoiceNumber}`);
                    const body = encodeURIComponent(`Hi ${thankYouData.client.contact_name||thankYouData.client.name},\n\nThank you! We've received your payment of ${new Intl.NumberFormat("en-US",{style:"currency",currency:"JMD"}).format(thankYouData.amount)} for Invoice #${thankYouData.invoiceNumber}.\n\nWe appreciate your business.\n\n${companySettings?.company_name||"Magnus Boys Construction"}`);
                    window.open(`mailto:${thankYouData.client.email}?subject=${subject}&body=${body}`, "_blank");
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold transition"
                >
                  Email
                </button>
              )}
            </div>
            <button
              onClick={() => { setShowThankYouModal(false); setThankYouData(null); }}
              className="w-full mt-3 py-2 text-sm text-slate-500 hover:text-slate-400 dark:text-slate-700"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg flex flex-col"
            style={{ maxHeight: "90dvh" }}>
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Edit Invoice</h3>
                <p className="text-xs text-slate-400 mt-0.5">{editingInvoice.invoice_number}</p>
              </div>
              <button onClick={() => setEditingInvoice(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                <X size={16}/>
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Invoice Date</label>
                  <input type="date" value={editForm.invoice_date}
                    onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Due Date</label>
                  <input type="date" value={editForm.due_date}
                    onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Status</label>
                <select value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none">
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tax Rate (%)</label>
                <input type="number" min="0" max="100" value={editForm.tax_rate}
                  onChange={e => setEditForm(f => ({ ...f, tax_rate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Terms</label>
                <input type="text" value={editForm.terms}
                  onChange={e => setEditForm(f => ({ ...f, terms: e.target.value }))}
                  placeholder="e.g. Net 30"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes</label>
                <textarea value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"/>
              </div>
            </div>
            {/* Footer */}
            <div className="flex-shrink-0 flex gap-3 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setEditingInvoice(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancel
              </button>
              <button onClick={saveEditInvoice}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}