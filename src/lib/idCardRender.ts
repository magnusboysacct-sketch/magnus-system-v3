// src/lib/idCardRender.ts
//
// ONE renderer for the Staff and Worker ID cards, used by the on-screen preview, the in-app print, the card PDF (PVC card printer), the print sheet PDF and the PNG
// files. Everything is drawn on a canvas in MILLIMETRES, so the card looks the same everywhere and is exactly 54 x 85.6 mm (portrait CR80) when printed.
//
//   * `bleedMm` extra millimetres of background are drawn on every side (3 mm for the print files, 0 for the screen). Backgrounds, stripes and the footer bar
//     run into the bleed; every piece of content (text, photo, logo, QR) stays at least SAFE_MM (3 mm) inside the trim, which the layout guarantees and
//     `content` (returned with every render) lets the tests check. Corners are square (the printer's cutter or the PVC card die rounds them).
//   * The QR encodes https://app.magnusboys.com/v/<code> (always the production address). Error correction M, dark navy on pure white, a 4-module white margin,
//     nothing over it. It is drawn as filled squares at a WHOLE number of pixels per module (no smoothing), and is at least 16 mm square (the 29 modules,
//     margin excluded) on the printed card.
//   * Nothing here touches the DOM except the default canvas factory, so the same code runs in the tests (see setCanvasFactory).
import QRCode from "qrcode";
import { resolvePalette, rgba, type MaybeTheme } from "./idCardTheme";

// ── Sizes (mm) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const CARD_W_MM = 54;
export const CARD_H_MM = 85.6;
export const BLEED_MM = 3;
export const SAFE_MM = 3;
export const MIN_QR_MM = 16;                 // the QR symbol (margin excluded), on the printed card
export const QR_MARGIN_MODULES = 4;
export const ID_VERIFY_BASE = "https://app.magnusboys.com";
export const PRINT_PPM = 600 / 25.4;         // pixels per mm at 600 dpi
export const SCREEN_PPM = 9;                 // on-screen preview: the QR plate is about 185 px
const QR_PLATE_MM = 22;                      // the layout reserves this much room for the QR plate (symbol + margin)

// ── Colours: the card colours come from the company (idCardTheme.ts); only the QR and the alert red are fixed ──────────────────
const NAVY = "#15315A";                  // the QR code: always dark navy on a pure white plate, whatever the card colours
export const ALERT_RED = "#DC2626";
const FONT = `"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif`;
const MONO = `Consolas, "Courier New", monospace`;

// ── Data ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type IdCardKind = "staff" | "worker";
export interface IdCardData {
  kind: IdCardKind;
  id: string;
  name: string;
  title: string;                                   // job title, or the role / worker type
  initials: string;
  verifyCode: string;                              // 12 hex
  cardTitle: string;                               // "STAFF IDENTIFICATION CARD" / "SITE IDENTIFICATION CARD"
  detail?: { label: string; value: string } | null; // the one info row on the front (employee number / ID number); nothing when empty
  bearer?: Array<[string, string]>;                // extra rows on the back (a worker's address and phone)
  issuedLabel: string;
  expiresLabel: string;
  expired: boolean;
  expiryColor: string;
  statement: string;                               // the paragraph on the back
}
export interface IdCardCompany {
  name: string;
  tagline: string;
  contactLines: string[];
  theme?: MaybeTheme | null;              // the company's card colours (null / missing = navy & gold)
}
type Img = CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number };
export interface IdCardImages { photo?: Img | null; logo?: Img | null; signature?: Img | null }
export interface Rect { x0: number; y0: number; x1: number; y1: number; what: string }       // mm, trim coordinates (0,0 = top-left corner of the trim)
export interface RenderedFace {
  canvas: HTMLCanvasElement;
  ppm: number; bleedMm: number;
  widthPx: number; heightPx: number;
  qr: { x: number; y: number; w: number; h: number; modulePx: number; modules: number; symbolMm: number };   // the white plate, canvas pixels
  content: Rect[];                                   // everything that must stay inside the safe zone
  url: string;
}

// ── Canvas factory (the browser's by default; the tests plug in @napi-rs/canvas) ───────────────────────────────────────────
type CanvasFactory = (w: number, h: number) => HTMLCanvasElement;
let factory: CanvasFactory = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export function setCanvasFactory(f: CanvasFactory) { factory = f; }
export function makeCanvas(w: number, h: number) { return factory(w, h); }

