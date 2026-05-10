
# Magnus System v3 - LIGHT Project Scan
Generated: 05/10/2026 10:03:46


==================================================
FILE: package.json
==================================================

{
  "name": "magnus-system-v3",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.97.0",
    "expr-eval": "^2.0.2",
    "lucide-react": "^0.574.0",
    "pdfjs-dist": "^5.4.624",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-easy-crop": "^5.5.7",
    "react-image-crop": "^11.0.10",
    "react-router-dom": "^7.13.0",
    "tesseract.js": "^7.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "autoprefixer": "^10.4.24",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "postcss": "^8.5.6",
    "supabase": "^2.84.5",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.48.0",
    "vite": "^7.3.1"
  }
}


==================================================
FILE: vite.config.ts
==================================================

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})


==================================================
FILE: tsconfig.json
==================================================

{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}


==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\AcceptInvitePage.tsx
==================================================

// src/pages/AcceptInvitePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AcceptInvitePage() {
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get("token_hash") || "";
  const type = (params.get("type") || "invite") as "invite" | "signup" | "recovery" | "email";
  const next = params.get("next") || "/";

  const [verifying, setVerifying] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;

    async function run() {
      if (!tokenHash) {
        setVerifyError("Invite link is missing token_hash.");
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (!active) return;

      if (error) {
        setVerifyError(error.message || "Invite verification failed.");
        setVerified(false);
      } else {
        setVerified(true);
      }

      setVerifying(false);
    }

    run();

    return () => {
      active = false;
    };
  }, [tokenHash, type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");

    if (!password || password.length < 6) {
      setSaveError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      setSaveError(error.message || "Failed to set password.");
      return;
    }

    navigate(next, { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900">Accept Invite</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set your password to activate your account.
        </p>

        {verifying ? (
          <div className="mt-6 text-sm text-slate-700">Verifying invite…</div>
        ) : verifyError ? (
          <div className="mt-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {verifyError}
          </div>
        ) : verified ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-slate-400"
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>

            {saveError ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {saveError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 text-white py-2.5 font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Set password and continue"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\AccountsReceivablePage.tsx
==================================================

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

  useEffect(() => {
    loadInvoices();
    loadClientsAndProjects();
    loadContracts();
  }, []);

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

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\AssembliesPage.tsx
==================================================

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

  // Picker (Type ? Category ? Item ? Variant)
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


==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\BillingPage.tsx
==================================================

import React from "react";
import { Check, X } from "lucide-react";
import { usePlan } from "../hooks/usePlan";
import type { Plan } from "../lib/plans";
import { PLAN_FEATURES } from "../lib/plans";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { theme } from "../lib/theme";

export default function BillingPage() {
  const { plan, setPlan } = usePlan();
  const financeAccess = useFinanceAccess();

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewBilling) {
    return <FinanceAccessDenied />;
  }

  const features = [
    { key: "takeoffExport", label: "Export Takeoff to CSV" },
    { key: "boqTakeoffLinking", label: "BOQ ↔ Takeoff Linking" },
    { key: "maxTakeoffGroups", label: "Takeoff Groups", getValue: (p: Plan) => PLAN_FEATURES[p].maxTakeoffGroups === null ? "Unlimited" : PLAN_FEATURES[p].maxTakeoffGroups },
    { key: "maxUsers", label: "Team Users", getValue: (p: Plan) => PLAN_FEATURES[p].maxUsers === null ? "Unlimited" : PLAN_FEATURES[p].maxUsers },
    { key: "advancedReports", label: "Advanced Reports" },
    { key: "prioritySupport", label: "Priority Support" },
  ];

  const plans: Plan[] = ["free", "pro", "team"];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className={`text-3xl font-bold ${theme.text.primary} mb-2`}>Billing & Plans</h1>
        <p className={theme.text.muted}>Choose the plan that fits your needs</p>
      </div>

      <div className={`mb-8 p-4 ${theme.status.info.bg} border ${theme.status.info.border} rounded-lg`}>
        <p className={`text-sm ${theme.status.info.text}`}>
          <strong>Current Plan:</strong> {PLAN_FEATURES[plan].name} ({PLAN_FEATURES[plan].price})
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((p) => {
          const planInfo = PLAN_FEATURES[p];
          const isCurrent = plan === p;

          return (
            <div
              key={p}
              className={`
                relative rounded-lg border-2 p-6 transition-all
                ${isCurrent
                  ? `border-blue-500 ${theme.status.info.bg}`
                  : `${theme.border.base} ${theme.surface.base}`
                }
              `}
            >
              {isCurrent && (
                <div className="absolute top-4 right-4 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
                  Current
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-xl font-bold ${theme.text.primary} mb-2`}>
                  {planInfo.name}
                </h3>
                <div className={`text-3xl font-bold ${theme.text.primary}`}>
                  {planInfo.price.split("/")[0]}
                  <span className={`text-sm font-normal ${theme.text.muted}`}>
                    /{planInfo.price.split("/")[1]}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {features.map((feature) => {
                  const featureKey = feature.key as keyof typeof planInfo;
                  let value = planInfo[featureKey];
                  let display: React.ReactNode;

                  if (feature.getValue) {
                    display = feature.getValue(p);
                  } else if (typeof value === "boolean") {
                    display = value ? <Check size={16} className={theme.status.success.text} /> : <X size={16} className={theme.text.muted} />;
                  } else if (typeof value === "number") {
                    display = value;
                  } else if (value === null) {
                    display = "Unlimited";
                  } else {
                    display = String(value);
                  }

                  return (
                    <li key={feature.key} className={`flex items-center gap-2 text-sm ${theme.text.secondary}`}>
                      {typeof display === "object" && display !== null ? (
                        <>
                          {display}
                          <span>{feature.label}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">{display}</span>
                          <span>{feature.label}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => setPlan(p)}
                disabled={isCurrent}
                className={`
                  w-full py-2 px-4 rounded-lg font-semibold transition-all
                  ${isCurrent
                    ? `${theme.input.disabled} ${theme.text.muted} cursor-not-allowed`
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                  }
                `}
              >
                {isCurrent ? "Current Plan" : `Switch to ${planInfo.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className={`mt-8 p-4 ${theme.surface.muted} border ${theme.border.base} rounded-lg`}>
        <p className={`text-xs ${theme.text.muted}`}>
          <strong>Note:</strong> This is a demo monetization system. No real payments are processed.
          Plan selection is stored locally for testing purposes.
        </p>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\BOQPage.tsx
==================================================

// src/pages/BOQPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useMasterLists } from "../hooks/useMasterLists";
import { ImportTakeoffModal } from "../components/ImportTakeoffModal";
import { generateProcurementFromBOQ } from "../lib/procurement";
import { generateEstimateFromBOQ } from "../lib/estimates";
import { useProjectContext } from "../context/ProjectContext";
import { SmartItemSelector } from "../components/SmartItemSelector";
import AIAssistantPanel from "../components/AIAssistantPanel";
import { BOQSuggestionCard } from "../components/BOQSuggestionCard";
import { addSuggestionToBOQ, type BOQSuggestion } from "../lib/boqSuggestions";
import { theme } from "../lib/theme";

type RateItem = {
  id: string;
  item_name: string;
  description: string | null;
  variant: string | null;
  unit: string | null;
  category: string | null;
  item_type: string | null;

  // from v_cost_items_current only
  current_rate?: number | null;
  current_currency?: string | null;
};

type BOQItemRow = {
  id: string;

  pick_type: string;
  pick_category: string;
  pick_item: string;
  pick_variant: string;

  cost_item_id: string | null;

  item_name: string;
  description: string;
  unit_id: string | null;
  qty: number;
  rate: number;
};

type Section = {
  id: string;
  masterCategoryId: string | null;
  title: string;
  scope: string;
  items: BOQItemRow[];
};

type AssemblyRow = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  category: string | null;
  is_active?: boolean | null;
};

type AssemblyComponentRow = {
  id: string;
  assembly_id: string;
  cost_item_id: string;
  line_type: string; // material/labour/equipment/subcontract/other
  quantity_factor: number;
  waste_percent: number;
  sort_order: number;
  notes: string | null;
};

function safeId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = typeof crypto !== "undefined" ? crypto : null;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function numOr(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function uniqSorted(values: string[]) {
  const set = new Set(values.map((v) => v.trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Categories */
function getCategoryId(c: any): string {
  return String(c?.id ?? "");
}
function getCategoryLabel(c: any): string {
  return String(c?.name ?? "Unnamed Category");
}
function getCategoryScope(c: any): string {
  return String(c?.scope_of_work ?? "");
}

/** Units */
function getUnitId(u: any): string {
  return String(u?.id ?? "");
}
function getUnitLabel(u: any): string {
  return String(u?.name ?? "Unit");
}

type BoqHeaderRow = {
  id: string;
  project_id: string;
  status: string;
  version: number;
  updated_at: string;
};


function resolveProjectId(): string | null {
  const keys = ["active_project_id", "selected_project_id", "project_id"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export default function BOQPage() {
  const nav = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject: selectedProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<"draft" | "approved">("draft");
  const [sections, setSections] = useState<Section[]>([]);

  // Persistence state
  const [boqId, setBoqId] = useState<string | null>(null);
  const [persistLoading, setPersistLoading] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Project picker state - resolve after hooks are called
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
    routeProjectId || currentProjectId || resolveProjectId()
  );

  // Auto-save state (UI only right now)
  const [autoSaveOn, setAutoSaveOn] = useState(true);
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState<string | null>(null);

  const {
    categories: masterCategories,
    units: masterUnits,
    loading: masterLoading,
    error: masterError,
  } = useMasterLists();

  const canEdit = status === "draft";

  const usableCategories = useMemo(() => {
    const arr = Array.isArray(masterCategories) ? masterCategories : [];
    return arr.filter((c: any) => !!getCategoryId(c));
  }, [masterCategories]);

  const usableUnits = useMemo(() => {
    const arr = Array.isArray(masterUnits) ? masterUnits : [];
    return arr.filter((u: any) => !!getUnitId(u));
  }, [masterUnits]);



  // Rate items
  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState<"v_cost_items_current" | "cost_items" | null>(null);

  // Smart selector state
  const [companyId, setCompanyId] = useState<string>("");
  const [showSmartSelector, setShowSmartSelector] = useState(false);
  const [smartSelectorContext, setSmartSelectorContext] = useState<{ sectionId: string; rowId: string } | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadRateItems() {
      setRateLoading(true);
      setRateError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();
        if (profile?.company_id && alive) {
          setCompanyId(profile.company_id);
        }
      }

      try {
        const { data, error } = await supabase
          .from("v_cost_items_current")
          .select("id,item_name,description,variant,unit,category,item_type,current_rate,current_currency")
          .order("item_name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as RateItem[]);
        setRateSource("v_cost_items_current");
        return;
      } catch (e: any) {
        console.warn("v_cost_items_current failed, falling back to cost_items:", e?.message ?? e);
      } finally {
        if (alive) setRateLoading(false);
      }

      try {
        setRateLoading(true);
        const { data, error } = await supabase
          .from("cost_items")
          .select("id,item_name,description,variant,unit,category,item_type")
          .order("item_name", { ascending: true })
          .limit(5000);

        if (error) throw error;
        if (!alive) return;

        setRateItems((data ?? []) as RateItem[]);
        setRateSource("cost_items");
      } catch (e: any) {
        console.error("Failed to load rate items:", e);
        if (!alive) return;
        setRateError(e?.message ?? "Failed to load rate items");
        setRateItems([]);
        setRateSource(null);
      } finally {
        if (alive) setRateLoading(false);
      }
    }

    loadRateItems();
    return () => {
      alive = false;
    };
  }, []);

  // Handle takeoff data from URL params
  useEffect(() => {
    const groupsParam = searchParams.get("groups");
    if (!groupsParam) return;

    try {
      const takeoffGroups = JSON.parse(groupsParam);

      if (Array.isArray(takeoffGroups) && takeoffGroups.length > 0) {
        const newSection: Section = {
          id: safeId(),
          masterCategoryId: null,
          title: "Takeoff Import",
          scope: "Quantities imported from takeoff measurements",
          items: takeoffGroups.map((group: any, index: number) => ({
            id: safeId(),
            pick_type: "manual",
            pick_category: "",
            pick_item: "",
            pick_variant: "",
            cost_item_id: null,
            item_name: group.groupName || "Imported Item",
            description: `${group.metric} measurement`,
            unit_id: null,
            qty: Number(group.value) || 0,
            rate: 0,
          })),
        };

        setSections((prev) => [...prev, newSection]);

        setSearchParams({});
      }
    } catch (e) {
      console.error("Failed to parse takeoff groups:", e);
    }
  }, [searchParams, setSearchParams]);

  // -----------------------------
  // Assemblies (PlanSwift-style)
  // -----------------------------
  const [assemblies, setAssemblies] = useState<AssemblyRow[]>([]);
  const [assemblyComponents, setAssemblyComponents] = useState<AssemblyComponentRow[]>([]);
  const [assemblyLoading, setAssemblyLoading] = useState(false);
  const [assemblyError, setAssemblyError] = useState<string | null>(null);

  type AssemblyModalState = {
    open: boolean;
    sectionId: string | null;
    search: string;
    selectedAssemblyId: string;
    qty: string; // keep as string for input
  };

  const [asmModal, setAsmModal] = useState<AssemblyModalState>({
    open: false,
    sectionId: null,
    search: "",
    selectedAssemblyId: "",
    qty: "1",
  });

  const [importTakeoffModal, setImportTakeoffModal] = useState<{
    open: boolean;
    sectionId: string | null;
    itemId: string | null;
  }>({
    open: false,
    sectionId: null,
    itemId: null,
  });

  const [aiSuggestionsModal, setAiSuggestionsModal] = useState<{
    open: boolean;
    suggestions: BOQSuggestion[];
  }>({
    open: false,
    suggestions: [],
  });

  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadAssemblies() {
      setAssemblyLoading(true);
      setAssemblyError(null);

      try {
        const { data: aData, error: aErr } = await supabase
          .from("assemblies")
          .select("id,name,description,unit,category,is_active")
          .order("name", { ascending: true })
          .limit(5000);

        if (aErr) throw aErr;

        const active = (Array.isArray(aData) ? aData : []).filter((a: any) => a?.is_active !== false);
        const list = active.map((a: any) => ({
          id: String(a.id),
          name: String(a.name ?? ""),
          description: a.description ? String(a.description) : null,
          unit: a.unit ? String(a.unit) : null,
          category: a.category ? String(a.category) : null,
          is_active: a.is_active ?? true,
        })) as AssemblyRow[];

        const { data: cData, error: cErr } = await supabase
          .from("assembly_components")
          .select("id,assembly_id,cost_item_id,line_type,quantity_factor,waste_percent,sort_order,notes")
          .order("assembly_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(20000);

        if (cErr) throw cErr;

        const comps = (Array.isArray(cData) ? cData : []).map((c: any) => ({
          id: String(c.id),
          assembly_id: String(c.assembly_id),
          cost_item_id: String(c.cost_item_id),
          line_type: String(c.line_type ?? "material"),
          quantity_factor: numOr(c.quantity_factor, 1),
          waste_percent: numOr(c.waste_percent, 0),
          sort_order: Number.isFinite(Number(c.sort_order)) ? Number(c.sort_order) : 0,
          notes: c.notes ? String(c.notes) : null,
        })) as AssemblyComponentRow[];

        if (!alive) return;
        setAssemblies(list);
        setAssemblyComponents(comps);
      } catch (e: any) {
        console.error("loadAssemblies failed:", e);
        if (!alive) return;
        setAssemblyError(e?.message ?? "Failed to load assemblies");
        setAssemblies([]);
        setAssemblyComponents([]);
      } finally {
        if (alive) setAssemblyLoading(false);
      }
    }

    loadAssemblies();
    return () => {
      alive = false;

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\CashFlowPage.tsx
==================================================

import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  fetchBankAccounts,
  fetchCashTransactions,
  getCashFlowSummary,
  getARSummary,
  getAPSummary,
} from "../lib/finance";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";

export default function CashFlowPage() {
  const financeAccess = useFinanceAccess();
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState({
    income: 0,
    expenses: 0,
    netCashFlow: 0,
  });
  const [arSummary, setArSummary] = useState({ totalOutstanding: 0, overdueCount: 0 });
  const [apSummary, setApSummary] = useState({ totalDue: 0, pendingApprovalCount: 0 });
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    loadData();
  }, [dateRange]);

  if (financeAccess.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-slate-600">Loading...</div>
      </div>
    );
  }

  if (!financeAccess.canViewCashFlow) {
    return <FinanceAccessDenied />;
  }

  async function loadData() {
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

      const [accounts, trans, cashSummary, ar, ap] = await Promise.all([
        fetchBankAccounts(profile.company_id),
        fetchCashTransactions(profile.company_id, dateRange.start, dateRange.end),
        getCashFlowSummary(profile.company_id, dateRange.start, dateRange.end),
        getARSummary(profile.company_id),
        getAPSummary(profile.company_id),
      ]);

      setBankAccounts(accounts);
      setTransactions(trans);
      setSummary(cashSummary);
      setArSummary(ar);
      setApSummary(ap);
    } catch (error) {
      console.error("Error loading cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + Number(acc.current_balance || 0), 0);

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-2xl font-bold text-slate-900">Cash Flow</h1>
        <p className="text-sm text-slate-600">Monitor cash position and financial health</p>
      </div>

      <div className="p-8">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-slate-500" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        </div>

        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Total Cash</div>
              <div className="rounded-lg bg-blue-50 p-2">
                <DollarSign size={18} className="text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">${totalBankBalance.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">Across all accounts</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Cash Inflow</div>
              <div className="rounded-lg bg-green-50 p-2">
                <ArrowUpRight size={18} className="text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-green-600">${summary.income.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Cash Outflow</div>
              <div className="rounded-lg bg-red-50 p-2">
                <ArrowDownRight size={18} className="text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600">${summary.expenses.toLocaleString()}</div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Net Cash Flow</div>
              <div className={`rounded-lg p-2 ${summary.netCashFlow >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                {summary.netCashFlow >= 0 ? (
                  <TrendingUp size={18} className="text-green-600" />
                ) : (
                  <TrendingDown size={18} className="text-red-600" />
                )}
              </div>
            </div>
            <div className={`text-2xl font-bold ${summary.netCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${Math.abs(summary.netCashFlow).toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-slate-500">This period</div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Bank Accounts</h3>
            <div className="space-y-3">
              {bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="font-medium text-slate-900">{account.account_name}</div>
                    <div className="text-sm text-slate-500 capitalize">
                      {account.account_type.replace("_", " ")}
                      {account.bank_name && ` • ${account.bank_name}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">
                      ${Number(account.current_balance).toLocaleString()}
                    </div>
                    {account.is_primary && (
                      <span className="text-xs font-medium text-blue-600">Primary</span>
                    )}
                  </div>
                </div>
              ))}
              {bankAccounts.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-500">No bank accounts configured</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Accounts Receivable</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-600">Outstanding</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    ${arSummary.totalOutstanding.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Overdue</div>
                  <div className="mt-1 text-2xl font-bold text-red-600">{arSummary.overdueCount}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Accounts Payable</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-600">Total Due</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    ${apSummary.totalDue.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Pending Approval</div>
                  <div className="mt-1 text-2xl font-bold text-orange-600">{apSummary.pendingApprovalCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">Recent Transactions</h3>
          </div>
          <div className="overflow-x-auto">
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
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Account
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.slice(0, 20).map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-900">{txn.transaction_date}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{txn.description}</div>
                      {txn.reference_number && (
                        <div className="text-xs text-slate-500">Ref: {txn.reference_number}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                          txn.transaction_type === "income"
                            ? "bg-green-50 text-green-700"
                            : txn.transaction_type === "expense"
                            ? "bg-red-50 text-red-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {txn.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {txn.bank_accounts?.account_name || "-"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`text-sm font-medium ${
                          txn.transaction_type === "income" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {txn.transaction_type === "income" ? "+" : "-"}$
                        {Number(txn.amount).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-500">No transactions in this period</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\ClientProjectPage.tsx
==================================================

import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  checkClientPortalAccess,
  fetchClientInvoices,
  fetchClientPayments,
  getClientFinancialSummary,
  type ClientInvoiceSummary,
  type ClientPaymentHistory,
} from "../lib/clientAccess";
import { fetchProjectTasks, getProjectProgress } from "../lib/tasks";
import type { ProjectTask, ProjectProgress } from "../lib/tasks";
import { fetchProjectFiles } from "../lib/documents";
import type { ProjectDocument } from "../lib/documents";
import { fetchDailyLogs } from "../lib/dailyLogs";
import type { DailyLog } from "../lib/dailyLogs";
import { fetchProjectPhotos } from "../lib/photos";
import type { ProjectPhoto } from "../lib/photos";
import { fetchProjectActivity, getActivityIcon, getActivityColor } from "../lib/activity";
import type { ProjectActivity } from "../lib/activity";

type ProjectRow = {
  id: string;
  client_id: string | null;
  name: string;
  site_address: string | null;
  status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ClientRow = {
  id: string;
  name: string;
};

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ClientProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [invoices, setInvoices] = useState<ClientInvoiceSummary[]>([]);
  const [payments, setPayments] = useState<ClientPaymentHistory[]>([]);
  const [financialSummary, setFinancialSummary] = useState<{
    total_invoiced: number;
    total_paid: number;
    balance_due: number;
    overdue_amount: number;
  } | null>(null);

  useEffect(() => {
    async function loadClientProject() {
      if (!projectId) {
        setError("No project ID provided");
        setLoading(false);
        return;
      }

      const accessInfo = await checkClientPortalAccess(projectId);

      if (!accessInfo.hasAccess || !accessInfo.isClientPortalUser) {
        setError("You do not have access to this project");
        setLoading(false);
        return;
      }

      setHasAccess(true);

      await loadProject();
      await loadTasks();
      await loadProgress();
      await loadDocuments();
      await loadDailyLogs();
      await loadPhotos();
      await loadActivities();
      await loadInvoices();
      await loadPayments();
      await loadFinancialSummary();

      setLoading(false);
    }

    loadClientProject();
  }, [projectId]);

  async function loadProject() {
    if (!projectId) return;

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Error fetching project:", projectError);
      setError("Failed to load project");
      return;
    }

    setProject(projectData);

    if (projectData.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", projectData.client_id)
        .single();

      if (clientData) {
        setClient(clientData);
      }
    }
  }

  async function loadTasks() {
    if (!projectId) return;
    const result = await fetchProjectTasks(projectId);
    if (result.success && result.data) {
      setTasks(result.data);
    }
  }

  async function loadProgress() {
    if (!projectId) return;
    const progressData = await getProjectProgress(projectId);
    if (progressData) {
      setProgress(progressData);
    }
  }

  async function loadDocuments() {
    if (!projectId) return;
    const result = await fetchProjectFiles(projectId);
    if (result.success && result.data) {
      setDocuments(result.data);
    }
  }

  async function loadDailyLogs() {
    if (!projectId) return;
    const result = await fetchDailyLogs(projectId);
    if (result.success && result.data) {
      setDailyLogs(result.data);
    }
  }

  async function loadPhotos() {
    if (!projectId) return;
    const result = await fetchProjectPhotos(projectId);
    if (result.success && result.data) {
      setPhotos(result.data);
    }
  }

  async function loadActivities() {
    if (!projectId) return;
    const result = await fetchProjectActivity(projectId, 20);
    if (result.success && result.data) {
      setActivities(result.data);
    }
  }

  async function loadInvoices() {
    if (!projectId) return;
    const result = await fetchClientInvoices(projectId);
    if (result.success && result.data) {
      setInvoices(result.data);
    }
  }

  async function loadPayments() {
    if (!projectId) return;
    const result = await fetchClientPayments(projectId);
    if (result.success && result.data) {
      setPayments(result.data);
    }
  }

  async function loadFinancialSummary() {
    if (!projectId) return;
    const result = await getClientFinancialSummary(projectId);
    if (result.success && result.data) {
      setFinancialSummary(result.data);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-sm text-slate-400">Loading project...</div>
      </div>
    );
  }

  if (error || !hasAccess || !project) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-200">Access Denied</h1>
            <p className="text-slate-400 mt-1">{error || "You do not have access to this project."}</p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const projectStatusColors = {
    planning: "bg-blue-500/20 text-blue-400",
    active: "bg-green-500/20 text-green-400",
    on_hold: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-slate-500/20 text-slate-400",
    cancelled: "bg-red-500/20 text-red-400",
  };

  const statusLabel = project.status.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-200">Client Portal</h1>
            <p className="text-sm text-slate-400 mt-0.5">Project Information</p>
          </div>
          <button
            onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-200">{project.name}</h2>
              {client && (
                <p className="text-sm text-slate-400 mt-1">Client: {client.name}</p>
              )}
            </div>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${projectStatusColors[project.status]}`}>
              {statusLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {project.site_address && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Site Address</div>
                <div className="text-sm text-slate-300">{project.site_address}</div>
              </div>
            )}
            {project.start_date && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Start Date</div>
                <div className="text-sm text-slate-300">
                  {new Date(project.start_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
            {project.end_date && (
              <div>
                <div className="text-xs text-slate-500 mb-1">End Date</div>
                <div className="text-sm text-slate-300">
                  {new Date(project.end_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            )}
          </div>

          {project.notes && (
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-1">Notes</div>
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{project.notes}</div>
            </div>
          )}
        </div>

        {progress && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <div className="text-sm font-semibold text-slate-200 mb-4">Project Progress</div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Overall Progress</span>
                  <span className="text-sm font-medium text-slate-300">{progress.progress_percent}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all"
                    style={{ width: `${progress.progress_percent}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-200">{progress.total_tasks}</div>
                  <div className="text-xs text-slate-500 mt-1">Total Tasks</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-green-400">{progress.completed_tasks}</div>
                  <div className="text-xs text-slate-500 mt-1">Completed</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {financialSummary && (financialSummary.total_invoiced > 0 || financialSummary.total_paid > 0) && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6">
            <div className="text-sm font-semibold text-slate-200 mb-4">Financial Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-blue-400">${formatCurrency(financialSummary.total_invoiced)}</div>
                <div className="text-xs text-slate-500 mt-1">Total Invoiced</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-green-400">${formatCurrency(financialSummary.total_paid)}</div>
                <div className="text-xs text-slate-500 mt-1">Total Paid</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-950/40 border border-slate-800">
                <div className="text-2xl font-semibold text-yellow-400">${formatCurrency(financialSummary.balance_due)}</div>
                <div className="text-xs text-slate-500 mt-1">Balance Due</div>
              </div>
              {financialSummary.overdue_amount > 0 && (
                <div className="text-center p-4 rounded-xl bg-red-950/40 border border-red-800">
                  <div className="text-2xl font-semibold text-red-400">${formatCurrency(financialSummary.overdue_amount)}</div>
                  <div className="text-xs text-slate-500 mt-1">Overdue</div>
                </div>
              )}
            </div>
          </div>
        )}

        {invoices.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-4">Invoices</div>
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{invoice.invoice_number}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Due: {new Date(invoice.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                      invoice.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                      invoice.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {invoice.status.replace(/_/g, ' ')}
                    </span>
                  </div>

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\ClientsPage.tsx
==================================================

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ClientRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export default function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientRow[]>([]);

  // New client form
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eContactName, setEContactName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eAddress, setEAddress] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eStatus, setEStatus] = useState<ClientRow["status"]>("active");

  async function loadClients() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setClients([]);
      setLoading(false);
      return;
    }

    setClients((data ?? []) as ClientRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadClients();
  }, []);

  async function addClient() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Client name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("clients").insert({
      name: trimmed,
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      status: "active",
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");

    await loadClients();
    setSaving(false);
  }

  function startEdit(c: ClientRow) {
    setEditingId(c.id);
    setEName(c.name ?? "");
    setEContactName(c.contact_name ?? "");
    setEPhone(c.phone ?? "");
    setEEmail(c.email ?? "");
    setEAddress(c.address ?? "");
    setENotes(c.notes ?? "");
    setEStatus(c.status);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function saveEdit() {
    if (!editingId) return;

    const trimmed = eName.trim();
    if (!trimmed) {
      setError("Client name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("clients")
      .update({
        name: trimmed,
        contact_name: eContactName.trim() || null,
        phone: ePhone.trim() || null,
        email: eEmail.trim() || null,
        address: eAddress.trim() || null,
        notes: eNotes.trim() || null,
        status: eStatus,
      })
      .eq("id", editingId);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setEditingId(null);
    await loadClients();
    setSaving(false);
  }

  async function deleteClient(id: string) {
    const ok = confirm("Delete this client? This cannot be undone.");
    if (!ok) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    if (editingId === id) setEditingId(null);
    await loadClients();
    setSaving(false);
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-slate-400 mt-1">
            Manage clients, contacts, addresses, and notes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={addClient}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "+ New Client"}
          </button>
          <button
            onClick={loadClients}
            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Add Client */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="text-sm font-semibold mb-3">Add Client</div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400">Client Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                placeholder="e.g., Mr. Brown / ABC Company"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Contact Name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 min-h-[90px]"
              />
            </div>
          </div>
        </div>

        {/* Client List */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Client List</div>
            <div className="text-xs text-slate-400">
              {loading ? "Loading..." : clients.length + " clients"}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-slate-400">Loading�</div>
            ) : clients.length === 0 ? (
              <div className="text-sm text-slate-400">No clients yet.</div>
            ) : (
              clients.map((c) => {
                const isEditing = editingId === c.id;

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              value={eName}
                              onChange={(e) => setEName(e.target.value)}
                              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={eContactName}
                                onChange={(e) => setEContactName(e.target.value)}
                                placeholder="Contact"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                              <input
                                value={ePhone}
                                onChange={(e) => setEPhone(e.target.value)}
                                placeholder="Phone"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={eEmail}
                                onChange={(e) => setEEmail(e.target.value)}
                                placeholder="Email"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                              <input
                                value={eAddress}
                                onChange={(e) => setEAddress(e.target.value)}
                                placeholder="Address"
                                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              />
                            </div>

                            <textarea
                              value={eNotes}
                              onChange={(e) => setENotes(e.target.value)}
                              placeholder="Notes"
                              className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600 min-h-[70px]"
                            />

                            <div className="flex items-center gap-2">
                              <select
                                value={eStatus}
                                onChange={(e) => setEStatus(e.target.value as ClientRow["status"])}
                                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm outline-none focus:border-slate-600"
                              >
                                <option value="active">active</option>
                                <option value="inactive">inactive</option>
                              </select>

                              <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-sm truncate">{c.name}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              {(c.contact_name || "�") +
                                " � " +
                                (c.phone || "�") +
                                " � " +
                                (c.email || "�")}
                            </div>
                            {c.address && (
                              <div className="text-xs text-slate-500 mt-1">{c.address}</div>
                            )}
                            {c.notes && (
                              <div className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">
                                {c.notes}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] px-2 py-1 rounded-full border border-slate-700 text-slate-300">
                            {c.status}
                          </div>

                          <button
                            onClick={() => startEdit(c)}
                            className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm"
                          >

==================================================
// src/pages/CompanyUsersPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type CompanyUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "director" | "admin" | "estimator" | "supervisor" | "client";
  status: "active" | "disabled";
  company_id: string;
};

type PendingInviteRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "director" | "admin" | "estimator" | "supervisor" | "client";
  status: string;
  company_id: string;
  invited_by: string | null;
  created_at: string;
};

type MyProfile = {
  id: string;
  role: string | null;
  company_id: string | null;
  full_name: string | null;
};

const ROLE_OPTIONS: CompanyUserRow["role"][] = [
  "director",
  "admin",
  "estimator",
  "supervisor",
  "client",
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function CompanyUsersPage() {
  const [me, setMe] = useState<MyProfile | null>(null);
  const [rows, setRows] = useState<CompanyUserRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyUserRow["role"]>("estimator");

  const isDirector = me?.role === "director";

  const loadPage = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!user) throw new Error("You are not logged in.");

      const { data: myProfile, error: myProfileError } = await supabase
        .from("user_profiles")
        .select("id, role, company_id, full_name")
        .eq("id", user.id)
        .single();

      if (myProfileError) throw myProfileError;
      setMe(myProfile as MyProfile);

      if (myProfile?.role !== "director") {
        setRows([]);
        setPendingInvites([]);
        setError("Only directors can access Company User Manager.");
        return;
      }

      const [{ data: usersData, error: usersError }, { data: invitesData, error: invitesError }] =
        await Promise.all([
          supabase.rpc("get_company_users"),
          supabase.rpc("get_company_pending_invites"),
        ]);

      if (usersError) throw usersError;
      if (invitesError) throw invitesError;

      setRows((usersData || []) as CompanyUserRow[]);
      setPendingInvites((invitesData || []) as PendingInviteRow[]);
    } catch (err: any) {
      console.error("CompanyUsersPage load error:", err);
      setError(err?.message || "Failed to load company users.");
      setRows([]);
      setPendingInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const disabled = rows.filter((r) => r.status === "disabled").length;
    const directors = rows.filter((r) => r.role === "director").length;
    return { total, active, disabled, directors };
  }, [rows]);

  const updateUser = useCallback(
    async (userId: string, patch: { role?: CompanyUserRow["role"]; status?: CompanyUserRow["status"] }) => {
      try {
        setSavingId(userId);
        setError("");

        const { error: rpcError } = await supabase.rpc("update_company_user_access", {
          p_user_id: userId,
          p_role: patch.role ?? null,
          p_status: patch.status ?? null,
        });

        if (rpcError) throw rpcError;

        setRows((prev) =>
          prev.map((row) =>
            row.id === userId
              ? {
                  ...row,
                  role: patch.role ?? row.role,
                  status: patch.status ?? row.status,
                }
              : row
          )
        );
      } catch (err: any) {
        console.error("updateUser error:", err);
        alert(err?.message || "Failed to update user.");
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const submitInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      try {
        setInviteLoading(true);
        setError("");

        const cleanEmail = inviteEmail.trim().toLowerCase();
        const cleanName = inviteName.trim();

        if (!cleanEmail) throw new Error("Email is required.");
        if (!inviteRole) throw new Error("Role is required.");

        const { data, error: fnError } = await supabase.functions.invoke("admin-invite-user", {
          body: {
            email: cleanEmail,
            full_name: cleanName || null,
            role: inviteRole,
          },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setInviteOpen(false);
        setInviteName("");
        setInviteEmail("");
        setInviteRole("estimator");

        await loadPage();
        alert(data?.message || "Invite sent successfully.");
      } catch (err: any) {
        console.error("invite error:", err);
        alert(err?.message || "Failed to send invite.");
      } finally {
        setInviteLoading(false);
      }
    },
    [inviteEmail, inviteName, inviteRole, loadPage]
  );

  const resendInvite = useCallback(
    async (invite: PendingInviteRow) => {
      try {
        setInviteActionId(invite.id);

        const { data, error: fnError } = await supabase.functions.invoke("admin-invite-user", {
          body: {
            email: invite.email,
            full_name: invite.full_name || null,
            role: invite.role,
          },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        await loadPage();
        alert(data?.message || "Invite resent successfully.");
      } catch (err: any) {
        console.error("resend invite error:", err);
        alert(err?.message || "Failed to resend invite.");
      } finally {
        setInviteActionId(null);
      }
    },
    [loadPage]
  );

  const cancelInvite = useCallback(async (inviteId: string) => {
    try {
      setInviteActionId(inviteId);

      const { error: rpcError } = await supabase.rpc("cancel_company_invite", {
        p_invitation_id: inviteId,
      });

      if (rpcError) throw rpcError;

      setPendingInvites((prev) => prev.filter((x) => x.id !== inviteId));
    } catch (err: any) {
      console.error("cancel invite error:", err);
      alert(err?.message || "Failed to cancel invite.");
    } finally {
      setInviteActionId(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Loading Company User Manager...</div>
        </div>
      </div>
    );
  }

  if (!isDirector) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-red-700">Access denied</h1>
          <p className="mt-2 text-sm text-red-600">
            Only directors can view and manage company users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Company User Manager</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage users and invites for your company only.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Invite User
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total Users</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Active</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.active}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Disabled</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.disabled}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">Directors</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.directors}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Company Users</h2>
          <p className="mt-1 text-sm text-slate-500">Active and disabled members in this company.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No users found for this company.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = savingId === row.id;
                  const isMe = me?.id === row.id;

                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">
                          {row.full_name?.trim() || "—"}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-700">{row.email || "—"}</td>

                      <td className="px-4 py-4">
                        <select
                          value={row.role}
                          disabled={busy}
                          onChange={(e) =>
                            updateUser(row.id, {
                              role: e.target.value as CompanyUserRow["role"],
                            })
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            row.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-right">

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\DashboardPage.tsx
==================================================

import React from "react";
import { useProjectContext } from "../context/ProjectContext";
import { theme } from "../lib/theme";

export default function DashboardPage() {
  const { currentProjectId, currentProject } = useProjectContext();

  if (!currentProjectId) {
  return (
    <div className={`p-6 text-sm ${theme.text.muted}`}>
      Please select a project from the top bar to view the Dashboard.
    </div>
  );
}

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-semibold ${theme.text.primary}`}>Dashboard</h1>
          <p className={`${theme.text.muted} mt-1`}>Projects summary, quick stats, recent activity.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={`px-3 py-2 rounded-xl ${theme.button.primary} text-sm`}>
            Primary Action
          </button>
          <button className={`px-3 py-2 rounded-xl ${theme.button.secondary} text-sm`}>
            Secondary
          </button>
        </div>
      </div>

      {currentProject && (
        <div className={`mt-4 text-sm ${theme.text.muted}`}>
          Project: <span className={`font-semibold ${theme.text.primary}`}>{currentProject.name}</span>
        </div>
      )}

      <div className={`mt-6 rounded-2xl border ${theme.border.base} ${theme.surface.muted} p-4`}>
        <p className={`text-sm ${theme.text.secondary}`}>
          Skeleton ready. Next we wire Supabase tables + live CRUD.
        </p>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\EstimatesPage.tsx
==================================================

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type EstimateHeader = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  version: number;
  created_at: string;
};

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<EstimateHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Load estimates on mount
  useEffect(() => {
    async function loadEstimates() {
      try {
        const { data, error } = await supabase
          .from("estimate_headers")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setEstimates(data || []);
      } catch (err) {
        console.error("Failed to load estimates:", err);
        setError("Failed to load estimates");
      } finally {
        setLoading(false);
      }
    }

    loadEstimates();
  }, []);

  async function handleNewEstimate() {
    try {
      // For now, use first project as temporary placeholder
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .limit(1);

      if (!projects || projects.length === 0) {
        setError("No projects available");
        return;
      }

      const { error } = await supabase
        .from("estimate_headers")
        .insert({
          project_id: projects[0].id,
          title: "Estimate",
          status: "draft",
          version: 1,
        });

      if (error) throw error;

      // Reload list after insert
      const { data: newData, error: newError } = await supabase
        .from("estimate_headers")
        .select("*")
        .order("created_at", { ascending: false });

      if (newError) throw newError;
      setEstimates(newData || []);
    } catch (err) {
      console.error("Failed to create estimate:", err);
      setError("Failed to create estimate");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Estimates</h1>
          <p className="text-slate-400 mt-1">Create, manage, and approve estimates.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button 
            onClick={handleNewEstimate}
            className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-sm"
          >
            New Estimate
          </button>
          <button className="px-3 py-2 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 text-sm">
            Secondary
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        {loading ? (
          <p className="text-sm text-slate-300">Loading estimates...</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : estimates.length === 0 ? (
          <p className="text-sm text-slate-300">No estimates yet</p>
        ) : (
          <div className="space-y-3">
            {estimates.map((estimate) => (
              <Link 
                key={estimate.id}
                to={`/estimates/${estimate.id}`}
                className="block"
              >
                <div 
                  className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 hover:border-slate-600 cursor-pointer transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-slate-200">
                        {estimate.title}
                      </h3>
                      <div className="mt-2 space-y-1 text-sm text-slate-400">
                        <div>Status: <span className="text-slate-300">{estimate.status}</span></div>
                        <div>Version: <span className="text-slate-300">{estimate.version}</span></div>
                        <div>Created: <span className="text-slate-300">{new Date(estimate.created_at).toLocaleDateString()}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\ExpensesPage.tsx
==================================================

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

  useEffect(() => {
    loadExpenses();
    loadProjectsAndCategories();
    loadUserInfo();
  }, []);

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
  console.log('OCR_FLOW_STEP_5 parent received:', {
    receiptId,
    ocrResult: result ? {
      hasData: !!(result.vendor || result.date || result.amount),
      vendor: result.vendor,
      date: result.date,
      amount: result.amount,
      tax: result.tax,
      receiptNumber: result.receiptNumber,
      confidence: result.confidence
    } : null
  });
  
  console.log('=== DEBUG: EXPENSES PAGE RECEIPT UPLOAD COMPLETE ===');
  console.log('ExpensesPage: Receipt upload complete callback received');
  console.log('ExpensesPage: Receipt ID:', receiptId);
  console.log('ExpensesPage: OCR result received:', result);
  
  setUploadedReceiptId(receiptId);
  setOcrResult(result);
  console.log('OCR_FLOW_STEP_3 ReceiptUpload state set:', {
    uploadedReceiptId: receiptId,
    ocrResult: result ? {
      hasData: !!(result.vendor || result.date || result.amount)
    } : null
  });

  if (result) {
    console.log('ExpensesPage: OCR result has data, showing preview');
    console.log('ExpensesPage: OCR result details for preview:');
    console.log('  - Vendor:', result.vendor);
    console.log('  - Date:', result.date);
    console.log('  - Amount:', result.amount);
    console.log('  - Tax:', result.tax);
    console.log('  - Receipt Number:', result.receiptNumber);
    console.log('  - Confidence:', result.confidence);
    console.log('  - Raw text length:', result.rawText?.length || 0);
    setShowOcrPreview(true);
  } else {
    console.log('ExpensesPage: No OCR result received');
  }
}

  function handleAcceptOCR() {
  console.log('=== DEBUG: EXPENSES PAGE ACCEPT OCR START ===');
  console.log('ExpensesPage: User accepted OCR results');
  
  if (!ocrResult) {
    console.log('ExpensesPage: No OCR result available, cannot accept');
    return;
  }

  // Prevent any field updates when OCR requires manual entry
  if (ocrResult.requiresManualEntry) {
    console.log('ExpensesPage: OCR requires manual entry - not auto-filling any fields');
    handleEditManually();
    return;
  }

  console.log('ExpensesPage: OCR result details:');
  console.log('  - Vendor:', ocrResult.vendor);
  console.log('  - Date:', ocrResult.date);
  console.log('  - Amount:', ocrResult.amount);
  console.log('  - Tax:', ocrResult.tax);
  console.log('  - Receipt Number:', ocrResult.receiptNumber);
  console.log('  - Confidence:', ocrResult.confidence);
  console.log('  - Requires Manual Entry:', ocrResult.requiresManualEntry);

  console.log('ExpensesPage: Current form data before update:', formData);

  const updatedFormData = {
    ...formData,
    vendor: ocrResult.vendor || formData.vendor,
    expense_date: ocrResult.date || formData.expense_date,
    amount: ocrResult.amount ? ocrResult.amount.toString() : formData.amount,
    description: formData.description || `Receipt from ${ocrResult.vendor || 'vendor'}`,
    notes: ocrResult.receiptNumber
      ? `Receipt #: ${ocrResult.receiptNumber}${formData.notes ? '\n' + formData.notes : ''}`
      : formData.notes,
  };

  console.log('ExpensesPage: Updated form data:', updatedFormData);
  setFormData(updatedFormData);

  setPendingOCRData(ocrResult);
  setShowOcrPreview(false);
  setShowAICategorizer(true);
  
  console.log('ExpensesPage: OCR preview closed, AI categorizer opened');
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

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\FieldOpsPage.tsx
==================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Camera, FileText, ChevronRight, Plus } from "lucide-react";
import { useProjectContext } from "../context/ProjectContext";
import { fetchDailyLogs, type DailyLog } from "../lib/dailyLogs";
import { fetchProjectPhotos } from "../lib/photos";
import { fetchProjectActivity, type ProjectActivity } from "../lib/activity";
import MobileDailyLogForm from "../components/MobileDailyLogForm";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";
import AIAssistantPanel from "../components/AIAssistantPanel";

export default function FieldOpsPage() {
  const navigate = useNavigate();
  const { currentProject } = useProjectContext();

  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<any[]>([]);
  const [todayActivity, setTodayActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLogModal, setShowLogModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (currentProject) {
      loadData();
    }
  }, [currentProject]);

  async function loadData() {
    if (!currentProject) return;

    setLoading(true);

    await Promise.all([
      loadRecentLogs(),
      loadRecentPhotos(),
      loadTodayActivity(),
    ]);

    setLoading(false);
  }

  async function loadRecentLogs() {
    if (!currentProject) return;

    const result = await fetchDailyLogs(currentProject.id);
    if (result.success && result.data) {
      setRecentLogs(result.data.slice(0, 5));
    }
  }

  async function loadRecentPhotos() {
    if (!currentProject) return;

    const result = await fetchProjectPhotos(currentProject.id);
    if (result.success && result.data) {
      setRecentPhotos(result.data.slice(0, 6));
    }
  }

  async function loadTodayActivity() {
    if (!currentProject) return;

    const result = await fetchProjectActivity(currentProject.id, 10);
    if (result.success && result.data) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todaysActivities = result.data.filter(activity => {
        const activityDate = new Date(activity.created_at);
        return activityDate >= todayStart;
      });

      setTodayActivity(todaysActivities);
    }
  }

  function handleLogSuccess() {
    setShowLogModal(false);
    loadData();
  }

  function handlePhotoSuccess() {
    setShowPhotoModal(false);
    loadData();
  }

  function getWeatherEmoji(weather: string) {
    const weatherMap: Record<string, string> = {
      sunny: "☀️",
      cloudy: "☁️",
      rainy: "🌧️",
      windy: "💨",
      snowy: "❄️",
    };
    return weatherMap[weather.toLowerCase()] || "🌤️";
  }

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-slate-400 mb-4">No project selected</div>
          <button
            onClick={() => navigate("/projects")}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
          >
            Select Project
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="p-6 text-sm text-slate-400">Loading field operations...</div>
      </div>
    );
  }

  const todayLog = recentLogs.find(log => log.log_date === today);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/50 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-lg font-semibold text-slate-200">Field Operations</h1>
          <p className="text-sm text-slate-400 mt-0.5">{currentProject.name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowLogModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg group"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div className="text-white font-medium text-base">Daily Log</div>
              <div className="text-blue-100 text-xs">
                {todayLog ? "Update Today" : "Create New"}
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowPhotoModal(true)}
            className="p-5 rounded-xl bg-gradient-to-br from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 transition-all shadow-lg group"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div className="text-white font-medium text-base">Add Photos</div>
              <div className="text-green-100 text-xs">Capture Site</div>
            </div>
          </button>
        </div>

        {todayActivity.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Today's Activity</h2>
              <div className="text-xs text-slate-500">{todayActivity.length} updates</div>
            </div>
            <div className="space-y-2">
              {todayActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-950/40">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-300">{activity.message}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(activity.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {todayLog && (
          <div className="rounded-xl border border-blue-800 bg-blue-950/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-semibold text-slate-200">Today's Log</h2>
              </div>
              <button
                onClick={() => setShowLogModal(true)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium"
              >
                Edit
              </button>
            </div>
            <div className="space-y-2">
              {todayLog.weather && (
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getWeatherEmoji(todayLog.weather)}</span>
                  <span className="text-sm text-slate-400 capitalize">{todayLog.weather}</span>
                </div>
              )}
              {todayLog.workers_count > 0 && (
                <div className="text-sm text-slate-400">
                  <span className="font-medium text-slate-300">{todayLog.workers_count}</span> workers on site
                </div>
              )}
              {todayLog.work_performed && (
                <div className="text-sm text-slate-300 line-clamp-2">
                  {todayLog.work_performed}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">Recent Logs</h2>
            <button
              onClick={() => navigate("/project-dashboard")}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
            >
              View All
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No daily logs yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg bg-slate-950/40 hover:bg-slate-900/60 transition cursor-pointer"
                  onClick={() => setShowLogModal(true)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-lg font-semibold text-slate-200">
                          {new Date(log.log_date).getDate()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(log.log_date).toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {log.weather && (
                            <span className="text-sm">{getWeatherEmoji(log.weather)}</span>
                          )}
                          {log.workers_count > 0 && (
                            <span className="text-xs text-slate-400">
                              {log.workers_count} workers
                            </span>
                          )}
                        </div>
                        {log.work_performed && (
                          <div className="text-sm text-slate-300 line-clamp-1 mt-1">
                            {log.work_performed}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {recentPhotos.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-200">Recent Photos</h2>
              <button
                onClick={() => navigate("/project-dashboard")}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
              >
                View All
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {recentPhotos.map((photo) => (
                <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-slate-950">
                  <img
                    src={photo.publicUrl}
                    alt={photo.caption || "Project photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BaseModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        title="Daily Log"
      >
        <MobileDailyLogForm
          projectId={currentProject.id}
          onSuccess={handleLogSuccess}
          onCancel={() => setShowLogModal(false)}
          prefillDate={todayLog?.log_date}
        />
      </BaseModal>

      <BaseModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        title="Add Photos"
      >
        <MobilePhotoCapture
          projectId={currentProject.id}
          onSuccess={handlePhotoSuccess}
          onCancel={() => setShowPhotoModal(false)}
        />
      </BaseModal>

      {currentProject && (
        <AIAssistantPanel
          context="daily_log"
          currentData={{
            hasLogToday: !!todayLog,
            consecutiveDaysWithoutLog: recentLogs.length === 0 ? 7 : 0,
            weatherConditions: todayLog?.weather === "rainy" || todayLog?.weather === "stormy" ? "poor" : "good",
            hasDelays: todayLog?.issues ? true : false,
          }}
          projectId={currentProject.id}
          onAction={(action, data) => {
            if (action === "Create Daily Log") {
              setShowLogModal(true);
            } else if (action === "View Today's Log") {
              setShowLogModal(true);
            } else if (action === "Add Photos") {
              setShowPhotoModal(true);
            }
          }}
        />
      )}
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\FieldPaymentsPage.tsx
==================================================

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  HandCoins, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Smartphone,
  User,
  Users,
  Calendar,
  DollarSign,
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Share2,
  Camera,
  PenTool,
  X
} from "lucide-react";
import { 
  fetchFieldPayments, 
  fetchFieldPaymentSummary,
  createFieldPayment,
  type FieldPayment, 
  type FieldPaymentStatus,
  type PaymentMethod,
  type FieldPaymentFilters 
} from "../lib/fieldPayments";
import { useProjectContext } from "../context/ProjectContext";
import SignaturePad from "../components/SignaturePad";
import UniversalImageCapture, { type ImageCaptureMode } from "../components/UniversalImageCapture";
import { BaseModal } from "../components/common/BaseModal";
import { IDOCRReview } from "../components/IDOCRReview";
import { downloadFieldPaymentReceipt, shareViaWhatsApp } from "../lib/fieldPaymentReceipt";
import { uploadFieldPaymentImage, uploadFieldPaymentPDF } from "../lib/fieldPayments";
import { performIDOCR, type IDOCRResult } from "../lib/idOCR";

export default function FieldPaymentsPage() {
  const navigate = useNavigate();
  const { currentProject, projects } = useProjectContext();

  // State
  const [payments, setPayments] = useState<FieldPayment[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showIDScanModal, setShowIDScanModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<FieldPayment | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [submitAttempts, setSubmitAttempts] = useState(0);
  
  // ID OCR state
  const [idOCRResult, setIdOCRResult] = useState<IDOCRResult | null>(null);
  const [showIDOCRReview, setShowIDOCRReview] = useState(false);
  const [idScanFile, setIdScanFile] = useState<File | null>(null);
  
  // Field user speed improvements
  const [workers, setWorkers] = useState<any[]>([]);
  const [quickAmounts, setQuickAmounts] = useState<string[]>(["50", "100", "150", "200", "250", "300"]);
  const [showQuickAmount, setShowQuickAmount] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState<FieldPaymentFilters>({
    status: "all",
    payment_method: "all",
    work_date_from: "",
    work_date_to: "",
    worker_name: "",
    project_id: "",
  });

  // Form data for new payment
  const [formData, setFormData] = useState({
    worker_name: "",
    worker_nickname: "",
    worker_id_number: "",
    worker_phone: "",
    worker_address: "",
    work_type: "",
    work_date: new Date().toISOString().split("T")[0],
    hours_worked: "",
    days_worked: "",
    rate_per_hour: "",
    rate_per_day: "",
    total_amount: "",
    payment_method: "cash" as PaymentMethod,
    payment_notes: "",
    location: "",
    weather_conditions: "",
    notes: "",
    project_id: "",
  });

  // Load existing workers for quick select
  useEffect(() => {
    if (companyId) {
      loadWorkersForQuickSelect();
    }
  }, [companyId]);

  // Handle worker name change for auto-suggestions
  function handleWorkerNameChange(value: string) {
    const search = value.toLowerCase();
    const filtered = workers.filter(w => 
      w.first_name.toLowerCase().includes(search) ||
      w.last_name.toLowerCase().includes(search) ||
      w.phone?.includes(search)
    );
    
    // Auto-select if there's only a few matches (1-3)
    if (filtered.length > 0 && filtered.length <= 3) {
      selectWorker(filtered[0]);
    }
  }

  // Select worker from suggestions
  function selectWorker(worker: any) {
    setFormData(prev => ({
      ...prev,
      worker_name: `${worker.first_name} ${worker.last_name}`,
      worker_phone: worker.phone || '',
      worker_nickname: worker.nickname || '',
      // Auto-calculate rate based on recent work history
      rate_per_hour: worker.pay_rate ? worker.pay_rate.toString() : '',
      total_amount: worker.pay_rate ? (worker.pay_rate * 8).toString() : '',
    }));
    
    setFormErrors(prev => ({ ...prev, worker_name: '', worker_phone: '', worker_nickname: '' }));
  }

  // Handle quick amount selection
  function handleQuickAmountSelect(amount: string) {
    const rate = parseFloat(formData.rate_per_hour) || 0;
    const hours = rate > 0 ? parseFloat(amount) / rate : 0;
    
    setFormData(prev => ({
      ...prev,
      total_amount: amount,
      hours_worked: hours > 0 ? hours.toString() : '',
    }));
  }

  async function loadWorkersForQuickSelect() {
    try {
      const { fetchWorkers } = await import("../lib/workers");
      const workersData = await fetchWorkers(companyId);
      
      // Get recent workers from field payments for better suggestions
      const { fetchFieldPayments } = await import("../lib/fieldPayments");
      const paymentsData = await fetchFieldPayments(companyId, filters);
      
      // Create a map of recent workers by phone for quick lookup
      const recentWorkersMap = new Map();
      paymentsData.forEach(payment => {
        if (payment.worker_phone && !recentWorkersMap.has(payment.worker_phone)) {
          recentWorkersMap.set(payment.worker_phone, {
            name: payment.worker_name,
            phone: payment.worker_phone,
            work_type: payment.work_type,
            last_amount: payment.total_amount,
            last_date: payment.work_date,
          });
        }
      });
      
      // Combine existing workers with recent workers
      const combinedWorkers = [...workersData];
      recentWorkersMap.forEach((recentWorker, phone) => {
        if (!workersData.some(w => w.phone === phone)) {
          combinedWorkers.push({
            id: `recent_${phone}`,
            company_id: companyId,
            first_name: recentWorker.name.split(' ')[0] || '',
            last_name: recentWorker.name.split(' ').slice(1).join(' ') || '',
            phone: recentWorker.phone,
            worker_type: 'employee',
            status: 'active',
            pay_rate: recentWorker.last_amount ? recentWorker.last_amount / 8 : null,
            created_at: recentWorker.last_date,
          });
        }
      });
      
      setWorkers(combinedWorkers);
    } catch (error) {
      console.error("Error loading workers for quick select:", error);
    }
  }

  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Photo state
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [workerPhoto, setWorkerPhoto] = useState<File | null>(null);
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<"worker" | "supervisor">("worker");
  const [photoType, setPhotoType] = useState<"id" | "worker">("id");

  useEffect(() => {
    loadUserInfo();
  }, []);

  useEffect(() => {
    if (companyId) {
      loadPayments();
      loadSummary();
    }
  }, [companyId, filters]);

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

  
  async function loadPayments() {
    try {
      setLoading(true);
      const data = await fetchFieldPayments(companyId, filters);
      setPayments(data);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const data = await fetchFieldPaymentSummary(companyId, {
        work_date_from: filters.work_date_from,
        work_date_to: filters.work_date_to,
        project_id: filters.project_id,
      });
      setSummary(data);
    } catch (error) {
      console.error("Error loading summary:", error);
    }
  }

  function handleCreatePayment() {
    // Reset form errors
    setFormErrors({});
    setError(null);
    setSuccess(null);
    
    setFormData({
      worker_name: "",
      worker_nickname: "",
      worker_id_number: "",
      worker_phone: "",
      worker_address: "",
      work_type: "",
      work_date: new Date().toISOString().split("T")[0],
      hours_worked: "",
      days_worked: "",
      rate_per_hour: "",
      rate_per_day: "",
      total_amount: "",
      payment_method: "cash",
      payment_notes: "",
      location: "",
      weather_conditions: "",
      notes: "",
      project_id: currentProject?.id || "",
    });
    setIdPhoto(null);
    setWorkerPhoto(null);
    setIdPhotoPreview(null);
    setWorkerPhotoPreview(null);
    setShowCreateModal(true);
  }

  // Validate form data
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!formData.worker_name.trim()) {
      errors.worker_name = "Worker name is required";
    }

    if (!formData.work_type.trim()) {
      errors.work_type = "Work type is required";
    }

    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      errors.total_amount = "Amount must be greater than 0";
    }

    if (formData.worker_phone && !/^\d{10,15}$/.test(formData.worker_phone.replace(/[^\d]/g, ''))) {
      errors.worker_phone = "Invalid phone number";
    }

    if (formData.hours_worked && parseFloat(formData.hours_worked) < 0) {
      errors.hours_worked = "Hours cannot be negative";
    }

    if (formData.days_worked && parseFloat(formData.days_worked) < 0) {
      errors.days_worked = "Days cannot be negative";
    }

    if (formData.rate_per_hour && parseFloat(formData.rate_per_hour) < 0) {
      errors.rate_per_hour = "Rate cannot be negative";
    }

    if (formData.rate_per_day && parseFloat(formData.rate_per_day) < 0) {
      errors.rate_per_day = "Rate cannot be negative";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSavePayment() {
    // Prevent duplicate submissions
    if (saving) {
      console.log("Submission already in progress");
      return;
    }

    // Validate form
    if (!validateForm()) {
      setSubmitAttempts(prev => prev + 1);
      setError("Please fix the errors below");
      return;
    }

    // Validate company and user
    if (!companyId) {
      setError("Company information not available");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const paymentData = {
        ...formData,
        total_amount: parseFloat(formData.total_amount),
        hours_worked: formData.hours_worked ? parseFloat(formData.hours_worked) : undefined,
        days_worked: formData.days_worked ? parseFloat(formData.days_worked) : undefined,
        rate_per_hour: formData.rate_per_hour ? parseFloat(formData.rate_per_hour) : undefined,
        rate_per_day: formData.rate_per_day ? parseFloat(formData.rate_per_day) : undefined,
        project_id: formData.project_id || undefined,
        supervisor_name: userId ? "Current User" : undefined,
      };

      const newPayment = await createFieldPayment(paymentData, companyId, userId);
      
      if (!newPayment || !newPayment.id) {
        throw new Error("Failed to create payment record");
      }

      // Upload photos if provided - with error handling
      const uploadPromises = [];
      
      if (idPhoto) {
        uploadPromises.push(
          (async () => {
            try {
              const { url } = await uploadFieldPaymentImage(idPhoto, companyId, newPayment.id, "id_photo");
              const { updateFieldPayment } = await import("../lib/fieldPayments");
              return updateFieldPayment(newPayment.id, { id_photo_url: url });
            } catch (uploadError) {
              console.error("ID photo upload failed:", uploadError);
              // Continue without photo - don't fail the entire payment
              return null;
            }

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\pages\FinanceDashboardPage.recovery.tsx
==================================================

import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  CreditCard,
  Landmark,
  Plus,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Eye,
  CheckCircle,
  Clock,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import { useFinanceAccess } from "../hooks/useFinanceAccess";
import { FinanceAccessDenied } from "../components/FinanceAccessDenied";
import { fetchBankTransactions } from "../services/finance/bankParser";
import { fetchCreditCardTransactions } from "../services/finance/creditCard";
import { fetchBankAccounts } from "../lib/finance";
import type { BankTransaction } from "../services/finance/bankParser";
import type { CreditCardTransaction } from "../services/finance/creditCard";
import type { BankAccount } from "../lib/finance";

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FinanceDashboardPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const { currentProjectId, currentProject } = useProjectContext();
  const financeAccess = useFinanceAccess();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [creditCardTransactions, setCreditCardTransactions] = useState<CreditCardTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const projectId = currentProjectId || routeProjectId;

  // Load data
  useEffect(() => {
    async function loadDashboardData() {
      if (!projectId || !financeAccess.canAccessProjectFinance) return;

      try {
        setLoading(true);
        setError(null);

        // Get company ID from project
        const { data: project } = await supabase
          .from("projects")
          .select("company_id")
          .eq("id", projectId)
          .single();

        if (!project?.company_id) {
          throw new Error("Project not found or no company associated");
        }

        setCompanyId(project.company_id);

        // Load all data in parallel
        const [bankAccountsData, bankTxnsData, creditTxnsData] = await Promise.all([
          fetchBankAccounts(project.company_id),
          fetchBankTransactions(project.company_id),
          fetchCreditCardTransactions(project.company_id),
        ]);

        setBankAccounts(bankAccountsData);
        setBankTransactions(bankTxnsData);
        setCreditCardTransactions(creditTxnsData);

      } catch (err) {
        console.error("Error loading dashboard data:", err);
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [projectId, financeAccess.canAccessProjectFinance]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    if (!bankTransactions.length && !creditCardTransactions.length) {
      return {
        companyCash: 0,
        projectCommitted: 0,
        projectActual: 0,
        safeOwnerDraw: 0,
        outstandingCreditLiability: 0,
        unmatchedCount: 0,
      };
    }

    // Company cash - sum of all bank account balances
    const companyCash = bankAccounts.reduce((sum, account) => sum + (account.current_balance || 0), 0);

    // Project committed - sum of unmatched bank and credit transactions (negative amounts are expenses)
    const projectCommitted = [
      ...bankTransactions.filter(t => !t.gl_transaction_id),
      ...creditCardTransactions.filter(t => !t.gl_transaction_id)
    ].reduce((sum, txn) => sum + (txn.amount < 0 ? Math.abs(txn.amount) : 0), 0);

    // Project actual - sum of posted transactions (negative amounts are expenses)
    const projectActual = [
      ...bankTransactions.filter(t => t.gl_transaction_id),
      ...creditCardTransactions.filter(t => t.gl_transaction_id)
    ].reduce((sum, txn) => sum + (txn.amount < 0 ? Math.abs(txn.amount) : 0), 0);

    // Safe owner draw - company cash minus committed expenses
    const safeOwnerDraw = Math.max(0, companyCash - projectCommitted);

    // Outstanding credit liability - sum of credit card balances (positive amounts are charges)
    const outstandingCreditLiability = creditCardTransactions
      .filter(t => t.amount > 0 && !t.gl_transaction_id)
      .reduce((sum, txn) => sum + txn.amount, 0);

    // Unmatched transactions count
    const unmatchedCount = [
      ...bankTransactions,
      ...creditCardTransactions
    ].filter(t => t.match_status === 'unmatched').length;

    return {
      companyCash,
      projectCommitted,
      projectActual,
      safeOwnerDraw,
      outstandingCreditLiability,
      unmatchedCount,
    };
  }, [bankTransactions, creditCardTransactions, bankAccounts]);

  // Recent transactions
  const recentBankTransactions = useMemo(() => 
    bankTransactions
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5),
  [bankTransactions]);

  const recentCreditTransactions = useMemo(() =>
    creditCardTransactions
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime())
      .slice(0, 5),
  [creditCardTransactions]);

  // Finance alerts
  const financeAlerts = useMemo(() => {
    const alerts = [];
    
    // Low cash alert
    if (summaryMetrics.companyCash < 5000) {
      alerts.push({
        type: "warning",
        title: "Low Cash Balance",
        message: `Company cash balance is ${formatCurrency(summaryMetrics.companyCash)}`,
        icon: AlertTriangle,
      });
    }

    // High credit liability alert
    if (summaryMetrics.outstandingCreditLiability > 10000) {
      alerts.push({
        type: "warning",
        title: "High Credit Card Liability",
        message: `Outstanding credit balance is ${formatCurrency(summaryMetrics.outstandingCreditLiability)}`,
        icon: CreditCard,
      });
    }

    // Many unmatched transactions alert
    if (summaryMetrics.unmatchedCount > 10) {
      alerts.push({
        type: "info",
        title: "Transactions Need Review",
        message: `${summaryMetrics.unmatchedCount} transactions need classification and matching`,
        icon: Clock,
      });
    }

    return alerts;
  }, [summaryMetrics]);

  // Automation queue
  const automationQueue = useMemo(() => {
    const allTransactions = [...bankTransactions, ...creditCardTransactions];
    
    const needsReview = allTransactions.filter(t => 
      t.match_status === 'unmatched' || (t.confidence_score ?? 0) < 0.7
    ).length;

    const highConfidence = allTransactions.filter(t => 
      !t.gl_transaction_id && (t.confidence_score ?? 0) >= 0.7
    ).length;

    return { needsReview, highConfidence };
  }, [bankTransactions, creditCardTransactions]);

  if (!financeAccess.canAccessProjectFinance) {
    return <FinanceAccessDenied />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="mb-4 text-2xl text-slate-400">Loading Finance Dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="flex items-center justify-center p-8">
          <div className="rounded-xl border border-rose-800/60 bg-rose-900/20 p-6">
            <div className="text-rose-300">Error: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Finance Dashboard</h1>
              <p className="text-slate-400">
                {currentProject?.name || "Project"} Financial Overview
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/projects/${projectId}/finance/transactions`)}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
              >
                <Eye className="h-4 w-4" />
                View Transactions
              </button>
              <button
                onClick={() => navigate(`/projects/${projectId}/finance`)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Finance Hub
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Company Cash</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.companyCash)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-900/20 p-3">
                <DollarSign className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Project Committed</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.projectCommitted)}
                </p>
              </div>
              <div className="rounded-lg bg-amber-900/20 p-3">
                <TrendingUp className="h-6 w-6 text-amber-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Project Actual</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.projectActual)}
                </p>
              </div>
              <div className="rounded-lg bg-sky-900/20 p-3">
                <TrendingDown className="h-6 w-6 text-sky-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Safe Owner Draw</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.safeOwnerDraw)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-900/20 p-3">
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Credit Liability</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(summaryMetrics.outstandingCreditLiability)}
                </p>
              </div>
              <div className="rounded-lg bg-rose-900/20 p-3">
                <CreditCard className="h-6 w-6 text-rose-400" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Unmatched</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {summaryMetrics.unmatchedCount}
                </p>
              </div>
              <div className="rounded-lg bg-violet-900/20 p-3">
                <Clock className="h-6 w-6 text-violet-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Bank Transactions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30">
            <div className="border-b border-slate-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-sky-400" />
                  <h2 className="text-lg font-semibold text-white">Recent Bank Transactions</h2>
                </div>
                <button
                  onClick={() => navigate(`/projects/${projectId}/finance/transactions?tab=bank`)}
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  View All
                </button>
              </div>
            </div>
            <div className="p-6">
              {recentBankTransactions.length > 0 ? (
                <div className="space-y-3">
                  {recentBankTransactions.map((transaction) => (
                    <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/30 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {transaction.description}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDateTime(transaction.transaction_date)}
                        </p>
                      </div>
                      <div className={`text-sm font-semibold ${
                        transaction.amount >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {transaction.amount >= 0 ? "+" : ""}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\AIAssistantPanel.tsx
==================================================

import React, { useState, useEffect } from "react";
import { Sparkles, X, ChevronRight, CircleAlert as AlertCircle, Lightbulb, TriangleAlert as AlertTriangle, TrendingUp } from "lucide-react";
import { generateSuggestions, type AISuggestion, type AIContext, type AIPromptData } from "../lib/aiAssistant";
import { Button } from "./common/Button";
import { theme } from "../lib/theme";

interface AIAssistantPanelProps {
  context: AIContext;
  currentData?: any;
  projectId?: string;
  onAction?: (action: string, data: any) => void;
}

export default function AIAssistantPanel({
  context,
  currentData,
  projectId,
  onAction,
}: AIAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen, context, currentData]);

  async function loadSuggestions() {
    setLoading(true);

    const promptData: AIPromptData = {
      context,
      currentData,
      projectId,
    };

    const result = await generateSuggestions(promptData);
    setSuggestions(result);

    setLoading(false);
  }

  function getIcon(type: string) {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-4 h-4" />;
      case "recommendation":
        return <Lightbulb className="w-4 h-4" />;
      case "insight":
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  }

  function getColorClasses(type: string, priority: string) {
    if (type === "warning") {
      return {
        border: theme.status.warning.border,
        bg: theme.status.warning.bg,
        icon: theme.status.warning.text,
        iconBg: "bg-yellow-500/20 dark:bg-yellow-500/20",
      };
    }

    if (priority === "high") {
      return {
        border: theme.status.info.border,
        bg: theme.status.info.bg,
        icon: theme.status.info.text,
        iconBg: "bg-blue-500/20 dark:bg-blue-500/20",
      };
    }

    return {
      border: theme.border.base,
      bg: theme.surface.muted,
      icon: theme.text.muted,
      iconBg: "bg-slate-500/20 dark:bg-slate-500/20",
    };
  }

  const highPrioritySuggestions = suggestions.filter((s) => s.priority === "high");

  if (!isOpen && highPrioritySuggestions.length > 0) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 group"
      >
        <Sparkles className="w-6 h-6 text-white" />
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
          {highPrioritySuggestions.length}
        </div>
      </button>
    );
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50"
      >
        <Sparkles className="w-6 h-6 text-white" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 max-h-[600px] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-200">AI Assistant</div>
            <div className="text-xs text-slate-500 capitalize">{context} context</div>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center transition"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Analyzing context...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-green-400" />
            </div>
            <div className="text-sm font-medium text-slate-300">All Set!</div>
            <div className="text-xs text-slate-500 mt-1">
              No suggestions at this time
            </div>
          </div>
        ) : (
          suggestions.map((suggestion) => {
            const colors = getColorClasses(suggestion.type, suggestion.priority);
            return (
              <div
                key={suggestion.id}
                className={`rounded-xl border ${colors.border} ${colors.bg} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <div className={colors.icon}>
                      {getIcon(suggestion.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 mb-1">
                      {suggestion.title}
                    </div>
                    <div className="text-xs text-slate-400 mb-3">
                      {suggestion.description}
                    </div>
                    {suggestion.action && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (onAction) {
                            onAction(suggestion.action!.label, suggestion.action!.data);
                          }
                        }}
                        className="w-full"
                      >
                        {suggestion.action.label}
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="text-xs text-slate-500 text-center">
          Suggestions based on current {context} context
        </div>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\AIDailyLogEnhancer.tsx
==================================================

import React, { useState } from "react";
import { Sparkles, X, Check, CreditCard as Edit3, Loader as Loader2 } from "lucide-react";
import { enhanceDailyLog, type DailyLogEnhancement } from "../lib/aiEnhancer";

interface AIDailyLogEnhancerProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (enhancement: DailyLogEnhancement["suggestions"]) => void;
  initialNotes: string;
}

export function AIDailyLogEnhancer({ isOpen, onClose, onAccept, initialNotes }: AIDailyLogEnhancerProps) {
  const [processing, setProcessing] = useState(false);
  const [enhancement, setEnhancement] = useState<DailyLogEnhancement | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedSuggestions, setEditedSuggestions] = useState<DailyLogEnhancement["suggestions"]>({});

  React.useEffect(() => {
    if (isOpen && initialNotes && !enhancement) {
      processNotes();
    }
  }, [isOpen, initialNotes]);

  async function processNotes() {
    if (!initialNotes.trim()) return;

    setProcessing(true);
    try {
      const result = await enhanceDailyLog(initialNotes);
      setEnhancement(result);
      setEditedSuggestions(result.suggestions);
    } catch (error) {
      console.error("Error enhancing log:", error);
    } finally {
      setProcessing(false);
    }
  }

  function handleAccept() {
    if (enhancement) {
      onAccept(editMode ? editedSuggestions : enhancement.suggestions);
      onClose();
    }
  }

  function handleEdit(field: keyof DailyLogEnhancement["suggestions"], value: string) {
    setEditedSuggestions((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">AI Daily Log Enhancer</h3>
              <p className="text-sm text-slate-400">Professional summary from your notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
              <p className="text-sm text-slate-400">Analyzing your notes...</p>
            </div>
          ) : enhancement ? (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">Original Notes</h4>
                  <span className="text-xs text-slate-500">{enhancement.originalText.length} characters</span>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{enhancement.originalText}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">AI Enhanced Version</h4>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        enhancement.confidence > 0.7
                          ? "bg-green-500/20 text-green-400"
                          : enhancement.confidence > 0.5
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {Math.round(enhancement.confidence * 100)}% confidence
                    </span>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        editMode
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                      }`}
                    >
                      <Edit3 className="w-3 h-3" />
                      {editMode ? "Editing" : "Edit"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {enhancement.suggestions.workPerformed && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Work Performed
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.workPerformed || ""}
                          onChange={(e) => handleEdit("workPerformed", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={3}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.workPerformed}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.deliveries && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">Deliveries</label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.deliveries || ""}
                          onChange={(e) => handleEdit("deliveries", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.deliveries}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.issues && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Issues & Delays
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.issues || ""}
                          onChange={(e) => handleEdit("issues", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.issues}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {enhancement.suggestions.notes && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Additional Notes
                      </label>
                      {editMode ? (
                        <textarea
                          value={editedSuggestions.notes || ""}
                          onChange={(e) => handleEdit("notes", e.target.value)}
                          className="w-full bg-slate-800 rounded-lg p-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          rows={2}
                        />
                      ) : (
                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                          <p className="text-sm text-slate-300">{enhancement.suggestions.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-slate-400">No notes to enhance</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 p-6 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              AI will organize your notes. You can edit before accepting.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Ignore
              </button>
              <button
                onClick={handleAccept}
                disabled={!enhancement || processing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Accept & Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\AIReceiptCategorizer.tsx
==================================================

import React, { useState, useEffect } from "react";
import { Sparkles, X, Check, TrendingUp, Tag, Building2, FileText, Loader as Loader2 } from "lucide-react";
import { categorizeReceipt, getExpenseCategories, type ReceiptCategorization } from "../lib/aiEnhancer";

interface AIReceiptCategorizerProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (categorization: {
    category: string;
    description: string;
    vendorType?: string;
  }) => void;
  vendor: string;
  amount: number;
  ocrText?: string;
}

export function AIReceiptCategorizer({
  isOpen,
  onClose,
  onAccept,
  vendor,
  amount,
  ocrText,
}: AIReceiptCategorizerProps) {
  const [processing, setProcessing] = useState(false);
  const [categorization, setCategorization] = useState<ReceiptCategorization | null>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedDescription, setSelectedDescription] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      processReceipt();
    }
  }, [isOpen, vendor, amount, ocrText]);

  async function loadCategories() {
    const categories = await getExpenseCategories();
    setAvailableCategories(categories);
  }

  async function processReceipt() {
    if (!vendor) return;

    setProcessing(true);
    try {
      const result = await categorizeReceipt(vendor, amount, ocrText);
      setCategorization(result);
      setSelectedCategory(result.suggestedCategory || "");
      setSelectedDescription(result.suggestedDescription);
    } catch (error) {
      console.error("Error categorizing receipt:", error);
    } finally {
      setProcessing(false);
    }
  }

  function handleAccept() {
    if (categorization && selectedCategory) {
      onAccept({
        category: selectedCategory,
        description: selectedDescription,
        vendorType: categorization.suggestedVendorType || undefined,
      });
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-200">AI Receipt Categorizer</h3>
              <p className="text-sm text-slate-400">Smart expense classification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-slate-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {processing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
              <p className="text-sm text-slate-400">Analyzing receipt...</p>
            </div>
          ) : categorization ? (
            <>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  Receipt Details
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Vendor</p>
                    <p className="text-sm text-slate-200 font-medium">{vendor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Amount</p>
                    <p className="text-sm text-slate-200 font-medium">
                      ${(() => {
                        const amountNumber = 
                          typeof amount === "number"
                            ? amount
                            : Number(String(amount).replace(/[^0-9.-]/g, ""));
                        return Number.isFinite(amountNumber) ? amountNumber.toFixed(2) : "Not detected";
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-slate-300">AI Suggestions</h4>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      categorization.confidence > 0.7
                        ? "bg-green-500/20 text-green-400"
                        : categorization.confidence > 0.5
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {Math.round(categorization.confidence * 100)}% confidence
                  </span>
                </div>

                {categorization.suggestedVendorType && (
                  <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
                    <div className="flex items-start gap-3">
                      <Building2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-300">Vendor Type Detected</p>
                        <p className="text-sm text-slate-300 mt-1">{categorization.suggestedVendorType}</p>
                        <p className="text-xs text-slate-500 mt-2">{categorization.reasoning}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <Tag className="w-3 h-3" />
                    Suggested Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Select category...</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                        {cat === categorization.suggestedCategory ? " (AI Suggested)" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedCategory === categorization.suggestedCategory && (
                    <p className="text-xs text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      AI recommendation selected
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    Description
                  </label>
                  <textarea
                    value={selectedDescription}
                    onChange={(e) => setSelectedDescription(e.target.value)}
                    placeholder="Enter expense description..."
                    className="w-full bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-slate-500">You can edit the AI-generated description</p>
                </div>

                {ocrText && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      OCR Extracted Text
                    </label>
                    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 max-h-32 overflow-y-auto">
                      <p className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{ocrText}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-slate-400">No receipt to categorize</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-700 p-6 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Review and edit AI suggestions before applying.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                disabled={!categorization || !selectedCategory || processing}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Apply Categorization
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\BOQSuggestionCard.tsx
==================================================

import React from "react";
import { Plus, Sparkles, Package, Layers } from "lucide-react";
import type { BOQSuggestion } from "../lib/boqSuggestions";

interface BOQSuggestionCardProps {
  suggestion: BOQSuggestion;
  onAdd: (suggestion: BOQSuggestion) => void;
  onIgnore: (suggestionId: string) => void;
  isAdding?: boolean;
}

export function BOQSuggestionCard({ suggestion, onAdd, onIgnore, isAdding }: BOQSuggestionCardProps) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            suggestion.isAssembly
              ? "bg-purple-500/20 text-purple-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {suggestion.isAssembly ? <Layers className="w-5 h-5" /> : <Package className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-slate-200 truncate">
                {suggestion.description}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {suggestion.item_code} • {suggestion.unit}
                {suggestion.category && ` • ${suggestion.category}`}
              </p>
            </div>

            <span
              className={`text-xs px-2 py-1 rounded flex-shrink-0 ${
                suggestion.confidence > 0.7
                  ? "bg-green-500/20 text-green-400"
                  : suggestion.confidence > 0.5
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-slate-700 text-slate-400"
              }`}
            >
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>

          <div className="flex items-start gap-2 mb-3">
            <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 flex-1">{suggestion.reason}</p>
          </div>

          {suggestion.relatedTo && suggestion.relatedTo.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {suggestion.relatedTo.map((related) => (
                <span
                  key={related}
                  className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30"
                >
                  Related to: {related}
                </span>
              ))}
            </div>
          )}

          {suggestion.isAssembly && suggestion.assemblyItems && suggestion.assemblyItems.length > 0 && (
            <div className="mb-3 bg-slate-900/50 rounded p-2 border border-slate-700">
              <p className="text-xs text-slate-400 mb-1">
                Assembly includes {suggestion.assemblyItems.length} items:
              </p>
              <div className="space-y-1">
                {suggestion.assemblyItems.slice(0, 3).map((item, idx) => (
                  <p key={idx} className="text-xs text-slate-500">
                    • {item.description} ({item.quantity} {item.unit})
                  </p>
                ))}
                {suggestion.assemblyItems.length > 3 && (
                  <p className="text-xs text-slate-500">
                    + {suggestion.assemblyItems.length - 3} more items
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onAdd(suggestion)}
              disabled={isAdding}
              className="flex-1 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-medium hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {isAdding ? "Adding..." : suggestion.isAssembly ? "Add Assembly" : "Add to BOQ"}
            </button>
            <button
              onClick={() => onIgnore(suggestion.id)}
              disabled={isAdding}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\CashFlowForecast.recovery.tsx
==================================================

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Calendar, DollarSign, CircleAlert as AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  getCashFlowForecast,
  getCashPositionSummary,
  getOutstandingReceivables,
  getOutstandingPayables,
  getUpcomingPayroll,
  formatCurrency,
  formatShortDate,
  getPriorityColor,
  getAgingColor,
  type CashFlowForecast as ForecastPeriod,
  type CashPositionSummary,
  type OutstandingReceivable,
  type OutstandingPayable,
  type UpcomingPayroll,
} from "../lib/cashFlow";

interface Props {
  companyId: string;
}

export default function CashFlowForecast({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<"week" | "month">("week");
  const [forecast, setForecast] = useState<ForecastPeriod[]>([]);
  const [summary, setSummary] = useState<CashPositionSummary | null>(null);
  const [receivables, setReceivables] = useState<OutstandingReceivable[]>([]);
  const [payables, setPayables] = useState<OutstandingPayable[]>([]);
  const [payroll, setPayroll] = useState<UpcomingPayroll[]>([]);
  const [showReceivables, setShowReceivables] = useState(false);
  const [showPayables, setShowPayables] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);

  useEffect(() => {
    loadData();
  }, [companyId, interval]);

  async function loadData() {
    try {
      setLoading(true);
      const [forecastData, summaryData, receivablesData, payablesData, payrollData] =
        await Promise.all([
          getCashFlowForecast(companyId, undefined, undefined, interval),
          getCashPositionSummary(companyId),
          getOutstandingReceivables(companyId),
          getOutstandingPayables(companyId),
          getUpcomingPayroll(companyId, interval === "week" ? 12 : 24),
        ]);

      setForecast(forecastData);
      setSummary(summaryData);
      setReceivables(receivablesData);
      setPayables(payablesData);
      setPayroll(payrollData);
    } catch (error) {
      console.error("Error loading cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  function calculateProjectedBalance(periodIndex: number): number {
    if (!summary) return 0;

    let balance = summary.current_cash_balance;
    for (let i = 0; i <= periodIndex; i++) {
      balance += forecast[i].net_cash_flow;
    }
    return balance;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-400">Loading cash flow forecast...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-8 text-center">
        <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Cash Flow Data</h3>
        <p className="text-sm text-slate-400">
          Set up bank accounts, invoices, and payroll to see cash flow forecasts.
        </p>
      </div>
    );
  }

  const totalInflows = forecast.reduce((sum, p) => sum + Number(p.expected_inflows), 0);
  const totalOutflows = forecast.reduce((sum, p) => sum + Number(p.expected_outflows), 0);
  const netForecast = totalInflows - totalOutflows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cash Flow Forecast</h2>
          <p className="text-sm text-slate-400">
            {interval === "week" ? "12-week" : "6-month"} cash flow projection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInterval("week")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "week"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setInterval("month")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "month"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <DollarSign size={16} />
            Current Cash
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(summary.current_cash_balance)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingUp size={16} />
            Expected Inflows
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatCurrency(totalInflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {receivables.length} invoice{receivables.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingDown size={16} />
            Expected Outflows
          </div>
          <div className="text-2xl font-bold text-red-400">{formatCurrency(totalOutflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {payables.length + payroll.length} payment{payables.length + payroll.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Calendar size={16} />
            Projected Balance
          </div>
          <div
            className={`text-2xl font-bold ${
              summary.current_cash_balance + netForecast >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatCurrency(summary.current_cash_balance + netForecast)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {netForecast >= 0 ? "+" : ""}
            {formatCurrency(netForecast)} net
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Period
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Inflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Outflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Net
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Balance
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">
                  Items
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {forecast.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No forecast data available
                  </td>
                </tr>
              ) : (
                forecast.map((period, idx) => {
                  const projectedBalance = calculateProjectedBalance(idx);
                  const netCashFlow = Number(period.net_cash_flow);
                  return (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      <td className="px-4 py-3 text-sm text-white">{period.period_label}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-400">
                        {formatCurrency(Number(period.expected_inflows))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-400">
                        {formatCurrency(Number(period.expected_outflows))}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${
                          netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {netCashFlow >= 0 ? "+" : ""}
                        {formatCurrency(netCashFlow)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-semibold ${
                          projectedBalance >= 0 ? "text-white" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(projectedBalance)}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-emerald-400">{period.receivables_count}</span>/
                          <span className="text-red-400">
                            {period.payables_count + period.payroll_count}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => setShowReceivables(!showReceivables)}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/30 border border-slate-800 rounded-lg hover:bg-slate-900/50"
        >
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-emerald-400" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Outstanding Receivables</div>
              <div className="text-xs text-slate-400">
                {receivables.length} invoice{receivables.length !== 1 ? "s" : ""} • Total:{" "}
                {formatCurrency(receivables.reduce((sum, r) => sum + Number(r.balance_due), 0))}
              </div>
            </div>
          </div>
          {showReceivables ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </button>

        {showReceivables && receivables.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Due Date</th>
                  <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
                  <th className="px-4 py-2 text-center text-xs text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {receivables.map((r) => (
                  <tr key={r.invoice_id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-2 text-white">{r.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {r.due_date ? formatShortDate(r.due_date) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400">

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\CashFlowForecast.tsx
==================================================

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Calendar, DollarSign, CircleAlert as AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  getCashFlowForecast,
  getCashPositionSummary,
  getOutstandingReceivables,
  getOutstandingPayables,
  getUpcomingPayroll,
  formatCurrency,
  formatShortDate,
  getPriorityColor,
  getAgingColor,
  type CashFlowForecast as ForecastPeriod,
  type CashPositionSummary,
  type OutstandingReceivable,
  type OutstandingPayable,
  type UpcomingPayroll,
} from "../lib/cashFlow";

interface Props {
  companyId: string;
}

export default function CashFlowForecast({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<"week" | "month">("week");
  const [forecast, setForecast] = useState<ForecastPeriod[]>([]);
  const [summary, setSummary] = useState<CashPositionSummary | null>(null);
  const [receivables, setReceivables] = useState<OutstandingReceivable[]>([]);
  const [payables, setPayables] = useState<OutstandingPayable[]>([]);
  const [payroll, setPayroll] = useState<UpcomingPayroll[]>([]);
  const [showReceivables, setShowReceivables] = useState(false);
  const [showPayables, setShowPayables] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);

  useEffect(() => {
    loadData();
  }, [companyId, interval]);

  async function loadData() {
    try {
      setLoading(true);
      const [forecastData, summaryData, receivablesData, payablesData, payrollData] =
        await Promise.all([
          getCashFlowForecast(companyId, undefined, undefined, interval),
          getCashPositionSummary(companyId),
          getOutstandingReceivables(companyId),
          getOutstandingPayables(companyId),
          getUpcomingPayroll(companyId, interval === "week" ? 12 : 24),
        ]);

      setForecast(forecastData);
      setSummary(summaryData);
      setReceivables(receivablesData);
      setPayables(payablesData);
      setPayroll(payrollData);
    } catch (error) {
      console.error("Error loading cash flow data:", error);
    } finally {
      setLoading(false);
    }
  }

  function calculateProjectedBalance(periodIndex: number): number {
    if (!summary) return 0;

    let balance = summary.current_cash_balance;
    for (let i = 0; i <= periodIndex; i++) {
      balance += forecast[i].net_cash_flow;
    }
    return balance;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-slate-400">Loading cash flow forecast...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-8 text-center">
        <AlertCircle size={48} className="mx-auto text-slate-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Cash Flow Data</h3>
        <p className="text-sm text-slate-400">
          Set up bank accounts, invoices, and payroll to see cash flow forecasts.
        </p>
      </div>
    );
  }

  const totalInflows = forecast.reduce((sum, p) => sum + Number(p.expected_inflows), 0);
  const totalOutflows = forecast.reduce((sum, p) => sum + Number(p.expected_outflows), 0);
  const netForecast = totalInflows - totalOutflows;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cash Flow Forecast</h2>
          <p className="text-sm text-slate-400">
            {interval === "week" ? "12-week" : "6-month"} cash flow projection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInterval("week")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "week"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setInterval("month")}
            className={`px-4 py-2 text-sm rounded ${
              interval === "month"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <DollarSign size={16} />
            Current Cash
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(summary.current_cash_balance)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingUp size={16} />
            Expected Inflows
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatCurrency(totalInflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {receivables.length} invoice{receivables.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <TrendingDown size={16} />
            Expected Outflows
          </div>
          <div className="text-2xl font-bold text-red-400">{formatCurrency(totalOutflows)}</div>
          <div className="text-xs text-slate-400 mt-1">
            {payables.length + payroll.length} payment{payables.length + payroll.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Calendar size={16} />
            Projected Balance
          </div>
          <div
            className={`text-2xl font-bold ${
              summary.current_cash_balance + netForecast >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {formatCurrency(summary.current_cash_balance + netForecast)}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {netForecast >= 0 ? "+" : ""}
            {formatCurrency(netForecast)} net
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                  Period
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Inflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Outflows
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Net
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                  Balance
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">
                  Items
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {forecast.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No forecast data available
                  </td>
                </tr>
              ) : (
                forecast.map((period, idx) => {
                  const projectedBalance = calculateProjectedBalance(idx);
                  const netCashFlow = Number(period.net_cash_flow);
                  return (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      <td className="px-4 py-3 text-sm text-white">{period.period_label}</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-400">
                        {formatCurrency(Number(period.expected_inflows))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-400">
                        {formatCurrency(Number(period.expected_outflows))}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-medium ${
                          netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {netCashFlow >= 0 ? "+" : ""}
                        {formatCurrency(netCashFlow)}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm text-right font-semibold ${
                          projectedBalance >= 0 ? "text-white" : "text-red-400"
                        }`}
                      >
                        {formatCurrency(projectedBalance)}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-emerald-400">{period.receivables_count}</span>/
                          <span className="text-red-400">
                            {period.payables_count + period.payroll_count}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <button
          onClick={() => setShowReceivables(!showReceivables)}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-900/30 border border-slate-800 rounded-lg hover:bg-slate-900/50"
        >
          <div className="flex items-center gap-3">
            <TrendingUp size={20} className="text-emerald-400" />
            <div className="text-left">
              <div className="text-sm font-medium text-white">Outstanding Receivables</div>
              <div className="text-xs text-slate-400">
                {receivables.length} invoice{receivables.length !== 1 ? "s" : ""} • Total:{" "}
                {formatCurrency(receivables.reduce((sum, r) => sum + Number(r.balance_due), 0))}
              </div>
            </div>
          </div>
          {showReceivables ? (
            <ChevronUp size={20} className="text-slate-400" />
          ) : (
            <ChevronDown size={20} className="text-slate-400" />
          )}
        </button>

        {showReceivables && receivables.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-slate-400">Due Date</th>
                  <th className="px-4 py-2 text-right text-xs text-slate-400">Amount</th>
                  <th className="px-4 py-2 text-center text-xs text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {receivables.map((r) => (
                  <tr key={r.invoice_id} className="hover:bg-slate-900/50">
                    <td className="px-4 py-2 text-white">{r.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-300">
                      {r.due_date ? formatShortDate(r.due_date) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400">

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\ContractProgressBilling.tsx
==================================================

import { useEffect, useState } from "react";
import { FileText, Plus, RefreshCw, CircleCheck as CheckCircle2, Clock, DollarSign, TrendingUp, CircleAlert as AlertCircle } from "lucide-react";
import type {
  ContractBillingItem,
  ContractBillingCalculation,
  ContractBillingSummary,
  ClientInvoice,
  ClientInvoiceLineItem
} from "../lib/finance";
import {
  fetchContractBillingItems,
  calculateContractBilling,
  getContractBillingSummary,
  syncBOQToBillingItems,
  updateContractBillingItem,
  createClientInvoice,
  createInvoiceLineItems,
  updateBillingItemAfterInvoice
} from "../lib/finance";

interface Props {
  contractId: string;
  companyId: string;
  projectId: string;
  clientId: string;
  onInvoiceCreated?: () => void;
}

export default function ContractProgressBilling({
  contractId,
  companyId,
  projectId,
  clientId,
  onInvoiceCreated
}: Props) {
  const [billingItems, setBillingItems] = useState<ContractBillingItem[]>([]);
  const [calculations, setCalculations] = useState<ContractBillingCalculation[]>([]);
  const [summary, setSummary] = useState<ContractBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    loadData();
  }, [contractId]);

  async function loadData() {
    try {
      setLoading(true);
      const [items, summaryData] = await Promise.all([
        fetchContractBillingItems(contractId),
        getContractBillingSummary(contractId)
      ]);
      setBillingItems(items);
      setSummary(summaryData);
    } catch (error) {
      console.error("Error loading contract billing data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncFromBOQ() {
    try {
      setSyncing(true);
      const count = await syncBOQToBillingItems(contractId);
      alert(`Synced ${count} items from BOQ`);
      await loadData();
    } catch (error) {
      console.error("Error syncing BOQ:", error);
      alert("Failed to sync BOQ items");
    } finally {
      setSyncing(false);
    }
  }

  async function handleCalculateBilling() {
    try {
      setCalculating(true);
      const calcs = await calculateContractBilling(contractId, invoiceDate);
      setCalculations(calcs);
      setShowBillingModal(true);
    } catch (error) {
      console.error("Error calculating billing:", error);
      alert("Failed to calculate billing");
    } finally {
      setCalculating(false);
    }
  }

  async function handleUpdateProgress(itemId: string, percentComplete: number) {
    try {
      await updateContractBillingItem(itemId, { percent_complete: percentComplete });
      await loadData();
    } catch (error) {
      console.error("Error updating progress:", error);
      alert("Failed to update progress");
    }
  }

  async function handleGenerateInvoice() {
    try {
      setGenerating(true);

      const selectedCalcs = calculations.filter(c => selectedItems.has(c.billing_item_id));
      if (selectedCalcs.length === 0) {
        alert("Please select at least one item to bill");
        return;
      }

      const subtotal = selectedCalcs.reduce((sum, c) => sum + Number(c.current_billing_amount), 0);
      const totalRetainage = selectedCalcs.reduce((sum, c) => sum + Number(c.retainage_amount), 0);
      const netTotal = selectedCalcs.reduce((sum, c) => sum + Number(c.net_amount_due), 0);

      const { data: { user } } = await (await import("../lib/supabase")).supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: lastInvoice } = await (await import("../lib/supabase")).supabase
        .from("client_invoices")
        .select("invoice_number")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nextNumber = 1;
      if (lastInvoice?.invoice_number) {
        const match = lastInvoice.invoice_number.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      const invoiceNumber = `INV-${String(nextNumber).padStart(5, "0")}`;

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice: Partial<ClientInvoice> = {
        company_id: companyId,
        project_id: projectId,
        client_id: clientId,
        contract_id: contractId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate.toISOString().split("T")[0],
        subtotal: subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: netTotal,
        amount_paid: 0,
        balance_due: netTotal,
        status: "draft",
        notes: `Progress billing as of ${invoiceDate}\nRetainage held: ${formatCurrency(totalRetainage)}`,
        created_by: user.id
      };

      const createdInvoice = await createClientInvoice(invoice);

      const lineItemsToCreate = selectedCalcs.map((calc, i) => ({
        invoice_id: createdInvoice.id,
        company_id: companyId,
        line_number: i + 1,
        description: calc.description,
        quantity: Number(calc.current_billing_quantity),
        unit: calc.unit,
        rate: Number(calc.contract_rate),
        amount: Number(calc.net_amount_due),
        billing_item_id: calc.billing_item_id,
        boq_item_id: calc.boq_item_id,
        percent_complete: Number(calc.percent_complete),
        previously_billed: Number(calc.previously_billed_amount),
        retainage_percent: Number(calc.retainage_percent),
        retainage_amount: Number(calc.retainage_amount),
        notes: `${calc.percent_complete}% complete`
      }));

      await createInvoiceLineItems(lineItemsToCreate);

      for (const calc of selectedCalcs) {
        await updateBillingItemAfterInvoice(
          calc.billing_item_id,
          Number(calc.current_billing_amount),
          Number(calc.current_billing_quantity),
          Number(calc.retainage_amount)
        );
      }

      alert(`Invoice ${invoiceNumber} created successfully!`);
      setShowBillingModal(false);
      setSelectedItems(new Set());
      setCalculations([]);
      await loadData();

      if (onInvoiceCreated) {
        onInvoiceCreated();
      }
    } catch (error) {
      console.error("Error generating invoice:", error);
      alert("Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  }

  function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return "$0.00";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined) return "0%";
    return `${Number(value).toFixed(1)}%`;
  }

  function toggleItemSelection(itemId: string) {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading contract billing...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Contract Progress Billing</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFromBOQ}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            Sync from BOQ
          </button>
          <button
            onClick={handleCalculateBilling}
            disabled={calculating || billingItems.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <DollarSign size={16} />
            Calculate Billing
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <FileText size={16} />
              Contract Amount
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(summary.contract_amount)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <CheckCircle2 size={16} />
              Billed to Date
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.total_billed_to_date)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {formatPercent(summary.percent_billed)} of contract
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <Clock size={16} />
              Retainage Held
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(summary.total_retainage_held)}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\CostCodeManager.tsx
==================================================

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

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\CostCodeSelect.tsx
==================================================

import { useEffect, useState } from "react";
import { fetchActiveCostCodes, type CostCode } from "../lib/costCodes";

interface Props {
  companyId: string;
  value: string | null | undefined;
  onChange: (costCodeId: string | null) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

export default function CostCodeSelect({
  companyId,
  value,
  onChange,
  required = false,
  className = "",
  placeholder = "Select Cost Code",
}: Props) {
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCostCodes();
  }, [companyId]);

  async function loadCostCodes() {
    try {
      setLoading(true);
      const codes = await fetchActiveCostCodes(companyId);
      setCostCodes(codes);
    } catch (error) {
      console.error("Error loading cost codes:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <select disabled className={className || "w-full px-3 py-2 border border-gray-300 rounded"}>
        <option>Loading...</option>
      </select>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      required={required}
      className={className || "w-full px-3 py-2 border border-gray-300 rounded"}
    >
      <option value="">{placeholder}</option>
      {costCodes.map((code) => (
        <option key={code.id} value={code.id}>
          {code.code} - {code.description}
          {code.category ? ` (${code.category})` : ""}
        </option>
      ))}
    </select>
  );
}

==================================================
FILE: C:\Users\magnu\Desktop\magnus-system-v3\src\components\CostCodeSummary.tsx
==================================================

import { useEffect, useState } from "react";
import { FileText, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { getProjectCostsByCode, type ProjectCostsByCode } from "../lib/costCodes";

interface Props {
  projectId: string;
  showTitle?: boolean;
}

export default function CostCodeSummary({ projectId, showTitle = true }: Props) {
  const [costData, setCostData] = useState<ProjectCostsByCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    try {
      setLoading(true);
      const data = await getProjectCostsByCode(projectId);
      setCostData(data);
    } catch (error) {
      console.error("Error loading cost code summary:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatPercent(value: number): string {
    return `${Number(value).toFixed(1)}%`;
  }

  const totals = costData.reduce(
    (acc, row) => ({
      budget: acc.budget + Number(row.boq_budget || row.budget_amount),
      committed: acc.committed + Number(row.committed_amount),
      actual: acc.actual + Number(row.actual_amount),
      variance: acc.variance + Number(row.variance),
    }),
    { budget: 0, committed: 0, actual: 0, variance: 0 }
  );

  const groupedData = groupByCategory
    ? costData.reduce((acc, row) => {
        const category = row.cost_code_category || "Uncategorized";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(row);
        return acc;
      }, {} as Record<string, ProjectCostsByCode[]>)
    : { All: costData };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading cost code summary...</div>
      </div>
    );
  }

  if (costData.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText size={48} className="mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Cost Codes Assigned</h3>
        <p className="text-sm text-gray-600">
          Assign cost codes to BOQ items, expenses, and procurement to see cost analysis here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showTitle && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cost Code Summary</h2>
            <p className="text-sm text-gray-600">Budget vs. Actual by Cost Code</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={groupByCategory}
                onChange={(e) => setGroupByCategory(e.target.checked)}
                className="w-4 h-4"
              />
              Group by Category
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <FileText size={16} />
            Total Budget
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatCurrency(totals.budget)}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <DollarSign size={16} />
            Committed
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {formatCurrency(totals.committed)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.budget > 0 ? formatPercent((totals.committed / totals.budget) * 100) : "0%"} of
            budget
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            <TrendingUp size={16} />
            Actual Costs
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(totals.actual)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.budget > 0 ? formatPercent((totals.actual / totals.budget) * 100) : "0%"} spent
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
            {totals.variance >= 0 ? (
              <TrendingDown size={16} className="text-green-600" />
            ) : (
              <TrendingUp size={16} className="text-red-600" />
            )}
            Variance
          </div>
          <div
            className={`text-2xl font-bold ${
              totals.variance >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(totals.variance)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {totals.variance >= 0 ? "Under budget" : "Over budget"}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Cost Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Budget
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Committed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Actual
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Variance
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  % Spent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Object.entries(groupedData).map(([category, rows]) => (
                <>
                  {groupByCategory && (
                    <tr key={`cat-${category}`} className="bg-gray-100">
                      <td colSpan={7} className="px-4 py-2 font-semibold text-gray-900">
                        {category}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const budget = Number(row.boq_budget || row.budget_amount);
                    const variance = Number(row.variance);
                    return (
                      <tr key={row.cost_code_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-gray-900">{row.cost_code}</td>
                        <td className="px-4 py-3 text-gray-900">
                          {row.cost_code_description}
                          {!groupByCategory && row.cost_code_category && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({row.cost_code_category})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatCurrency(budget)}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {formatCurrency(Number(row.committed_amount))}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600">
                          {formatCurrency(Number(row.actual_amount))}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${
                            variance >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(variance)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  Number(row.percent_spent) > 100
                                    ? "bg-red-500"
                                    : Number(row.percent_spent) > 90
                                    ? "bg-orange-500"
                                    : "bg-green-500"
                                }`}
                                style={{
                                  width: `${Math.min(Number(row.percent_spent), 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-gray-700 font-medium">
                              {formatPercent(Number(row.percent_spent))}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr className="font-bold">
                <td colSpan={2} className="px-4 py-3 text-gray-900">
                  TOTALS
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCurrency(totals.budget)}
                </td>
                <td className="px-4 py-3 text-right text-blue-600">
                  {formatCurrency(totals.committed)}
                </td>
                <td className="px-4 py-3 text-right text-orange-600">
                  {formatCurrency(totals.actual)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    totals.variance >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(totals.variance)}
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {totals.budget > 0
                    ? formatPercent((totals.actual / totals.budget) * 100)
                    : "0%"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
