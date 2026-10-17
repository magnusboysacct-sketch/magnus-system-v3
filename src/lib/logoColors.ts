// src/lib/logoColors.ts
// "Suggest from my logo": find the logo's main colours (ignoring transparent and white / near-white pixels) and turn them into a few primary + accent pairs for the
// ID card. extractDominantColors / suggestThemes are pure (they take RGBA pixels); logoPixels loads an image into a small canvas in the browser.
import { contrast, ensureContrast, hexToRgb, luminance, mix, rgbToHex, type IdCardTheme } from "./idCardTheme";

// Anything this light and this unsaturated is paper, not brand colour.
function isNearWhite(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return (min >= 225) || (max >= 205 && max - min <= 18 && (r + g + b) / 3 >= 215);
}
const dist = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// The most common distinct colours of an RGBA pixel buffer, biggest first. Pixels with alpha < 128 and near-white pixels are skipped.
export function extractDominantColors(rgba: ArrayLike<number>, max = 4): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (isNearWhite(r, g, b)) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);           // 16 levels per channel
    const e = buckets.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => ({ n: e.n, c: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] as [number, number, number] }));
  // merge buckets that are visually the same colour (the biggest wins)
  const clusters: { n: number; c: [number, number, number] }[] = [];
  for (const s of sorted) {
    const hit = clusters.find((k) => dist(k.c, s.c) < 60);
    if (hit) hit.n += s.n; else clusters.push({ ...s });
  }
  const total = clusters.reduce((a, k) => a + k.n, 0);
  return clusters.sort((a, b) => b.n - a.n).filter((k) => k.n / Math.max(1, total) >= 0.03).slice(0, max).map((k) => rgbToHex(k.c));
}

const GOLD = "#C9A84C", WHITE = "#FFFFFF", SILVER = "#C0C6CE";

// An accent that stands out against `primary`: the logo's own second colour if it does, else gold / silver / white (whichever reads best).
function pickAccent(primary: string, candidates: string[]): string {
  for (const c of candidates) if (contrast(c, primary) >= 3 && c !== primary) return ensureContrast(c, primary);
  const pool = [GOLD, SILVER, WHITE, "#111111"];            // dark as a last choice, for a light or mid-tone primary
  return pool.map((c) => ({ c, k: contrast(c, primary) })).sort((a, b) => b.k - a.k)[0].c;
}

// Up to 3 different primary / accent pairs from the logo's colours (none when the logo has no colour: all white, all transparent...).
export function suggestThemes(colors: string[]): IdCardTheme[] {
  if (!colors.length) return [];
  const out: IdCardTheme[] = [];
  const add = (t: IdCardTheme) => { if (!out.some((o) => o.primary === t.primary && o.accent === t.accent) && t.primary !== t.accent) out.push(t); };
  const [c1, c2] = colors;
  // a very light brand colour makes a poor card face: deepen it
  const face = (c: string) => (luminance(c) > 0.55 ? mix(c, "#000000", 0.55) : c);
  add({ primary: face(c1), accent: pickAccent(face(c1), [c2, c1].filter(Boolean) as string[]) });
  if (c2) add({ primary: face(c2), accent: pickAccent(face(c2), [c1]) });
  add({ primary: mix(c1, "#000000", 0.55), accent: pickAccent(mix(c1, "#000000", 0.55), [mix(c1, "#FFFFFF", 0.45)]) });
  if (out.length < 3) add({ primary: mix(c1, "#000000", 0.75), accent: GOLD });
  return out.slice(0, 3).map((t) => ({ primary: rgbToHex(hexToRgb(t.primary)), accent: rgbToHex(hexToRgb(t.accent)) }));
}

// Browser: the logo's pixels on a canvas of at most `size` px (needs the image to be same-origin or CORS-enabled, as the card renderer already requires).
export function logoPixels(img: HTMLImageElement, size = 96): Uint8ClampedArray | null {
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const s = Math.min(1, size / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  } catch {
    return null;       // a canvas tainted by a cross-origin image cannot be read
  }
}
