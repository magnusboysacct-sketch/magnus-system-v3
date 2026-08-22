// src/pages/secretary/TaskTrackerSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { CheckSquare, Square, Circle, Plus, Pencil, Trash2, User as UserIcon } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Modal, Field, Input, Textarea, Select, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";

type TaskStatus = "open" | "in_progress" | "done";

type AdminTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string;
};

// Real user_profiles.role is any of the 7 real values, not just
// secretary/admin/director — this is office/admin work assignable to any
// team member with an account (estimator, supervisor, office_user, etc.),
// not construction labor, so the picker pulls from user_profiles, not
// workers.
type TeamMember = {
  id: string;
  full_name: string | null;
  email: string | null;
};

const STATUS_LABEL: Record<TaskStatus, string> = { open: "Open", in_progress: "In Progress", done: "Done" };
const STATUS_ORDER: TaskStatus[] = ["open", "in_progress", "done"];

// UTC-midnight-safe parsing — new Date(isoString) treats a bare "YYYY-MM-DD"
// as UTC midnight, which can silently shift a day off depending on the
// browser's timezone. Same discipline established in SchedulingSection.tsx.
function dateOnly(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return parseDate(iso).toLocaleDateString("en-JM", { year: "numeric", month: "short", day: "numeric" });
}
function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "done") return false;
  return parseDate(dueDate).getTime() < dateOnly(new Date()).getTime();
}

function memberName(m: TeamMember | undefined): string {
  if (!m) return "";
  return m.full_name || m.email || "";
}