export const verifyUrl = (code: string) => `${ID_VERIFY_BASE}/v/${code}`;

// ── The QR ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function qrMatrix(text: string): { size: number; dark: (r: number, c: number) => boolean } {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = q.modules.size, data = q.modules.data;
  return { size, dark: (r, c) => !!data[r * size + c] };
}

// Pixels per module so that the plate (symbol + 4-module margin each side) fits in `plateMm`.
export function qrModulePx(modules: number, ppm: number, plateMm = QR_PLATE_MM) {
  return Math.max(1, Math.floor((plateMm * ppm) / (modules + 2 * QR_MARGIN_MODULES)));
}

// Draw the plate with its QR at (x, y), integer pixels, whole-pixel modules, no smoothing.
function drawQrPlate(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, modulePx: number) {
  const { size, dark } = qrMatrix(text);
  const plate = (size + 2 * QR_MARGIN_MODULES) * modulePx;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, plate, plate);
  ctx.fillStyle = NAVY;
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!dark(r, c)) { c++; continue; }
      let run = 1;
      while (c + run < size && dark(r, c + run)) run++;          // one wide square per run of dark modules: fewer draw calls, same pixels
      ctx.fillRect(x + (QR_MARGIN_MODULES + c) * modulePx, y + (QR_MARGIN_MODULES + r) * modulePx, run * modulePx, modulePx);
      c += run;
    }
  }
  return { plate, modules: size };
}

