/* eslint-disable @typescript-eslint/no-explicit-any */
// Tests for the per-company ID card colours (src/lib/idCardTheme.ts, logoColors.ts and their use by the renderer and the downloads).
// Run:  npm run test:idcard
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import JSZip from "jszip";
import { BLEED_MM, PRINT_PPM, SCREEN_PPM, renderIdCardFace, safeZoneViolations, setCanvasFactory, verifyUrl, type IdCardCompany, type IdCardData, type RenderedFace } from "../../src/lib/idCardRender";
import { buildCardPdf, buildPngZip, buildSheetPdf, type CardItem } from "../../src/lib/idCardExport";
import { DEFAULT_THEME, THEME_PRESETS, contrast, ensureContrast, headerColors, readableOn, resolvePalette, rgbToHex, type IdCardTheme } from "../../src/lib/idCardTheme";
import { extractDominantColors, suggestThemes } from "../../src/lib/logoColors";

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const mk = (w: number, h: number, paint: (c: any) => void) => { const c = createCanvas(w, h); paint(c.getContext("2d")); return c as any; };
const PHOTO = mk(300, 400, (c) => { c.fillStyle = "#6f8fb8"; c.fillRect(0, 0, 300, 400); });
const LOGO = mk(520, 160, (c) => { c.fillStyle = "#b91c1c"; c.fillRect(0, 0, 160, 160); });
const SIGNATURE = mk(300, 100, (c) => { c.strokeStyle = "#111"; c.lineWidth = 4; c.beginPath(); c.moveTo(10, 70); c.lineTo(150, 40); c.stroke(); });
const COMPANY: IdCardCompany = { name: "Magnus Boys Construction", tagline: "Building With Integrity", contactLines: ["12 Hope Road", "St Andrew, Jamaica", "Tel: 876-555-0100"] };
const staff = (over: Partial<IdCardData> = {}): IdCardData => ({
  kind: "staff", id: "s1", name: "Amanda Clarke", title: "Quantity Surveyor", initials: "AC", verifyCode: "0a1b2c3d4e5f", cardTitle: "STAFF IDENTIFICATION CARD",
  detail: { label: "Employee No", value: "MB-014" }, bearer: [], issuedLabel: "Jan 2026", expiresLabel: "Jan 2028", expired: false, expiryColor: "#4ade80",
  statement: "This card certifies the bearer is an authorized staff member of Magnus Boys Construction. This card remains company property and must be surrendered upon termination.", ...over });
const item = (data: IdCardData): CardItem => ({ data, images: { photo: PHOTO, logo: LOGO, signature: SIGNATURE } });
const MAROON: IdCardTheme = { primary: "#6B1D2A", accent: "#C9A84C" };
const EXTREME: Array<[string, IdCardTheme]> = [
  ["almost white", { primary: "#FAFAFA", accent: "#F5F5F5" }], ["pure white", { primary: "#FFFFFF", accent: "#FFFFFF" }], ["pure black", { primary: "#000000", accent: "#000000" }],
  ["mid grey", { primary: "#808080", accent: "#7A7A7A" }], ["mid blue", { primary: "#3B82F6", accent: "#2563EB" }], ["yellow", { primary: "#FACC15", accent: "#EAB308" }],
  ["mid green", { primary: "#22C55E", accent: "#16A34A" }], ["red with pink", { primary: "#DC2626", accent: "#EC4899" }],
];
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const px = (r: RenderedFace, x: number, y: number) => [...(r.canvas.getContext("2d") as any).getImageData(x, y, 1, 1).data] as number[];
const decode = (r: RenderedFace) => { const d = (r.canvas.getContext("2d") as any).getImageData(r.qr.x, r.qr.y, r.qr.w, r.qr.h); return jsQR(d.data as unknown as Uint8ClampedArray, r.qr.w, r.qr.h)?.data ?? null; };
// `rgba(r,g,b,a)` text blended over `bg`
function blend(rgbaStr: string, bg: string) {
  const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(rgbaStr)!;
  const a = +m[4]; const b = hex(bg);
  return rgbToHex([+m[1] * a + b[0] * (1 - a), +m[2] * a + b[1] * (1 - a), +m[3] * a + b[2] * (1 - a)]);
}

