// src/pages/WorkersPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Select, Field,
  Table, Th, Tr, Td, Empty, Modal, Alert, Textarea,
  Tabs, Divider, cn
} from "../components/ui";
import {
  Plus, Search, HardHat, Phone, Mail, MapPin,
  RefreshCw, Edit2, Trash2, LayoutGrid, List,
  DollarSign, Clock, User, Calendar, Briefcase
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkerType = "employee" | "subcontractor" | "crew_lead";
type WorkerStatus = "active" | "inactive" | "terminated";
type PayType = "hourly" | "salary" | "contract";

type Worker = {
  id: string;
  company_id: string;
  worker_type: WorkerType;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  hire_date?: string | null;
  status: WorkerStatus;
  pay_type?: PayType | null;
  pay_rate?: number | null;
  overtime_rate?: number | null;
  employee_id?: string | null;
  notes?: string | null;
  created_at?: string;
};

type Tab = "all" | "active" | "inactive" | "terminated";
type ViewMode = "grid" | "list";

const STATUS_COLOR: Record<WorkerStatus, any> = {
  active: "green", inactive: "amber", terminated: "red"
};

const TYPE_COLOR: Record<WorkerType, string> = {
  employee: "text-blue-400", subcontractor: "text-violet-400", crew_lead: "text-cyan-400"
};

const TYPE_BG: Record<WorkerType, string> = {
  employee: "bg-blue-500/10 border-blue-500/20",
  subcontractor: "bg-violet-500/10 border-violet-500/20",
  crew_lead: "bg-cyan-500/10 border-cyan-500/20",
};

const EMPTY_FORM = {
  first_name: "", last_name: "", email: "", phone: "",
  address: "", city: "", hire_date: "",
  worker_type: "employee" as WorkerType,
  status: "active" as WorkerStatus,
  pay_type: "hourly" as PayType,
  pay_rate: "", overtime_rate: "", employee_id: "", notes: "",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function fullName(w: Worker) { return `${w.first_name} ${w.last_name}`; }

function initials(w: Worker) {
  return `${w.first_name?.[0] || ""}${w.last_name?.[0] || ""}`.toUpperCase();
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Worker Card ──────────────────────────────────────────────────────────────

function WorkerCard({ worker, onEdit, onDelete }: {
  worker: Worker;
  onEdit: (w: Worker) => void;
  onDelete: (id: string) => void;
}) {
  const avatarBg = worker.worker_type === "employee" ? "bg-blue-500/20 text-blue-300" :
    worker.worker_type === "crew_lead" ? "bg-cyan-500/20 text-cyan-300" :
    "bg-violet-500/20 text-violet-300";

  return (
    <Card className="group hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold border", TYPE_BG[worker.worker_type], TYPE_COLOR[worker.worker_type])}>
          {initials(worker)}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onEdit(worker)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
            <Edit2 size={12}/>
          </button>
          <button onClick={() => onDelete(worker.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
            <Trash2 size={12}/>
          </button>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-100 mb-0.5">{fullName(worker)}</div>
        <div className={cn("text-[10px] font-semibold capitalize", TYPE_COLOR[worker.worker_type])}>
          {worker.worker_type.replace("_", " ")}
        </div>
        {worker.employee_id && (
          <div className="text-[9px] text-slate-700 mt-0.5">ID: {worker.employee_id}</div>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        {worker.phone && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <Phone size={9}/> {worker.phone}
          </div>
        )}
        {worker.email && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600 truncate">
            <Mail size={9}/> {worker.email}
          </div>
        )}
        {worker.hire_date && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <Calendar size={9}/> Hired {fmtDate(worker.hire_date)}
          </div>
        )}
      </div>

      {/* Pay info */}
      {worker.pay_rate && (
        <div className="flex items-center gap-1.5 mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
          <DollarSign size={10} className="text-emerald-400"/>
          <span className="text-[11px] font-semibold text-emerald-300">
            {fmt(worker.pay_rate)} / {worker.pay_type === "hourly" ? "hr" : worker.pay_type === "salary" ? "yr" : "contract"}
          </span>
          {worker.overtime_rate && (
            <span className="text-[9px] text-emerald-600 ml-1">OT: {fmt(worker.overtime_rate)}/hr</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
        <Badge color={STATUS_COLOR[worker.status]} dot>{worker.status}</Badge>
        {worker.city && <span className="text-[9px] text-slate-700">{worker.city}</span>}
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showNew, setShowNew] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.company_id) setCompanyId(data.company_id); });
    });
  }, []);

  useEffect(() => { if (companyId) loadWorkers(); }, [companyId]);

  async function loadWorkers() {
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from("workers")
        .select("*")
        .eq("company_id", companyId!)
        .order("first_name", { ascending: true });
      if (e) throw e;
      setWorkers(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function saveWorker() {
    setSaving(true); setError(null);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        hire_date: form.hire_date || null,
        worker_type: form.worker_type,
        status: form.status,
        pay_type: form.pay_type || null,
        pay_rate: form.pay_rate ? parseFloat(form.pay_rate) : null,
        overtime_rate: form.overtime_rate ? parseFloat(form.overtime_rate) : null,
        employee_id: form.employee_id.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editWorker) {
        const { error: e } = await supabase.from("workers").update(payload).eq("id", editWorker.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("workers").insert({ ...payload, company_id: companyId });
        if (e) throw e;
      }
      await loadWorkers();
      closeModal();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function deleteWorker(id: string) {
    try {
      const { error: e } = await supabase.from("workers").delete().eq("id", id);
      if (e) throw e;
      setWorkers(prev => prev.filter(w => w.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(worker: Worker) {
    setEditWorker(worker);
    setForm({
      first_name: worker.first_name,
      last_name: worker.last_name,
      email: worker.email || "",
      phone: worker.phone || "",
      address: worker.address || "",
      city: worker.city || "",
      hire_date: worker.hire_date || "",
      worker_type: worker.worker_type,
      status: worker.status,
      pay_type: worker.pay_type || "hourly",
      pay_rate: worker.pay_rate?.toString() || "",
      overtime_rate: worker.overtime_rate?.toString() || "",
      employee_id: worker.employee_id || "",
      notes: worker.notes || "",
    });
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false); setEditWorker(null);
    setForm(EMPTY_FORM); setError(null);
  }

  // Filter
  const filtered = workers.filter(w => {
    const matchSearch = fullName(w).toLowerCase().includes(search.toLowerCase()) ||
      (w.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (w.phone || "").includes(search) ||
      (w.employee_id || "").toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "all" || w.status === tab;
    const matchType = !typeFilter || w.worker_type === typeFilter;
    return matchSearch && matchTab && matchType;
  });

  const stats = {
    total: workers.length,
    active: workers.filter(w => w.status === "active").length,
    inactive: workers.filter(w => w.status === "inactive").length,
    terminated: workers.filter(w => w.status === "terminated").length,
    employees: workers.filter(w => w.worker_type === "employee").length,
    subs: workers.filter(w => w.worker_type === "subcontractor").length,
    avgRate: workers.filter(w => w.pay_rate).length > 0
      ? workers.filter(w => w.pay_rate).reduce((s, w) => s + (w.pay_rate || 0), 0) / workers.filter(w => w.pay_rate).length
      : 0,
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Workers"
        subtitle={`${stats.total} total · ${stats.active} active`}
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""}/>}
              onClick={loadWorkers}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13}/>}
              onClick={() => { setEditWorker(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              Add Worker
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total",      value: stats.total,      color: "text-slate-200",   key: "all" as Tab },
            { label: "Active",     value: stats.active,     color: "text-emerald-400", key: "active" as Tab },
            { label: "Inactive",   value: stats.inactive,   color: "text-amber-400",   key: "inactive" as Tab },
            { label: "Terminated", value: stats.terminated, color: "text-red-400",     key: "terminated" as Tab },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                tab === s.key ? "border-cyan-500/30 bg-cyan-500/10" : "border-white/[0.07] bg-[#0c1018] hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Employees</div>
            <div className="text-xl font-bold text-blue-400">{stats.employees}</div>
          </Card>
          <Card>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Subcontractors</div>
            <div className="text-xl font-bold text-violet-400">{stats.subs}</div>
          </Card>
          <Card>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Avg Pay Rate</div>
            <div className="text-xl font-bold text-emerald-400">{stats.avgRate ? fmt(stats.avgRate) : "—"}</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
            <Input className="pl-8" placeholder="Search name, email, ID..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-40">
            <option value="">All types</option>
            <option value="employee">Employee</option>
            <option value="subcontractor">Subcontractor</option>
            <option value="crew_lead">Crew Lead</option>
          </Select>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
            <button onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <LayoutGrid size={13}/>
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <List size={13}/>
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading workers...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<HardHat size={20}/>}
            title={search ? "No workers match your search" : "No workers yet"}
            body={search ? "Try a different search." : "Add your first worker to get started."}
            action={!search ? <Btn variant="primary" icon={<Plus size={13}/>}
              onClick={() => { setEditWorker(null); setForm(EMPTY_FORM); setShowNew(true); }}>
              Add Worker</Btn> : undefined}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(w => (
              <WorkerCard key={w.id} worker={w}
                onEdit={openEdit}
                onDelete={id => setDeleteConfirm(id)}
              />
            ))}
          </div>
        ) : (
          <Card padding={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Worker</Th>
                  <Th>Type</Th>
                  <Th>Phone</Th>
                  <Th>Pay Rate</Th>
                  <Th>Hire Date</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => (
                  <Tr key={w.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border flex-shrink-0", TYPE_BG[w.worker_type], TYPE_COLOR[w.worker_type])}>
                          {initials(w)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200 text-xs">{fullName(w)}</div>
                          {w.employee_id && <div className="text-[9px] text-slate-700">#{w.employee_id}</div>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className={cn("text-[10px] font-semibold capitalize", TYPE_COLOR[w.worker_type])}>
                        {w.worker_type.replace("_", " ")}
                      </span>
                    </Td>
                    <Td muted>{w.phone || "—"}</Td>
                    <Td>
                      {w.pay_rate ? (
                        <span className="text-xs font-semibold text-emerald-400">
                          {fmt(w.pay_rate)}/{w.pay_type === "hourly" ? "hr" : w.pay_type === "salary" ? "yr" : "ct"}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </Td>
                    <Td muted>{fmtDate(w.hire_date)}</Td>
                    <Td><Badge color={STATUS_COLOR[w.status]} dot>{w.status}</Badge></Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(w)}
                          className="p-1.5 rounded hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                          <Edit2 size={12}/>
                        </button>
                        <button onClick={() => setDeleteConfirm(w.id)}
                          className="p-1.5 rounded hover:bg-red-500/15 text-slate-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>

      {/* New / Edit Modal */}
      <Modal open={showNew} onClose={closeModal}
        title={editWorker ? "Edit Worker" : "Add Worker"}
        subtitle={editWorker ? fullName(editWorker) : "Add a new worker to your team"}
        width="max-w-2xl">
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name">
              <Input placeholder="John" value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} autoFocus/>
            </Field>
            <Field label="Last Name">
              <Input placeholder="Smith" value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Worker Type">
              <Select value={form.worker_type}
                onChange={e => setForm(f => ({ ...f, worker_type: e.target.value as WorkerType }))}>
                <option value="employee">Employee</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="crew_lead">Crew Lead</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as WorkerStatus }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone">
              <Input placeholder="876-555-0100" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="john@example.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <Input placeholder="Kingston" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
            </Field>
            <Field label="Hire Date">
              <Input type="date" value={form.hire_date}
                onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}/>
            </Field>
          </div>

          <Divider label="Pay Information"/>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Pay Type">
              <Select value={form.pay_type}
                onChange={e => setForm(f => ({ ...f, pay_type: e.target.value as PayType }))}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
                <option value="contract">Contract</option>
              </Select>
            </Field>
            <Field label="Pay Rate ($)">
              <Input type="number" placeholder="0.00" value={form.pay_rate}
                onChange={e => setForm(f => ({ ...f, pay_rate: e.target.value }))}/>
            </Field>
            <Field label="Overtime Rate ($)">
              <Input type="number" placeholder="0.00" value={form.overtime_rate}
                onChange={e => setForm(f => ({ ...f, overtime_rate: e.target.value }))}/>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Employee ID (optional)">
              <Input placeholder="EMP-001" value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}/>
            </Field>
            <Field label="Address">
              <Input placeholder="123 Main St" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}/>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea rows={2} placeholder="Any additional notes..." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveWorker}
              disabled={!form.first_name.trim() || !form.last_name.trim() || saving}>
              {saving ? "Saving..." : editWorker ? "Save Changes" : "Add Worker"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}
        title="Remove Worker" width="max-w-sm">
        <div className="space-y-4">
          <Alert type="warning">
            This will permanently remove the worker record. Time entries and payment history will be preserved.
          </Alert>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => deleteConfirm && deleteWorker(deleteConfirm)}>
              Remove Worker
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
