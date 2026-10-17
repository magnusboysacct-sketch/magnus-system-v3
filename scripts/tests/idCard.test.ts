/* eslint-disable @typescript-eslint/no-explicit-any */
// Tests for the ID card renderer and the print-shop downloads (src/lib/idCardRender.ts, idCardExport.ts, idCardGuide.ts).
// They run in Node with @napi-rs/canvas standing in for the browser's canvas; the QR codes are decoded with jsQR, from the rendered canvas AND from the images
// embedded in the generated PDFs / PNGs.
// Run:  npm run test:share
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import JSZip from "jszip";
import {
  BLEED_MM, CARD_H_MM, CARD_W_MM, ID_VERIFY_BASE, MIN_QR_MM, PRINT_PPM, SAFE_MM, SCREEN_PPM, renderIdCardFace, renderQrCanvas, safeZoneViolations, setCanvasFactory, verifyUrl,
  type IdCardCompany, type IdCardData, type RenderedFace,
} from "../../src/lib/idCardRender";
import { PAGE_H_MM, PAGE_W_MM, PAPER_MM, buildCardPdf, buildInstructionsPdf, buildPngZip, buildSheetPdf, cardPdfName, cellOrigin, pngZipName, sheetLayout, sheetPdfName, type CardItem } from "../../src/lib/idCardExport";
import { shopMessage } from "../../src/lib/idCardGuide";

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const mk = (w: number, h: number, paint: (c: ReturnType<ReturnType<typeof createCanvas>["getContext"]>) => void) => { const c = createCanvas(w, h); paint(c.getContext("2d")); return c as any; };
const PHOTO = mk(300, 400, (c) => { c.fillStyle = "#6f8fb8"; c.fillRect(0, 0, 300, 400); c.fillStyle = "#e9c9a5"; c.beginPath(); c.arc(150, 150, 70, 0, 7); c.fill(); });
const LOGO_WIDE = mk(520, 160, (c) => { c.fillStyle = "#ffffff"; c.fillRect(0, 0, 520, 160); c.fillStyle = "#b91c1c"; c.fillRect(0, 0, 160, 160); });
const LOGO_TALL = mk(100, 400, (c) => { c.fillStyle = "#1d4ed8"; c.fillRect(0, 0, 100, 400); });
const SIGNATURE = mk(300, 100, (c) => { c.strokeStyle = "#111"; c.lineWidth = 4; c.beginPath(); c.moveTo(10, 70); c.bezierCurveTo(60, -10, 100, 120, 150, 40); c.stroke(); });
const COMPANY: IdCardCompany = { name: "Magnus Boys Construction", tagline: "Building With Integrity", contactLines: ["12 Hope Road, Unit 2", "St Andrew, Jamaica", "Tel: 876-555-0100", "Email: office@magnusboys.com"] };
const worker = (over: Partial<IdCardData> = {}): IdCardData => ({
  kind: "worker", id: "w1", name: "Jonathan Bartholomew-Williams", title: "Master Carpenter", initials: "JB", verifyCode: "f14afb95658c", cardTitle: "SITE IDENTIFICATION CARD",
  detail: { label: "National ID", value: "123-456-789" }, bearer: [["Address", "14 Long Lane, Kingston"], ["Phone", "876-555-0111"]],
  issuedLabel: "Mar 5, 2026", expiresLabel: "Mar 5, 2028", expired: false, expiryColor: "#C9A84C",
  statement: "This card certifies the bearer is an authorized worker of Magnus Boys Construction. This card remains company property and must be surrendered upon termination.", ...over });
const staff = (over: Partial<IdCardData> = {}): IdCardData => worker({ kind: "staff", id: "s1", name: "Amanda Clarke", title: "Quantity Surveyor", initials: "AC", verifyCode: "0a1b2c3d4e5f", cardTitle: "STAFF IDENTIFICATION CARD",
  detail: { label: "Employee No", value: "MB-014" }, bearer: undefined, issuedLabel: "Jan 2026", expiresLabel: "Jan 2028", expiryColor: "#4ade80", ...over });