// RGB image XObjects of a jsPDF file, decoded to RGBA (undoes the PNG predictor jsPDF writes)
function pdfImages(bytes: Buffer): Array<{ w: number; h: number; rgba: Uint8ClampedArray }> {
  const txt = bytes.toString("latin1");
  const out: Array<{ w: number; h: number; rgba: Uint8ClampedArray }> = [];
  for (const m of txt.matchAll(/<<\s*\/Type \/XObject\s*\/Subtype \/Image\s*\/Width (\d+)\s*\/Height (\d+)\s*\/ColorSpace \/DeviceRGB[\s\S]*?\/Predictor (\d+)[\s\S]*?\/Length (\d+)[\s\S]*?>>\s*stream\r?\n/g)) {
    const w = +m[1], h = +m[2], len = +m[4];
    const start = m.index! + m[0].length;
    const raw = zlib.inflateSync(bytes.subarray(start, start + len));
    const bpp = 3, stride = w * bpp;
    const rgb = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (stride + 1)];
      const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? rgb[y * stride + i - bpp] : 0, b = y ? rgb[(y - 1) * stride + i] : 0, c = i >= bpp && y ? rgb[(y - 1) * stride + i - bpp] : 0;
        let v = row[i];
        if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
        else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        rgb[y * stride + i] = v & 255;
      }
    }
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255; }
    out.push({ w, h, rgba });
  }
  return out;
}
type Img = { w: number; h: number; rgba: Uint8ClampedArray };
const crop = (img: Img, x: number, y: number, w: number, h: number) => { const o = new Uint8ClampedArray(w * h * 4); for (let r = 0; r < h; r++) o.set(img.rgba.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4); return o; };
const at = (img: Img, x: number, y: number) => [...img.rgba.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 3)];
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 2);

// ── contrast ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("colours: text is white or near-black and always reaches 4.5:1 - very light, very dark and every mid colour", () => {
  assert.equal(readableOn("#FFFFFF"), "#050505");
  assert.equal(readableOn("#FAFAFA"), "#050505");
  assert.equal(readableOn("#000000"), "#FFFFFF");
  assert.equal(readableOn("#15315A"), "#FFFFFF");
  assert.equal(readableOn("#FACC15"), "#050505");
  for (let v = 0; v <= 255; v++) {                                                       // every grey, including the worst case in the middle
    const h = rgbToHex([v, v, v]); const k = contrast(readableOn(h), h);
    assert.ok(k >= 4.5, `grey ${h}: ${k.toFixed(2)}`);
  }
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {   // a grid over the whole colour cube
    const h = rgbToHex([r, g, b]); const k = contrast(readableOn(h), h);
    assert.ok(k >= 4.5, `${h}: ${k.toFixed(2)}`);
  }
});

test("colours: every piece of text on the card reaches 4.5:1 (presets and awkward colours); a too-close accent is adjusted", () => {
  const themes: Array<[string, IdCardTheme]> = [...THEME_PRESETS.filter((p) => p.id !== "navy-gold").map((p) => [p.name, p.theme] as [string, IdCardTheme]), ...EXTREME];
  for (const [label, t] of themes) {
    const P = resolvePalette(t);
    assert.ok(contrast(P.fg, P.primary) >= 4.5, `${label}: text on face`);
    assert.ok(contrast(P.accent, P.primary) >= 4.5, `${label}: accent ${P.accent} on ${P.primary}`);
    for (const a of [0.4, 0.45, 0.55, 0.6, 0.9]) assert.ok(contrast(blend(P.fgA(a), P.primary), P.primary) >= 4.5, `${label}: faint text ${a}`);
    for (const c of ["#DC2626", "#4ADE80", "#FBBF24"]) assert.ok(contrast(P.status(c), P.primary) >= 4.5, `${label}: status ${c}`);
    assert.ok(contrast(P.ink, P.tint) >= 4.5, `${label}: heading on back`);
    for (const a of [0.5, 0.55, 0.72, 0.8, 0.85]) assert.ok(contrast(blend(P.inkA(a), P.tint), P.tint) >= 4.5, `${label}: back text ${a}`);
    assert.ok(contrast(P.bannerText, P.banner) >= 4.5, `${label}: banner text`);
    assert.ok(contrast(P.logoInitial, "#FFFFFF") >= 4.5, `${label}: initial on the white plate`);
  }
  assert.notEqual(resolvePalette({ primary: "#FAFAFA", accent: "#F5F5F5" }).accent, "#F5F5F5", "an accent that matches the face is changed");
  assert.equal(ensureContrast("#C9A84C", "#15315A"), "#C9A84C", "an accent that already reads is left alone");
});

