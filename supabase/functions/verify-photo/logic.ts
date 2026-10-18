// supabase/functions/verify-photo/logic.ts — the pure parts of verify-photo (no Deno, no network), so they can be tested in Node.

export const CODE_RE = /^[0-9a-f]{12}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PRIVATE_BUCKET = "private-files";
export const SIGNED_URL_TTL_SECONDS = 300;      // five minutes: long enough for the page to load the picture

export type PhotoRequest = { kind: "code"; code: string } | { kind: "worker"; id: string };

// The body names a card by the code in its QR (new cards) or by the worker id (cards printed before the codes existed). Anything else is refused.
export function parsePhotoRequest(body: unknown): PhotoRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.code === "string") {
    const code = b.code.trim().toLowerCase();
    return CODE_RE.test(code) ? { kind: "code", code } : null;
  }
  if (typeof b.workerId === "string") {
    const id = b.workerId.trim().toLowerCase();
    return UUID_RE.test(id) ? { kind: "worker", id } : null;
  }
  return null;
}

// The storage path in the private bucket for a stored photo value: a bare path, or an old (long-lived) signed / public URL of the private bucket.
// null for anything else (empty, an external URL, another bucket): the page then shows initials.
export function privatePhotoPath(stored: unknown): string | null {
  if (typeof stored !== "string") return null;
  const v = stored.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/.exec(v);
    if (!m || m[1] !== PRIVATE_BUCKET) return null;
    try { return decodeURIComponent(m[2]) || null; } catch { return null; }
  }
  if (/^(data|blob):/i.test(v)) return null;
  const path = v.replace(/^\/+/, "");
  return path.includes("..") ? null : path;
}

// A photo that may be shown on the public verify page is a profile / passport photo only: never an ID scan, never a finance file.
export function isShowablePhotoPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.length < 3) return false;                          // <companyId>/<folder>/<file>
  if (!UUID_RE.test(parts[0])) return false;                   // the first folder is a company id
  return parts[1] === "staff-photos" || (parts[1] === "workers" && parts[2] === "passport");
}
