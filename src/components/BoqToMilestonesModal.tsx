// src/components/BoqToMilestonesModal.tsx — "Add from BOQ" on a project's Milestones tab.
// Tick lines of the project's BOQ and add them as: one milestone per line, one new milestone with the lines as its tasks,
// or tasks inside an existing milestone (e.g. one added from a template).
// Money: the BOQ amount (qty x rate, the CLIENT's price) goes on the milestone's payment amount. A task's rate is what the
// WORKER is paid (field payments use it), so it is left empty for you to fill; the BOQ rate is noted in the task description.
// Lines whose name is already a milestone or task in this project are marked "already added" (the BOQ gives its lines new ids
// every time it is saved, so the name is what lasts); they can still be ticked on purpose.

import { useEffect, useMemo, useState } from "react";
import { Modal, Field, Input, Select, Btn } from "./ui";
import { supabase } from "../lib/supabase";

type Mode = "each" | "one" | "existing";
interface BoqRow {
  key: string; section_id: string; section: string; item_id: string | null; name: string; qty: number; unit: string; rate: number; amount: number; assembly: boolean;
}

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const qtyText = (q: number) => String(Math.round(q * 1000) / 1000);

async function loadBoqRows(projectId: string): Promise<BoqRow[]> {
  const { data: headers, error: hErr } = await supabase.from("boq_headers").select("id, updated_at").eq("project_id", projectId)
    .order("updated_at", { ascending: false }).limit(1);
  if (hErr) throw new Error(hErr.message);
  const boqId = headers?.[0]?.id as string | undefined;
  if (!boqId) return [];
  const { data: sections, error: sErr } = await supabase.from("boq_sections").select("id, sort_order, title").eq("boq_id", boqId).order("sort_order");
  if (sErr) throw new Error(sErr.message);
  const secs = (sections || []) as { id: string; sort_order: number; title: string | null }[];
  if (secs.length === 0) return [];
  // line_name is newer: read without it if the database doesn't have it yet.
  const cols = "id, section_id, sort_order, item_name, description, pick_item, unit_id, qty, rate, assembly_instance_id, assembly_name";
  const read = async (c: string): Promise<{ data: unknown[] | null; error: { message: string } | null }> => {
    const r = await supabase.from("boq_section_items").select(c).in("section_id", secs.map((x) => x.id)).order("sort_order");
    return { data: (r.data as unknown[] | null) ?? null, error: r.error };
  };
  let res = await read(cols + ", line_name");
  if (res.error) res = await read(cols);
  if (res.error) throw new Error(res.error.message);
  type Item = { id: string; section_id: string; sort_order: number; item_name: string | null; description: string | null; pick_item: string | null;
    unit_id: string | null; qty: number | null; rate: number | null; assembly_instance_id: string | null; assembly_name: string | null; line_name?: string | null };
  const items = (res.data || []) as unknown as Item[];
  const unitIds = [...new Set(items.map((i) => i.unit_id).filter(Boolean))] as string[];
  const units = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: u } = await supabase.from("master_units").select("id, name").in("id", unitIds);
    for (const x of (u || []) as { id: string; name: string }[]) units.set(x.id, x.name);
  }
  const rows: BoqRow[] = [];
  for (const s of secs) {
    const title = (s.title || "").trim() || "Section";
    const mine = items.filter((i) => i.section_id === s.id).sort((a, b) => a.sort_order - b.sort_order);
    const seenAssembly = new Set<string>();
    for (const i of mine) {
      if (i.assembly_instance_id) {
        // An assembly (e.g. a wall made of blocks, mortar, steel) comes in as ONE line: its parts added together.
        if (seenAssembly.has(i.assembly_instance_id)) continue;
        seenAssembly.add(i.assembly_instance_id);
        const parts = mine.filter((p) => p.assembly_instance_id === i.assembly_instance_id);
        const amount = parts.reduce((t, p) => t + Number(p.qty || 0) * Number(p.rate || 0), 0);
        rows.push({ key: `a-${i.assembly_instance_id}`, section_id: s.id, section: title, item_id: null,
          name: (i.assembly_name || i.item_name || "Assembly").trim(), qty: 1, unit: "lot", rate: amount, amount, assembly: true });
        continue;
      }
      const name = (i.line_name || i.item_name || i.pick_item || i.description || "").trim();
      if (!name) continue;
      const qty = Number(i.qty || 0), rate = Number(i.rate || 0);
      rows.push({ key: `i-${i.id}`, section_id: s.id, section: title, item_id: i.id, name, qty,
        unit: (i.unit_id && units.get(i.unit_id)) || "", rate, amount: qty * rate, assembly: false });
    }
  }
  return rows;
}

