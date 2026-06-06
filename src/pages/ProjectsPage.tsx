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
  Building2, LayoutGrid, List, RefreshCw
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  status: string | null;
  client_id?: string | null;
};

type Client = { id: string; name: string };

const STATUS_COLOR: Record<string, any> = {
  active:    "green",
  completed: "blue",
  on_hold:   "amber",
  cancelled: "red",
  planning:  "violet",
};

const STATUS_OPTS = [
  { value: "active",    label: "Active" },
  { value: "planning",  label: "Planning" },
  { value: "on_hold",   label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, client, onClick }: {
  project: Project;
  client?: Client;
  onClick: () => void;
}) {
  const status = project.status || "active";
  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-white/[0.07] bg-[#0c1018] hover:border-white/[0.14] hover:bg-[#111820] transition-all cursor-pointer p-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <Hammer size={16} className="text-cyan-400" />
        </div>
        <Badge color={STATUS_COLOR[status] || "slate"} dot>{status.replace("_", " ")}</Badge>
      </div>

      {/* Name */}
      <div className="text-sm font-semibold text-slate-100 mb-1 truncate group-hover:text-white transition-colors">
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
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.05] mt-auto">
        <div className="flex items-center gap-3">
<span className="text-[10px] text-slate-700 capitalize">{project.status?.replace("_"," ") || "active"}</span>
        </div>
        <ArrowRight size={13} className="text-slate-700 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  );
}

// ─── Project Row (list view) ──────────────────────────────────────────────────

function ProjectRow({ project, client, onClick }: {
  project: Project;
  client?: Client;
  onClick: () => void;
}) {
  const status = project.status || "active";
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
        <Hammer size={13} className="text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-200 truncate">{project.name}</div>
        {client && <div className="text-[10px] text-slate-600">{client.name}</div>}
      </div>
      <Badge color={STATUS_COLOR[status] || "slate"} dot>{status.replace("_", " ")}</Badge>

      <ArrowRight size={13} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { projects, loadingProjects, refreshProjects } = useProjectContext();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showNew, setShowNew] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    name: "", status: "active", client_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  // Load clients for the dropdown
  useEffect(() => {
    async function loadClients() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) return;
        const { data } = await supabase
          .from("clients").select("id, name")
          .eq("company_id", profile.company_id).order("name");
        setClients(data || []);
      } catch {}
    }
    loadClients();
  }, []);

  // Filter projects
  const filtered = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
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

  async function createProject() {
    setSaving(true); setError(null);
    try {
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

      await refreshProjects();
      setShowNew(false);
      setForm({ name: "", status: "active", budget: "", description: "", client_id: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function getClient(clientId?: string | null) {
    return clients.find(c => c.id === clientId);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Projects"
        subtitle={`${stats.total} total · ${stats.active} active`}
        actions={
          <>
            <Btn
              variant="ghost" size="sm"
              icon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
              onClick={handleRefresh}
            />
            <Btn
              variant="primary" size="sm"
              icon={<Plus size={13} />}
              onClick={() => setShowNew(true)}
            >
              New Project
            </Btn>
          </>
        }
      />

      <div className="p-6 space-y-5">

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total",     value: stats.total,     color: "text-slate-200" },
            { label: "Active",    value: stats.active,    color: "text-emerald-400" },
            { label: "On Hold",   value: stats.onHold,    color: "text-amber-400" },
            { label: "Completed", value: stats.completed, color: "text-blue-400" },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(s.label === "Total" ? "all" : s.label.toLowerCase().replace(" ", "_"))}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                statusFilter === (s.label === "Total" ? "all" : s.label.toLowerCase().replace(" ", "_"))
                  ? "border-cyan-500/30 bg-cyan-500/10"
                  : "border-white/[0.07] bg-[#0c1018] hover:border-white/[0.12]"
              )}
            >
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">{s.label}</div>
              <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
            </button>
          ))}
        </div>

        {/* Search + filters + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
            <Input
              className="pl-8"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-36"
          >
            <option value="all">All status</option>
            {STATUS_OPTS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "grid" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-colors", viewMode === "list" ? "bg-white/10 text-slate-200" : "text-slate-600 hover:text-slate-400")}
            >
              <List size={13} />
            </button>
          </div>
        </div>

        {/* Project list / grid */}
        {loadingProjects ? (
          <div className="flex items-center justify-center py-16 text-xs text-slate-600">
            <RefreshCw size={14} className="animate-spin mr-2" /> Loading projects...
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            icon={<FolderOpen size={20} />}
            title={search || statusFilter !== "all" ? "No projects match your filters" : "No projects yet"}
            body={search || statusFilter !== "all" ? "Try adjusting your search or filter." : "Create your first project to get started."}
            action={
              !search && statusFilter === "all"
                ? <Btn variant="primary" icon={<Plus size={13} />} onClick={() => setShowNew(true)}>New Project</Btn>
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
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.07] bg-[#0c1018] overflow-hidden">
            {/* List header */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-white/[0.06]">
              <div className="w-8 flex-shrink-0" />
              <div className="flex-1 text-[9px] font-bold uppercase tracking-widest text-slate-700">Project</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-700 w-20">Status</div>

              <div className="w-5 flex-shrink-0" />
            </div>
            {filtered.map(p => (
              <ProjectRow
                key={p.id}
                project={p as Project}
                client={getClient((p as any).client_id)}
                onClick={() => nav(`/projects/${p.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── New Project Modal ── */}
      <Modal
        open={showNew}
        onClose={() => { setShowNew(false); setError(null); }}
        title="New Project"
        subtitle="Fill in the details to create a new project"
      >
        <div className="space-y-4">
          {error && (
            <Alert type="error" onClose={() => setError(null)}>{error}</Alert>
          )}

          <Field label="Project Name" error={!form.name.trim() && saving ? "Name is required" : undefined}>
            <Input
              placeholder="e.g. Downtown Office Complex"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-1 gap-4">
            <Field label="Status">
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>

  
          </div>

          {clients.length > 0 && (
            <Field label="Client (optional)">
              <Select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">No client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}

<div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <Btn variant="ghost" onClick={() => { setShowNew(false); setError(null); }}>
              Cancel
            </Btn>
            <Btn
              variant="primary"
              onClick={createProject}
              disabled={!form.name.trim() || saving}
            >
              {saving ? "Creating..." : "Create Project"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
