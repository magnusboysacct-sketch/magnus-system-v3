// src/pages/WorkersPage.tsx
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { WorkerIDCard } from "../components/WorkerIDCard";
import { SimpleIDScanner } from "../components/SimpleIDScanner";
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
  id_number?: string | null;
  id_photo_url?: string | null;
  national_id_type?: string | null;
  passport_photo_url?: string | null;
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
  id_number: "", id_photo_url: "", national_id_type: "", passport_photo_url: "",
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

function WorkerCard({ worker, onEdit, onDelete, onView, onIdCard }: {
  worker: Worker;
  onEdit: (w: Worker) => void;
  onDelete: (id: string) => void;
  onView: (w: Worker) => void;
  onIdCard: (w: Worker) => void;
}) {
    worker.worker_type === "crew_lead" ? "bg-cyan-500/20 text-cyan-300" :
    "bg-violet-500/20 text-violet-300";

  return (
    <Card className="group hover:border-slate-300 dark:hover:border-white/[0.13] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold border overflow-hidden", TYPE_BG[worker.worker_type || "employee"], TYPE_COLOR[worker.worker_type || "employee"])}>
          {worker.passport_photo_url ? (
            <img src={worker.passport_photo_url} alt={fullName(worker)} className="w-full h-full object-cover" />
          ) : (
            initials(worker)
          )}
        </div>
        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button onClick={() => onIdCard(worker)}
            className="p-1.5 rounded-lg hover:bg-yellow-500/15 text-slate-600 hover:text-yellow-400 transition-colors" title="Print ID Card">
            <span style={{fontSize:11}}>🪪</span>
          </button>
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
        <button onClick={() => onView(worker)} className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-0.5 hover:text-cyan-400 transition-colors text-left">{fullName(worker)}</button>
        <div className={cn("text-[10px] font-semibold capitalize", TYPE_COLOR[worker.worker_type || "employee"])}>
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

      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.05]">
        <Badge color={STATUS_COLOR[worker.status]} dot>{worker.status}</Badge>
        {worker.city && <span className="text-[9px] text-slate-700">{worker.city}</span>}
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkersPage() {
  const { settings: companySettings } = useCompanySettings();
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
  const [showIDScanner, setShowIDScanner] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const idPhotoFileRef = useRef<File | null>(null);
  const passportPhotoFileRef = useRef<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [idCardWorker, setIdCardWorker] = useState<Worker | null>(null);
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
      console.log("FELICA PASSPORT:", data?.find((w:any)=>w.first_name==="FELICA")?.passport_photo_url);
      return data || [];
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleIDScan(result: any, croppedFile?: File) {
    setShowIDScanner(false);
    if (croppedFile) { idPhotoFileRef.current = croppedFile; console.log("ID photo file received:", croppedFile.name, croppedFile.size); }
    setForm(f => ({
      ...f,
      first_name:       result.firstName || f.first_name,
      last_name:        result.lastName  || f.last_name,
      address:          result.address   || f.address,
      id_number:        result.idNumber  || result.documentNumber || f.id_number,
      national_id_type: result.documentType || f.national_id_type,
    }));
  }
  async function saveWorker() {
    setSaving(true); setError(null);
    try {
      const payload: Record<string, any> = {
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
        id_number: form.id_number?.trim() || null,
        id_photo_url: form.id_photo_url || null,
        national_id_type: form.national_id_type?.trim() || null,
        passport_photo_url: form.passport_photo_url || null,
      };

      // Upload passport photo to Supabase storage
      console.log("PASSPORT REF:", passportPhotoFileRef.current, "COMPANY:", companyId);
      if (passportPhotoFileRef.current && companyId) {
        try {
          const ppPath = `workers/passport/${companyId}/${Date.now()}_passport.jpg`;
          const { error: ppErr } = await supabase.storage
            .from("project-files")
            .upload(ppPath, passportPhotoFileRef.current!, { upsert: true });
          if (!ppErr) {
          console.log("PASSPORT UPLOAD RESULT - ppErr:", ppErr);
            const { data: ppUrl } = supabase.storage.from("project-files").getPublicUrl(ppPath);
            payload.passport_photo_url = ppUrl.publicUrl;
            console.log("PASSPORT SAVED TO PAYLOAD:", payload.passport_photo_url);
          }
        } catch (e) { console.error("PASSPORT CATCH ERROR:", e); }
      }
      // Upload ID photo to Supabase storage
      console.log("Checking ID photo ref:", idPhotoFileRef.current, companyId);
      if (idPhotoFileRef.current && companyId) {
        try {
          const path = `workers/ids/${companyId}/${Date.now()}_${form.id_number || "id"}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("project-files")
            .upload(path, idPhotoFileRef.current!, { upsert: true });
          if (upErr) {
            console.error("ID photo upload error:", upErr);
          } else {
            const { data: urlData } = supabase.storage.from("project-files").getPublicUrl(path);
            payload.id_photo_url = urlData.publicUrl;
            console.log("ID photo uploaded:", urlData.publicUrl);
          }
        } catch (upEx) {
          console.error("ID photo upload exception:", upEx);
        }
      }
      if (editWorker) {
        const { error: e } = await supabase.from("workers").update(payload).eq("id", editWorker.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("workers").insert({ ...payload, company_id: companyId });
        if (e) throw e;
      }
      const freshWorkers = await loadWorkers();
      console.log('FRESH WORKERS:', JSON.stringify(freshWorkers?.map((w:any) => ({id:w.id,name:w.first_name,passport:w.passport_photo_url}))))
      if (freshWorkers && editWorker) {
        const refreshed = freshWorkers.find((w: any) => w.id === editWorker.id);
        if (refreshed) setIdCardWorker(refreshed);
      }
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
      id_number: worker.id_number || "",
      id_photo_url: worker.id_photo_url || "",
      national_id_type: worker.national_id_type || "",
      passport_photo_url: worker.passport_photo_url || "",
    });
    setShowNew(true);
  }

  function closeModal() {
    idPhotoFileRef.current = null;
    setShowIDScanner(false);
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
            { label: "Total",      value: stats.total,      color: "text-slate-800 dark:text-slate-200",   key: "all" as Tab },
            { label: "Active",     value: stats.active,     color: "text-emerald-400", key: "active" as Tab },
            { label: "Inactive",   value: stats.inactive,   color: "text-amber-400",   key: "inactive" as Tab },
            { label: "Terminated", value: stats.terminated, color: "text-red-400",     key: "terminated" as Tab },
          ].map(s => (
            <button key={s.key} onClick={() => setTab(s.key)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                tab === s.key ? "border-cyan-500/30 bg-cyan-500/10" : "border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] p-1">
            <button onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
              <LayoutGrid size={13}/>
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200" : "text-slate-600 hover:text-slate-400")}>
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
                onView={w => setSelectedWorker(w)}
                onDelete={id => setDeleteConfirm(id)}
                onIdCard={w => setIdCardWorker(workers.find(x => x.id === w.id) || w)}
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
                        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border flex-shrink-0 overflow-hidden", TYPE_BG[w.worker_type], TYPE_COLOR[w.worker_type])}>
                          {w.passport_photo_url ? (
                            <img src={w.passport_photo_url} alt={fullName(w)} className="w-full h-full object-cover" />
                          ) : (
                            initials(w)
                          )}
                        </div>
                        <div>
                          <button onClick={() => setSelectedWorker(w)} className="font-semibold text-slate-800 dark:text-slate-200 text-xs hover:text-cyan-400 transition-colors text-left">{fullName(w)}</button>
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
        width="max-w-4xl">
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* ID Scanner */}
          {showIDScanner ? (
            <SimpleIDScanner
              onResult={handleIDScan}
              onCancel={() => setShowIDScanner(false)}
            />
          ) : (
            <button onClick={() => setShowIDScanner(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 px-4 py-3 transition-all group">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              </div>
              <div className="text-left flex-1">
                <div className="text-xs font-semibold text-cyan-300">Scan Worker ID with AI</div>
                <div className="text-[10px] text-slate-600">
                  {form.id_number ? `ID: ${form.id_number} — ${form.first_name} ${form.last_name}` : "Auto-fill name, address and ID number"}
                </div>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          {/* Passport Photo Upload */}
          <div className="flex items-center gap-4 p-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-20 rounded-lg border-2 border-amber-500/40 overflow-hidden bg-slate-800 flex items-center justify-center">
                {passportPhotoPreview || form.passport_photo_url ? (
                  <img src={passportPhotoPreview || form.passport_photo_url || undefined} alt="Passport" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl opacity-30">👤</span>
                )}
              </div>
              {(passportPhotoPreview || form.passport_photo_url) && (
                <button onClick={() => { passportPhotoFileRef.current = null; setPassportPhotoPreview(null); setForm(f => ({ ...f, passport_photo_url: "" })); }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center hover:bg-red-400">✕</button>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-amber-300 mb-1">Passport Photo</div>
              <div className="text-[10px] text-slate-500 mb-2">Upload a headshot for the ID card</div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
                <span className="text-[10px] text-amber-300 font-medium">📷 Choose Photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  passportPhotoFileRef.current = file;
                  const reader = new FileReader();
                  reader.onload = ev => setPassportPhotoPreview(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }} />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="First Name">
              <Input placeholder="John" value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} autoFocus/>
            </Field>
            <Field label="Last Name">
              <Input placeholder="Smith" value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}/>
            </Field>
            <Field label="Worker Type">
              <Select value={form.worker_type}
                onChange={e => setForm(f => ({ ...f, worker_type: e.target.value as WorkerType }))}>
                <option value="employee">Employee</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="crew_lead">Crew Lead</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Status">
              <Select value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as WorkerStatus }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </Select>
            </Field>
            <Field label="Phone">
              <Input placeholder="876-555-0100" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="john@example.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="City">
              <Input placeholder="Kingston" value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}/>
            </Field>
            <Field label="Hire Date">
              <Input type="date" value={form.hire_date}
                onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))}/>
            </Field>
            <Field label="Employee ID (optional)">
              <Input placeholder="EMP-001" value={form.employee_id}
                onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}/>
            </Field>
          </div>

          <Divider label="Pay Information"/>

          <div className="grid grid-cols-4 gap-4">
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
            <Field label="Address">
              <Input placeholder="123 Main St" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}/>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <Textarea rows={2} placeholder="Any additional notes..." value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}/>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveWorker}
              disabled={!form.first_name.trim() || !form.last_name.trim() || saving}>
              {saving ? "Saving..." : editWorker ? "Save Changes" : "Add Worker"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Worker Detail Modal — shows ID photo */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedWorker(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1520] shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{fullName(selectedWorker)}</div>
                <div className="text-[10px] text-slate-600 capitalize">{selectedWorker.worker_type.replace("_"," ")}</div>
              </div>
              <button onClick={() => setSelectedWorker(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-600 hover:text-slate-300 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* ID Photo */}
              {selectedWorker.id_photo_url ? (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">Government ID</div>
                  <img src={selectedWorker.id_photo_url} alt="Worker ID"
                    className="w-full rounded-xl border border-white/[0.08] object-contain max-h-48 bg-black"/>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.08] p-6 text-center">
                  <div className="text-[10px] text-slate-600">No ID photo stored</div>
                </div>
              )}
              {/* Details */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:"ID Number",   value: selectedWorker.id_number },
                  { label:"ID Type",     value: selectedWorker.national_id_type?.replace("_"," ") },
                  { label:"Phone",       value: selectedWorker.phone },
                  { label:"Email",       value: selectedWorker.email },
                  { label:"Address",     value: selectedWorker.address },
                  { label:"City",        value: selectedWorker.city },
                  { label:"Pay Rate",    value: selectedWorker.pay_rate ? `${selectedWorker.pay_rate}/hr` : null },
                  { label:"Hire Date",   value: selectedWorker.hire_date ? fmtDate(selectedWorker.hire_date) : null },
                ].filter(f => f.value).map(f => (
                  <div key={f.label} className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.05] p-2.5">
                    <div className="text-[9px] text-slate-600 mb-0.5">{f.label}</div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize truncate">{f.value}</div>
                  </div>
                ))}
              </div>
              {/* Print + Delete */}
              <div className="flex gap-2 pt-3 border-t border-slate-200 dark:border-white/[0.06] mt-2">
                <button onClick={() => window.print()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-white/[0.08] text-xs text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
                  🖨 Print
                </button>
                <button onClick={() => { setDeleteConfirm(selectedWorker!.id); setSelectedWorker(null); }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-colors">
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {idCardWorker && (
        <WorkerIDCard
          workerId={idCardWorker.id}
          companyName={companySettings?.company_name || "Magnus Boys Construction"}
          onClose={() => setIdCardWorker(null)}
        />
      )}
    </div>
  );
}
