// src/lib/projectFiles.ts — the project's "Client BOQ" and "Statements" folders (migration 20260992000000).
// The row is in project_files; the file is in the private-files bucket (statements under the company's finance folder, so only
// people with full finance access can open them). Opening a file uses a short-lived signed link.
import { supabase } from "./supabase";
import { openLater } from "./fileLinks";

export type FileFolder = "client_boq" | "statement";
export interface ProjectFile {
  id: string; company_id: string; project_id: string; folder: FileFolder; file_name: string; file_path: string;
  mime_type: string | null; size_bytes: number | null; doc_date: string | null; amount: number | null; note: string | null;
  uploaded_by: string | null; created_at: string;
}
export const FOLDER_WORDS: Record<FileFolder, { title: string; icon: string; hint: string }> = {
  client_boq: { title: "Client BOQ", icon: "📄", hint: "The BOQ or estimate the client gives you (PDF, picture, Excel or Word)." },
  statement: { title: "Statements", icon: "💵", hint: "The client's payment statements. Add the date and amount of each payment." },
};
export const MAX_FILE_MB = 10;
const ALLOWED = /\.(pdf|jpe?g|png|webp|heic|heif|xlsx|xls|docx|doc|csv)$/i;
export function fileProblem(f: File): string | null {
  if (!ALLOWED.test(f.name)) return `${f.name}: only PDF, pictures, Excel, Word or CSV files.`;
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `${f.name}: bigger than ${MAX_FILE_MB} MB.`;
  return null;
}
function mimeFor(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword", csv: "text/csv" } as Record<string, string>)[ext || ""] || "application/octet-stream";
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const { data, error } = await supabase.from("project_files").select("*").eq("project_id", projectId)
    .order("doc_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ProjectFile[];
}

export async function addProjectFile(o: { companyId: string; projectId: string; folder: FileFolder; file: File; docDate: string | null; amount: number | null; note: string | null }): Promise<void> {
  const safe = o.file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = o.folder === "client_boq"
    ? `${o.companyId}/project-files/${o.projectId}/client-boq/${Date.now()}_${safe}`
    : `${o.companyId}/finance/project-statements/${o.projectId}/${Date.now()}_${safe}`;
  const contentType = mimeFor(o.file);
  const { error: upErr } = await supabase.storage.from("private-files").upload(path, o.file, { contentType, upsert: false });
  if (upErr) throw new Error(`${o.file.name}: ${upErr.message}`);
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("project_files").insert({
    company_id: o.companyId, project_id: o.projectId, folder: o.folder, file_name: o.file.name, file_path: path, mime_type: contentType,
    size_bytes: o.file.size, doc_date: o.docDate, amount: o.amount, note: o.note, uploaded_by: user?.id,
  });
  if (error) { await supabase.storage.from("private-files").remove([path]); throw new Error(`${o.file.name}: ${error.message}`); }
}

export async function openProjectFile(f: ProjectFile, download = false): Promise<void> {
  await openLater(async () => {
    const { data, error } = await supabase.storage.from("private-files").createSignedUrl(f.file_path, 300, download ? { download: f.file_name } : undefined);
    if (error || !data?.signedUrl) throw new Error(`Could not open the file${error?.message ? ` (${error.message})` : ""}.`);
    return data.signedUrl;
  });
}

export async function updateProjectFile(id: string, patch: { doc_date?: string | null; amount?: number | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.from("project_files").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// Removes the row first (the permission check), then the file.
export async function removeProjectFile(f: ProjectFile): Promise<void> {
  const { data, error } = await supabase.from("project_files").delete().eq("id", f.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a director, admin or the person who added it can remove this file.");
  await supabase.storage.from("private-files").remove([f.file_path]);
}
