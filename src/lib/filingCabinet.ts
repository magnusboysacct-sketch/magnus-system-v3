// src/lib/filingCabinet.ts — Documents, the company filing cabinet (migration 20260993000000).
// Drawers (doc_drawers) hold documents (doc_files). The file is in the private-files bucket: normal drawers under
// <company>/documents/, private drawers under <company>/finance/documents/ (only full finance access can open those).
import { supabase } from "./supabase";
import { openLater } from "./fileLinks";

export interface Drawer { id: string; company_id: string; name: string; is_private: boolean; sort: number; created_at: string }
export interface DocFile {
  id: string; company_id: string; drawer_id: string | null; project_id: string | null; title: string; file_name: string; file_path: string;
  is_private: boolean; mime_type: string | null; size_bytes: number | null; doc_date: string | null; note: string | null;
  uploaded_by: string | null; created_at: string; updated_at: string;
}
export const MAX_DOC_MB = 25;
export const STARTER_DRAWERS: { name: string; is_private?: boolean }[] = [
  { name: "Contracts" }, { name: "Client papers" }, { name: "Suppliers & quotes" }, { name: "Permits & approvals" },
  { name: "Insurance & licences" }, { name: "Tax (TAJ / NIS / NHT)", is_private: true }, { name: "Bank", is_private: true }, { name: "Other" },
];

// Files the browser may show (PDF, pictures, Office, text...). Anything else is kept as a plain download.
const KNOWN: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
  tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf", zip: "application/zip",
  mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4",
};
export function docMime(name: string): string { return KNOWN[name.split(".").pop()?.toLowerCase() || ""] || "application/octet-stream"; }
export function docIcon(mime: string | null): string {
  const m = mime || "";
  return /pdf/.test(m) ? "📕" : /^image\//.test(m) ? "🖼️" : /sheet|excel|csv/.test(m) ? "📊" : /word|opendocument\.text|rtf/.test(m) ? "📝"
    : /presentation|powerpoint/.test(m) ? "📽️" : /^video\//.test(m) ? "🎬" : /^audio\//.test(m) ? "🎵" : /zip/.test(m) ? "🗜️" : /^text\//.test(m) ? "📃" : "📄";
}
export function sizeWords(n: number | null): string { return n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }

const pathFor = (companyId: string, isPrivate: boolean, name: string) =>
  `${companyId}/${isPrivate ? "finance/" : ""}documents/${crypto.randomUUID().slice(0, 8)}_${name.replace(/[^\w.\- ]+/g, "_").slice(-120)}`;

export async function listDrawers(companyId: string): Promise<Drawer[]> {
  const { data, error } = await supabase.from("doc_drawers").select("*").eq("company_id", companyId).order("sort").order("name");
  if (error) throw new Error(error.message);
  return (data || []) as Drawer[];
}
export async function addDrawer(companyId: string, name: string, isPrivate: boolean): Promise<void> {
  const { error } = await supabase.from("doc_drawers").insert({ company_id: companyId, name: name.trim(), is_private: isPrivate });
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There is already a drawer with that name." : error.message);
}
export async function addStarterDrawers(companyId: string): Promise<void> {
  const rows = STARTER_DRAWERS.map((d, i) => ({ company_id: companyId, name: d.name, is_private: !!d.is_private, sort: i }));
  const { error } = await supabase.from("doc_drawers").insert(rows);
  if (error) throw new Error(error.message);
}
export async function renameDrawer(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("doc_drawers").update({ name: name.trim() }).eq("id", id);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "There is already a drawer with that name." : error.message);
}
export async function removeDrawer(id: string): Promise<void> {
  const { data, error } = await supabase.from("doc_drawers").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a director or admin can remove a drawer.");
}

export async function listDocs(companyId: string): Promise<DocFile[]> {
  const { data, error } = await supabase.from("doc_files").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data || []) as DocFile[];
}

export async function addDoc(o: { companyId: string; drawer: Drawer | null; projectId: string | null; file: File; title: string; docDate: string | null; note: string | null }): Promise<void> {
  if (o.file.size > MAX_DOC_MB * 1024 * 1024) throw new Error(`${o.file.name}: bigger than ${MAX_DOC_MB} MB.`);
  const path = pathFor(o.companyId, !!o.drawer?.is_private, o.file.name);
  const contentType = docMime(o.file.name);
  const { error: upErr } = await supabase.storage.from("private-files").upload(path, o.file, { contentType, upsert: false });
  if (upErr) throw new Error(`${o.file.name}: ${upErr.message}`);
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("doc_files").insert({
    company_id: o.companyId, drawer_id: o.drawer?.id ?? null, project_id: o.projectId, title: o.title.trim() || o.file.name,
    file_name: o.file.name, file_path: path, mime_type: contentType, size_bytes: o.file.size, doc_date: o.docDate, note: o.note, uploaded_by: user?.id,
  });
  if (error) { await supabase.storage.from("private-files").remove([path]); throw new Error(`${o.file.name}: ${error.message}`); }
}

// A private link to the file (an hour), for the in-app viewer.
export async function docLink(f: DocFile): Promise<string> {
  const { data, error } = await supabase.storage.from("private-files").createSignedUrl(f.file_path, 3600);
  if (error || !data?.signedUrl) throw new Error(`Could not open the file${error?.message ? ` (${error.message})` : ""}.`);
  return data.signedUrl;
}

export async function openDoc(f: DocFile, download = false): Promise<void> {
  await openLater(async () => {
    const { data, error } = await supabase.storage.from("private-files").createSignedUrl(f.file_path, 300, download ? { download: f.file_name } : undefined);
    if (error || !data?.signedUrl) throw new Error(`Could not open the file${error?.message ? ` (${error.message})` : ""}.`);
    return data.signedUrl;
  });
}

// Change the details; moving between a private and a normal drawer also moves the file to the matching place.
export async function updateDoc(f: DocFile, patch: { title?: string; drawer?: Drawer | null; project_id?: string | null; doc_date?: string | null; note?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title.trim() || f.file_name;
  if (patch.project_id !== undefined) row.project_id = patch.project_id;
  if (patch.doc_date !== undefined) row.doc_date = patch.doc_date;
  if (patch.note !== undefined) row.note = patch.note;
  let moved: { from: string; to: string } | null = null;
  if (patch.drawer !== undefined) {
    row.drawer_id = patch.drawer?.id ?? null;
    const wantPrivate = patch.drawer ? patch.drawer.is_private : f.is_private;      // "Not filed yet" keeps it where it is
    if (wantPrivate !== f.is_private) {
      const to = pathFor(f.company_id, wantPrivate, f.file_name);
      const { error: mvErr } = await supabase.storage.from("private-files").move(f.file_path, to);
      if (mvErr) throw new Error("Could not move the file: " + mvErr.message);
      row.file_path = to; moved = { from: f.file_path, to };
    }
  }
  const { error } = await supabase.from("doc_files").update(row).eq("id", f.id);
  if (error) {
    if (moved) await supabase.storage.from("private-files").move(moved.to, moved.from);        // put it back
    throw new Error(error.message);
  }
}

export async function removeDoc(f: DocFile): Promise<void> {
  const { data, error } = await supabase.from("doc_files").delete().eq("id", f.id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a director, admin or the person who added it can remove this document.");
  await supabase.storage.from("private-files").remove([f.file_path]);
}
