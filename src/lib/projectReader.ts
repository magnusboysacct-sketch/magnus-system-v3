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