// The QR on its own (for the full-screen view): white square, `modulePx` pixels per module.
export function renderQrCanvas(text: string, modulePx: number): HTMLCanvasElement {
  const { size } = qrMatrix(text);
  const plate = (size + 2 * QR_MARGIN_MODULES) * modulePx;
  const canvas = factory(plate, plate);
  drawQrPlate(canvas.getContext("2d") as CanvasRenderingContext2D, text, 0, 0, modulePx);
  return canvas;
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const natural = (img: Img) => ({ w: (img.naturalWidth || img.width) as number, h: (img.naturalHeight || img.height) as number });
const MM_PER_UNIT = 54 / 213;     // the old 213-unit card: a logo is never shown larger than its own pixel size in those units

// contain-fit (iw x ih) into (maxW x maxH) mm, never above natural size (1 natural px = 1 old card unit)
function fit(img: Img, maxW: number, maxH: number) {
  const n = natural(img);
  if (!n.w || !n.h) return { w: maxW, h: maxH };
  const nw = n.w * MM_PER_UNIT, nh = n.h * MM_PER_UNIT;
  const s = Math.min(1, maxW / nw, maxH / nh);
  return { w: nw * s, h: nh * s };
}

interface TextOpts { size: number; color: string; weight?: number; align?: "left" | "center" | "right"; mono?: boolean; italic?: boolean; maxWidth?: number; upper?: boolean }

export function renderIdCardFace(face: "front" | "back", data: IdCardData, company: IdCardCompany, images: IdCardImages, opts: { ppm: number; bleedMm: number }): RenderedFace {
  const { ppm, bleedMm } = opts;
  const widthPx = Math.round((CARD_W_MM + 2 * bleedMm) * ppm), heightPx = Math.round((CARD_H_MM + 2 * bleedMm) * ppm);
  const canvas = factory(widthPx, heightPx);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const ox = bleedMm * ppm, oy = bleedMm * ppm;
  const X = (mm: number) => ox + mm * ppm, Y = (mm: number) => oy + mm * ppm, L = (mm: number) => mm * ppm;
  const content: Rect[] = [];
  const url = verifyUrl(data.verifyCode);
  const W = CARD_W_MM, H = CARD_H_MM, B = bleedMm;
  const P = resolvePalette(company.theme);              // the colours of this company's card (readable whatever was chosen, see idCardTheme.ts)
  const fa = (a: number) => rgba(P.fg, a);               // decoration (hairlines, placeholders) in the text colour

  const note = (what: string, x0: number, y0: number, x1: number, y1: number) => content.push({ what, x0, y0, x1, y1 });
  // Edges that reach the bleed edge are pushed out to the canvas edge, so rounding of the canvas size never leaves a half-painted last pixel row / column.
  const edgeX = (mm: number) => (mm <= -B + 1e-9 ? 0 : mm >= W + B - 1e-9 ? widthPx : X(mm));
  const edgeY = (mm: number) => (mm <= -B + 1e-9 ? 0 : mm >= H + B - 1e-9 ? heightPx : Y(mm));
  const fillBox = (color: string, x0: number, y0: number, x1: number, y1: number) => { ctx.fillStyle = color; ctx.fillRect(edgeX(x0), edgeY(y0), edgeX(x1) - edgeX(x0), edgeY(y1) - edgeY(y0)); };

  function text(str: string, xMm: number, baselineMm: number, o: TextOpts) {
    let s = o.upper ? str.toUpperCase() : str;
    if (!s) return;
    let size = o.size;
    const weight = o.weight ?? 400;
    const set = () => { ctx.font = `${o.italic ? "italic " : ""}${weight} ${size * ppm}px ${o.mono ? MONO : FONT}`; };
    set();
    if (o.maxWidth) {
      while (ctx.measureText(s).width > o.maxWidth * ppm && size > o.size * 0.6) { size *= 0.96; set(); }
      while (ctx.measureText(s).width > o.maxWidth * ppm && s.length > 1) { s = s.slice(0, -2) + "…"; }
    }
    const w = ctx.measureText(s).width / ppm;
    ctx.fillStyle = o.color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = o.align ?? "left";
    ctx.fillText(s, X(xMm), Y(baselineMm));
    const align = o.align ?? "left";
    const x0 = align === "left" ? xMm : align === "center" ? xMm - w / 2 : xMm - w;
    note("text: " + s.slice(0, 24), x0, baselineMm - size * 0.78, x0 + w, baselineMm + size * 0.22);
  }

  function wrap(str: string, xMm: number, firstBaseline: number, maxW: number, lineH: number, o: Omit<TextOpts, "maxWidth">, maxLines = 6) {
    ctx.font = `${o.italic ? "italic " : ""}${o.weight ?? 400} ${o.size * ppm}px ${FONT}`;
    const words = str.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW * ppm && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    lines.slice(0, maxLines).forEach((l, i) => text(l, xMm, firstBaseline + i * lineH, o));
    return firstBaseline + (Math.min(lines.length, maxLines) - 1) * lineH;
  }

  function line(x0: number, y0: number, x1: number, y1: number, color: string, widthMm: number) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, L(widthMm));
    ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
  }

  // QR plate: whole-pixel modules, integer position
  function qrPlate(rightMm: number | null, topMm: number, bottomMm: number | null) {
    const m = qrModulePx(qrMatrix(url).size, ppm);
    const modules = qrMatrix(url).size;
    const plate = (modules + 2 * QR_MARGIN_MODULES) * m;
    // pinned to a safe edge: round DOWN so the plate never ends past it
    const x = rightMm === null ? Math.round(X(W / 2) - plate / 2) : Math.floor(X(rightMm) - plate);
    const y = bottomMm === null ? Math.round(Y(topMm)) : Math.floor(Y(bottomMm) - plate);
    drawQrPlate(ctx, url, x, y, m);
    note("QR plate", (x - ox) / ppm, (y - oy) / ppm, (x - ox + plate) / ppm, (y - oy + plate) / ppm);
    return { x, y, w: plate, h: plate, modulePx: m, modules, symbolMm: (modules * m) / ppm };
  }

  let qr: RenderedFace["qr"];

  if (face === "front") {
    fillBox(P.primary, -B, -B, W + B, H + B);
    fillBox(P.accent, -B, -B, W + B, 1.3);                                           // top stripe (runs into the bleed)

    // OFFICIAL ID badge, top right, clear of the widest logo plate
    ctx.fillStyle = rgba(P.accent, 0.15); ctx.strokeStyle = rgba(P.accent, 0.4); ctx.lineWidth = Math.max(1, L(0.15));
    ctx.fillRect(X(42.6), Y(3.2), L(8.4), L(5)); ctx.strokeRect(X(42.6), Y(3.2), L(8.4), L(5));
    note("badge", 42.6, 3.2, 51, 8.2);
    ctx.fillStyle = P.accent; ctx.font = `700 ${1.15 * ppm}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("OFFICIAL", X(46.8), Y(5.6)); ctx.fillText("ID", X(46.8), Y(7.3));

    // Logo on a white plate with a thin gold border, natural aspect ratio (never cropped or stretched)
    const bandTop = 3, bandH = 12, inset = 6 * MM_PER_UNIT;
    const plateMaxW = 30;
    let pw = bandH, ph = bandH, fw = 0, fh = 0;
    if (images.logo) { const f = fit(images.logo, plateMaxW - 2 * inset, bandH - 2 * inset); fw = f.w; fh = f.h; pw = fw + 2 * inset; ph = fh + 2 * inset; }
    const px0 = W / 2 - pw / 2, py0 = bandTop + (bandH - ph) / 2;
    ctx.fillStyle = "#ffffff"; roundRectPath(ctx, X(px0), Y(py0), L(pw), L(ph), L(1.8)); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = Math.max(1, L(0.25)); roundRectPath(ctx, X(px0 + 0.125), Y(py0 + 0.125), L(pw - 0.25), L(ph - 0.25), L(1.7)); ctx.stroke();
    note("logo plate", px0, py0, px0 + pw, py0 + ph);
    if (images.logo) ctx.drawImage(images.logo, X(px0 + inset), Y(py0 + inset), L(fw), L(fh));
    else { ctx.fillStyle = P.logoInitial; ctx.font = `800 ${5 * ppm}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((company.name.charAt(0) || "?").toUpperCase(), X(W / 2), Y(bandTop + bandH / 2)); ctx.textBaseline = "alphabetic"; }

    text(company.name, W / 2, 17.4, { size: 1.75, color: P.fg, weight: 600, align: "center", upper: true, maxWidth: 46 });
    line(4, 18.5, 50, 18.5, fa(0.12), 0.1);

    // Photo (profile / passport photo only)
    const phx = (W - 13) / 2, phy = 19.8, phw = 13, phh = 16;
    ctx.fillStyle = fa(0.05); roundRectPath(ctx, X(phx), Y(phy), L(phw), L(phh), L(1.3)); ctx.fill();
    note("photo", phx, phy, phx + phw, phy + phh);
    if (images.photo) {
      ctx.save(); roundRectPath(ctx, X(phx + 0.2), Y(phy + 0.2), L(phw - 0.4), L(phh - 0.4), L(1.1)); ctx.clip();
      const n = natural(images.photo), s = Math.max((phw - 0.4) / (n.w * 1), (phh - 0.4) / (n.h * 1)) ;   // cover
      const dw = n.w * s, dh = n.h * s;
      ctx.drawImage(images.photo, X(phx + 0.2 + ((phw - 0.4) - dw) / 2), Y(phy + 0.2 + ((phh - 0.4) - dh) / 2), L(dw), L(dh));
      ctx.restore();
    } else {
      ctx.fillStyle = fa(0.35); ctx.font = `700 ${5.2 * ppm}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(data.initials || "?", X(W / 2), Y(phy + phh / 2)); ctx.textBaseline = "alphabetic";
    }
    ctx.strokeStyle = rgba(P.accent, 0.6); ctx.lineWidth = Math.max(1, L(0.3)); roundRectPath(ctx, X(phx), Y(phy), L(phw), L(phh), L(1.3)); ctx.stroke();

    text(data.title, W / 2, 38.5, { size: 1.7, color: P.accent, align: "center", upper: true, maxWidth: 46 });
    text(data.name, W / 2, 42.1, { size: 3.3, color: P.fg, weight: 700, align: "center", upper: true, maxWidth: 46 });
    text(data.cardTitle, W / 2, 44.2, { size: 1.45, color: P.fgA(0.55), align: "center", upper: true });
    line(4, 45.4, 50, 45.4, fa(0.12), 0.1);

    if (data.detail && data.detail.value) {
      text(data.detail.label, 4, 48.2, { size: 1.3, color: P.fgA(0.45), upper: true });
      text(data.detail.value, 50, 48.2, { size: 1.8, color: P.fgA(0.9), weight: 600, align: "right", mono: true, maxWidth: 32 });
    }

    qr = qrPlate(null, 49.8, null);
    text("SCAN TO VERIFY", W / 2, (qr.y - oy + qr.h) / ppm + 2.6, { size: 1.3, color: P.fgA(0.6), align: "center" });

    // Footer bar (runs into the bleed)
    ctx.fillStyle = rgba(P.accent, 0.12); ctx.fillRect(0, Y(75.6), widthPx, heightPx - Y(75.6));
    line(-B, 75.6, W + B, 75.6, rgba(P.accent, 0.35), 0.15);
    text("ISSUED", 4, 78.2, { size: 1.25, color: P.fgA(0.4) });
    text(data.issuedLabel, 4, 80.7, { size: 1.9, color: P.accent, weight: 700 });
    text(data.expired ? "EXPIRED" : "EXPIRES", 50, 78.2, { size: 1.25, color: data.expired ? P.status(ALERT_RED) : P.fgA(0.4), align: "right" });
    text(data.expiresLabel, 50, 80.7, { size: 1.9, color: P.status(data.expiryColor), weight: 700, align: "right" });
    fillBox(P.accent, -B, H - 0.8, W + B, H + B);                                   // bottom stripe (runs into the bleed)
  } else {
    fillBox(P.tint, -B, -B, W + B, H + B);

    // Logo, no plate
    const cy = 6.3;
    if (images.logo) {
      const f = fit(images.logo, 26.9, 6.6);
      ctx.drawImage(images.logo, X(W / 2 - f.w / 2), Y(cy - f.h / 2), L(f.w), L(f.h));
      note("logo", W / 2 - f.w / 2, cy - f.h / 2, W / 2 + f.w / 2, cy + f.h / 2);
    } else {
      ctx.fillStyle = P.primary; roundRectPath(ctx, X(W / 2 - 3.3), Y(cy - 3.3), L(6.6), L(6.6), L(1.5)); ctx.fill();
      note("logo", W / 2 - 3.3, cy - 3.3, W / 2 + 3.3, cy + 3.3);
      ctx.fillStyle = P.fg; ctx.font = `800 ${2.4 * ppm}px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((company.name.charAt(0) || "?").toUpperCase(), X(W / 2), Y(cy)); ctx.textBaseline = "alphabetic";
    }

    // Amber banner (runs into the bleed)
    fillBox(P.banner, -B, 11.5, W + B, 17.2);
    text("IF FOUND, RETURN TO ISSUING COMPANY BELOW", W / 2, 15.1, { size: 1.45, color: P.bannerText, weight: 700, align: "center", maxWidth: 46 });

    text(company.name, W / 2, 22.2, { size: 2.5, color: P.ink, weight: 700, align: "center", upper: true, maxWidth: 48 });
    text(company.tagline, W / 2, 24.8, { size: 1.65, color: P.inkA(0.55), align: "center", maxWidth: 46 });
    line(4, 26.2, 50, 26.2, P.tintLine, 0.15);

    let y = 29.2;
    company.contactLines.slice(0, 4).forEach((l) => { text(l, 4, y, { size: 1.65, color: P.inkA(0.72), maxWidth: 46 }); y += 2.4; });

    const last = wrap(data.statement, 4, y + 1.4, 46, 2.25, { size: 1.55, color: P.inkA(0.85), italic: true }, 4);

    if (data.bearer && data.bearer.length) {
      const ly = Math.max(last + 2.4, 49.2);
      line(4, ly, 50, ly, P.tintLine, 0.15);
      let by = ly + 2.9;
      data.bearer.slice(0, 2).forEach(([label, value]) => {
        text(label, 4, by, { size: 1.3, color: P.inkA(0.5), upper: true });
        text(value, 14, by, { size: 1.65, color: P.inkA(0.8), maxWidth: 36 });
        by += 2.5;
      });
    }

    // Signature (bottom left) and QR (bottom right)
    const sigLineY = 79.4;
    if (images.signature) {
      const f = fit(images.signature, 23, 8);
      ctx.drawImage(images.signature, X(4 + (23 - f.w) / 2), Y(sigLineY - 0.4 - f.h), L(f.w), L(f.h));
      note("signature", 4 + (23 - f.w) / 2, sigLineY - 0.4 - f.h, 4 + (23 - f.w) / 2 + f.w, sigLineY - 0.4);
    }
    line(4, sigLineY, 27, sigLineY, "rgba(28,26,20,0.4)", 0.15);
    text("AUTHORIZED SIGNATURE", 4, 81.7, { size: 1.25, color: P.inkA(0.5) });
    qr = qrPlate(W - SAFE_MM, 0, H - SAFE_MM);
  }

  return { canvas, ppm, bleedMm, widthPx, heightPx, qr, content, url };
}

// Everything that has to stay inside the safe zone is reported in `content`; returns the offenders (none = good).
export function safeZoneViolations(r: RenderedFace, safeMm = SAFE_MM): Rect[] {
  return r.content.filter((c) => c.x0 < safeMm - 0.001 || c.y0 < safeMm - 0.001 || c.x1 > CARD_W_MM - safeMm + 0.001 || c.y1 > CARD_H_MM - safeMm + 0.001);
}
