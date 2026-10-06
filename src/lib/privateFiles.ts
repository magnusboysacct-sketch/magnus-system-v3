// Helpers for files kept in the PRIVATE private-files bucket and shown to logged-in staff: the database stores the storage
// PATH (never a URL) and a fresh signed URL is made each time the files are loaded or opened ("sign on read"). The bucket's
// policies need the company id as the first folder of every path, and sign with the viewer's own session.
import { supabase } from "./supabase";

export const PRIVATE_FILES_BUCKET = "private-files";
// 24 hours, the same window Takeoff uses for its PDFs. Long enough that a plan left open (pdf.js re-fetches the whole file for
// every page it renders) keeps working; callers re-sign when something is opened.
export const PRIVATE_FILE_SIGN_SECONDS = 60 * 60 * 24;

// A stored value that is already a (legacy) URL rather than a storage path.
export function isLegacyUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

// null when signing fails or there is no path.
export async function signPrivatePath(
  path: string | null | undefined,
  seconds: number = PRIVATE_FILE_SIGN_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(PRIVATE_FILES_BUCKET).createSignedUrl(path, seconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// Signs many paths in one request. The map is keyed by path; a path that could not be signed is simply absent.
export async function signPrivatePaths(
  paths: Array<string | null | undefined>,
  seconds: number = PRIVATE_FILE_SIGN_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return out;
  try {
    const { data, error } = await supabase.storage.from(PRIVATE_FILES_BUCKET).createSignedUrls(unique, seconds);
    if (error || !data) return out;
    for (const row of data) {
      if (row?.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
    }
  } catch {
    /* nothing signed */
  }
  return out;
}

// ---- project_photos ------------------------------------------------------------------------------------------------
// Rows in this table come from two writers: the main photos upload (public project-photos bucket, path <projectId>/...) and
// the field app (private-files, path <companyId>/field-photos/<projectId>/...). The second segment tells them apart.
export function isFieldPhotoPath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.split("/")[1] === "field-photos";
}

export function projectPhotoBucket(path: string | null | undefined): string {
  return isFieldPhotoPath(path) ? PRIVATE_FILES_BUCKET : "project-photos";
}

// Display URLs for project_photos.photo_url values, keyed by photo_url: signed for field photos, public for the rest.
export async function resolveProjectPhotoUrls(
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const clean = [...new Set(paths.filter((p): p is string => !!p))];
  const out = await signPrivatePaths(clean.filter((p) => isFieldPhotoPath(p)));
  for (const p of clean) {
    if (isFieldPhotoPath(p)) continue;
    out.set(p, supabase.storage.from("project-photos").getPublicUrl(p).data.publicUrl);
  }
  return out;
}
