/* eslint-disable @typescript-eslint/no-explicit-any */
// Tests for the company logo handling (src/lib/logoImage.ts, and the logo drawing in src/lib/idCardRender.ts).
// Run:  npm run test:idcard
import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import JSZip from "jszip";
import { BLEED_MM, PRINT_PPM, drawLogo, fitLogoMm, prepareLogo, renderIdCardFace, safeZoneViolations, setCanvasFactory, type IdCardCompany, type IdCardData } from "../../src/lib/idCardRender";
import { buildPngZip } from "../../src/lib/idCardExport";
import {
  LOGO_ACCEPT, LOGO_ALLOWED_TYPES, LOGO_MAX_BYTES, LOGO_MIN_WIDTH, LOGO_SMALL_WARNING, TRIM_DEFAULT_ABOVE, describeLogo, logoExtension, logoIsSmall, logoType, marginsAreWasteful, measureMargins,
  svgDimensions, svgIsSafe, svgWithSize, trimBox, trimIsWorthIt, trimRect, validateLogoFile,
} from "../../src/lib/logoImage";

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
const mk = (w: number, h: number, paint: (c: any) => void) => { const c = createCanvas(w, h); paint(c.getContext("2d")); return c as any; };
const COMPANY: IdCardCompany = { name: "Magnus Boys Construction", tagline: "Building With Integrity", contactLines: ["12 Hope Road"] };
const staff = (): IdCardData => ({ kind: "staff", id: "s1", name: "Amanda Clarke", title: "Quantity Surveyor", initials: "AC", verifyCode: "0a1b2c3d4e5f", cardTitle: "STAFF IDENTIFICATION CARD",
  detail: null, bearer: [], issuedLabel: "Jan 2026", expiresLabel: "Jan 2028", expired: false, expiryColor: "#4ade80", statement: "This card certifies the bearer." });

// ── upload rules ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("upload: only PNG and JPG up to 5 MB are accepted; WEBP and SVG are refused with a readable message", () => {
  assert.deepEqual([...LOGO_ALLOWED_TYPES], ["image/png", "image/jpeg"]);
  assert.ok(!/webp|svg/i.test(LOGO_ACCEPT), "the file picker does not offer WEBP or SVG: " + LOGO_ACCEPT);
  for (const [type, ext] of [["image/png", "png"], ["image/jpeg", "jpg"]]) {
    assert.equal(validateLogoFile({ type, name: "logo." + ext, size: 1000 }), null, type);
    assert.equal(logoExtension(type), ext);
  }
  assert.equal(validateLogoFile({ type: "image/png", name: "a.png", size: LOGO_MAX_BYTES }), null, "exactly 5 MB is fine");
  assert.match(validateLogoFile({ type: "image/png", name: "a.png", size: LOGO_MAX_BYTES + 1 })!, /at most 5 MB/);
  assert.match(validateLogoFile({ type: "image/webp", name: "a.webp", size: 10 })!, /PNG or JPG/);
  assert.match(validateLogoFile({ type: "image/svg+xml", name: "a.svg", size: 10 })!, /SVG logos are not accepted yet/);
  assert.match(validateLogoFile({ type: "image/gif", name: "a.gif", size: 10 })!, /PNG or JPG/);
  assert.match(validateLogoFile({ type: "application/pdf", name: "a.pdf", size: 10 })!, /PNG or JPG/);
  assert.match(validateLogoFile({ type: "image/png", name: "a.png", size: 0 })!, /empty/);
  // some browsers give no type: the extension decides (so a .svg or .webp with no type is still refused)
  assert.equal(logoType({ type: "", name: "Logo.SVG" }), "image/svg+xml");
  assert.match(validateLogoFile({ type: "", name: "Logo.SVG", size: 5 })!, /SVG logos are not accepted/);
  assert.match(validateLogoFile({ type: "application/octet-stream", name: "x.webp", size: 5 })!, /PNG or JPG/);
  assert.equal(logoType({ type: "image/jpg", name: "x.jpg" }), "image/jpeg");
  assert.equal(validateLogoFile({ type: "", name: "x.png", size: 5 }), null);
});

