// src/lib/projectReader.ts — 🤖 Project Reader (migration 20261006000000, magnus-ai action "read_project").
// The server fetches the chosen project files itself, Claude reads them, and the result is saved with the project
// (project_ai_reads), so an old reading opens again for free.
import { supabase } from "./supabase";
import { requireFeature } from "./platformSettings";

export interface ReadCheck { level: "problem" | "warning" | "info" | string; text: string; where?: string }
export interface ReadResult {
  title?: string; summary?: string;
  job?: { client?: string; location?: string; date?: string; total?: string; currency?: string };
  scope?: string[]; key_facts?: { label: string; value: string; source?: string }[];
  checks?: ReadCheck[]; questions?: string[]; answer?: string; file_notes?: string[];
}
export interface SavedRead { id: string; created_at: string; file_names: string[]; question: string | null; result: ReadResult }

export async function readProjectFiles(projectId: string, fileIds: string[], question: string): Promise<SavedRead> {
  await requireFeature("ai");
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/magnus-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "" },
    body: JSON.stringify({ action: "read_project", projectId, fileIds, question }),
  });
  let j: { success?: boolean; error?: string; data?: { id: string | null; created_at: string | null; result: ReadResult } } = {};
  try { j = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !j.success || !j.data) {
    throw new Error(j.error || (res.status === 546 || res.status === 504 ? "The reading took too long. Try fewer files, or a smaller PDF." : `The reader did not answer (error ${res.status}).`));
  }
  return { id: j.data.id || "", created_at: j.data.created_at || new Date().toISOString(), file_names: [], question: question || null, result: j.data.result };
}

export async function listReads(projectId: string): Promise<SavedRead[]> {
  const { data, error } = await supabase.from("project_ai_reads").select("id, created_at, file_names, question, result")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data || []) as SavedRead[];
}

export async function deleteRead(id: string): Promise<void> {
  const { data, error } = await supabase.from("project_ai_reads").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a director, admin or the person who made it can remove this reading.");
}

// What 🔊 Listen reads out: the explanation, the answer, then the problems and warnings.
export function speechText(r: ReadResult): string {
  const parts: string[] = [];
  if (r.title) parts.push(r.title + ".");
  if (r.answer) parts.push("Your question. " + r.answer);
  if (r.summary) parts.push(r.summary);
  const probs = (r.checks || []).filter((c) => c.level === "problem" || c.level === "warning");
  if (probs.length) parts.push(`There ${probs.length === 1 ? "is one thing" : `are ${probs.length} things`} to check. ` + probs.map((c, i) => `${i + 1}. ${c.text}`).join(" "));
  if (r.questions?.length) parts.push("Questions to ask. " + r.questions.join(" "));
  return parts.join("\n\n")
    .replace(/(\d+)'-(\d+)"/g, "$1 feet $2 inches").replace(/(\d+)'/g, "$1 feet").replace(/(\d+)"/g, "$1 inches")
    .replace(/\bm2\b/g, "square metres").replace(/\bm3\b/g, "cubic metres").replace(/\bJMD\b/g, "Jamaican dollars");
}

// ── 🗓 Step 2: milestones from a reading ─────────────────────────────────────────────────────────────────────────────
export interface PlanMilestone { name: string; description?: string; boq_sections?: string; weeks?: number; material?: number; labour?: number; payment?: number; money_note?: string }
export interface MilestonePlan { kind: "milestones"; from_read: string; currency?: string; boq_total?: number; milestones: PlanMilestone[]; total_weeks?: number; notes?: string[]; note?: string | null }

async function callAI<T>(payload: Record<string, unknown>): Promise<T> {
  await requireFeature("ai");
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/magnus-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "" },
    body: JSON.stringify(payload),
  });
  let j: { success?: boolean; error?: string; data?: T } = {};
  try { j = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !j.success || !j.data) {
    throw new Error(j.error || (res.status === 546 || res.status === 504 ? "It took too long. Try again." : `The AI did not answer (error ${res.status}).`));
  }
  return j.data;
}

