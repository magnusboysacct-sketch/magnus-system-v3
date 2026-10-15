// api/_lib/sharePreview.ts
//
// Pure helpers for the link-preview pages (api/share-preview.ts) and the 1200x630 card (api/share-card.ts). Everything here is plain
// TypeScript with no framework imports so it runs unchanged on Vercel's edge runtime and under the unit tests (scripts/tests/).
// (Files under api/ whose name starts with "_" are not deployed as routes.)

export type ShareKind = "portal" | "contact" | "photos";

export interface SharePreview {
  company_name: string;
  logo_url: string | null;
  title: string;
  description: string;
}

// ── Link-preview bots ───────────────────────────────────────────────────────────────────────────────────────────────────
// Keep in step with the user-agent rewrite in vercel.json (a unit test checks they agree).
export const BOT_UA_NAMES = [
  "WhatsApp", "facebookexternalhit", "Facebot", "Twitterbot", "Slackbot", "TelegramBot", "LinkedInBot", "Discordbot", "SkypeUriPreview", "Googlebot",
] as const;
export const BOT_UA_REGEX_SOURCE = `.*(${BOT_UA_NAMES.join("|")}).*`;
const BOT_UA_REGEX = new RegExp(BOT_UA_REGEX_SOURCE);

export function isPreviewBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_UA_REGEX.test(userAgent);
}

// ── Share URL patterns ──────────────────────────────────────────────────────────────────────────────────────────────────
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const isValidToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);
export const isShareKind = (k: unknown): k is ShareKind => k === "portal" || k === "contact" || k === "photos";

export function sharePath(kind: ShareKind, token: string): string {
  return kind === "contact" ? `/portal/contact/${token}` : kind === "photos" ? `/shared/${token}` : `/portal/${token}`;
}

// The same three patterns the app's routes (and vercel.json) use. Anything else is not a share link.
export function parseSharePath(pathname: string): { kind: ShareKind; token: string } | null {
  let m = /^\/portal\/contact\/([^/]+)\/?$/.exec(pathname);
  if (m && isValidToken(m[1])) return { kind: "contact", token: m[1] };
  m = /^\/portal\/([^/]+)\/?$/.exec(pathname);
  if (m && m[1] !== "contact" && isValidToken(m[1])) return { kind: "portal", token: m[1] };
  m = /^\/shared\/([^/]+)\/?$/.exec(pathname);
  if (m && isValidToken(m[1])) return { kind: "photos", token: m[1] };
  return null;
}

// ── What the database may tell the crawler ──────────────────────────────────────────────────────────────────────────────
// Control characters (newlines, tabs, NUL…) become spaces, runs of whitespace collapse, and the text is capped.
export function stripControl(v: unknown, max: number): string {
  let out = "";
  for (const ch of String(v ?? "")) { const c = ch.charCodeAt(0); out += c < 32 || c === 127 ? " " : ch; }
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}
const clean = stripControl;

export function genericTitle(kind: ShareKind, company: string): string {
  return kind === "photos" ? `Project photos – ${company}` : `Project portal – ${company}`;
}
export function genericDescription(kind: ShareKind): string {
  return kind === "photos"
    ? "View the shared project photos. No login needed."
    : kind === "contact"
      ? "Open this link to set up your project portal access."
      : "Sign in to view your project updates and documents.";
}

// Takes whatever get_share_preview returned and keeps ONLY the four public fields (anything else — however it got there — is dropped).
export function normalizePreview(raw: unknown, kind: ShareKind): SharePreview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const company = clean(r.company_name, 80);
  if (!company) return null;
  const logo = clean(r.logo_url, 600);
  return {
    company_name: company,
    logo_url: logo || null,
    title: clean(r.title, 120) || genericTitle(kind, company),
    description: clean(r.description, 200) || genericDescription(kind),
  };
}

