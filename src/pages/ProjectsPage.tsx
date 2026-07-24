// src/pages/ProjectsPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectContext } from "../context/ProjectContext";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, Badge, Btn, Input, Empty,
  Modal, Field, Select, Alert, cn
} from "../components/ui";
import {
  FolderOpen, Plus, Search, Hammer, ArrowRight,
  Building2, LayoutGrid, List, RefreshCw, CheckSquare, TrendingUp,
  Edit2, Trash2, RotateCcw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  status: string | null;
  client_id?: string | null;
};

type Client = { id: string; name: string };

type CloseOutForm = {
  project_type: string;
  client_type: string;
  estimated_cost: string;
  actual_cost: string;
  estimated_duration_weeks: string;
  actual_duration_weeks: string;
  estimated_markup_pct: string;
  actual_markup_pct: string;
  was_profitable: boolean;
  had_delays: boolean;
  delay_reason: string;
  cost_overrun_reason: string;
};

const STATUS_COLOR: Record<string, any> = {
  active:    "green",
  completed: "blue",
  on_hold:   "amber",
  cancelled: "red",
  planning:  "violet",
  archived:  "slate",
};

const STATUS_OPTS = [
  { value: "active",    label: "Active" },
  { value: "planning",  label: "Planning" },
  { value: "on_hold",   label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Filter-only — "archived" isn't a status a director should be able to pick
// from the regular New/Edit Project form; it's only reachable via the
// dedicated Archive action in the delete flow.
const FILTER_STATUS_OPTS = [...STATUS_OPTS, { value: "archived", label: "Archived" }];

const DEFAULT_CLOSEOUT: CloseOutForm = {
  project_type: "",
  client_type: "",
  estimated_cost: "",
  actual_cost: "",
  estimated_duration_weeks: "",
  actual_duration_weeks: "",
  estimated_markup_pct: "",
  actual_markup_pct: "",
  was_profitable: true,
  had_delays: false,
  delay_reason: "",
  cost_overrun_reason: "",
};

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, client, onClick, onCloseOut, onEdit, onDelete }: {
  project: Project;
  client?: Client;
  onClick: () => void;
  onCloseOut: () => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const { userRole, refreshProjects } = useProjectContext();
  const canDelete = userRole === "director";
  const status = project.status || "active";
  const canCloseOut = status === "active" || status === "completed";
  async function restore(e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("projects").update({ status: "active" }).eq("id", project.id);
    await refreshProjects();
  }
  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.14] hover:bg-slate-50 dark:hover:bg-[#111820] transition-all cursor-pointer p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <Hammer size={16} className="text-cyan-400" />
        </div>
        <Badge color={STATUS_COLOR[status] || "slate"} dot>{status.replace("_", " ")}</Badge>
      </div>

      {/* Name */}
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 truncate group-hover:text-white transition-colors">
        {project.name}
      </div>

      {/* Client */}
      {client && (
        <div className="flex items-center gap-1.5 mb-3">
          <Building2 size={10} className="text-slate-700" />
          <span className="text-[10px] text-slate-600 truncate">{client.name}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/[0.05] mt-3">
        <span className="text-[10px] text-slate-700 capitalize">{project.status?.replace("_"," ") || "active"}</span>
        <div className="flex items-center gap-2">
          {canCloseOut && (
            <button
              onClick={e => { e.stopPropagation(); onCloseOut(); }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] text-emerald-400 font-semibold transition md:opacity-0 md:group-hover:opacity-100"
              title="Record project actuals for AI learning"
            >
              <TrendingUp size={9}/> Close Out
            </button>
          )}
          {status === "archived" ? (
            canDelete && (
              <button
                onClick={restore}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-400 font-semibold transition"
                title="Restore Project">
                <RotateCcw size={11}/> Restore
              </button>
            )
          ) : (
            <>
              <button
                onClick={e => { e.stopPropagation(); onEdit(project); }}
                className="p-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-blue-500/15 text-slate-500 hover:text-blue-400 transition-colors"
                title="Edit Project">
                <Edit2 size={13}/>
              </button>
              {canDelete && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(project); }}
                  className="p-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-colors"
                  title="Delete Project">
                  <Trash2 size={13}/>
                </button>
              )}
            </>
          )}
          <ArrowRight size={13} className="text-slate-700 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </div>
  );
}

