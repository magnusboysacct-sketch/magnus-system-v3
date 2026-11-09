// src/lib/staffIdDocs.ts — a staff member's government ID: front and back pictures, ID number, type, address, date of birth
// (migration 20260998000000). Readable by the person and by director / admin / secretary; the pictures sit in the ID-scan
// folder (<company>/workers/ids/), which only director, admin and secretary can open.
import { supabase } from "./supabase";
import { privatePath, resolveFileUrl, safeUploadName } from "./storageRefs";

export interface StaffIdDoc {
  user_id: string; company_id: string; id_number: string | null; id_type: string | null; address: string | null;
  date_of_birth: string | null; front_path: string | null; back_path: string | null; updated_at: string;
}

export async function fetchStaffIdDoc(userId: string): Promise<StaffIdDoc | null> {
  const { data, error } = await supabase.from("staff_id_documents").select("*").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return data as StaffIdDoc | null;
}
export async function staffIdPictureUrls(doc: StaffIdDoc | null): Promise<{ front: string | null; back: string | null }> {
  if (!doc) return { front: null, back: null };
  const [front, back] = await Promise.all([resolveFileUrl(doc.front_path), resolveFileUrl(doc.back_path)]);
  return { front, back };
}

async function upload(companyId: string, file: File, label: string): Promise<string> {
  const path = privatePath(companyId, "workers/ids", safeUploadName(label));
  const { error } = await supabase.storage.from("private-files").upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(`The ID picture was not saved (${error.message}).`);
  return path;
}

// Save the details and any new pictures (only director / admin / secretary may).
export async function saveStaffIdDoc(o: {
  userId: string; companyId: string; front?: File | null; back?: File | null;
  fields: { id_number?: string | null; id_type?: string | null; address?: string | null; date_of_birth?: string | null };
}): Promise<void> {
  const row: Record<string, unknown> = { user_id: o.userId, company_id: o.companyId, ...o.fields };
  if (o.front) row.front_path = await upload(o.companyId, o.front, "staff-id");
  if (o.back) row.back_path = await upload(o.companyId, o.back, "staff-id-back");
  const { error } = await supabase.from("staff_id_documents").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