export default function TaskTrackerSection() {
  const [companyId, setCompanyId] = useState<string>("");
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add/Edit modal state — editingId null means creating new (insert on
  // save); set means editing that row (update, no duplicate).
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("open");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => { init(); }, []);

  async function init() {
    setLoading(true);
    setLoadErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadErr("Not signed in."); setLoading(false); return; }

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profileErr || !profile?.company_id) { setLoadErr("Could not load company."); setLoading(false); return; }
      setCompanyId(profile.company_id);

      const [{ data: tasksData, error: tasksErr }, { data: teamData, error: teamErr }] = await Promise.all([
        supabase.from("admin_tasks")
          .select("id, title, description, status, due_date, assigned_to, created_at")
          .eq("company_id", profile.company_id),
        supabase.from("user_profiles")
          .select("id, full_name, email")
          .eq("company_id", profile.company_id)
          .order("full_name"),
      ]);
      if (tasksErr) throw tasksErr;
      if (teamErr) throw teamErr;
      setTasks((tasksData || []) as AdminTask[]);
      setTeam((teamData || []) as TeamMember[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load tasks.");
    }
    setLoading(false);
  }

  const teamById = useMemo(() => new Map(team.map(m => [m.id, m])), [team]);

  const grouped = useMemo(() => {
    const g: Record<TaskStatus, AdminTask[]> = { open: [], in_progress: [], done: [] };
    for (const t of tasks) g[t.status].push(t);
    // Sorted by due_date ascending within each group, nulls last.
    for (const s of STATUS_ORDER) {
      g[s].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
      });
    }
    return g;
  }, [tasks]);

  function openAdd() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setStatus("open");
    setDueDate("");
    setAssignedTo("");
    setSaveErr("");
    setModalOpen(true);
  }

  function openEdit(t: AdminTask) {
    setEditingId(t.id);
    setTitle(t.title);
    setDescription(t.description || "");
    setStatus(t.status);
    setDueDate(t.due_date || "");
    setAssignedTo(t.assigned_to || "");
    setSaveErr("");
    setModalOpen(true);
  }

  async function saveTask() {
    if (!title.trim()) { setSaveErr("Enter a title."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        due_date: dueDate || null,
        assigned_to: assignedTo || null,
      };
      if (editingId) {
        const { error: updateErr } = await supabase.from("admin_tasks").update(payload).eq("id", editingId);
        if (updateErr) throw updateErr;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase.from("admin_tasks").insert({
          ...payload,
          company_id: companyId,
          created_by: user?.id || null,
        });
        if (insertErr) throw insertErr;
      }
      setModalOpen(false);
      setEditingId(null);
      await init();
    } catch (e: any) {
      setSaveErr(e.message || "Failed to save task.");
    }
    setSaving(false);
  }

  async function deleteTask(t: AdminTask) {
    if (!window.confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    setBusyId(t.id);
    setActionErr("");
    const { error: err } = await supabase.from("admin_tasks").delete().eq("id", t.id);
    if (err) setActionErr(err.message || "Failed to delete.");
    else await init();
    setBusyId(null);
  }

  // Quick toggle between open/done via the checkbox icon — a lightweight
  // shortcut alongside full Edit, not a replacement for it (still the only
  // way to set in_progress or change other fields).
  async function toggleDone(t: AdminTask) {
    setBusyId(t.id);
    setActionErr("");
    const newStatus: TaskStatus = t.status === "done" ? "open" : "done";
    const { error: err } = await supabase.from("admin_tasks").update({ status: newStatus }).eq("id", t.id);
    if (err) setActionErr(err.message || "Failed to update.");
    else await init();
    setBusyId(null);
  }

  function TaskRow({ t }: { t: AdminTask }) {
    const overdue = isOverdue(t.due_date, t.status);
    const assignee = memberName(teamById.get(t.assigned_to || ""));
    return (
      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => toggleDone(t)} disabled={busyId === t.id} className="flex-shrink-0">
            {t.status === "done"
              ? <CheckSquare size={15} className="text-emerald-400" />
              : t.status === "in_progress"
                ? <Circle size={15} className="text-cyan-400" />
                : <Square size={15} className="text-slate-400" />}
          </button>
          <div className="min-w-0">
            <span className={`text-xs font-semibold truncate block ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"}`}>{t.title}</span>
            {(t.due_date || assignee) && (
              <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                {t.due_date && <span>Due {formatDate(t.due_date)}</span>}
                {assignee && <span className="inline-flex items-center gap-1"><UserIcon size={10} />{assignee}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {overdue && <Badge color="red">Overdue</Badge>}
          <Btn variant="secondary" size="xs" icon={<Pencil size={11} />} onClick={() => openEdit(t)} />
          <Btn variant="secondary" size="xs" icon={<Trash2 size={11} />} disabled={busyId === t.id} onClick={() => deleteTask(t)} />
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-16 flex justify-center"><Spinner /></div>;
  }

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Admin To-Do" subtitle="Company-admin tasks — separate from project tasks" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={openAdd}>Add Task</Btn>
        </div>

        {tasks.length === 0 ? (
          <Empty icon={<CheckSquare size={22} />} title="No tasks yet" body="Add your first admin task above." />
        ) : (
          <div className="space-y-4">
            {STATUS_ORDER.map(s => (
              <div key={s}>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-1.5">
                  {STATUS_LABEL[s]} <span className="text-slate-400">({grouped[s].length})</span>
                </div>
                {grouped[s].length === 0 ? (
                  <p className="text-xs text-slate-400 pl-1">Nothing here.</p>
                ) : (
                  <div className="space-y-2">
                    {grouped[s].map(t => <TaskRow key={t.id} t={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        title={editingId ? "Edit Task" : "Add Task"}
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Renew general liability insurance" />
          </Field>
          <Field label="Description" hint="Optional">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            </Field>
            <Field label="Due Date" hint="Optional">
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Assigned To" hint="Optional — any real team member, not just Secretary Workspace users">
            <Select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">— Unassigned —</option>
              {team.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
            </Select>
          </Field>

          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => { setModalOpen(false); setEditingId(null); }}>Cancel</Btn>
            <Btn variant="primary" size="sm" disabled={saving} onClick={saveTask}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Task"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