const item = (data: IdCardData, images: any = { photo: PHOTO, logo: LOGO_WIDE, signature: SIGNATURE }): CardItem => ({ data, images });

const decode = (r: RenderedFace, x = r.qr.x, y = r.qr.y, w = r.qr.w, h = r.qr.h) => {
  const ctx = r.canvas.getContext("2d") as any;
  const d = ctx.getImageData(x, y, w, h);
  return jsQR(d.data as unknown as Uint8ClampedArray, w, h)?.data ?? null;
};
const px = (r: RenderedFace, x: number, y: number) => { const d = (r.canvas.getContext("2d") as any).getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ── the QR ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("QR: encodes the production address and the card's verify code, never the browser's origin", () => {
  assert.equal(ID_VERIFY_BASE, "https://app.magnusboys.com");
  assert.equal(verifyUrl("f14afb95658c"), "https://app.magnusboys.com/v/f14afb95658c");
  for (const data of [worker(), staff()]) for (const face of ["front", "back"] as const) {
    const r = renderIdCardFace(face, data, COMPANY, { photo: PHOTO, logo: LOGO_WIDE }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
    assert.equal(r.url, verifyUrl(data.verifyCode));
    assert.equal(decode(r), r.url, `${data.kind} ${face}`);
  }
});

test("QR: decodes on screen (9 px/mm) and in print (600 dpi), front and back, for staff and worker", () => {
  for (const ppm of [SCREEN_PPM, PRINT_PPM]) for (const data of [worker(), staff()]) for (const face of ["front", "back"] as const)
    assert.equal(decode(renderIdCardFace(face, data, COMPANY, { logo: LOGO_TALL }, { ppm, bleedMm: ppm === PRINT_PPM ? BLEED_MM : 0 })), verifyUrl(data.verifyCode), `${ppm} ${data.kind} ${face}`);
});

test("QR: at least 16 mm square on the printed card (front and back) and at least 120 px on screen; whole-pixel modules; 4-module margin", () => {
  for (const [ppm, bleed] of [[PRINT_PPM, BLEED_MM], [SCREEN_PPM, 0]] as const) for (const face of ["front", "back"] as const) {
    const r = renderIdCardFace(face, staff(), COMPANY, {}, { ppm, bleedMm: bleed });
    assert.ok(Number.isInteger(r.qr.modulePx) && r.qr.modulePx >= 1);
    assert.equal(r.qr.w, (r.qr.modules + 8) * r.qr.modulePx, "plate = symbol + 4 modules each side, whole pixels");
    assert.equal(r.qr.w, r.qr.h);
    const symbolMm = (r.qr.modules * r.qr.modulePx) / ppm;
    assert.ok(symbolMm >= MIN_QR_MM, `${face} ${ppm}: symbol ${symbolMm.toFixed(2)} mm`);
    if (ppm === SCREEN_PPM) assert.ok(r.qr.w >= 120 && (r.qr.modules * r.qr.modulePx) >= 120, `screen plate ${r.qr.w}px`);
    if (ppm === PRINT_PPM) assert.ok(r.qr.w / ppm >= MIN_QR_MM + 8 * 0.5, "print plate (with margin) is bigger than the 16 mm symbol");
  }
});

test("QR: only two colours (dark navy and pure white, no smoothing), error correction M, nothing drawn over it", () => {
  const r = renderIdCardFace("front", worker(), COMPANY, { photo: PHOTO, logo: LOGO_WIDE }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const d = (r.canvas.getContext("2d") as any).getImageData(r.qr.x, r.qr.y, r.qr.w, r.qr.h).data as Uint8ClampedArray;
  const seen = new Set<string>();
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
  assert.deepEqual([...seen].sort(), ["21,49,90,255", "255,255,255,255"].sort());
  // the 4-module margin is pure white all round
  const m = r.qr.modulePx * 4;
  for (const [x, y] of [[0, 0], [r.qr.w - 1, 0], [0, r.qr.w - 1], [m - 1, m - 1], [r.qr.w - m, r.qr.w - m]]) assert.deepEqual(px(r, r.qr.x + x, r.qr.y + y), [255, 255, 255, 255]);
  // the same plate drawn alone (full-screen view) is pixel-identical to the plate on the card
  const alone = renderQrCanvas(r.url, r.qr.modulePx);
  assert.equal(alone.width, r.qr.w);
  assert.deepEqual([...(alone.getContext("2d") as any).getImageData(0, 0, alone.width, alone.height).data], [...d]);
  // M, not L / Q / H: the 41-character address is a version-3 symbol (29 modules)
  assert.equal(r.qr.modules, 29);
});

test("QR: the full-screen view decodes at any size and is pure white around the code", () => {
  for (const mpx of [4, 9, 16]) {
    const c = renderQrCanvas(verifyUrl("0a1b2c3d4e5f"), mpx);
    const ctx = c.getContext("2d") as any;
    const d = ctx.getImageData(0, 0, c.width, c.height);
    assert.equal(jsQR(d.data as unknown as Uint8ClampedArray, c.width, c.height)?.data, verifyUrl("0a1b2c3d4e5f"));
  }
});

// ── the layout ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("layout: nothing important within 3 mm of the trim (text, photo, logo, QR), front and back, many shapes of card", () => {
  const variants: Array<[string, IdCardData, any]> = [
    ["worker full", worker(), { photo: PHOTO, logo: LOGO_WIDE, signature: SIGNATURE }],
    ["staff full", staff(), { photo: PHOTO, logo: LOGO_WIDE, signature: SIGNATURE }],
    ["tall logo", staff(), { photo: PHOTO, logo: LOGO_TALL }],
    ["no photo, no logo, no signature", worker({ detail: null, bearer: [] }), {}],
    ["very long name and title", staff({ name: "Maximilian Alexander Montgomery-Featherstonehaugh III", title: "Senior Quantity Surveyor and Estimating Manager" }), { logo: LOGO_WIDE }],
    ["long company, contact lines and detail", worker({ detail: { label: "National ID", value: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" }, bearer: [["Address", "Unit 14, The Very Long Named Apartment Complex, Some Road, Kingston 10"], ["Phone", "876-555-0111 / 876-555-0112"]] }), { photo: PHOTO, logo: LOGO_WIDE }],
    ["expired", worker({ expired: true, expiryColor: "#DC2626" }), { photo: PHOTO }],
  ];
  const longCo: IdCardCompany = { ...COMPANY, name: "The Very Long Named Construction And Engineering Company Limited", tagline: "A very long tagline that goes on and on and on for far too long", contactLines: ["Suite 100, Building A, Extremely Long Road Name That Keeps Going, Kingston 10, Jamaica W.I.", "b", "c", "d", "e"] };
  for (const [label, data, images] of variants) for (const co of [COMPANY, longCo]) for (const face of ["front", "back"] as const) for (const [ppm, bleed] of [[PRINT_PPM, BLEED_MM], [SCREEN_PPM, 0]] as const) {
    const r = renderIdCardFace(face, data, co, images, { ppm, bleedMm: bleed });
    const bad = safeZoneViolations(r);
    assert.deepEqual(bad, [], `${label} / ${co.name.slice(0, 12)} / ${face} / ${ppm}: ${bad.map((b) => b.what + " " + [b.x0, b.y0, b.x1, b.y1].map((n) => n.toFixed(2))).join("; ")}`);
    assert.ok(r.content.some((c) => c.what === "QR plate"));
  }
});

test("layout: the QR plate never overlaps the 'Scan to verify' label, the issued / expires footer, or other content", () => {
  const r = renderIdCardFace("front", worker(), COMPANY, { photo: PHOTO, logo: LOGO_WIDE }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const plate = r.content.find((c) => c.what === "QR plate")!;
  const others = r.content.filter((c) => c !== plate && c.what !== "logo plate");
  for (const o of others) {
    const overlaps = o.x0 < plate.x1 && o.x1 > plate.x0 && o.y0 < plate.y1 && o.y1 > plate.y0;
    assert.equal(overlaps, false, `QR plate overlaps ${o.what}`);
  }
  const label = r.content.find((c) => c.what.startsWith("text: SCAN TO VERIFY"))!;
  const issued = r.content.find((c) => c.what.startsWith("text: ISSUED"))!;
  assert.ok(label.y0 >= plate.y1, "label below the plate");
  assert.ok(label.y1 <= issued.y0 - 0.5, "label above the footer text");
  for (const face of ["front", "back"] as const) for (const data of [worker(), staff()]) {
    const x = renderIdCardFace(face, data, COMPANY, { photo: PHOTO, logo: LOGO_WIDE, signature: SIGNATURE }, { ppm: SCREEN_PPM, bleedMm: 0 });
    const pl = x.content.find((c) => c.what === "QR plate")!;
    for (const o of x.content.filter((c) => c !== pl)) assert.equal(o.x0 < pl.x1 && o.x1 > pl.x0 && o.y0 < pl.y1 && o.y1 > pl.y0, false, `${data.kind} ${face}: QR plate overlaps ${o.what}`);
  }
});

test("layout: the outer 3 mm of the trim holds no white (no QR plate or logo plate near the edge); the bleed carries the background; corners are square", () => {
  for (const [face, bg, bleedPx] of [["front", "#15315A", 0], ["back", "#E7EDF6", 0]] as const) {
    const r = renderIdCardFace(face, worker(), COMPANY, { photo: PHOTO, logo: LOGO_WIDE, signature: SIGNATURE }, { ppm: PRINT_PPM, bleedMm: BLEED_MM }); void bleedPx;
    const b = Math.round(BLEED_MM * PRINT_PPM), s = Math.round(SAFE_MM * PRINT_PPM);
    const ctx = r.canvas.getContext("2d") as any;
    const trimW = Math.round(CARD_W_MM * PRINT_PPM), trimH = Math.round(CARD_H_MM * PRINT_PPM);
    const band = (x: number, y: number, w: number, h: number) => { const d = ctx.getImageData(x, y, w, h).data; let white = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) white++; return white; };
    assert.equal(band(b, b, trimW, s - 2) + band(b, b + trimH - s + 2, trimW, s - 2) + band(b, b, s - 2, trimH) + band(b + trimW - s + 2, b, s - 2, trimH), 0, `${face}: white inside the safe band`);
    // bleed: every pixel of the outer ring is opaque; the corner pixel exists (square corners, nothing transparent)
    for (const [x, y] of [[0, 0], [r.widthPx - 1, 0], [0, r.heightPx - 1], [r.widthPx - 1, r.heightPx - 1], [b - 1, b - 1], [b, b]]) assert.equal(px(r, x, y)[3], 255, `${face} corner ${x},${y}`);
    // the mid-edge bleed pixels are the face colour (the background runs out to the edge)
    assert.deepEqual(px(r, 2, Math.round(r.heightPx / 2)).slice(0, 3), face === "front" ? hex(bg) : hex(bg));
    assert.deepEqual(px(r, r.widthPx - 3, Math.round(r.heightPx / 2) + 40).slice(0, 3), hex(bg));
  }
  // the stripes / banner run into the bleed too
  const f = renderIdCardFace("front", worker(), COMPANY, {}, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.deepEqual(px(f, 2, 2).slice(0, 3), hex("#C9A84C"), "gold top stripe reaches the top-left bleed corner");
  assert.deepEqual(px(f, f.widthPx - 3, f.heightPx - 3).slice(0, 3), hex("#C9A84C"), "gold bottom stripe reaches the bottom-right bleed corner");
  const bk = renderIdCardFace("back", worker(), COMPANY, {}, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.deepEqual(px(bk, 2, Math.round((BLEED_MM + 14) * PRINT_PPM)).slice(0, 3), hex("#F2A93B"), "amber banner reaches the left bleed edge");
  assert.equal(f.widthPx, Math.round(60 * PRINT_PPM)); assert.equal(f.heightPx, Math.round(91.6 * PRINT_PPM));
});

test("layout: staff card face shows no TRN (the employee number instead, or nothing)", () => {
  const withNo = renderIdCardFace("front", staff(), COMPANY, {}, { ppm: SCREEN_PPM, bleedMm: 0 });
  assert.ok(withNo.content.some((c) => c.what.startsWith("text: EMPLOYEE NO")) && withNo.content.some((c) => c.what.startsWith("text: MB-014")));
  assert.ok(!withNo.content.some((c) => /TRN/i.test(c.what)));
  const without = renderIdCardFace("front", staff({ detail: null }), COMPANY, {}, { ppm: SCREEN_PPM, bleedMm: 0 });
  assert.ok(!without.content.some((c) => /EMPLOYEE|TRN/i.test(c.what)));
});

// ── the PDFs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ptToMm = (pt: number) => (pt * 25.4) / 72;
function pdfPages(bytes: Buffer): Array<{ w: number; h: number }> {
  const txt = bytes.toString("latin1");
  return [...txt.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({ w: ptToMm(parseFloat(m[1])), h: ptToMm(parseFloat(m[2])) }));
}
// every image XObject that is RGB, in file order, decoded to raw RGB (the PNG "Sub"/predictor rows jsPDF writes are undone here)
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
const crop = (img: { w: number; h: number; rgba: Uint8ClampedArray }, x: number, y: number, w: number, h: number) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) out.set(img.rgba.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4);
  return out;
};

test("card PDF: 2 pages per person, each exactly 60 x 91.6 mm (54 x 85.6 trim + 3 mm bleed); the embedded QR on every page decodes", async () => {
  const items = [item(staff()), item(worker()), item(staff({ name: "Pat Lee", id: "s2", verifyCode: "123456789abc", detail: null }), { logo: LOGO_TALL })];
  const bytes = Buffer.from(await (await buildCardPdf(items, COMPANY)).arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pages = pdfPages(bytes);
  assert.equal(pages.length, 6);
  for (const p of pages) { assert.ok(Math.abs(p.w - 60) < 0.01 && Math.abs(p.h - 91.6) < 0.01, `page ${p.w} x ${p.h} mm`); }
  assert.equal(PAGE_W_MM, 60); assert.ok(Math.abs(PAGE_H_MM - 91.6) < 1e-9);
  const imgs = pdfImages(bytes);
  assert.equal(imgs.length, 6);
  const expected = items.flatMap((i) => (["front", "back"] as const).map((face) => ({ i, face })));
  imgs.forEach((img, k) => {
    assert.equal(img.w, Math.round(60 * PRINT_PPM)); assert.equal(img.h, Math.round(91.6 * PRINT_PPM));
    const ref = renderIdCardFace(expected[k].face, expected[k].i.data, COMPANY, expected[k].i.images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
    const text = jsQR(crop(img, ref.qr.x, ref.qr.y, ref.qr.w, ref.qr.h), ref.qr.w, ref.qr.h)?.data;
    assert.equal(text, verifyUrl(expected[k].i.data.verifyCode), `QR in PDF page ${k + 1}`);
  });
  assert.equal(cardPdfName([items[0]], COMPANY), "Amanda_Clarke_ID_card_CR80_bleed3mm.pdf");
  assert.match(cardPdfName(items, COMPANY), /^Magnus_Boys_Construction_ID_cards_x3_CR80_bleed3mm\.pdf$/);
});

test("print sheet PDF: A4 and Letter, fronts then matching backs, mirrored, crop marks inside the margins, cards at true size", async () => {
  for (const paper of ["a4", "letter"] as const) {
    const L = sheetLayout(paper);
    const [pw, ph] = PAPER_MM[paper];
    assert.equal(L.cols, 3); assert.equal(L.rows, paper === "a4" ? 3 : 2);
    assert.ok(L.left >= 10 && L.top >= 10, "room for crop marks");
    assert.ok(L.left + L.gridW <= pw - 10 + 1e-9 && L.top + L.gridH <= ph - 10 + 1e-9);
    // mirrored: the back of the card at column c sits at column (cols-1-c); same row; the two columns are symmetric about the page centre
    for (let i = 0; i < L.perPage; i++) {
      const f = cellOrigin(paper, i, false), b = cellOrigin(paper, i, true);
      assert.ok(Math.abs(f.y - b.y) < 1e-9);
      assert.ok(Math.abs(f.x + b.x + CARD_W_MM - pw) < 1e-6, `card ${i}: front x ${f.x}, back x ${b.x}`);
    }
    const n = L.perPage + 2;                                   // two pages' worth of fronts: 2 sheets x (front + back) = 4 pages
    const items = Array.from({ length: n }, (_, k) => item(staff({ id: "s" + k, name: "Person " + k, verifyCode: (0x100000000000 + k).toString(16) })));
    const bytes = Buffer.from(await (await buildSheetPdf(items, COMPANY, paper)).arrayBuffer());
    const pages = pdfPages(bytes);
    assert.equal(pages.length, 4);
    for (const p of pages) assert.ok(Math.abs(p.w - pw) < 0.01 && Math.abs(p.h - ph) < 0.01, `${paper} page ${p.w} x ${p.h}`);
    // the images placed on the pages: true card size (+ bleed), at the cells' positions
    const streams: string[] = [];
    const txt = bytes.toString("latin1");
    for (const m of txt.matchAll(/stream\r?\n/g)) {
      const start = m.index! + m[0].length, end = txt.indexOf("endstream", start);
      if (end < 0 || txt.slice(Math.max(0, m.index! - 3), m.index!) === "end") continue;
      try { const s = zlib.inflateSync(bytes.subarray(start, end)).toString("latin1"); if (/\bcm\b/.test(s) && /\bDo\b/.test(s)) streams.push(s); } catch { /* an image or font, not a page */ }
    }
    const placed = streams.map((s) => [...s.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/\w+ Do/g)].map((m) => ({ w: ptToMm(+m[1]), h: ptToMm(+m[2]), x: ptToMm(+m[3]), top: ph - ptToMm(+m[4]) - ptToMm(+m[2]) })));
    assert.equal(placed.length, 4, "four content streams with images");
    assert.equal(placed[0].length, L.perPage); assert.equal(placed[1].length, L.perPage); assert.equal(placed[2].length, 2); assert.equal(placed[3].length, 2);
    placed.forEach((pg, k) => pg.forEach((p, i) => {
      assert.ok(Math.abs(p.w - 60) < 0.02 && Math.abs(p.h - 91.6) < 0.02, "card art is 60 x 91.6 mm = true card size + 3 mm bleed");
      const o = cellOrigin(paper, i, k % 2 === 1);
      assert.ok(Math.abs(p.x - (o.x - BLEED_MM)) < 0.02 && Math.abs(p.top - (o.y - BLEED_MM)) < 0.02, `${paper} page ${k + 1} card ${i}: at ${p.x.toFixed(2)},${p.top.toFixed(2)} expected ${(o.x - 3).toFixed(2)},${(o.y - 3).toFixed(2)}`);
    }));
    assert.match(sheetPdfName(items, COMPANY, paper), /print_sheet_(A4|LETTER)\.pdf$/);
    // QR on the sheet decodes too
    const imgs = pdfImages(bytes);
    assert.equal(imgs.length, 2 * n);
    const ref = renderIdCardFace("front", items[0].data, COMPANY, items[0].images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
    assert.equal(jsQR(crop(imgs[0], ref.qr.x, ref.qr.y, ref.qr.w, ref.qr.h), ref.qr.w, ref.qr.h)?.data, verifyUrl(items[0].data.verifyCode));
  }
});

test("PNG zip: front and back of everyone at 600 dpi with bleed (1417 x 2164 px, resolution written into the file), plus PRINT INSTRUCTIONS.pdf; the QR decodes", async () => {
  const items = [item(staff()), item(worker())];
  const zip = await JSZip.loadAsync(await (await buildPngZip(items, COMPANY)).arrayBuffer());
  const names = Object.keys(zip.files).sort();
  assert.deepEqual(names, ["Amanda_Clarke_back_600dpi_bleed3mm.png", "Amanda_Clarke_front_600dpi_bleed3mm.png", "Jonathan_Bartholomew-Williams_back_600dpi_bleed3mm.png", "Jonathan_Bartholomew-Williams_front_600dpi_bleed3mm.png", "PRINT INSTRUCTIONS.pdf"].sort());
  const bytes = await zip.file("Amanda_Clarke_front_600dpi_bleed3mm.png")!.async("nodebuffer");
  const img = await loadImage(bytes);
  assert.equal(img.width, 1417); assert.equal(img.height, 2164);
  // pHYs chunk: 600 dpi = 23622 pixels per metre, unit = metre
  const i = bytes.indexOf("pHYs");
  assert.ok(i > 0); assert.equal(bytes.readUInt32BE(i + 4), 23622); assert.equal(bytes.readUInt32BE(i + 8), 23622); assert.equal(bytes[i + 12], 1);
  const c = createCanvas(img.width, img.height); const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
  const ref = renderIdCardFace("front", items[0].data, COMPANY, items[0].images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const d = ctx.getImageData(ref.qr.x, ref.qr.y, ref.qr.w, ref.qr.h);
  assert.equal(jsQR(d.data as unknown as Uint8ClampedArray, ref.qr.w, ref.qr.h)?.data, verifyUrl(items[0].data.verifyCode));
  assert.match(pngZipName(items, COMPANY), /_ID_cards_PNG_600dpi_bleed3mm\.zip$/);
  const inst = Buffer.from(await zip.file("PRINT INSTRUCTIONS.pdf")!.async("arraybuffer"));
  assert.equal(inst.subarray(0, 5).toString(), "%PDF-");
});

test("PRINT INSTRUCTIONS.pdf: A4, one page for a normal list, more pages only for a very long list of names", async () => {
  const one = Buffer.from(await (await buildInstructionsPdf([item(staff()), item(worker())], COMPANY, LOGO_WIDE)).arrayBuffer());
  const p1 = pdfPages(one);
  assert.equal(p1.length, 1); assert.ok(Math.abs(p1[0].w - 210) < 0.01 && Math.abs(p1[0].h - 297) < 0.01);
  const many = Array.from({ length: 150 }, (_, k) => item(staff({ id: "s" + k, name: "Person Number " + k })));
  const p2 = pdfPages(Buffer.from(await (await buildInstructionsPdf(many, COMPANY)).arrayBuffer()));
  assert.ok(p2.length >= 2 && p2.every((p) => Math.abs(p.w - 210) < 0.01));
});

test("print-shop message: company name and number of cards filled in, with the exact specification", () => {
  assert.equal(shopMessage("Acme Ltd", ["staff", "staff", "staff"]),
    "Hi, I need 3 staff ID cards printed for Acme Ltd. Size: CR80 (standard ID / bank card), 54 x 85.6 mm, portrait, double-sided. Files are print-ready PDF with 3 mm bleed on all sides; please trim to the card size. Colour, 300 dpi or higher. Please do a test card first so I can check the colours and that the QR code scans.");
  assert.match(shopMessage("Acme Ltd", ["worker"]), /^Hi, I need 1 worker ID card printed for Acme Ltd\./);
  assert.match(shopMessage("Acme Ltd", ["staff", "worker"]), /^Hi, I need 2 ID cards printed for Acme Ltd\./);
  assert.equal(CARD_H_MM, 85.6);
});