export default function BoqToMilestonesModal({ open, onClose, projectId, companyId, milestones, existingNames, onDone }: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  companyId: string | null;
  milestones: { id: string; milestone_name: string; milestone_no: number | null }[];
  /** Names of the project's milestones and tasks, to mark lines already added. */
  existingNames: string[];
  onDone: (message: string) => void;
}) {
  const [rows, setRows] = useState<BoqRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("each");
  const [newName, setNewName] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null); setPicked(new Set()); setMode("each"); setNewName(""); setTargetId(""); setError(null);
    loadBoqRows(projectId).then((r) => { if (alive) setRows(r); })
      .catch((e: unknown) => { if (alive) { setRows([]); setError(e instanceof Error ? e.message : "Could not load the BOQ."); } });
    return () => { alive = false; };
  }, [open, projectId]);

  const known = useMemo(() => new Set(existingNames.map(norm)), [existingNames]);
  const chosen = (rows || []).filter((r) => picked.has(r.key));
  const chosenTotal = chosen.reduce((t, r) => t + r.amount, 0);
  const sections = useMemo(() => [...new Set((rows || []).map((r) => r.section))], [rows]);

  function toggle(key: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function taskPayload(r: BoqRow, milestoneId: string) {
    return {
      project_id: projectId, milestone_id: milestoneId, task_name: r.name.slice(0, 200), status: "planned", percent_complete: 0,
      quantity: r.qty || null, unit: r.unit || null,
      task_description: `From the BOQ (${r.section})${r.qty ? `: ${qtyText(r.qty)} ${r.unit}` : ""}. BOQ price ${jmd(r.rate)}${r.unit ? ` per ${r.unit}` : ""} = ${jmd(r.amount)}. Set the worker's rate yourself.`,
      boq_section_id: r.section_id, boq_item_id: r.item_id, quantity_source_type: "boq", quantity_source_value: r.qty || 0,
    };
  }

  // The BOQ link columns on tasks (boq_section_id, boq_item_id, quantity_source_*) are from an older update that not every
  // database has. If they are missing, the tasks are saved without them (the link is only a note; nothing needs it).
  async function insertTasks(list: ReturnType<typeof taskPayload>[]) {
    const first = await supabase.from("project_tasks").insert(list);
    if (!first.error) return;
    if (!/(boq_|quantity_source).*(schema cache|does not exist)|(schema cache|does not exist).*(boq_|quantity_source)/i.test(first.error.message)) {
      throw new Error(first.error.message);
    }
    const linkCols = ["boq_section_id", "boq_item_id", "quantity_source_type", "quantity_source_value"];
    const plain = list.map((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !linkCols.includes(k))));
    const second = await supabase.from("project_tasks").insert(plain);
    if (second.error) throw new Error(second.error.message);
  }

  async function addMilestone(name: string, description: string, payment: number, no: number): Promise<string> {
    const { data, error: e } = await supabase.from("project_milestones").insert({
      project_id: projectId, company_id: companyId, milestone_name: name.slice(0, 200), description, status: "planned",
      planned_labour_cost: 0, planned_material_cost: 0, planned_equipment_cost: 0, payment_amount: Math.round(payment * 100) / 100, milestone_no: no,
    }).select("id").single();
    if (e) throw new Error(e.message);
    return (data as { id: string }).id;
  }

  async function add() {
    if (busy) return;
    setError(null);
    if (chosen.length === 0) { setError("Tick at least one BOQ line."); return; }
    if (mode === "one" && !newName.trim()) { setError("Type a name for the new milestone."); return; }
    if (mode === "existing" && !targetId) { setError("Choose the milestone to add the tasks to."); return; }
    if (!companyId) { setError("Your company is still loading. Try again."); return; }
    setBusy(true);
    let made = 0;
    try {
      let no = Math.max(0, ...milestones.map((m) => Number(m.milestone_no || 0))) + 1;
      if (mode === "each") {
        for (const r of chosen) {
          const id = await addMilestone(r.name, `From the BOQ (${r.section})${r.qty ? `: ${qtyText(r.qty)} ${r.unit}` : ""}. BOQ amount ${jmd(r.amount)}.`, r.amount, no++);
          await insertTasks([taskPayload(r, id)]);
          made++;
        }
        onDone(`${made} milestone${made === 1 ? "" : "s"} added from the BOQ (each with its task).`);
      } else {
        const milestoneId = mode === "one"
          ? await addMilestone(newName.trim(), `From the BOQ: ${chosen.length} line${chosen.length === 1 ? "" : "s"}, BOQ amount ${jmd(chosenTotal)}.`, chosenTotal, no)
          : targetId;
        await insertTasks(chosen.map((r) => taskPayload(r, milestoneId)));
        made = chosen.length;
        const target = mode === "one" ? newName.trim() : milestones.find((m) => m.id === targetId)?.milestone_name;
        onDone(`${made} task${made === 1 ? "" : "s"} from the BOQ added to "${target}".`);
      }
      onClose();
    } catch (e: unknown) {
      setError(`${e instanceof Error ? e.message : "Not added."}${made > 0 ? ` (${made} were added before this.)` : ""}`);
      if (made > 0) onDone(`${made} added from the BOQ before a problem stopped the rest.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Add from BOQ" width="max-w-3xl"
      subtitle="Tick the BOQ lines to add as milestones or tasks.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        {rows === null ? <div className="text-xs text-slate-500">Loading the BOQ...</div>
          : rows.length === 0 ? <div className="text-xs text-slate-500">This project has no BOQ lines yet. Build the BOQ first (BOQ button on the project).</div>
          : (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/[0.07]">
              {sections.map((sec) => (
                <div key={sec}>
                  <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400">{sec}</div>
                  {rows.filter((r) => r.section === sec).map((r) => {
                    const already = known.has(norm(r.name));
                    return (
                      <label key={r.key} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-slate-100 dark:border-white/[0.04] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} />
                        <span className="min-w-0 flex-1">
                          <span className={already ? "text-slate-400" : "text-slate-800 dark:text-slate-200"}>{r.name}</span>
                          {r.assembly && <span className="ml-1 text-[10px] text-slate-400">(assembly)</span>}
                          {already && <span className="ml-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">already added</span>}
                        </span>
                        <span className="w-24 text-right text-slate-500">{r.qty ? `${qtyText(r.qty)} ${r.unit}` : ""}</span>
                        <span className="w-28 text-right font-semibold text-slate-700 dark:text-slate-300">{jmd(r.amount)}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

        {rows && rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">{chosen.length} ticked · {jmd(chosenTotal)}</span>
              <Btn variant="ghost" size="sm" onClick={() => setPicked(new Set(rows.filter((r) => !known.has(norm(r.name))).map((r) => r.key)))}>Tick all not added yet</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Clear</Btn>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-white/[0.07] p-3">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add them as</div>
              {([
                ["each", "Each line its own milestone", "Every ticked line becomes a new milestone (with one task), its BOQ amount as the payment amount."],
                ["one", "One new milestone, the lines as its tasks", "Name the milestone; its payment amount is the ticked lines added together."],
                ["existing", "Tasks in a milestone I already have", "For example a milestone you added from a template."],
              ] as [Mode, string, string][]).map(([m, label, hint]) => (
                <label key={m} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="radio" name="boq-mode" className="mt-0.5" checked={mode === m} onChange={() => setMode(m)} />
                  <span><span className="font-medium text-slate-800 dark:text-slate-200">{label}</span><span className="block text-[11px] text-slate-500">{hint}</span></span>
                </label>
              ))}
              {mode === "one" && (
                <Field label="New milestone name">
                  <Input value={newName} placeholder={chosen[0]?.section ? `e.g. ${chosen[0].section} - extra works` : "e.g. Extra works"} onChange={(e) => setNewName(e.target.value)} />
                </Field>
              )}
              {mode === "existing" && (
                <Field label="Milestone">
                  <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">{milestones.length === 0 ? "No milestones yet" : "Choose"}</option>
                    {[...milestones].sort((a, b) => Number(a.milestone_no || 0) - Number(b.milestone_no || 0))
                      .map((m) => <option key={m.id} value={m.id}>{m.milestone_no ? `${m.milestone_no}. ` : ""}{m.milestone_name}</option>)}
                  </Select>
                </Field>
              )}
              <p className="text-[11px] text-slate-500">
                Tasks get the BOQ quantity and unit. Their rate is what you pay the worker, so it is left for you to set; the BOQ price is noted in each task.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void add(); }} disabled={busy || chosen.length === 0}>{busy ? "Adding..." : "Add"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
