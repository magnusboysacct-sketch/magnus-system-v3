// src/lib/logoImage.ts
// The company logo: what may be uploaded, how its quality is judged, and how it is loaded for drawing.
//
//   * The ORIGINAL upload is stored untouched (no resize, no re-compression, no JPEG conversion, transparency kept). Everything that shows the logo uses the
//     original, or draws from it at full resolution; nothing is ever scaled up.
//   * Allowed: PNG, JPG, WEBP and SVG, up to 5 MB. A raster logo narrower than 1000 px gets a warning (it will look blurry on cards and documents).
//   * Pure helpers (validation, SVG size / safety checks, margin measuring) have no DOM and are covered by the tests; the loaders use the browser.

export const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MIN_WIDTH = 1000;
export const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";
export const LOGO_SMALL_WARNING = "This logo is small and may look blurry on cards and documents. Upload a larger PNG or SVG for best quality.";
export const LOGO_MARGIN_HINT = "has a lot of empty space around it, so it shows smaller than it could. Trimming the empty space before uploading makes it larger on cards and documents.";

const EXT_BY_TYPE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };
const TYPE_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

// The type to trust: the browser's, or (when it says nothing) the file name's extension.
export function logoType(file: { type?: string; name?: string }): string {
  const t = (file.type || "").toLowerCase();
  if (t && t !== "application/octet-stream") return t === "image/jpg" ? "image/jpeg" : t;
  const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
  return TYPE_BY_EXT[ext] || "";
}
export const logoExtension = (type: string) => EXT_BY_TYPE[type] || "png";
export const isSvgUrl = (url: string) => /^data:image\/svg\+xml/i.test(url) || /\.svg(\?|#|$)/i.test(url);

// null = fine; otherwise the sentence to show the person.
export function validateLogoFile(file: { type?: string; name?: string; size: number }): string | null {
  const t = logoType(file);
  if (!(LOGO_ALLOWED_TYPES as readonly string[]).includes(t)) return "Use a PNG, JPG, WEBP or SVG file for the logo.";
  if (file.size > LOGO_MAX_BYTES) return `This file is ${(file.size / 1048576).toFixed(1)} MB. The logo can be at most 5 MB.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

// ── SVG ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// An SVG shown as an image cannot run scripts, but the file is public, so refuse the obviously active kinds.
export function svgIsSafe(text: string): boolean {
  return !/<\s*script\b|<\s*foreignObject\b|<!ENTITY|\son[a-z]+\s*=|javascript\s*:|<\s*iframe\b|<\s*embed\b|<\s*object\b/i.test(text);
}
const num = (s: string | undefined) => { const n = s ? parseFloat(s) : NaN; return n > 0 ? n : 0; };
// The drawing's own size: width / height attributes, else the viewBox.
export function svgDimensions(text: string): { width: number; height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const w = num(/\swidth\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']/i.exec(tag)?.[1]);
  const h = num(/\sheight\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']/i.exec(tag)?.[1]);
  if (w && h) return { width: w, height: h };
  const vb = /viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']/i.exec(tag);
  if (vb && num(vb[1]) && num(vb[2])) return { width: num(vb[1]), height: num(vb[2]) };
  return null;
}
// Browsers give an SVG with only a viewBox no natural size at all; give it one (same shape, 1000 units wide) so it can be measured and drawn.
export function svgWithSize(text: string): { text: string; width: number; height: number } | null {
  const d = svgDimensions(text);
  if (!d) return null;
  const tag = /<svg\b[^>]*>/i.exec(text)![0];
  if (/\swidth\s*=/.test(tag) && /\sheight\s*=/.test(tag)) return { text, width: d.width, height: d.height };
  const width = 1000, height = Math.max(1, Math.round((1000 * d.height) / d.width));
  const cleaned = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, "");
  const patched = cleaned.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  return { text: text.replace(tag, patched), width, height };
}

// ── margins ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// How much of the image is empty (fully or almost fully transparent) on each side, as fractions of its width / height. null = no transparency to trim.
export interface Margins { left: number; right: number; top: number; bottom: number; box: { x0: number; y0: number; x1: number; y1: number } }
export function measureMargins(rgba: ArrayLike<number>, w: number, h: number, alphaMin = 9): Margins | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, seeThrough = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = rgba[(y * w + x) * 4 + 3];
    if (a < 255) seeThrough = true;
    if (a >= alphaMin) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (!seeThrough || x1 < 0) return null;
  return { left: x0 / w, right: (w - 1 - x1) / w, top: y0 / h, bottom: (h - 1 - y1) / h, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
}
// True when the empty margins cost the logo real size (more than 30% of the width or 35% of the height is empty).
export const marginsAreWasteful = (m: Margins | null) => !!m && (m.left + m.right > 0.3 || m.top + m.bottom > 0.35);

// ── what to tell the person after an upload ───────────────────────────────────────────────────────────────────────────────────
export interface LogoInfo { type: string; width: number; height: number; vector: boolean; bytes?: number; margins: Margins | null }
export const logoIsSmall = (i: Pick<LogoInfo, "vector" | "width">) => !i.vector && i.width < LOGO_MIN_WIDTH;
export function describeLogo(i: LogoInfo): string {
  const kind = { "image/png": "PNG", "image/jpeg": "JPG", "image/webp": "WEBP", "image/svg+xml": "SVG" }[i.type] || "image";
  const size = i.vector ? `${kind} (vector, sharp at any size)` : `${kind} · ${i.width} × ${i.height} px`;
  return i.bytes ? `${size} · ${i.bytes >= 1048576 ? (i.bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(i.bytes / 1024)) + " KB"}` : size;
}

// ── browser: measuring and loading ──────────────────────────────────────────────────────────────────────────────────────────
function marginsOf(img: HTMLImageElement): Margins | null {
  try {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const s = Math.min(1, 400 / Math.max(nw, nh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(nw * s)); c.height = Math.max(1, Math.round(nh * s));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return measureMargins(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  } catch { return null; }
}
function imageFromUrl(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The image could not be read."));
    img.src = url;
  });
}

// Measures an upload without changing it. Throws a readable message if the file is not a usable image.
export async function analyzeLogoFile(file: File): Promise<LogoInfo> {
  const type = logoType(file);
  const bad = validateLogoFile(file);
  if (bad) throw new Error(bad);
  if (type === "image/svg+xml") {
    const text = await file.text();
    if (!svgIsSafe(text)) throw new Error("This SVG contains scripts or embedded content and cannot be used. Export a plain SVG from your design tool.");
    const sized = svgWithSize(text);
    if (!sized) throw new Error("This SVG has no size (no width / height or viewBox). Export it again from your design tool.");
    const url = URL.createObjectURL(new Blob([sized.text], { type: "image/svg+xml" }));
    try { const img = await imageFromUrl(url, false); return { type, width: sized.width, height: sized.height, vector: true, bytes: file.size, margins: marginsOf(img) }; }
    finally { URL.revokeObjectURL(url); }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await imageFromUrl(url, false);
    return { type, width: img.naturalWidth, height: img.naturalHeight, vector: false, bytes: file.size, margins: marginsOf(img) };
  } finally { URL.revokeObjectURL(url); }
}

// The stored logo, as an image ready to draw. A vector (SVG) logo is given a size so it can be measured, and stays vector.
export async function loadLogoImage(url: string): Promise<{ image: HTMLImageElement; vector: boolean; info: LogoInfo }> {
  if (isSvgUrl(url)) {
    const text = await (await fetch(url)).text();
    if (!svgIsSafe(text)) throw new Error("unsafe svg");
    const sized = svgWithSize(text);
    if (!sized) throw new Error("svg without a size");
    const blobUrl = URL.createObjectURL(new Blob([sized.text], { type: "image/svg+xml" }));
    const image = await imageFromUrl(blobUrl, false);                  // (a blob: image never taints the canvas)
    return { image, vector: true, info: { type: "image/svg+xml", width: sized.width, height: sized.height, vector: true, margins: marginsOf(image) } };
  }
  const image = await imageFromUrl(url, true);
  return { image, vector: false, info: { type: "", width: image.naturalWidth, height: image.naturalHeight, vector: false, margins: marginsOf(image) } };
}
