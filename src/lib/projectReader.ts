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
