// src/components/MilestoneTemplates.tsx
//
// Milestone templates: save a milestone with its tasks once and add it to any future project (see migration 20260938000000_milestone_templates.sql).
//   SaveAsTemplateModal      - asks for a name and calls save_milestone_as_template
//   MilestoneTemplatesModal  - "Add from template" picker (search, task counts) with a "Manage templates" view (list, view tasks, rename, delete)
//   TemplateAddedModal       - after adding: offer "Copy for bases now?"
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
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><BookmarkPlus size={14} className="text-cyan-500" /> Save as template</div>
            <div className="text-[11px] text-slate-500 truncate">{milestone.milestone_name} · {taskCount} task{taskCount === 1 ? "" : "s"}</div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saves this milestone and its tasks (names, quantities, units, rates, crew, durations, planned costs, payment amount) so you can add it to other projects.
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

export function MilestoneTemplatesModal({ projectId, onClose, onApplied }: {
  projectId: string;
  onClose: () => void;
  // the new project_milestones row and how many tasks the template had
  onApplied: (milestone: Record<string, unknown>, taskCount: number, templateName: string) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"pick" | "manage">("pick");
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // manage view
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
    setBusyId(t.id); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("apply_milestone_template", { p_template_id: t.id, p_project_id: projectId });
      if (rpcError) throw rpcError;
      const milestone = Array.isArray(data) ? data[0] : data;
      await onApplied(milestone, t.taskCount, t.name);
    } catch (e) {
      setError(errText(e) || "Could not add the template.");
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
    if (!confirm(`Delete the template "${t.name}" and its ${t.taskCount} task${t.taskCount === 1 ? "" : "s"}?\n\nMilestones already created from it are not affected.`)) return;
    setBusyId(t.id); setError("");
    const { error: dError } = await supabase.from("milestone_templates").delete().eq("id", t.id);
    setBusyId(null);
    if (dError) { setError(errText(dError) || "Could not delete the template."); return; }
    if (openId === t.id) setOpenId(null);
    await load();
  }

  return (
    <div className={shell}>
      <div className={card}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 min-w-0">
            {mode === "manage" && (
              <button onClick={() => { setMode("pick"); setError(""); }} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><ChevronLeft size={16} /></button>
            )}
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <LayoutTemplate size={14} className="text-cyan-500" /> {mode === "pick" ? "Add from template" : "Milestone templates"}
            </div>
          </div>
          <button onClick={onClose} disabled={!!busyId} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className={`${fieldCls} pl-8`} />
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : loadError ? (
            <p className="text-xs text-red-500">{loadError}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500">No templates yet. Use "Save as template" on a milestone to make one.</p>
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
                          <div className="text-[11px] text-slate-500">
                            {t.taskCount} task{t.taskCount === 1 ? "" : "s"}{t.payment_amount ? ` · payment ${fmtJMD(Number(t.payment_amount))}` : ""}
                          </div>
                          {t.description && <div className="text-[11px] text-slate-400 truncate">{t.description}</div>}
                        </>
                      )}
                    </div>
                    {mode === "pick" ? (
                      <button onClick={() => apply(t)} disabled={!!busyId}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-40 transition flex-shrink-0">
                        <Plus size={12} />{busyId === t.id ? "Adding…" : "Add"}
                      </button>
                    ) : renamingId === t.id ? null : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => toggleTasks(t.id)} title="View tasks" className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
                          {openId === t.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Tasks
                        </button>
                        <button onClick={() => { setRenamingId(t.id); setRenameValue(t.name); setError(""); }} title="Rename" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]"><Pencil size={12} /></button>
                        <button onClick={() => remove(t)} disabled={busyId === t.id} title="Delete" className="p-1.5 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10"><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                  {mode === "manage" && openId === t.id && (
                    <div className="border-t border-slate-100 dark:border-white/[0.05] px-3 py-2 bg-slate-50 dark:bg-white/[0.02]">
                      {tasks[t.id] === "loading" ? <p className="text-xs text-slate-500">Loading…</p>
                        : (tasks[t.id] as TemplateTask[] | undefined)?.length ? (
                          <ol className="space-y-1">
                            {(tasks[t.id] as TemplateTask[]).map((k, i) => (
                              <li key={k.id} className="flex items-baseline gap-2 text-xs text-slate-700 dark:text-slate-300">
                                <span className="text-slate-400 w-4 text-right">{i + 1}.</span>
                                <span className="flex-1 min-w-0 truncate">{k.task_name}</span>
                                <span className="text-slate-500 flex-shrink-0">{k.quantity != null ? `${Number(k.quantity)} ${k.unit || ""}` : ""}{k.rate_per_unit ? ` @ ${fmtJMD(Number(k.rate_per_unit))}` : ""}</span>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="text-xs text-slate-500">This template has no tasks.</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <div className="text-xs text-red-500 break-words">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-white/[0.07]">
          {mode === "pick" ? (
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