test("colours: the default is exactly today's card (navy face, gold accent, original tint and amber banner)", () => {
  const P = resolvePalette(null);
  assert.deepEqual([P.isDefault, P.primary, P.accent, P.tint, P.tintLine, P.banner, P.fg], [true, "#15315A", "#C9A84C", "#E7EDF6", "#C7D4E6", "#F2A93B", "#FFFFFF"]);
  assert.equal(resolvePalette({ primary: "nonsense", accent: null }).primary, DEFAULT_THEME.primary);
  assert.equal(resolvePalette({ primary: "#15315a", accent: "#c9a84c" }).isDefault, true);
  assert.deepEqual(THEME_PRESETS.map((p) => p.name), ["Navy & Gold", "Black & Gold", "Forest Green & Gold", "Maroon & Gold", "Charcoal & Silver", "Royal Blue & White"]);
});

// ── the card ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("colours: the QR still decodes on every preset and awkward colour, front and back, screen and print; layout never changes", () => {
  const all: Array<[string, IdCardTheme]> = [...THEME_PRESETS.map((p) => [p.name, p.theme] as [string, IdCardTheme]), ...EXTREME];
  const plain = renderIdCardFace("front", staff(), COMPANY, { photo: PHOTO, logo: LOGO }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  for (const [label, theme] of all) for (const face of ["front", "back"] as const) for (const [ppm, bl] of [[SCREEN_PPM, 0], [PRINT_PPM, BLEED_MM]] as const) {
    const r = renderIdCardFace(face, staff(), { ...COMPANY, theme }, { photo: PHOTO, logo: LOGO, signature: SIGNATURE }, { ppm, bleedMm: bl });
    assert.equal(decode(r), r.url, `${label} ${face} ${ppm}`);
    assert.deepEqual(safeZoneViolations(r), [], `${label} ${face}: safe zone`);
    const d = (r.canvas.getContext("2d") as any).getImageData(r.qr.x, r.qr.y, r.qr.w, r.qr.h).data as Uint8ClampedArray;      // the QR plate: dark navy on pure white only
    const seen = new Set<string>(); for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    assert.deepEqual([...seen].sort(), ["21,49,90", "255,255,255"], `${label} ${face}: QR colours`);
    if (face === "front" && ppm === PRINT_PPM) { assert.equal(r.qr.x, plain.qr.x); assert.equal(r.qr.y, plain.qr.y); assert.equal(r.qr.w, plain.qr.w); }   // same layout as the default card
  }
});