// ─── Project Row (list view) ──────────────────────────────────────────────────

function ProjectRow({ project, client, onClick, onCloseOut, onEdit, onDelete }: {
  project: Project;
  client?: Client;
  onClick: () => void;
  onCloseOut: () => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const { userRole, refreshProjects } = useProjectContext();
  const canDelete = userRole === "director";
  const status = project.status || "active";
  const canCloseOut = status === "active" || status === "completed";
  async function restore(e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("projects").update({ status: "active" }).eq("id", project.id);
    await refreshProjects();
  }
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Hammer size={13} className="text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{project.name}</div>
        {client && <div className="text-[10px] text-slate-600">{client.name}</div>}
      </div>
      <Badge color={STATUS_COLOR[status] || "slate"} dot>{status.replace("_", " ")}</Badge>
      {canCloseOut && (
        <button
          onClick={e => { e.stopPropagation(); onCloseOut(); }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-[10px] text-emerald-400 font-semibold transition md:opacity-0 md:group-hover:opacity-100"
        >
          <TrendingUp size={9}/> Close Out
        </button>
      )}
      {status === "archived" ? (
        canDelete && (
          <button
            onClick={restore}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-[10px] text-blue-400 font-semibold transition"
            title="Restore">
            <RotateCcw size={11}/> Restore
          </button>
        )
      ) : (
        <>
          <button
            onClick={e => { e.stopPropagation(); onEdit(project); }}
            className="p-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-blue-500/15 text-slate-500 hover:text-blue-400 transition-colors"
            title="Edit">
            <Edit2 size={13}/>
          </button>
          {canDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(project); }}
              className="p-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-colors"
              title="Delete">
              <Trash2 size={13}/>
            </button>
          )}
        </>
      )}
      <ArrowRight size={13} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { projects, loadingProjects, refreshProjects, currentProjectId, setCurrentProjectId } = useProjectContext();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showNew, setShowNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ name: "", status: "active", client_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [deleteAction, setDeleteAction] = useState<"choosing" | "deleting" | "archiving">("choosing");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Close Out state
  const [closeOutProject, setCloseOutProject] = useState<Project | null>(null);
  const [closeOutForm, setCloseOutForm] = useState<CloseOutForm>(DEFAULT_CLOSEOUT);
  const [closeOutSaving, setCloseOutSaving] = useState(false);
  const [closeOutError, setCloseOutError] = useState<string | null>(null);
  const [closeOutSuccess, setCloseOutSuccess] = useState(false);

  const nav = useNavigate();

  useEffect(() => {
    async function loadClients() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) return;
        setCompanyId(profile.company_id);
        const { data } = await supabase
          .from("clients").select("id, name")
          .eq("company_id", profile.company_id).order("name");
        setClients(data || []);
      } catch {}
    }
    loadClients();
  }, []);

  const filtered = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    // "All" means all non-archived — archived projects only show when the
    // Archived filter is explicitly selected, matching "Archive hides it".
    const matchStatus = statusFilter === "all" ? p.status !== "archived" : p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    onHold: projects.filter(p => p.status === "on_hold").length,
  };

  async function handleRefresh() {
    setRefreshing(true);
    await refreshProjects();
    setRefreshing(false);
  }

  async function saveProject() {
    if (!form.name.trim()) return;
    setSaving(true); setError(null);
    try {
      if (editProject) {
        const { error: e } = await supabase
          .from("projects")
          .update({
            name: form.name.trim(),
            status: form.status,
            client_id: form.client_id || null,
          })
          .eq("id", editProject.id);
        if (e) throw e;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not logged in");
        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) throw new Error("No company found");
        const { error: e } = await supabase.from("projects").insert({
          name: form.name.trim(),
          status: form.status,
          client_id: form.client_id || null,
          company_id: profile.company_id,
        });
        if (e) throw e;
      }
      await refreshProjects();
      closeModal();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(p: Project) {
    setEditProject(p);
    setForm({ name: p.name, status: p.status || "active", client_id: p.client_id || "" });
    setShowNew(true);
  }

  function closeModal() {
    setShowNew(false);
    setEditProject(null);
    setForm({ name: "", status: "active", client_id: "" });
    setError(null);
  }

  async function archiveProject(p: Project) {
    setDeleteAction("archiving");
    setDeleteError(null);
    try {
      const { error: e } = await supabase.from("projects").update({ status: "archived" }).eq("id", p.id);
      if (e) { setDeleteError(e.message); return; }
      await refreshProjects();
      setDeleteConfirm(null);
      if (currentProjectId === p.id) setCurrentProjectId(null);
    } finally {
      setDeleteAction("choosing");
    }
  }

  async function deleteProject(p: Project) {
    setDeleteAction("deleting");
    setDeleteError(null);
    try {
      // Most project_id FKs already cascade at the DB level, but a few
      // (confirmed: field_payments) don't, and a handful of tables created
      // outside tracked migrations have unknown cascade behavior — deleting
      // their rows first is harmless where cascade already exists and
      // necessary where it doesn't.
      const pid = p.id;
      await supabase.from("field_payments").delete().eq("project_id", pid);
      await supabase.from("boq_headers").delete().eq("project_id", pid);
      await supabase.from("project_daily_logs").delete().eq("project_id", pid);
      await supabase.from("project_photos").delete().eq("project_id", pid);
      await supabase.from("project_issues").delete().eq("project_id", pid);
      await supabase.from("project_tasks").delete().eq("project_id", pid);
      await supabase.from("site_visits").delete().eq("project_id", pid);
      await supabase.from("project_plans").delete().eq("project_id", pid);
      await supabase.from("project_milestones").delete().eq("project_id", pid);
      await supabase.from("purchase_orders").delete().eq("project_id", pid);
      // Finally delete the project
      const { error: e } = await supabase.from("projects").delete().eq("id", pid);
      if (e) { setDeleteError(e.message); return; }
      await refreshProjects();
      setDeleteConfirm(null);
      if (currentProjectId === p.id) setCurrentProjectId(null);
    } finally {
      setDeleteAction("choosing");
    }
  }

  async function saveCloseOut() {
    if (!closeOutProject || !companyId) return;
    setCloseOutSaving(true); setCloseOutError(null);
    try {
      const { error: e } = await supabase.from("project_actuals").insert({
        company_id: companyId,
        project_id: closeOutProject.id,
        project_type: closeOutForm.project_type || null,
        client_type: closeOutForm.client_type || null,
        estimated_cost: parseFloat(closeOutForm.estimated_cost) || null,
        actual_cost: parseFloat(closeOutForm.actual_cost) || null,
        estimated_duration_weeks: parseFloat(closeOutForm.estimated_duration_weeks) || null,
        actual_duration_weeks: parseFloat(closeOutForm.actual_duration_weeks) || null,
        estimated_markup_pct: parseFloat(closeOutForm.estimated_markup_pct) || null,
        actual_markup_pct: parseFloat(closeOutForm.actual_markup_pct) || null,
        was_profitable: closeOutForm.was_profitable,
        had_delays: closeOutForm.had_delays,
        completed_at: new Date().toISOString(),
      });
      if (e) throw e;

      // Mark project as completed
      await supabase.from("projects").update({ status: "completed" }).eq("id", closeOutProject.id);
      await refreshProjects();
      setCloseOutSuccess(true);
      setTimeout(() => {
        setCloseOutProject(null);
        setCloseOutForm(DEFAULT_CLOSEOUT);
        setCloseOutSuccess(false);
      }, 2000);
    } catch (e: any) {
      setCloseOutError(e.message);
    } finally {
      setCloseOutSaving(false);
    }
  }

  function openCloseOut(project: Project) {
    setCloseOutProject(project);
    setCloseOutForm(DEFAULT_CLOSEOUT);
    setCloseOutError(null);
    setCloseOutSuccess(false);
  }

  function getClient(clientId?: string | null) {
    return clients.find(c => c.id === clientId);
  }

  const inputClass = "w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-cyan-500/40";
  const labelClass = "text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1 block";
  const selectClass = inputClass;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Projects"
        subtitle={`${stats.total} total · ${stats.active} active`}
        actions={
          <>
            <Btn variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
              onClick={handleRefresh}/>
            <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setShowNew(true)}>
              New Project
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">
        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",     value: stats.total,     color: "text-slate-800 dark:text-slate-200",   filter: "all" },
            { label: "Active",    value: stats.active,    color: "text-emerald-400", filter: "active" },
            { label: "On Hold",   value: stats.onHold,    color: "text-amber-400",   filter: "on_hold" },
            { label: "Completed", value: stats.completed, color: "text-blue-400",    filter: "completed" },
          ].map(s => (
            <button key={s.label} onClick={() => setStatusFilter(s.filter)}
              className={cn("rounded-xl border p-3 text-left transition-all",
                statusFilter === s.filter
                  ? "border-cyan-500/30 bg-cyan-500/10"
                  : "border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] hover:border-slate-300 dark:hover:border-white/[0.12]")}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Search + filters + view toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] sm:max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
            <Input className="pl-8" placeholder="Search projects..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-36">
            <option value="all">All status</option>
            {FILTER_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

        {/* Project list / grid */}
        {loadingProjects ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2"/> Loading projects...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<FolderOpen size={20}/>}
            title={search || statusFilter !== "all" ? "No projects match your filters" : "No projects yet"}
            body={search || statusFilter !== "all" ? "Try adjusting your search or filter." : "Create your first project to get started."}
            action={
              !search && statusFilter === "all"
                ? <Btn variant="primary" icon={<Plus size={13}/>} onClick={() => setShowNew(true)}>New Project</Btn>
                : <Btn variant="ghost" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</Btn>
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(p => (
              <ProjectCard
                key={p.id}
                project={p as Project}
                client={getClient((p as any).client_id)}
                onClick={() => nav(`/projects/${p.id}`)}
                onCloseOut={() => openCloseOut(p as Project)}
                onEdit={openEdit}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-200 dark:border-white/[0.06]">
              <div className="w-8 flex-shrink-0"/>
              <div className="flex-1 text-[9px] font-bold uppercase tracking-widest text-slate-700">Project</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 w-20">Status</div>
              <div className="w-5 flex-shrink-0"/>
            </div>
            {filtered.map(p => (
              <ProjectRow
                key={p.id}
                project={p as Project}
                client={getClient((p as any).client_id)}
                onClick={() => nav(`/projects/${p.id}`)}
                onCloseOut={() => openCloseOut(p as Project)}
                onEdit={openEdit}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── New / Edit Project Modal ── */}
      <Modal open={showNew} onClose={closeModal}
        title={editProject ? "Edit Project" : "New Project"}
        subtitle={editProject ? `Editing ${editProject.name}` : "Fill in the details to create a new project"}>
        <div className="space-y-4">
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
          <Field label="Project Name" error={!form.name.trim() && saving ? "Name is required" : undefined}>
            <Input placeholder="e.g. Downtown Office Complex"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus/>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          {clients.length > 0 && (
            <Field label="Client (optional)">
              <Select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
            <Btn variant="primary" onClick={saveProject} disabled={!form.name.trim() || saving}>
              {saving ? (editProject ? "Saving..." : "Creating...") : (editProject ? "Save Changes" : "Create Project")}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* ── Close Out Modal ── */}
      <Modal
        open={!!closeOutProject}
        onClose={() => { setCloseOutProject(null); setCloseOutForm(DEFAULT_CLOSEOUT); }}
        title="Close Out Project"
        subtitle={`Record actual results for ${closeOutProject?.name || ""} — this feeds AI learning`}
        width="max-w-lg"
      >
        <div className="space-y-4">
          {closeOutError && <Alert type="error" onClose={() => setCloseOutError(null)}>{closeOutError}</Alert>}

          {closeOutSuccess ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <CheckSquare size={24} className="text-emerald-400"/>
              </div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Project closed out!</div>
              <div className="text-xs text-slate-500 text-center">Actuals saved. AI will use this data to improve future bid recommendations.</div>
            </div>
          ) : (
            <>
              {/* AI learning notice */}
              <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2.5 flex gap-2">
                <TrendingUp size={13} className="text-purple-400 flex-shrink-0 mt-0.5"/>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  These actuals train the AI Bid Advisor. The more projects you close out, the more accurate future markup and duration recommendations become.
                </div>
              </div>

              {/* Project classification */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Project Type</label>
                  <select className={selectClass}
                    value={closeOutForm.project_type}
                    onChange={e => setCloseOutForm(f => ({ ...f, project_type: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="government">Government</option>
                    <option value="infrastructure">Infrastructure</option>
                    <option value="renovation">Renovation</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Client Type</label>
                  <select className={selectClass}
                    value={closeOutForm.client_type}
                    onChange={e => setCloseOutForm(f => ({ ...f, client_type: e.target.value }))}>
                    <option value="">Select...</option>
                    <option value="new">New Client</option>
                    <option value="existing">Existing Client</option>
                    <option value="government">Government</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              {/* Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Estimated Cost (JMD)</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.estimated_cost}
                    onChange={e => setCloseOutForm(f => ({ ...f, estimated_cost: e.target.value }))}/>
                </div>
                <div>
                  <label className={labelClass}>Actual Cost (JMD)</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.actual_cost}
                    onChange={e => setCloseOutForm(f => ({ ...f, actual_cost: e.target.value }))}/>
                </div>
              </div>

              {/* Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Estimated Duration (weeks)</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.estimated_duration_weeks}
                    onChange={e => setCloseOutForm(f => ({ ...f, estimated_duration_weeks: e.target.value }))}/>
                </div>
                <div>
                  <label className={labelClass}>Actual Duration (weeks)</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.actual_duration_weeks}
                    onChange={e => setCloseOutForm(f => ({ ...f, actual_duration_weeks: e.target.value }))}/>
                </div>
              </div>

              {/* Markup */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Estimated Markup %</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.estimated_markup_pct}
                    onChange={e => setCloseOutForm(f => ({ ...f, estimated_markup_pct: e.target.value }))}/>
                </div>
                <div>
                  <label className={labelClass}>Actual Markup %</label>
                  <input type="number" className={inputClass} placeholder="0"
                    value={closeOutForm.actual_markup_pct}
                    onChange={e => setCloseOutForm(f => ({ ...f, actual_markup_pct: e.target.value }))}/>
                </div>
              </div>

              {/* Outcome flags */}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={closeOutForm.was_profitable}
                    onChange={e => setCloseOutForm(f => ({ ...f, was_profitable: e.target.checked }))}
                    className="accent-emerald-500 w-3.5 h-3.5"/>
                  Was Profitable
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input type="checkbox" checked={closeOutForm.had_delays}
                    onChange={e => setCloseOutForm(f => ({ ...f, had_delays: e.target.checked }))}
                    className="accent-amber-500 w-3.5 h-3.5"/>
                  Had Delays
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                <Btn variant="ghost" onClick={() => { setCloseOutProject(null); setCloseOutForm(DEFAULT_CLOSEOUT); }}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={saveCloseOut} disabled={closeOutSaving}
                  icon={<TrendingUp size={13}/>}>
                  {closeOutSaving ? "Saving..." : "Save Actuals"}
                </Btn>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── Delete Project Modal ── */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => { if (deleteAction === "choosing") { setDeleteConfirm(null); setDeleteError(null); } }}
        title="Delete Project?"
        subtitle={deleteConfirm?.name || ""}
        width="max-w-sm">
        <div>
          <p className="text-sm text-slate-500 text-center mb-5">
            This project may have linked records. What would you like to do?
          </p>

          {deleteError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-xs">
              ⚠️ {deleteError}
            </div>
          )}

          <div className="space-y-3 mb-5">
            {/* Archive */}
            <button
              onClick={() => deleteConfirm && archiveProject(deleteConfirm)}
              disabled={deleteAction !== "choosing"}
              className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all disabled:opacity-50 text-left">
              <span className="text-2xl flex-shrink-0">🗄️</span>
              <div>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {deleteAction === "archiving" ? "Archiving..." : "Archive Project"}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Hides project from the active list. All data kept safe — restore anytime.
                </div>
              </div>
            </button>

            {/* Delete */}
            <button
              onClick={() => deleteConfirm && deleteProject(deleteConfirm)}
              disabled={deleteAction !== "choosing"}
              className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-red-200 dark:border-red-500/30 hover:border-red-400 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all disabled:opacity-50 text-left">
              <span className="text-2xl flex-shrink-0">🗑️</span>
              <div>
                <div className="text-sm font-bold text-red-600 dark:text-red-400">
                  {deleteAction === "deleting" ? "Deleting..." : "Delete Everything"}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Permanently removes the project and all linked data — payments, BOQ, photos, logs. Cannot be undone.
                </div>
              </div>
            </button>
          </div>

          <Btn variant="ghost" onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
            disabled={deleteAction !== "choosing"} className="w-full justify-center">
            Cancel
          </Btn>
        </div>
      </Modal>
    </div>
  );
}