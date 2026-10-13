// src/components/CopyMilestoneForBasesModal.tsx
//
// "Copy for bases…" on a milestone: pick the project's bases (BOQ lines named in the BOQ builder, line_name) and/or type extra names,
// and the database function duplicate_milestone_for_bases makes one copy of the milestone (and of every task in it) per base, so each
// base counts separately in the client's progress bar (progress = complete tasks / all tasks). All copies or none.
import React, { useEffect, useMemo, useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { supabase } from "../lib/supabase";

const MAX_BASES = 50;
const SEP = " – "; // matches the separator the database function puts between the milestone name and the base name

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message || "");
  return typeof e === "string" ? e : "";
}

// The project's bases = the distinct, non-empty line names on the lines of its current BOQ (the same BOQ the BOQ page opens:
// most recently updated, then highest version). Order of first appearance, case-insensitive de-duplication.
async function loadProjectBases(projectId: string): Promise<string[]> {
  const { data: headers, error: hErr } = await supabase
    .from("boq_headers").select("id,updated_at,version").eq("project_id", projectId)
    .order("updated_at", { ascending: false }).order("version", { ascending: false }).limit(1);
  if (hErr) throw hErr;
  const boqId = headers?.[0]?.id as string | undefined;
  if (!boqId) return [];
  const { data: sections, error: sErr } = await supabase.from("boq_sections").select("id,sort_order,section_no").eq("boq_id", boqId);
  if (sErr) throw sErr;
  const sectionIds = (sections || []).map((s: { id: string }) => s.id);
  if (!sectionIds.length) return [];
  const order = new Map((sections || []).map((s: { id: string; sort_order?: number | null; section_no?: number | null }, i: number) => [s.id, [s.sort_order ?? s.section_no ?? i, i] as [number, number]]));
  const { data: items, error: iErr } = await supabase.from("boq_section_items").select("section_id,sort_order,line_name").in("section_id", sectionIds);
  if (iErr) throw iErr;
  const rows = (items || []).filter((r: { line_name?: string | null }) => String(r.line_name || "").trim() !== "");
  rows.sort((a: { section_id: string; sort_order?: number | null }, b: { section_id: string; sort_order?: number | null }) => {
    const oa = order.get(a.section_id) || [0, 0], ob = order.get(b.section_id) || [0, 0];
    return oa[0] - ob[0] || oa[1] - ob[1] || (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows as { line_name: string }[]) {
    const name = r.line_name.trim();
    const key = name.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(name); }
  }
  return out;
}

export default function CopyMilestoneForBasesModal({
  projectId, milestone, taskCount, existingMilestoneNames, onClose, onDone,
}: {
  projectId: string;
  milestone: { id: string; milestone_name: string };
  taskCount: number;
  existingMilestoneNames: string[];
  onClose: () => void;
  onDone: (created: number) => void | Promise<void>;
}) {
  const [bases, setBases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());   // BOQ bases ticked (all start unticked)
  const [extras, setExtras] = useState<string[]>([]);             // names typed in (always included)
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await loadProjectBases(projectId);
        if (alive) setBases(b);
      } catch (e) {
        if (alive) setLoadError(errText(e) || "Could not load the project's bases.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId]);

  const taken = useMemo(() => new Set(existingMilestoneNames.map((n) => n.trim().toLowerCase())), [existingMilestoneNames]);
  const alreadyCopied = (name: string) => taken.has((milestone.milestone_name + SEP + name).trim().toLowerCase());

  const chosen = [...bases.filter((b) => picked.has(b) && !alreadyCopied(b)), ...extras];
  const n = chosen.length;
  const tooMany = n > MAX_BASES;

  function toggle(b: string) {
    setPicked((p) => { const next = new Set(p); if (next.has(b)) next.delete(b); else next.add(b); return next; });
  }
  function addExtra() {
    const name = newName.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if ([...bases, ...extras].some((x) => x.toLowerCase() === key)) { setError(`"${name}" is already in the list.`); return; }
    if (alreadyCopied(name)) { setError(`A milestone for "${name}" already exists.`); return; }
    setError("");
    setExtras((x) => [...x, name]);
    setNewName("");
  }

  async function create() {
    if (!n || tooMany || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("duplicate_milestone_for_bases", {
        p_milestone_id: milestone.id,
        p_bases: chosen.map((name) => ({ name })),
      });
      if (rpcError) throw rpcError;
      const created = Array.isArray(data) ? data.length : n;
      await onDone(created);
    } catch (e) {
      setError(errText(e) || "Could not create the copies.");
      setBusy(false);
    }
  }

  const input = "flex-1 min-w-0 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-cyan-500/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1117] shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Copy size={14} className="text-cyan-500" /> Copy for bases</div>
            <div className="text-[11px] text-slate-500 truncate">{milestone.milestone_name} · {taskCount} task{taskCount === 1 ? "" : "s"}</div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/[0.06] text-slate-500"><X size={14} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each base gets its own copy of this milestone and its tasks (reset to planned, 0%), so every base counts separately in the client's progress bar.
          </p>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-2">Bases from the project's BOQ</div>
            {loading ? (
              <p className="text-xs text-slate-500">Loading…</p>
            ) : loadError ? (
              <p className="text-xs text-red-500">{loadError}</p>
            ) : bases.length === 0 ? (
              <p className="text-xs text-slate-500">No named lines in the BOQ yet. Name the BOQ lines (the "Name" on a line) or add the base names below.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {bases.map((b) => {
                  const done = alreadyCopied(b);
                  return (
                    <label key={b} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${done ? "opacity-50 border-slate-200 dark:border-white/[0.05]" : "cursor-pointer border-slate-200 dark:border-white/[0.07] hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}>
                      <input type="checkbox" checked={picked.has(b) && !done} disabled={done || busy} onChange={() => toggle(b)} className="accent-cyan-600" />
                      <span className="flex-1 min-w-0 truncate text-slate-800 dark:text-slate-200">{b}</span>
                      {done && <span className="text-[10px] text-slate-500">already copied</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600 mb-2">Add a name</div>
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }}
                placeholder="e.g. Tank 5" className={input} disabled={busy} />
              <button onClick={addExtra} disabled={busy || !newName.trim()}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 text-xs font-semibold hover:bg-cyan-500/20 disabled:opacity-40 transition">
                <Plus size={12} /> Add
              </button>
            </div>
            {extras.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {extras.map((x) => (
                  <span key={x} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-600 dark:text-cyan-300">
                    {x}
                    <button onClick={() => setExtras((e) => e.filter((y) => y !== x))} disabled={busy} className="p-0.5 rounded-full hover:bg-cyan-500/20"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300">
            {n === 0
              ? "Tick the bases to copy this milestone for."
              : <>This will create <strong>{n} milestone{n === 1 ? "" : "s"}</strong> and <strong>{n * taskCount} task{n * taskCount === 1 ? "" : "s"}</strong>{taskCount > 0 ? <span className="text-slate-500"> ({n} × {taskCount})</span> : null}.</>}
            {tooMany && <div className="text-xs text-red-500 mt-1">At most {MAX_BASES} bases at a time.</div>}
            {taskCount === 0 && n > 0 && <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">This milestone has no tasks, so the copies won't change the progress bar until tasks are added to them.</div>}
          </div>

          {error && <div className="text-xs text-red-500 break-words">{error}</div>}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-200 dark:border-white/[0.07]">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition">Cancel</button>
          <button onClick={create} disabled={!n || tooMany || busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-40 transition">
            <Copy size={13} />{busy ? "Creating…" : n ? `Create ${n} cop${n === 1 ? "y" : "ies"}` : "Create copies"}
          </button>
        </div>
      </div>
    </div>
  );
}