test("colours: the card faces use the saved colours (bleed, stripes, back tint, banner); no saved colours = navy", () => {
  const F = renderIdCardFace("front", staff(), { ...COMPANY, theme: MAROON }, {}, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const B = renderIdCardFace("back", staff(), { ...COMPANY, theme: MAROON }, {}, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const P = resolvePalette(MAROON);
  assert.deepEqual(px(F, 2, Math.round(F.heightPx / 2)).slice(0, 3), hex(P.primary), "front face = primary, out into the bleed");
  assert.deepEqual(px(F, 2, 2).slice(0, 3), hex(P.accent), "top stripe = accent");
  assert.deepEqual(px(B, 2, Math.round(B.heightPx / 2) + 600).slice(0, 3), hex(P.tint), "back = tint of the primary colour");
  assert.deepEqual(px(B, 2, Math.round((BLEED_MM + 14) * PRINT_PPM)).slice(0, 3), hex(P.banner), "banner colour");
  const D = renderIdCardFace("front", staff(), { ...COMPANY, theme: null }, {}, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.deepEqual(px(D, 2, Math.round(D.heightPx / 2)).slice(0, 3), hex("#15315A"));
});

test("colours: Card PDF, Print sheet PDF and the PNG zip carry the saved colours (and the QR still decodes in them)", async () => {
  const co: IdCardCompany = { ...COMPANY, theme: MAROON };
  const P = resolvePalette(MAROON);
  const items = [item(staff()), item(staff({ id: "w2", name: "Second Person", verifyCode: "123456789abc" }))];
  // Card PDF
  const cimgs = pdfImages(Buffer.from(await (await buildCardPdf(items, co)).arrayBuffer()));
  assert.equal(cimgs.length, 4);
  assert.ok(near(at(cimgs[0], 2, 1000), hex(P.primary)), "card PDF front = primary");
  assert.ok(near(at(cimgs[1], 2, 1700), hex(P.tint)), "card PDF back = tint");
  assert.ok(near(at(cimgs[0], 2, 2), hex(P.accent)), "card PDF top stripe = accent");
  const ref = renderIdCardFace("front", items[0].data, co, items[0].images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.equal(jsQR(crop(cimgs[0], ref.qr.x, ref.qr.y, ref.qr.w, ref.qr.h), ref.qr.w, ref.qr.h)?.data, verifyUrl(items[0].data.verifyCode));
  const refB = renderIdCardFace("back", items[1].data, co, items[1].images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.equal(jsQR(crop(cimgs[3], refB.qr.x, refB.qr.y, refB.qr.w, refB.qr.h), refB.qr.w, refB.qr.h)?.data, verifyUrl(items[1].data.verifyCode));
  const plainPdf = pdfImages(Buffer.from(await (await buildCardPdf([items[0]], COMPANY)).arrayBuffer()));
  assert.ok(near(at(plainPdf[0], 2, 1000), hex("#15315A")), "no saved colours: navy");
  // Print sheet PDF
  const sheet = pdfImages(Buffer.from(await (await buildSheetPdf(items, co, "a4")).arrayBuffer()));
  assert.equal(sheet.length, 4);
  assert.ok(near(at(sheet[0], 2, 1000), hex(P.primary)) && near(at(sheet[2], 2, 1700), hex(P.tint)), "sheet PDF (backs come after the fronts) uses the saved colours");
  assert.equal(jsQR(crop(sheet[0], ref.qr.x, ref.qr.y, ref.qr.w, ref.qr.h), ref.qr.w, ref.qr.h)?.data, verifyUrl(items[0].data.verifyCode));
  // PNG zip
  const zip = await JSZip.loadAsync(await (await buildPngZip(items, co)).arrayBuffer());
  const draw = async (name: string) => { const im = await loadImage(await zip.file(name)!.async("nodebuffer")); const c = createCanvas(im.width, im.height); const cx = c.getContext("2d"); cx.drawImage(im, 0, 0); return cx; };
  assert.ok(near([...(await draw("Amanda_Clarke_front_600dpi_bleed3mm.png")).getImageData(2, 1000, 1, 1).data].slice(0, 3), hex(P.primary)), "PNG front = primary");
  assert.ok(near([...(await draw("Second_Person_back_600dpi_bleed3mm.png")).getImageData(2, 1700, 1, 1).data].slice(0, 3), hex(P.tint)), "PNG back = tint");
});

// ── the verify page header and the logo suggestions ──────────────────────────────────────────────────────────────────────────
test("colours: the verify page header uses the company colours with automatic text; none saved = the default", () => {
  assert.deepEqual(headerColors(null), { bg: "#15315A", fg: "#FFFFFF", accent: "#C9A84C" });
  assert.equal(headerColors({ primary: "#FAFAFA", accent: "#F5F5F5" }).fg, "#050505");
  const h = headerColors(MAROON);
  assert.ok(contrast(h.fg, h.bg) >= 4.5);
});

test("logo colours: white and transparent pixels are ignored; the brand colours come out as sensible pairs", () => {
  const W = 40, H = 40, buf = new Uint8ClampedArray(W * H * 4);
  const put = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; } };
  put(0, 0, W, H, 255, 255, 255);              // white background
  put(0, 0, 10, 10, 0, 0, 0, 0);               // a transparent patch
  put(5, 5, 30, 30, 185, 28, 28);              // red: the big shape
  put(12, 12, 24, 24, 20, 60, 160);            // blue inside it
  const colors = extractDominantColors(buf);
  assert.equal(colors.length, 2, colors.join());
  assert.equal(colors[0], rgbToHex([185, 28, 28]), "red is the main colour: " + colors.join());
  assert.ok(!colors.includes("#FFFFFF"));
  const s = suggestThemes(colors);
  assert.ok(s.length >= 2 && s.length <= 3, "2-3 suggestions");
  for (const t of s) { assert.match(t.primary, /^#[0-9A-F]{6}$/); assert.match(t.accent, /^#[0-9A-F]{6}$/); assert.notEqual(t.primary, t.accent); assert.ok(contrast(t.primary, t.accent) >= 3, "accent stands out"); }
  assert.equal(new Set(s.map((t) => t.primary + t.accent)).size, s.length, "all different");
  const empty = new Uint8ClampedArray(W * H * 4).fill(255); for (let i = 3; i < empty.length; i += 8) empty[i] = 0;      // white and half transparent: nothing to find
  assert.deepEqual(extractDominantColors(empty), []);
  assert.deepEqual(suggestThemes([]), []);
  const light = suggestThemes(["#FFE97A"]);                                                                              // one very light brand colour is deepened to be a card face
  assert.ok(light.length >= 1 && contrast(light[0].primary, "#FFFFFF") >= 3, JSON.stringify(light));
});