test("upload: a raster logo under 1000 px wide gets the warning; larger logos do not (judged on the picked file, not on the trimmed copy)", () => {
  assert.equal(LOGO_MIN_WIDTH, 1000);
  assert.equal(logoIsSmall({ vector: false, width: 999 }), true);
  assert.equal(logoIsSmall({ vector: false, width: 1000 }), false);
  assert.equal(logoIsSmall({ vector: false, width: 792, sourceWidth: 1200 }), false, "a trimmed copy is not warned about when the picked file was big enough");
  assert.equal(logoIsSmall({ vector: false, width: 700, sourceWidth: 800 }), true);
  assert.equal(logoIsSmall({ vector: true, width: 24 }), false, "a vector logo that is already stored is sharp at any size");
  assert.equal(LOGO_SMALL_WARNING, "This logo is small and may look blurry on cards and documents. Upload a larger PNG for best quality.");
  assert.equal(describeLogo({ type: "image/png", width: 1200, height: 744, vector: false, bytes: 74311, margins: null }), "PNG · 1200 × 744 px · 73 KB");
  assert.equal(describeLogo({ type: "image/png", width: 800, height: 610, vector: false, bytes: 50000, margins: null, trimmedFrom: { width: 1200, height: 744 } }),
    "PNG · 800 × 610 px · 49 KB (empty space trimmed; original 1200 × 744 px kept)");
  assert.equal(describeLogo({ type: "image/svg+xml", width: 76, height: 76, vector: true, margins: null }), "SVG (vector, sharp at any size)");
  assert.equal(describeLogo({ type: "image/jpeg", width: 3000, height: 1000, vector: false, bytes: 2.5 * 1048576, margins: null }), "JPG · 3000 × 1000 px · 2.5 MB");
});

test("trim: the artwork's box is found (transparent margins, or near-white margins when the logo has no transparency) and offered when over 10% is empty", () => {
  const W = 200, H = 100;
  const make = (fill: [number, number, number, number], art: [number, number, number, number], box: [number, number, number, number]) => {
    const buf = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < buf.length; i += 4) { buf[i] = fill[0]; buf[i + 1] = fill[1]; buf[i + 2] = fill[2]; buf[i + 3] = fill[3]; }
    for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) { const i = (y * W + x) * 4; buf[i] = art[0]; buf[i + 1] = art[1]; buf[i + 2] = art[2]; buf[i + 3] = art[3]; }
    return buf;
  };
  // transparent margins
  const t = trimBox(make([0, 0, 0, 0], [185, 28, 28, 255], [50, 20, 150, 70]), W, H)!;
  assert.deepEqual([t.x0, t.y0, t.x1, t.y1, t.basis], [50, 20, 150, 70, "transparent"]);
  assert.ok(Math.abs(t.emptyShare - (1 - (100 * 50) / (W * H))) < 1e-9);
  assert.equal(trimIsWorthIt(t), true);
  // near-white margins on a logo with no transparency (a JPG / a PNG on white)
  const w = trimBox(make([255, 255, 255, 255], [20, 40, 120, 255], [30, 10, 170, 90]), W, H)!;
  assert.deepEqual([w.x0, w.y0, w.x1, w.y1, w.basis], [30, 10, 170, 90, "white"]);
  const off = trimBox(make([250, 250, 250, 255], [20, 40, 120, 255], [30, 10, 170, 90]), W, H)!;
  assert.deepEqual([off.x0, off.x1], [30, 170], "off-white margins count as margin too");
  // a WHITE logo on a transparent background is kept whole (white is artwork when there is transparency)
  const whiteLogo = trimBox(make([0, 0, 0, 0], [255, 255, 255, 255], [50, 20, 150, 70]), W, H)!;
  assert.deepEqual([whiteLogo.x0, whiteLogo.x1], [50, 150]);
  // little margin: not offered (the threshold is 10% of the image)
  assert.equal(TRIM_DEFAULT_ABOVE, 0.1);
  const tight = trimBox(make([0, 0, 0, 0], [1, 2, 3, 255], [4, 2, 196, 98]), W, H)!;
  assert.equal(trimIsWorthIt(tight), false);
  const nearTen = trimBox(make([0, 0, 0, 0], [1, 2, 3, 255], [0, 0, 190, 100]), W, H)!;      // 5% empty
  assert.equal(trimIsWorthIt(nearTen), false);
  const abovTen = trimBox(make([0, 0, 0, 0], [1, 2, 3, 255], [0, 0, 170, 100]), W, H)!;      // 15% empty
  assert.equal(trimIsWorthIt(abovTen), true);
  // nothing but background: nothing to crop to
  assert.equal(trimBox(make([255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 1, 1]), W, H), null);
  assert.equal(trimBox(new Uint8ClampedArray(W * H * 4), W, H), null);
  // the crop keeps a little air and never leaves the image
  assert.deepEqual(trimRect(t, W, H), { x: 48, y: 18, w: 104, h: 54 });
  assert.deepEqual(trimRect({ ...abovTen }, W, H), { x: 0, y: 0, w: 172, h: 100 });
});