// ── The card URL ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Short, stable fingerprint of company + logo: a new logo (or name) gives a new URL, so the long-lived cache never serves a stale card.
export function cardVersion(name: string, logo: string | null): string {
  let h = 0x811c9dc5;
  const s = `${name}\u0000${logo || ""}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

// The card is addressed by the SAME kind + token as the share link (k, t); the endpoint looks the company up itself, so nothing about what the card shows
// (name, logo) can be supplied in the URL. v is only the cache-buster: the fingerprint of the name + logo the card was built for.
export function buildCardUrl(origin: string, kind: ShareKind, token: string, name: string, logo: string | null): string {
  const u = new URL("/api/share-card", origin);
  u.searchParams.set("k", kind);
  u.searchParams.set("t", token);
  u.searchParams.set("v", cardVersion(name, logo));
  return u.toString();
}

// ── The one database lookup both endpoints use ──────────────────────────────────────────────────────────────────────────
export function previewEnv(env: Record<string, string | undefined> = process.env): { url: string; key: string } | null {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

// get_share_preview(kind, token) -> the four public fields, or null for anything unknown / revoked / expired / failed (all identical to the caller).
export async function fetchSharePreview(kind: ShareKind, token: string, fetchImpl: typeof fetch = fetch, env = previewEnv()): Promise<SharePreview | null> {
  if (!env) return null;
  try {
    const res = await fetchImpl(`${env.url}/rest/v1/rpc/get_share_preview`, {
      method: "POST",
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_kind: kind, p_token: token }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? normalizePreview(await res.json(), kind) : null;
  } catch {
    return null;
  }
}

// Only our own Supabase company-logos bucket may be fetched for a card (the endpoint must not become an open proxy).
export function isAllowedLogoUrl(raw: string | null | undefined, supabaseUrl: string | null | undefined): boolean {
  if (!raw || !supabaseUrl) return false;
  try {
    const u = new URL(raw), base = new URL(supabaseUrl);
    if (u.protocol !== "https:" || u.host !== base.host || u.username || u.password || u.port) return false;
    if (!u.pathname.startsWith("/storage/v1/object/public/company-logos/")) return false;
    const decoded = decodeURIComponent(u.pathname);
    return !decoded.split("/").some((seg) => seg === ".." || seg === ".");
  } catch {
    return false;
  }
}

// ── The crawler page ────────────────────────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildPreviewHtml(o: { title: string; description: string; company: string; pageUrl: string; imageUrl: string }): string {
  const t = esc(o.title), d = esc(o.description), c = esc(o.company), u = esc(o.pageUrl), i = esc(o.imageUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${t}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${c}">
<meta property="og:url" content="${u}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${i}">
<meta property="og:image:secure_url" content="${i}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${c}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${i}">
</head><body><p>${t}</p></body></html>`;
}

// ── Logo geometry for the card ──────────────────────────────────────────────────────────────────────────────────────────
export interface ImageInfo { mime: "image/png" | "image/jpeg" | "image/gif" | "image/svg+xml"; width: number; height: number }

// Reads the natural size from the file's own header. Returns null for anything else (WebP etc.: the card then falls back to the name).
export function imageInfo(b: Uint8Array): ImageInfo | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const width = dv.getUint32(16), height = dv.getUint32(20);
    return width > 0 && height > 0 ? { mime: "image/png", width, height } : null;
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    const width = b[6] | (b[7] << 8), height = b[8] | (b[9] << 8);
    return width > 0 && height > 0 ? { mime: "image/gif", width, height } : null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        const height = (b[i + 5] << 8) | b[i + 6], width = (b[i + 7] << 8) | b[i + 8];
        return width > 0 && height > 0 ? { mime: "image/jpeg", width, height } : null;
      }
      i += 2 + len;
    }
    return null;
  }
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 2048)));
  if (/<svg[\s>]/i.test(head)) {
    const tag = /<svg[^>]*>/i.exec(head)?.[0] || "";
    const num = (re: RegExp) => { const m = re.exec(tag); return m ? parseFloat(m[1]) : NaN; };
    let width = num(/\swidth\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']/i), height = num(/\sheight\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']/i);
    if (!(width > 0 && height > 0)) {
      const vb = /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
      if (vb) { width = parseFloat(vb[1]); height = parseFloat(vb[2]); }
    }
    return width > 0 && height > 0 ? { mime: "image/svg+xml", width, height } : null;
  }
  return null;
}

// The logo sits at its natural aspect ratio ("contain"), inside the centre square of the card so a square crop still shows all of it:
// at most 560px wide and 60% of the card's height; never enlarged more than 2x its own pixel size.
export const CARD = { width: 1200, height: 630, logoMaxW: 560, logoMaxH: Math.round(630 * 0.6), maxUpscale: 2 } as const;

export function fitLogo(iw: number, ih: number): { w: number; h: number } {
  const scale = Math.min(CARD.logoMaxW / iw, CARD.logoMaxH / ih, CARD.maxUpscale);
  return { w: Math.max(1, Math.round(iw * scale)), h: Math.max(1, Math.round(ih * scale)) };
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Fetches the company logo for the card. Only the allowed storage URL, no redirects, 4 s, at most 4 MB. Returns null on any problem.
export async function loadLogo(
  url: string | null,
  supabaseUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ dataUri: string; width: number; height: number } | null> {
  if (!url || !isAllowedLogoUrl(url, supabaseUrl)) return null;
  try {
    const res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len > 4_000_000) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 4_000_000) return null;
    const info = imageInfo(bytes);
    if (!info) return null;
    return { dataUri: `data:${info.mime};base64,${toBase64(bytes)}`, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
