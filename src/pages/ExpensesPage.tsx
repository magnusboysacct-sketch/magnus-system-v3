// src/pages/ExpensesPage.tsx
import React, { useEffect, useState } from "react";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../context/ProjectContext";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Tabs, cn
} from "../components/ui";
import {
  Plus, Search, Download, Receipt, DollarSign,
  RefreshCw, Filter, X, Check, Calendar, Pencil, Trash2
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Expense = {
  id: string;
  amount: number;
  description: string | null;
  expense_date: string | null;
  category_id: string | null;
  project_id: string | null;
  worker_id: string | null;
  status: string | null;
  receipt_url: string | null;
  created_at: string;
  projects?: { name: string } | null;
  workers?: { first_name: string; last_name: string } | null;
  expense_categories?: { name: string } | null;
};

type Category = { id: string; name: string; category_type: string };

type Tab = "all" | "pending" | "approved" | "filing";

// Matches the expenses.status CHECK constraint exactly: pending/approved/
// reimbursed/rejected — "paid" was never a real status (no such value in
// the DB constraint; see the "Mark Paid" fix below), so it's "reimbursed"
// that needs the color, not "paid".
const STATUS_COLOR: Record<string, any> = {
  pending:    "amber",
  approved:   "green",
  reimbursed: "blue",
  rejected:   "red",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const { projects, currentProject, userRole } = useProjectContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showExpenseScanner, setShowExpenseScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null while editing an existing expense — reuses the same "Log
  // Expense" modal, pre-filled, instead of a separate edit modal. Null
  // means the modal (if open) is in "create new" mode.
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  function handleExpenseScan(result: any, receiptFile?: File) {
    setShowExpenseScanner(false);
    if(receiptFile&&companyId){const now=new Date();const p="receipts/"+now.getFullYear()+"/"+String(now.getMonth()+1).padStart(2,"0")+"/"+Date.now()+"_receipt.jpg";supabase.storage.from("project-files").upload(p,receiptFile,{upsert:true}).then(({error:ue})=>{if(!ue){const{data:ud}=supabase.storage.from("project-files").getPublicUrl(p);setForm(f=>({...f,receipt_url:ud.publicUrl}));}});}
    setForm(f => ({
      ...f,
      description: result.vendor ? `${result.vendor} - Receipt` : f.description,
      amount:      result.amount ? result.amount.toString() : f.amount,
      expense_date: result.date || f.expense_date,
    }));
  }
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [form, setForm] = useState({
    description: "", amount: "", expense_date: "",
    category_id: "", project_id: currentProject?.id || "", status: "pending", receipt_url: "",
  });

  // Load company ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => {
    if (companyId) { loadExpenses(); loadCategories(); }
  }, [companyId]);

  async function loadExpenses() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("expenses")
        .select("*, projects(name), workers(first_name, last_name), expense_categories(name)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (e) throw e;
      setExpenses(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadCategories() {
    const { data } = await supabase
      .from("expense_categories")
      .select("id, name, category_type")
      .eq("company_id", companyId!);
    setCategories(data || []);
  }

  const blankForm = { description: "", amount: "", expense_date: "", category_id: "", project_id: currentProject?.id || "", status: "pending", receipt_url: "" };

  function openNew() {
    setEditingExpense(null);
    setForm(blankForm);
    setShowNew(true);
  }

  function openEdit(exp: Expense) {
    setEditingExpense(exp);
    setForm({
      description: exp.description || "",
      amount: exp.amount != null ? String(exp.amount) : "",
      expense_date: exp.expense_date || "",
      category_id: exp.category_id || "",
      project_id: exp.project_id || "",
      status: exp.status || "pending",
      receipt_url: exp.receipt_url || "",
    });
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false);
    setEditingExpense(null);
    setError(null);
    setForm(blankForm);
  }

  // Handles both create and edit — editingExpense being set is what decides
  // insert vs. update. No status restriction on editing (matches the
  // precedent on AccountsReceivablePage/FieldPaymentsPage: edit is allowed
  // at any status, only delete is role-gated).
  async function saveExpense() {
    setSaving(true); setError(null);
    try {
      const payload = {
        description: form.description.trim(),
        amount: parseFloat(form.amount) || 0,
        expense_date: form.expense_date || null,
        category_id: form.category_id || null,
        project_id: form.project_id || null,
        status: form.status,
        receipt_url: form.receipt_url || null,
      };
      if (editingExpense) {
        const { error: e } = await supabase.from("expenses").update(payload).eq("id", editingExpense.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("expenses").insert({ company_id: companyId, ...payload });
        if (e) throw e;
      }
      await loadExpenses();
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  // Delete is restricted to director, matching the same role-gate used for
  // destructive actions on ClientsPage / AccountsReceivablePage. Uses
  // window.confirm() rather than a custom modal — ConfirmModal isn't used
  // anywhere live in this app; window.confirm() is the dominant pattern for
  // every other delete action (invoices, POs, contracts, field payments).
  async function deleteExpense(exp: Expense) {
    if (!window.confirm(`Delete expense "${exp.description || "this expense"}"? This cannot be undone.`)) return;
    const { error: e } = await supabase.from("expenses").delete().eq("id", exp.id);
    if (e) { setError(e.message); return; }
    setExpenses(prev => prev.filter(x => x.id !== exp.id));
  }

  // "Mark Paid" previously called updateStatus(id, "approved") — the same
  // target as the Approve button, a copy-paste no-op. The expenses.status
  // CHECK constraint is pending/approved/reimbursed/rejected — "paid" was
  // never a real value. lib/finance.ts's approveExpense()/reimburseExpense()
  // already treat "reimbursed" as the paid-equivalent terminal state (see
  // its `markAsPaid` param), so "reimbursed" is the correct target here too,
  // not a new "paid" value added to the constraint.
  async function updateStatus(id: string, status: string) {
    await supabase.from("expenses").update({ status }).eq("id", id);
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  }

  function exportCSV() {
    const rows = filtered.map(e => [
      fmtDate(e.expense_date), e.description || "", fmt(e.amount),
      e.expense_categories?.name || "", e.projects?.name || "",
      `${e.workers?.first_name || ""} ${e.workers?.last_name || ""}`.trim(), e.status || ""
    ].join(","));
    const csv = ["Date,Description,Amount,Category,Project,Worker,Status", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `expenses_${Date.now()}.csv`; a.click();
  }

  // Filter
  const filtered = expenses.filter(e => {
    const matchSearch = (e.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.expense_categories?.name || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || e.status === tab;
    const matchProject = !projectFilter || e.project_id === projectFilter;
    return matchSearch && matchTab && matchProject;
  });

  // Totals
  const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalPending = expenses.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);
  const totalApproved = expenses.filter(e => e.status === "approved").reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Expenses"
        subtitle={`${expenses.length} total · ${fmt(totalAll)}`}
        actions={
          <>
            <Btn variant="ghost" size="sm" icon={<Download size={13}/>} onClick={exportCSV}>Export</Btn>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>} onClick={openNew}>Log Expense</Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Total Expenses", value: fmt(totalAll),     color: "text-slate-800 dark:text-slate-200" },
            { label: "Pending",        value: fmt(totalPending),  color: "text-amber-400" },
            { label: "Approved",       value: fmt(totalApproved), color: "text-emerald-400" },
          ].map(s => (
            <Card key={s.label} className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">{s.label}</div>
              <div className={cn("text-lg sm:text-2xl font-bold truncate", s.color)}>{s.value}</div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs
          tabs={[
            { key: "all" as Tab,      label: "All",      count: expenses.length },
            { key: "pending" as Tab,  label: "Pending",  count: expenses.filter(e => e.status === "pending").length },
            { key: "approved" as Tab, label: "Approved", count: expenses.filter(e => e.status === "approved").length },
            { key: "filing" as Tab, label: "📁 Filing Cabinet", count: expenses.filter(e=>!!e.receipt_url).length },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-700"/>
            <Input className="pl-8" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="w-44">
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>

        {/* Table */}
        <Card padding={false}>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Project</Th>
                <Th>Worker</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={8} className="text-center py-10 text-slate-500 dark:text-slate-600">
                  <RefreshCw size={14} className="animate-spin inline mr-2"/>Loading...
                </Td></tr>
              ) : filtered.length === 0 ? (
                <tr><Td colSpan={8}>
                  <Empty icon={<Receipt size={18}/>} title="No expenses found"
                    action={<Btn variant="primary" size="sm" icon={<Plus size={12}/>} onClick={openNew}>Log Expense</Btn>}/>
                </Td></tr>
              ) : filtered.map(e => (
                <Tr key={e.id}>
                  <Td muted>{fmtDate(e.expense_date)}</Td>
                  <Td><span className="font-medium text-slate-800 dark:text-slate-200">{e.description || "—"}</span></Td>
                  <Td muted>{e.expense_categories?.name || "—"}</Td>
                  <Td muted>{e.projects?.name || "—"}</Td>
                  <Td muted>
                    {e.workers ? `${e.workers.first_name} ${e.workers.last_name}` : "—"}
                  </Td>
                  <Td right><span className="font-semibold text-slate-800 dark:text-slate-200">{fmt(e.amount)}</span></Td>
                  <Td>
                    <Badge color={STATUS_COLOR[e.status || "pending"] || "slate"} dot>
                      {e.status || "pending"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {e.status === "pending" && (
                        <button onClick={() => updateStatus(e.id, "approved")}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                          Approve
                        </button>
                      )}
                      {e.status === "approved" && (
                        <button onClick={() => updateStatus(e.id, "reimbursed")}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                          Mark Paid
                        </button>
                      )}
                      <button onClick={() => openEdit(e)} title="Edit"
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/[0.06] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Pencil size={12}/>
                      </button>
                      {userRole === "director" && (
                        <button onClick={() => deleteExpense(e)} title="Delete"
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={12}/>
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* New Expense Modal */}
      {/* Filing Cabinet */}
      {tab==="filing"&&(
        <div className="space-y-4">
          {(() => {
            const withReceipts = expenses.filter(e=>e.receipt_url);
            if(withReceipts.length===0) return (
              <div className="text-center py-16 text-slate-600 text-sm">
                <div className="text-4xl mb-3">📁</div>
                <div>No receipts filed yet</div>
                <div className="text-xs mt-1">Scan a receipt when logging an expense to file it here</div>
              </div>
            );
            // Group by year/month
            const grouped: Record<string, Expense[]> = {};
            withReceipts.forEach(e=>{
              const d = new Date(e.expense_date||e.created_at);
              const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
              if(!grouped[key]) grouped[key]=[];
              grouped[key].push(e);
            });
            return Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([key, items])=>{
              const [year, month] = key.split("-");
              const monthName = new Date(Number(year), Number(month)-1).toLocaleString("en-US",{month:"long"});
              return (
                <div key={key} className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] overflow-hidden">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-white/[0.05] flex items-center gap-2">
                    <span>📁</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{monthName} {year}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-600 ml-auto">{items.length} receipt{items.length!==1?"s":""}</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {items.map(e=>(
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] flex-shrink-0 cursor-pointer"
                          onClick={()=>window.open(e.receipt_url!,"_blank")}>
                          <img src={e.receipt_url!} className="w-full h-full object-cover"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{e.description||"Expense"}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-500">{e.expense_date?new Date(e.expense_date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-600">{e.projects?.name||"No project"}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-emerald-400">JMD {(e.amount||0).toLocaleString()}</div>
                          <div className="flex gap-1 mt-1">
                            <button onClick={()=>window.open(e.receipt_url!,"_blank")}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 text-[10px] transition">
                              👁 View
                            </button>
                            <button onClick={()=>{const w=window.open("","_blank");if(w){w.document.write(`<html><body style="margin:0"><img src="${e.receipt_url}" style="max-width:100%"/></body></html>`);w.document.close();setTimeout(()=>w.print(),500);}}}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 text-[10px] transition">
                              🖨 Print
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
      <Modal open={showNew} onClose={closeModal}
        title={editingExpense ? "Edit Expense" : "Log Expense"}
        subtitle={editingExpense ? "Update this expense's details" : "Record a new project expense"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Receipt Scanner */}
          {showExpenseScanner ? (
            <ReceiptScanner
              onResult={handleExpenseScan}
              onCancel={() => setShowExpenseScanner(false)}
            />
          ) : (
            <button onClick={() => setShowExpenseScanner(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-3 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/20 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Scan Receipt with AI</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-600">Auto-fill from photo</div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 dark:text-slate-700 ml-auto"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          <Field label="Description">
            <Input placeholder="e.g. Cement bags from Hardware Plus" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} autoFocus/>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount ($)">
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}/>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}/>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="reimbursed">Reimbursed / Paid</option>
              <option value="rejected">Rejected</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveExpense}
              disabled={!form.description.trim() || !form.amount || saving}>
              {saving ? "Saving..." : editingExpense ? "Save Changes" : "Log Expense"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}