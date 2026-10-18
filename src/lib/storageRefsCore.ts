// src/lib/storageRefsCore.ts
// What a stored file reference looks like, with no network and no Supabase client (so it can be tested in Node and shared with edge functions).
//
// The database stores, for sensitive images (ID scans, passport / staff photos, receipts), the storage PATH in the private bucket - never a URL. A short-lived
// signed URL is made when the image is shown (src/lib/storageRefs.ts). Older rows hold a URL instead (a long-lived signed URL or a public URL); every reader
// goes through these helpers, so both forms keep working, and anything that SAVES such a value turns a URL back into a path first.

export const PRIVATE_FILES_BUCKET = "private-files";
// Buckets whose objects are never public: a reference into one of these has to be signed to be shown.
export const SIGNED_BUCKETS: readonly string[] = ["private-files", "project-files", "receipts", "company-documents"];

export interface StorageRef { bucket: string; path: string }

const URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/;

// null for an empty value, an external URL, a data: / blob: URL. A bare "path/like/this" is a path in the private-files bucket.
export function parseStorageRef(value: unknown): StorageRef | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(data|blob):/i.test(v)) return null;
  if (/^https?:\/\//i.test(v)) {
    const m = URL_RE.exec(v);
    if (!m) return null;
    let path = m[2];
    try { path = decodeURIComponent(path); } catch { return null; }
    return path ? { bucket: m[1], path } : null;
  }
  return { bucket: PRIVATE_FILES_BUCKET, path: v.replace(/^\/+/, "") };
}

// What to store: a reference into a private bucket becomes its path (private-files only; other buckets keep their value), anything else is kept as it is.
export function toStoredRef(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ref = parseStorageRef(value);
  if (ref && ref.bucket === PRIVATE_FILES_BUCKET) return ref.path;
  return value.trim();
}

// True when showing this value needs a signed URL.
export function needsSigning(value: unknown): boolean {
  const ref = parseStorageRef(value);
  return !!ref && SIGNED_BUCKETS.includes(ref.bucket);
}

// <companyId>/<folder>/<file>: every path in the private bucket starts with the company id (the bucket's policies key on it).
export const privatePath = (companyId: string, folder: string, fileName: string) => `${companyId}/${folder}/${fileName}`;

// A file name that cannot carry personal data: the national ID number is never put in a file name (it used to be).
export const safeUploadName = (suffix: string, ext = "jpg") => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix ? "_" + suffix : ""}.${ext}`;