test("svg: scripts and embedded content are refused; the drawing's size is read from width / height or the viewBox", () => {
  assert.equal(svgIsSafe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), true);
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"></svg>', '<svg><a href="javascript:alert(1)"><rect/></a></svg>', '<svg><foreignObject><div/></foreignObject></svg>', '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'])
    assert.equal(svgIsSafe(bad), false, bad);
  assert.deepEqual(svgDimensions('<svg width="120px" height="40px"></svg>'), { width: 120, height: 40 });
  assert.deepEqual(svgDimensions('<svg viewBox="0 0 76.2 76.2"></svg>'), { width: 76.2, height: 76.2 });
  assert.deepEqual(svgDimensions('<svg viewBox="0,0,200,50"></svg>'), { width: 200, height: 50 });
  assert.equal(svgDimensions("<html></html>"), null);
  assert.equal(svgDimensions("<svg></svg>"), null);
  const sized = svgWithSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect/></svg>')!;
  assert.deepEqual([sized.width, sized.height], [1000, 250]);
  assert.match(sized.text, /<svg width="1000" height="250"/);
  assert.equal(svgWithSize('<svg width="30" height="30" viewBox="0 0 10 10"></svg>')!.text.includes('width="30"'), true, "an SVG that already has a size is left as it is");
});

test("margins: the empty transparent border around the artwork is measured; a logo without transparency has none to trim", () => {
  const W = 100, H = 60, buf = new Uint8ClampedArray(W * H * 4);
  for (let y = 10; y < 40; y++) for (let x = 30; x < 70; x++) { const i = (y * W + x) * 4; buf[i + 3] = 255; }
  const m = measureMargins(buf, W, H)!;
  assert.deepEqual([m.box.x0, m.box.y0, m.box.x1, m.box.y1], [30, 10, 70, 40]);
  assert.ok(Math.abs(m.left - 0.3) < 1e-9 && Math.abs(m.right - 0.3) < 1e-9 && Math.abs(m.top - 10 / 60) < 1e-9);
  assert.equal(marginsAreWasteful(m), true);
  const solid = new Uint8ClampedArray(W * H * 4).fill(255);
  assert.equal(measureMargins(solid, W, H), null);
  assert.equal(measureMargins(new Uint8ClampedArray(W * H * 4), W, H), null, "fully transparent: nothing to measure");
  assert.equal(marginsAreWasteful({ ...m, left: 0.05, right: 0.05, top: 0.05, bottom: 0.05 }), false);
});

// ── drawing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// a 1200 x 744 logo like the company's: artwork in the middle with wide transparent margins, thin lines of small "text" at the bottom
const BIG = mk(1200, 744, (c) => {
  c.fillStyle = "#b91c1c"; c.fillRect(204, 29, 792, 400);                       // the big mark
  c.fillStyle = "#1e2a6e"; for (let i = 0; i < 4; i++) c.fillRect(260 + i * 180, 592, 90, 3);   // thin text-like strokes, 3 px tall
});

test("logo drawing: empty transparent margins are trimmed, the file itself is not altered", () => {
  const p = prepareLogo(BIG);
  assert.ok(p.sw < 1200 * 0.7 && p.sh < 744 * 0.9, `${p.sw}x${p.sh}`);
  assert.ok(p.sx <= 205 && p.sx >= 200 && p.sy <= 30, `${p.sx},${p.sy}`);
  assert.equal(BIG.width, 1200); assert.equal(BIG.height, 744);                                 // the original canvas still has its full size
  assert.equal(prepareLogo(BIG), p, "prepared once per image");
  const opaque = mk(400, 200, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 400, 200); c.fillStyle = "#000"; c.fillRect(100, 50, 200, 100); });
  const po = prepareLogo(opaque);
  assert.deepEqual([po.sx, po.sy, po.sw, po.sh], [0, 0, 400, 200], "a logo with no transparency is drawn whole");
});

test("logo drawing: on the card the trimmed artwork fills the plate - bigger than the whole file would", () => {
  const front = (logo: any) => renderIdCardFace("front", staff(), COMPANY, { logo }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const plate = (r: ReturnType<typeof front>) => r.content.find((c) => c.what === "logo plate")!;
  const trimmed = plate(front(BIG));
  // the same artwork padded with an opaque white margin cannot be trimmed: same file shape, but the artwork is smaller on the plate
  const padded = mk(1200, 744, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 1200, 744); c.drawImage(BIG, 0, 0); });
  const whole = plate(front(padded));
  const artworkMm = (pl: typeof trimmed, frac: number) => (pl.y1 - pl.y0) * frac;
  assert.ok(artworkMm(trimmed, 1) >= 0, "plate exists");
  const p = prepareLogo(BIG);
  const f = fitLogoMm(p, 27, 9);
  assert.ok(f.h > 8.9 || f.w > 26.9, "the trimmed artwork reaches the edge of its box: " + JSON.stringify(f));
  const fw = fitLogoMm(prepareLogo(padded), 27, 9);
  const scaleTrimmed = f.h / p.sh, scaleWhole = fw.h / prepareLogo(padded).sh;                       // millimetres per source pixel of the artwork
  assert.ok(scaleTrimmed > scaleWhole * 1.15, `artwork is drawn at least 15% larger when trimmed: ${scaleTrimmed.toFixed(4)} vs ${scaleWhole.toFixed(4)}`);
  assert.ok(trimmed.x1 - trimmed.x0 > 0 && whole.x1 - whole.x0 > 0);
  const r = front(BIG);
  assert.deepEqual(safeZoneViolations(r), [], "still inside the safe zone");
});

