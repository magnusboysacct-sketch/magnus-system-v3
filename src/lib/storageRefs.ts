// src/lib/storageRefs.ts — turn stored file references into URLs that can be shown right now ("sign on read").
// Pure parsing lives in storageRefsCore.ts. A private file is signed with the viewer's OWN session, so the bucket's policies (company folder, and for ID scans and
// finance files the role) decide who gets an image; someone not allowed simply gets no URL (null) and the screen shows its placeholder.
import { supabase } from "./supabase";
import { parseStorageRef, needsSigning, PRIVATE_FILES_BUCKET } from "./storageRefsCore";

export { toStoredRef, parseStorageRef, needsSigning, privatePath, safeUploadName, PRIVATE_FILES_BUCKET } from "./storageRefsCore";

export const SIGN_SECONDS = 60 * 60;                    // one hour: re-signed whenever a screen loads
const CACHE_MS = 50 * 60 * 1000;                        // reuse a signed URL for 50 minutes (not for the whole hour: it must still be valid when shown)
const cache = new Map<string, { url: string; at: number }>();

// Displayable URLs for stored values, keyed by the stored value. Private references are signed (one request per bucket); public / external URLs pass through;
// a value that cannot be shown (not allowed, missing file) is simply absent from the map.
export async function resolveFileUrls(values: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const byBucket = new Map<string, Map<string, string>>();             // bucket -> (path -> stored value)
  for (const raw of new Set(values.filter((v): v is string => typeof v === "string" && v.trim() !== ""))) {
    const ref = parseStorageRef(raw);
    if (!ref || !needsSigning(raw)) { out.set(raw, raw); continue; }   // public bucket, external URL, ...
    const key = ref.bucket + "/" + ref.path;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) { out.set(raw, hit.url); continue; }
    if (!byBucket.has(ref.bucket)) byBucket.set(ref.bucket, new Map());
    byBucket.get(ref.bucket)!.set(ref.path, raw);
  }
  for (const [bucket, paths] of byBucket) {
    try {
      const { data } = await supabase.storage.from(bucket).createSignedUrls([...paths.keys()], SIGN_SECONDS);
      for (const row of data || []) {
        if (!row?.path || !row.signedUrl || row.error) continue;
        const raw = paths.get(row.path);
        if (raw) { out.set(raw, row.signedUrl); cache.set(bucket + "/" + row.path, { url: row.signedUrl, at: Date.now() }); }
      }
    } catch { /* nothing signed for this bucket */ }
  }
  return out;
}

export async function resolveFileUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  return (await resolveFileUrls([value])).get(value) ?? null;
}

// Rows with some of their fields replaced by displayable URLs (null when the file cannot be shown to this person).
export async function withResolvedUrls<T extends object>(rows: T[], fields: Array<keyof T>): Promise<T[]> {
  if (!rows.length) return rows;
  const values: string[] = [];
  for (const r of rows) for (const f of fields) { const v = r[f]; if (typeof v === "string" && v) values.push(v); }
  const urls = await resolveFileUrls(values);
  return rows.map((r) => {
    const copy = { ...r } as Record<string, unknown>;
    for (const f of fields) { const v = (r as Record<string, unknown>)[f as string]; if (typeof v === "string" && v) copy[f as string] = urls.get(v) ?? null; }
    return copy as T;
  });
}

// For code that uploads: the path is what gets stored. Upload, then store the path.
export async function uploadPrivate(path: string, body: Blob | File, options: { contentType?: string; upsert?: boolean } = {}): Promise<{ path: string | null; error: string | null }> {
  const { error } = await supabase.storage.from(PRIVATE_FILES_BUCKET).upload(path, body, { upsert: options.upsert ?? false, contentType: options.contentType });
  return error ? { path: null, error: error.message } : { path, error: null };
}
