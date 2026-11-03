// src/components/MilestoneTemplates.tsx
//
// Task templates (stored as milestone_templates + milestone_template_tasks, migration 20260938000000): save a milestone's TASKS once
// and add them into any milestone - e.g. one made from the BOQ - instead of adding a whole milestone.
//   SaveAsTemplateModal      - asks for a name and calls save_milestone_as_template (saves the milestone's tasks)
//   MilestoneTemplatesModal  - with a milestone: "Add tasks from template" into it (tasks with the same name already in that milestone
//                              are skipped); without one: "Task templates" manager (view tasks, remove a task, rename, delete)
//   TemplateAddedModal       - (older whole-milestone flow, no longer opened)
// Tasks keep their takeoff links (linked assembly / item), so Takeoff measurements made with that milestone active still add to them.
// Access is company-scoped by the database (row-level security); renaming and deleting are plain updates/deletes.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkPlus, ChevronDown, ChevronLeft, ChevronRight, Copy, LayoutTemplate, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message || "");
  return typeof e === "string" ? e : "";
}
const fmtJMD = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", maximumFractionDigits: 0 }).format(n || 0);
const fieldCls = "w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-cyan-500/50";
const shell = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";
const card = "w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl max-h-[90vh] flex flex-col";

// ── Save as template ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function SaveAsTemplateModal({ milestone, taskCount, onClose, onSaved }: {
  milestone: { id: string; milestone_name: string };
  taskCount: number;
  onClose: () => void;
  onSaved: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(milestone.milestone_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const clean = name.trim();
    if (!clean) { setError("Give the template a name."); return; }
    setBusy(true); setError("");
    try {
      const { error: rpcError } = await supabase.rpc("save_milestone_as_template", { p_milestone_id: milestone.id, p_name: clean });
      if (rpcError) throw rpcError;
      await onSaved(clean);
    } catch (e) {
      setError(errText(e) || "Could not save the template.");
      setBusy(false);
    }
  }

  return (
    <div className={shell}>
      <div className={card}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><BookmarkPlus size={14} className="text-cyan-500" /> Save tasks as template</div>
            <div className="text-[11px] text-slate-500 truncate">{milestone.milestone_name} · {taskCount} task{taskCount === 1 ? "" : "s"}</div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saves this milestone's tasks (names, quantities, units, worker rates, crew, durations, takeoff links) as a task template, so you can add them into any milestone, in this project or another.
            Dates, BOQ links and progress are not saved.
          </p>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 block mb-1">Template name</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
              placeholder="e.g. Water tank" className={fieldCls} disabled={busy} />
          </div>
          {error && <div className="text-xs text-red-500 break-words">{error}</div>}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/[0.07]">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 transition">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-40 transition">
            <BookmarkPlus size={13} />{busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add from template (+ manage) ───────────────────────────────────────────────────────────────────────────────────────────────────────
interface TemplateRow { id: string; name: string; description: string | null; payment_amount: number | null; taskCount: number; }
interface TemplateTask { id: string; task_name: string; quantity: number | null; unit: string | null; rate_per_unit: number | null; trade_type: string | null; }

// Copy a template task into a project task. Columns some databases don't have yet are dropped and the insert is retried.
async function insertTasksTolerant(rows: Record<string, unknown>[]): Promise<void> {
  let list = rows;
  for (let tries = 0; tries < 12; tries++) {
    const { error } = await supabase.from("project_tasks").insert(list);
    if (!error) return;
    const m = error.message.match(/'([a-z_]+)' column|column "?([a-z_]+)"? (?:of relation "project_tasks" )?does not exist/i);
    const col = m?.[1] || m?.[2];
    if (!col || !(col in (list[0] || {}))) throw new Error(error.message);
    list = list.map((r) => { const c = { ...r }; delete c[col]; return c; });
  }
  throw new Error("The tasks could not be saved.");
}

const taskKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function MilestoneTemplatesModal({ projectId, milestone, existingTaskNames = [], onClose, onApplied }: {
  projectId: string;
  /** The milestone the tasks go into. Without one, the window only manages the templates. */
  milestone?: { id: string; milestone_name: string } | null;
  /** Task names already in that milestone: tasks with the same name are skipped. */
  existingTaskNames?: string[];
  onClose: () => void;
  onApplied?: (added: number, skipped: number, templateName: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"pick" | "manage">(milestone ? "pick" : "manage");
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, TemplateTask[] | "loading">>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const { data, error: qError } = await supabase.from("milestone_templates")
        .select("id,name,description,payment_amount,milestone_template_tasks(count)").order("name", { ascending: true });
      if (qError) throw qError;
      setRows(((data || []) as unknown as { id: string; name: string; description?: string | null; payment_amount?: number | null; milestone_template_tasks?: { count?: number }[] }[]).map((t) => ({
        id: t.id, name: t.name, description: t.description ?? null, payment_amount: t.payment_amount ?? null,
        taskCount: Array.isArray(t.milestone_template_tasks) ? Number(t.milestone_template_tasks[0]?.count ?? 0) : 0,
      })));
    } catch (e) {
      setLoadError(errText(e) || "Could not load the templates.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? rows.filter((r) => r.name.toLowerCase().includes(s) || (r.description || "").toLowerCase().includes(s)) : rows;
  }, [rows, search]);

  async function apply(t: TemplateRow) {
    if (!milestone) return;
    setBusyId(t.id); setError("");
    try {
      const { data, error: qError } = await supabase.from("milestone_template_tasks").select("*").eq("template_id", t.id).order("sort_order", { ascending: true });
      if (qError) throw qError;
      const have = new Set(existingTaskNames.map(taskKey));
      const list = (data || []) as Record<string, unknown>[];
      const fresh = list.filter((k) => !have.has(taskKey(String(k.task_name || ""))));
      if (fresh.length > 0) {
        const base = Date.now();
        await insertTasksTolerant(fresh.map((k, i) => ({
          project_id: projectId, milestone_id: milestone.id, task_name: k.task_name, task_description: k.task_description ?? null,
          trade_type: k.trade_type ?? null, status: "planned", percent_complete: 0,
          // A task linked to a takeoff item starts at 0: Takeoff ADDS its measurements to the quantity, so the old project's measured
          // amount saved in the template must not be kept. Other tasks keep the template's quantity.
          quantity: (k.linked_assembly_id || k.linked_item_id) ? 0 : (k.quantity ?? null), unit: k.unit ?? null, rate_per_unit: k.rate_per_unit ?? null,
          crew_size: k.crew_size ?? null, production_rate_per_day: k.production_rate_per_day ?? null,
          weather_impact_factor: k.weather_impact_factor ?? null, labor_cost_per_day: k.labor_cost_per_day ?? null,
          equipment_cost_per_day: k.equipment_cost_per_day ?? null, material_cost_total: k.material_cost_total ?? null,
          // takeoff links: measurements of the same assembly / item in this milestone add to these tasks
          linked_assembly_id: k.linked_assembly_id ?? null, linked_item_id: k.linked_item_id ?? null,
          linked_assembly_name: k.linked_assembly_name ?? null, linked_item_name: k.linked_item_name ?? null,
          // keeps the template's order
          created_at: new Date(base + i).toISOString(),
        })));
      }
      setBusyId(null);
      await onApplied?.(fresh.length, list.length - fresh.length, t.name);
    } catch (e) {
      setError(errText(e) || "Could not add the tasks.");
      setBusyId(null);
    }
  }

  async function toggleTasks(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (tasks[id] && tasks[id] !== "loading") return;
    setTasks((m) => ({ ...m, [id]: "loading" }));
    const { data, error: qError } = await supabase.from("milestone_template_tasks")
      .select("id,task_name,quantity,unit,rate_per_unit,trade_type").eq("template_id", id).order("sort_order", { ascending: true });
    if (qError) { setError(errText(qError)); setTasks((m) => ({ ...m, [id]: [] })); return; }
    setTasks((m) => ({ ...m, [id]: (data || []) as TemplateTask[] }));
  }

  async function removeTask(templateId: string, k: TemplateTask) {
    if (!confirm(`Remove "${k.task_name}" from this template?\n\nTasks already added to milestones are not affected.`)) return;
    setBusyId(templateId); setError("");
    const { error: dError } = await supabase.from("milestone_template_tasks").delete().eq("id", k.id);
    setBusyId(null);
    if (dError) { setError(errText(dError) || "Could not remove the task."); return; }
    setTasks((m) => ({ ...m, [templateId]: ((m[templateId] as TemplateTask[]) || []).filter((x) => x.id !== k.id) }));
    setRows((r) => r.map((x) => (x.id === templateId ? { ...x, taskCount: Math.max(0, x.taskCount - 1) } : x)));
  }

  async function rename(t: TemplateRow) {
    const name = renameValue.trim();
    if (!name) { setError("Give the template a name."); return; }
    if (name === t.name) { setRenamingId(null); return; }
    setBusyId(t.id); setError("");
    const { error: uError } = await supabase.from("milestone_templates").update({ name }).eq("id", t.id);
    setBusyId(null);
    if (uError) { setError(/duplicate key|unique/i.test(errText(uError)) ? `A template named "${name}" already exists.` : errText(uError)); return; }
    setRenamingId(null);
    await load();
  }

  async function remove(t: TemplateRow) {
    if (!confirm(`Delete the template "${t.name}" and its ${t.taskCount} task${t.taskCount === 1 ? "" : "s"}?\n\nTasks already added to milestones are not affected.`)) return;
    setBusyId(t.id); setError("");
    const { error: dError } = await supabase.from("milestone_templates").delete().eq("id", t.id);
    setBusyId(null);
    if (dError) { setError(errText(dError) || "Could not delete the template."); return; }
    if (openId === t.id) setOpenId(null);
    await load();
  }

  const showTaskList = (t: TemplateRow) => openId === t.id && (
    <div className="border-t border-slate-100 dark:border-white/[0.05] px-3 py-2 bg-slate-50 dark:bg-white/[0.02]">
      {tasks[t.id] === "loading" ? <p className="text-xs text-slate-500">Loading…</p>
        : (tasks[t.id] as TemplateTask[] | undefined)?.length ? (
          <ol className="space-y-1">
            {(tasks[t.id] as TemplateTask[]).map((k, i) => (
              <li key={k.id} className="flex items-baseline gap-2 text-xs text-slate-700 dark:text-slate-300">
                <span className="text-slate-400 w-4 text-right">{i + 1}.</span>
                <span className="flex-1 min-w-0 truncate">{k.task_name}</span>
                <span className="text-slate-500 flex-shrink-0">{k.quantity != null ? `${Number(k.quantity)} ${k.unit || ""}` : ""}{k.rate_per_unit ? ` @ ${fmtJMD(Number(k.rate_per_unit))}` : ""}</span>
                {mode === "manage" && (
                  <button onClick={() => removeTask(t.id, k)} disabled={busyId === t.id} title="Remove this task from the template"
                    className="p-0.5 rounded text-slate-400 hover:text-red-500"><Trash2 size={11} /></button>
                )}
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-slate-500">This template has no tasks.</p>}
    </div>
  );

  return (
    <div className={shell}>
      <div className={card}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 min-w-0">
            {mode === "manage" && milestone && (
              <button onClick={() => { setMode("pick"); setError(""); }} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><ChevronLeft size={16} /></button>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <LayoutTemplate size={14} className="text-cyan-500" /> {mode === "pick" ? "Add tasks from template" : "Task templates"}
              </div>
              {mode === "pick" && milestone && <div className="text-[11px] text-slate-500 truncate">Into: {milestone.milestone_name}</div>}
            </div>
          </div>
          <button onClick={onClose} disabled={!!busyId} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className={`${fieldCls} pl-8`} />
          </div>
          {mode === "pick" && (
            <p className="text-[11px] text-slate-500">The template's tasks are added into this milestone. Tasks with the same name already in it are skipped. Tasks linked to a takeoff item start at 0 and are filled from Takeoff (make this milestone the active one there).</p>
          )}

          {loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : loadError ? (
            <p className="text-xs text-red-500">{loadError}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500">No templates yet. Build the tasks in a milestone once, then use "Save tasks as template" on it.</p>
          ) : shown.length === 0 ? (
            <p className="text-xs text-slate-500">No template matches "{search}".</p>
          ) : (
            <div className="space-y-2">
              {shown.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 dark:border-white/[0.07]">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      {mode === "manage" && renamingId === t.id ? (
                        <div className="flex gap-2">
                          <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void rename(t); if (e.key === "Escape") setRenamingId(null); }} className={fieldCls} />
                          <button onClick={() => rename(t)} disabled={busyId === t.id} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40">Save</button>
                          <button onClick={() => setRenamingId(null)} className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-xs text-slate-600 dark:text-slate-400">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{t.name}</div>
                          <div className="text-[11px] text-slate-500">{t.taskCount} task{t.taskCount === 1 ? "" : "s"}</div>
                          {t.description && <div className="text-[11px] text-slate-400 truncate">{t.description}</div>}
                        </>
                      )}
                    </div>
                    {renamingId === t.id && mode === "manage" ? null : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => toggleTasks(t.id)} title="View tasks" className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                          {openId === t.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Tasks
                        </button>
                        {mode === "pick" ? (
                          <button onClick={() => apply(t)} disabled={!!busyId || t.taskCount === 0}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40 transition">
                            <Plus size={12} />{busyId === t.id ? "Adding…" : "Add tasks"}
                          </button>
                        ) : (
                          <>
                            <button onClick={() => { setRenamingId(t.id); setRenameValue(t.name); setError(""); }} title="Rename" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><Pencil size={12} /></button>
                            <button onClick={() => remove(t)} disabled={busyId === t.id} title="Delete" className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {showTaskList(t)}
                </div>
              ))}
            </div>
          )}

          {error && <div className="text-xs text-red-500 break-words">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-white/[0.07]">
          {!milestone ? <span /> : mode === "pick" ? (
            <button onClick={() => { setMode("manage"); setError(""); }} className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">Manage templates</button>
          ) : (
            <button onClick={() => { setMode("pick"); setError(""); }} className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline">Back to adding</button>
          )}
          <button onClick={onClose} disabled={!!busyId} className="px-4 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 transition">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── After adding ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function TemplateAddedModal({ name, taskCount, onNotNow, onCopyForBases }: {
  name: string; taskCount: number; onNotNow: () => void; onCopyForBases: () => void;
}) {
  return (
    <div className={shell}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl p-5 space-y-4">
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Added "{name}"</div>
          <p className="text-xs text-slate-500 mt-1">{taskCount} task{taskCount === 1 ? "" : "s"} added to this project. Is this milestone needed for several bases (tanks, units…)?</p>
        </div>
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Copy for bases now?</div>
        <div className="flex gap-2">
          <button onClick={onNotNow} className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 transition">Not now</button>
          <button onClick={onCopyForBases} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition">
            <Copy size={13} /> Copy for bases…
          </button>
        </div>
      </div>
    </div>
  );
}