test("logo drawing: a vector logo scales freely, a raster logo is never enlarged past its own pixels", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1d4ed8"/></svg>');
  const img: any = await loadImage(svg);
  const vec = fitLogoMm(prepareLogo(img, true), 27, 9);
  assert.ok(Math.abs(vec.h - 9) < 0.01, "a 24-unit SVG fills the 9 mm box: " + JSON.stringify(vec));
  const small = fitLogoMm(prepareLogo(mk(24, 24, (c) => { c.fillStyle = "#1d4ed8"; c.fillRect(0, 0, 24, 24); }), false), 27, 9);
  assert.ok(small.h < 9 && Math.abs(small.h - 24 * (54 / 213)) < 0.01, "a 24 px raster stays at its natural size: " + JSON.stringify(small));
  const r = renderIdCardFace("front", staff(), COMPANY, { logo: img, logoVector: true }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  assert.deepEqual(safeZoneViolations(r), []);
});

test("logo drawing: thin strokes survive the shrink to 600 dpi (stepwise, high quality)", () => {
  // draw the logo's thin lines at the card's size; the result must contain them (not skipped by the shrink)
  const p = prepareLogo(BIG);
  const f = fitLogoMm(p, 27, 9);
  const w = Math.round(f.w * PRINT_PPM), h = Math.round(f.h * PRINT_PPM);
  const c = createCanvas(w, h); const cx = c.getContext("2d") as any;
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h);
  drawLogo(cx, p, 0, 0, w, h);
  // the strokes are at y = 592..595 of the 744 px file; trimmed box starts at p.sy
  const row = Math.round(((593.5 - p.sy) / p.sh) * h);
  let darkest = 255;
  for (let dy = -2; dy <= 2; dy++) for (let x = 0; x < w; x++) { const d = cx.getImageData(x, Math.min(h - 1, Math.max(0, row + dy)), 1, 1).data; darkest = Math.min(darkest, d[0]); }
  assert.ok(darkest < 200, "the thin strokes are still there, darkest pixel " + darkest);
  // and the big mark is solid red
  const mid = cx.getImageData(Math.round(w / 2), Math.round(h * 0.3), 1, 1).data;
  assert.ok(mid[0] > 150 && mid[1] < 60, "mark colour " + [...mid]);
});

test("logo drawing: PNG downloads draw the logo from the original at 600 dpi (full resolution, thin strokes kept)", async () => {
  const co: IdCardCompany = { ...COMPANY };
  const zip = await JSZip.loadAsync(await (await buildPngZip([{ data: staff(), images: { logo: BIG } }], co)).arrayBuffer());
  const im = await loadImage(await zip.file("Amanda_Clarke_front_600dpi_bleed3mm.png")!.async("nodebuffer"));
  assert.equal(im.width, 1417);
  const c = createCanvas(im.width, im.height); const cx = c.getContext("2d") as any; cx.drawImage(im, 0, 0);
  const r = renderIdCardFace("front", staff(), co, { logo: BIG }, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
  const pl = r.content.find((x) => x.what === "logo plate")!;
  const x0 = Math.round((pl.x0 + BLEED_MM) * PRINT_PPM), x1 = Math.round((pl.x1 + BLEED_MM) * PRINT_PPM), y0 = Math.round((pl.y0 + BLEED_MM) * PRINT_PPM), y1 = Math.round((pl.y1 + BLEED_MM) * PRINT_PPM);
  const d = cx.getImageData(x0, y0, x1 - x0, y1 - y0).data as Uint8ClampedArray;
  let red = 0, navy = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] > 150 && d[i + 1] < 70 && d[i + 2] < 70) red++; if (d[i] < 90 && d[i + 2] > 70 && d[i + 2] > d[i] + 20) navy++; }
  assert.ok(red > 5000, "the mark is on the card at print resolution: " + red + " red px");
  assert.ok(navy > 20, "the thin strokes are kept: " + navy + " navy px");
});