export async function planMilestones(readId: string, note: string): Promise<{ id: string | null; created_at: string | null; plan: MilestonePlan }> {
  return callAI({ action: "plan_milestones", readId, note });
}

export const isPlan = (r: SavedRead) => (r.result as unknown as { kind?: string })?.kind === "milestones";

export interface NewMilestone { name: string; description: string; start: string | null; end: string | null; material: number; labour: number; payment: number }
// Adds them after the project's existing milestones (milestone_no carries on). Returns how many were made.
export async function createMilestones(projectId: string, companyId: string, list: NewMilestone[]): Promise<number> {
  const { data: have, error: e1 } = await supabase.from("project_milestones").select("milestone_no").eq("project_id", projectId);
  if (e1) throw new Error(e1.message);
  let no = Math.max(0, ...((have || []) as { milestone_no: number | null }[]).map((m) => Number(m.milestone_no || 0))) + 1;
  const rows = list.map((m) => ({
    project_id: projectId, company_id: companyId, milestone_name: m.name.trim().slice(0, 200), description: m.description.trim() || null, status: "planned",
    planned_start_date: m.start, planned_end_date: m.end, planned_labour_cost: Math.round(m.labour * 100) / 100,
    planned_material_cost: Math.round(m.material * 100) / 100, planned_equipment_cost: 0, payment_amount: Math.round(m.payment * 100) / 100, milestone_no: no++,
  }));
  const { error } = await supabase.from("project_milestones").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ── 📋 Step 3: a draft BOQ from a reading (copied from the client's BOQ, or built from the drawing) ──────────────────────
export interface DraftItem {
  ref?: string; name: string; description?: string; unit?: string; qty: number; material_rate: number; labour_rate: number; source?: string;
  library?: { id: string; name: string; unit: string | null; type: string | null; rate: number | null };
}
export interface BoqDraft { kind: "boq_draft"; from_read: string; currency?: string; total_check?: number; sections: { title: string; items: DraftItem[] }[]; notes?: string[]; library_size?: number; matched?: number }
export const isBoqDraft = (r: SavedRead) => (r.result as unknown as { kind?: string })?.kind === "boq_draft";

export async function draftBoq(readId: string): Promise<{ id: string | null; created_at: string | null; draft: BoqDraft }> {
  return callAI({ action: "draft_boq", readId });
}
export async function matchBoq(draftId: string): Promise<{ id: string; draft: BoqDraft }> {
  return callAI({ action: "match_boq", draftId });
}

const unitKey = (u: string | null | undefined) => String(u || "").toLowerCase().replace(/\s|\./g, "").replace(/^(sqm|sqm²|m²)$/, "m2").replace(/^(cum|m³)$/, "m3")
  .replace(/^(no|nos|nr|each|ea|pc|pcs)$/, "no").replace(/^(lm|linm|meter|metre)$/, "m").replace(/^(kgs)$/, "kg");

// Saves the draft as a NEW draft BOQ version of the project (never touches an existing version).
// rates: "client" = material + labour from the client's BOQ; "library" = your Rate Library rate where an item is matched.
export async function createBoqFromDraft(projectId: string, companyId: string, draft: BoqDraft, rates: "client" | "library", skipZeroQty: boolean)
  : Promise<{ version: number; items: number }> {
  const { data: last, error: e0 } = await supabase.from("boq_headers").select("version").eq("project_id", projectId).order("version", { ascending: false }).limit(1);
  if (e0) throw new Error(e0.message);
  const version = (Number((last || [])[0]?.version) || 0) + 1;

  // units: use the ones you have; add the missing ones to your unit list
  const { data: units } = await supabase.from("master_units").select("id, name");
  const unitMap = new Map<string, string>();
  ((units || []) as { id: string; name: string }[]).forEach((u) => { if (!unitMap.has(unitKey(u.name))) unitMap.set(unitKey(u.name), u.id); });
  const unitId = async (u?: string) => {
    const k = unitKey(u);
    if (!k) return null;
    if (unitMap.has(k)) return unitMap.get(k)!;
    const { data: nu } = await supabase.from("master_units").insert({ name: String(u).trim().slice(0, 20), company_id: companyId, is_active: true, unit_type: "other", sort_order: 999 }).select("id").single();
    const id = (nu as { id: string } | null)?.id || null;
    if (id) unitMap.set(k, id);
    return id;
  };

  const { data: hdr, error: e1 } = await supabase.from("boq_headers").insert([{ project_id: projectId, status: "draft", version }]).select("id").single();
  if (e1 || !hdr) throw new Error(e1?.message || "Could not create the BOQ.");
  const boqId = (hdr as { id: string }).id;
  try {
    const sections = draft.sections.map((s) => ({ ...s, items: s.items.filter((it) => !skipZeroQty || Number(it.qty) > 0) })).filter((s) => s.items.length > 0);
    const { data: secs, error: e2 } = await supabase.from("boq_sections")
      .insert(sections.map((s, i) => ({ boq_id: boqId, sort_order: i, title: (s.title || `Section ${i + 1}`).slice(0, 200), scope: "" }))).select("id, sort_order");
    if (e2) throw new Error(e2.message);
    const secId = new Map(((secs || []) as { id: string; sort_order: number }[]).map((s) => [s.sort_order, s.id]));
    const rows: Record<string, unknown>[] = [];
    for (const [i, s] of sections.entries()) {
      for (const [j, it] of s.items.entries()) {
        const client = (Number(it.material_rate) || 0) + (Number(it.labour_rate) || 0);
        const lib = it.library && it.library.rate != null ? Number(it.library.rate) : null;
        const rate = rates === "library" && lib != null ? lib : client;
        const desc = [it.ref ? `(${it.ref})` : "", it.description || "",
          client ? `Client rate: material ${it.material_rate || 0} + labour ${it.labour_rate || 0}.` : "", it.source ? `[${it.source}]` : ""].filter(Boolean).join(" ");
        rows.push({
          section_id: secId.get(i), sort_order: j, pick_type: "", pick_category: "", pick_item: "", pick_variant: "",
          cost_item_id: it.library?.id || null, item_name: (it.name || "Item").slice(0, 200), description: desc.slice(0, 2000),
          unit_id: await unitId(it.unit), qty: Number(it.qty) || 0, rate: Math.round(rate * 100) / 100, measurements: [],
        });
      }
    }
    for (let k = 0; k < rows.length; k += 200) {
      const { error: e3 } = await supabase.from("boq_section_items").insert(rows.slice(k, k + 200));
      if (e3) throw new Error(e3.message);
    }
    await supabase.rpc("sync_boq_budget_to_cost_events", { p_boq_id: boqId });
    return { version, items: rows.length };
  } catch (e) {
    await supabase.from("boq_sections").delete().eq("boq_id", boqId);   // nothing half-made is left behind (items go with their section)
    await supabase.from("boq_headers").delete().eq("id", boqId);
    throw e;
  }
}

// ── 🎙️ Talk to your project ────────────────────────────────────────────────────────────────────────────────────────
export async function askProject(readId: string, question: string, history: { q: string; a: string }[]): Promise<string> {
  const r = await callAI<{ answer: string }>({ action: "ask_project", readId, question, history });
  return r.answer;
}

// ── 📜 Contract terms → a draft contract with its payment schedule (Contracts page) ────────────────────────────────────
export interface ContractTerms {
  kind: "contract_terms"; from_read: string;
  contract_name?: string; client?: string; reference?: string; contract_date?: string | null; start_date?: string | null; completion_date?: string | null;
  duration_weeks?: number | null; contract_amount?: number | null; currency?: string; amount_source?: string;
  retention_percent?: number | null; retention_release?: string | null; advance_percent?: number | null; advance_amount?: number | null;
  payment_terms?: string | null; billing_schedule?: string | null; penalty_clause?: string | null; warranty_period_months?: number | null;
  governing_law?: string | null; scope_of_work?: string | null;
  payment_schedule?: { name: string; description?: string; percent?: number | null; amount?: number | null; due_date?: string | null }[];
  missing?: string[]; found_in?: string;
}
export const isContractTerms = (r: SavedRead) => (r.result as unknown as { kind?: string })?.kind === "contract_terms";
export async function readContractTerms(readId: string): Promise<{ id: string | null; created_at: string | null; terms: ContractTerms }> {
  return callAI({ action: "contract_terms", readId });
}

export interface NewContract {
  name: string; number: string; contractDate: string | null; start: string | null; end: string | null; amount: number; retention: number;
  paymentTerms: string; billing: string; penalty: string; warrantyMonths: number; scope: string; notes: string;
  schedule: { name: string; description: string; amount: number; percent: number; due: string | null }[];
}
const BILLING = ["milestone", "monthly", "completion", "time_materials"];
export async function createContractFromTerms(projectId: string, companyId: string, c: NewContract): Promise<string> {
  const { data: p } = await supabase.from("projects").select("client_id").eq("id", projectId).maybeSingle();
  const { data, error } = await supabase.from("client_contracts").insert({
    company_id: companyId, project_id: projectId, client_id: (p as { client_id: string | null } | null)?.client_id || null,
    contract_number: c.number, contract_name: c.name.trim().slice(0, 200), contract_date: c.contractDate || new Date().toISOString().slice(0, 10),
    start_date: c.start, completion_date: c.end, contract_amount: Math.round(c.amount * 100) / 100, retention_percent: c.retention,
    payment_terms: c.paymentTerms || null, billing_schedule: BILLING.includes(c.billing) ? c.billing : "milestone",
    scope_of_work: c.scope || null, penalty_clause: c.penalty || null, warranty_period_months: c.warrantyMonths || 12,
    governing_law: "Jamaica", notes: c.notes || null, status: "draft",
  }).select("id").single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  const rows = c.schedule.filter((s) => s.name.trim()).map((s, i) => ({
    contract_id: id, company_id: companyId, milestone_name: s.name.trim().slice(0, 200), milestone_description: s.description || null,
    due_date: s.due, amount: Math.round(s.amount * 100) / 100, percent_complete: s.percent || 0, status: "pending", sort_order: i,
  }));
  if (rows.length) {
    const { error: e2 } = await supabase.from("contract_payment_schedules").insert(rows);
    if (e2) throw new Error(`The contract was made, but not its payment schedule: ${e2.message}`);
  }
  return id;
}

// ── 🧱 Materials list → purchase orders (Procurement page) ───────────────────────────────────────────────────────────
export interface MaterialLine { name: string; description?: string; qty: number; unit?: string; unit_price?: number; group?: string; supplied_by?: string; for?: string; source?: string; note?: string }
export interface MaterialList { kind: "material_list"; from_read: string; currency?: string; items: MaterialLine[]; notes?: string[] }
export const isMaterialList = (r: SavedRead) => (r.result as unknown as { kind?: string })?.kind === "material_list";
export async function makeMaterialList(readId: string): Promise<{ id: string | null; created_at: string | null; list: MaterialList }> {
  return callAI({ action: "material_list", readId });
}
// One DRAFT purchase order with the given lines. Returns its number.
export async function createPoFromMaterials(projectId: string, companyId: string, supplier: { id: string | null; name: string }, title: string,
  expected: string | null, lines: { name: string; description: string; qty: number; unit: string; price: number }[]): Promise<string> {
  const { generatePONumber, createPurchaseOrder, addPurchaseOrderItem } = await import("./purchaseOrders");
  const po_number = await generatePONumber(companyId);
  const r = await createPurchaseOrder({ project_id: projectId, supplier_id: supplier.id, supplier_name: supplier.name.trim() || "Supplier", po_number, title: title.slice(0, 200),
    status: "draft", expected_date: expected, notes: "Made from the project documents by the Project Reader. Check quantities and prices before issuing." });
  if (!r.success || !r.data) throw new Error(r.error || "Could not make the purchase order.");
  const poId = (r.data as { id: string }).id;
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const a = await addPurchaseOrderItem(poId, { material_name: l.name.slice(0, 200), description: l.description || null, quantity: l.qty, unit: l.unit || null, unit_rate: Math.max(0, l.price) });
    if (!a.success) throw new Error(`${po_number} was made, but "${l.name}" was not added: ${a.error}`);
  }
  return po_number;
}
