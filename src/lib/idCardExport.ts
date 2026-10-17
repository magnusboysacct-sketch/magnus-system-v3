// src/lib/idCardExport.ts
// "Download for printing": the card PDF for a PVC card printer, the print sheet PDF (paper + laminate), the PNG files and PRINT INSTRUCTIONS.pdf.
// Every file is made from the same renderer as the on-screen card (idCardRender.ts), at 600 dpi, so the QR and the text are crisp and identical everywhere.
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import {
  BLEED_MM, CARD_H_MM, CARD_W_MM, PRINT_PPM, makeCanvas, renderIdCardFace,
  type IdCardCompany, type IdCardData, type IdCardImages,
} from "./idCardRender";
import { BEFORE_YOU_GO, CARD_SPEC_LINES, GLOSSARY, WHEN_YOU_PICK_UP, kindWord, shopMessage } from "./idCardGuide";

export interface CardItem { data: IdCardData; images: IdCardImages }
export type Paper = "a4" | "letter";
export const PAPER_MM: Record<Paper, [number, number]> = { a4: [210, 297], letter: [215.9, 279.4] };
export const PAGE_W_MM = CARD_W_MM + 2 * BLEED_MM;    // 60
export const PAGE_H_MM = CARD_H_MM + 2 * BLEED_MM;    // 91.6
type Progress = (fraction: number) => void;

const yieldUi = () => new Promise<void>((r) => setTimeout(r, 0));
// eslint-disable-next-line no-control-regex
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, "_").replace(/^[_.]+|[_.]+$/g, "").slice(0, 80) || "ID";

export const cardPdfName = (items: CardItem[], company: IdCardCompany) =>
  items.length === 1 ? `${safe(items[0].data.name)}_ID_card_CR80_bleed3mm.pdf` : `${safe(company.name)}_ID_cards_x${items.length}_CR80_bleed3mm.pdf`;
export const sheetPdfName = (items: CardItem[], company: IdCardCompany, paper: Paper) =>
  `${safe(items.length === 1 ? items[0].data.name : company.name + "_x" + items.length)}_ID_cards_print_sheet_${paper.toUpperCase()}.pdf`;
export const pngZipName = (items: CardItem[], company: IdCardCompany) =>
  `${safe(items.length === 1 ? items[0].data.name : company.name + "_x" + items.length)}_ID_cards_PNG_600dpi_bleed3mm.zip`;

const pdfBlob = (doc: jsPDF) => new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
const png = (c: HTMLCanvasElement) => c.toDataURL("image/png");

// ── a) Card PDF: 2 pages per person (front, back), each 60 x 91.6 mm = 54 x 85.6 mm trim + 3 mm bleed ───────────────────────
export async function buildCardPdf(items: CardItem[], company: IdCardCompany, onProgress?: Progress): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: [PAGE_W_MM, PAGE_H_MM], orientation: "portrait", compress: true });
  doc.setProperties({ title: `${company.name} ID cards (CR80, 3 mm bleed)`, creator: "Magnus System" });
  let n = 0;
  for (const item of items) {
    for (const face of ["front", "back"] as const) {
      if (n > 0) doc.addPage([PAGE_W_MM, PAGE_H_MM], "portrait");
      const r = renderIdCardFace(face, item.data, company, item.images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
      doc.addImage(png(r.canvas), "PNG", 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
      n++;
      onProgress?.(n / (items.length * 2));
      await yieldUi();
    }
  }
  return pdfBlob(doc);
}

// ── b) Print sheet PDF: fronts on one page, the matching backs on the next, mirrored so a double-sided print lines up ──────
export function sheetLayout(paper: Paper) {
  const [pw, ph] = PAPER_MM[paper];
  const margin = 10, gap = 6;                                         // the 3 mm bleeds of neighbours just touch; crop marks sit in the outer margins
  const cols = Math.max(1, Math.floor((pw - 2 * margin + gap) / (CARD_W_MM + gap)));
  const rows = Math.max(1, Math.floor((ph - 2 * margin + gap) / (CARD_H_MM + gap)));
  const gridW = cols * CARD_W_MM + (cols - 1) * gap, gridH = rows * CARD_H_MM + (rows - 1) * gap;
  return { pw, ph, cols, rows, perPage: cols * rows, gap, left: (pw - gridW) / 2, top: (ph - gridH) / 2, gridW, gridH };
}
// Trim-box origin (mm) of cell `i` (0-based, row by row) on the front page; on the back page the columns are mirrored.
export function cellOrigin(paper: Paper, i: number, back: boolean) {
  const L = sheetLayout(paper);
  const row = Math.floor(i / L.cols), col0 = i % L.cols;
  const col = back ? L.cols - 1 - col0 : col0;
  return { x: L.left + col * (CARD_W_MM + L.gap), y: L.top + row * (CARD_H_MM + L.gap) };
}

export async function buildSheetPdf(items: CardItem[], company: IdCardCompany, paper: Paper, onProgress?: Progress): Promise<Blob> {
  const L = sheetLayout(paper);
  const doc = new jsPDF({ unit: "mm", format: [L.pw, L.ph], orientation: "portrait", compress: true });
  doc.setProperties({ title: `${company.name} ID cards (print sheet, ${paper.toUpperCase()})`, creator: "Magnus System" });
  const pages = Math.ceil(items.length / L.perPage);
  let done = 0, first = true;
  const marks = () => {
    doc.setDrawColor(0); doc.setLineWidth(0.15);
    for (let c = 0; c < L.cols; c++) for (const x of [L.left + c * (CARD_W_MM + L.gap), L.left + c * (CARD_W_MM + L.gap) + CARD_W_MM]) {
      doc.line(x, L.top - 7, x, L.top - 4); doc.line(x, L.top + L.gridH + 4, x, L.top + L.gridH + 7);
    }
    for (let r = 0; r < L.rows; r++) for (const y of [L.top + r * (CARD_H_MM + L.gap), L.top + r * (CARD_H_MM + L.gap) + CARD_H_MM]) {
      doc.line(L.left - 7, y, L.left - 4, y); doc.line(L.left + L.gridW + 4, y, L.left + L.gridW + 7, y);
    }
  };
  for (let p = 0; p < pages; p++) {
    const chunk = items.slice(p * L.perPage, (p + 1) * L.perPage);
    for (const back of [false, true]) {
      if (!first) doc.addPage([L.pw, L.ph], "portrait");
      first = false;
      for (let i = 0; i < chunk.length; i++) {
        const r = renderIdCardFace(back ? "back" : "front", chunk[i].data, company, chunk[i].images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
        const o = cellOrigin(paper, i, back);
        doc.addImage(png(r.canvas), "PNG", o.x - BLEED_MM, o.y - BLEED_MM, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
        done++;
        onProgress?.(done / (items.length * 2));
        await yieldUi();
      }
      marks();
      doc.setFontSize(7); doc.setTextColor(110);
      doc.text(`${back ? "BACKS" : "FRONTS"}  ·  sheet ${p + 1} of ${pages}  ·  ${paper.toUpperCase()}  ·  print at 100% / Actual size, double-sided, flip on the long edge  ·  cut along the crop marks`, L.pw / 2, L.ph - 4, { align: "center" });
    }
  }
  return pdfBlob(doc);
}

// ── c) PNG files: front and back of everyone at 600 dpi with bleed, zipped, with PRINT INSTRUCTIONS.pdf ───────────────────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Writes the resolution (600 dpi) into the PNG (a pHYs chunk right after IHDR), so a print shop's software sees the true size.
export function pngWithDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(13);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm); dv.setUint32(4, ppm); data[8] = 1;
  const type = new TextEncoder().encode("pHYs");
  const crcInput = new Uint8Array(4 + 9); crcInput.set(type, 0); crcInput.set(data.subarray(0, 9), 4);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9); chunk.set(type, 4); chunk.set(data.subarray(0, 9), 8); cv.setUint32(17, crc32(crcInput));
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;                                           // signature + length + "IHDR" + data + crc
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}
const dataUrlBytes = (u: string) => { const b = atob(u.slice(u.indexOf(",") + 1)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };

export async function buildPngZip(items: CardItem[], company: IdCardCompany, onProgress?: Progress): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  let done = 0;
  for (const item of items) {
    let base = safe(item.data.name); let k = 2;
    while (used.has(base)) base = `${safe(item.data.name)}_${k++}`;
    used.add(base);
    for (const face of ["front", "back"] as const) {
      const r = renderIdCardFace(face, item.data, company, item.images, { ppm: PRINT_PPM, bleedMm: BLEED_MM });
      zip.file(`${base}_${face}_600dpi_bleed3mm.png`, pngWithDpi(dataUrlBytes(png(r.canvas)), 600));
      done++; onProgress?.(done / (items.length * 2 + 1));
      await yieldUi();
    }
  }
  zip.file("PRINT INSTRUCTIONS.pdf", await (await buildInstructionsPdf(items, company, items[0]?.images.logo)).arrayBuffer());
  onProgress?.(1);
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

// ── d) PRINT INSTRUCTIONS.pdf: one A4 page (more pages only for a very long list of names) ──────────────────────────────────
export async function buildInstructionsPdf(items: CardItem[], company: IdCardCompany, logo?: IdCardImages["logo"]): Promise<Blob> {
  const dpi = 200, ppm = dpi / 25.4, W = 210, H = 297;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title: `${company.name} ID cards: print instructions`, creator: "Magnus System" });
  const kinds = items.map((i) => i.data.kind);
  const nStaff = kinds.filter((k) => k === "staff").length, nWorker = kinds.length - nStaff;
  const FONT = `"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif`;
  let page = 0;

  const names = items.map((i) => `${i.data.name}  (${i.data.kind})`);
  let nameIdx = 0;
  while (page === 0 || nameIdx < names.length) {
    const canvas = makeCanvas(Math.round(W * ppm), Math.round(H * ppm));
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const mm = (v: number) => v * ppm;
    let y = 14;
    const font = (size: number, weight = 400, italic = false) => { ctx.font = `${italic ? "italic " : ""}${weight} ${mm(size)}px ${FONT}`; };
    const wrapText = (t: string, x: number, maxW: number, size: number, lh: number, color = "#1f2937", weight = 400) => {
      font(size, weight); ctx.fillStyle = color; ctx.textAlign = "left";
      const words = t.split(/\s+/); let cur = "";
      const lines: string[] = [];
      for (const w of words) { const test = cur ? cur + " " + w : w; if (ctx.measureText(test).width > mm(maxW) && cur) { lines.push(cur); cur = w; } else cur = test; }
      if (cur) lines.push(cur);
      for (const l of lines) { ctx.fillText(l, mm(x), mm(y)); y += lh; }
    };
    const heading = (t: string) => { y += 2; font(4.4, 700); ctx.fillStyle = "#15315A"; ctx.fillText(t, mm(15), mm(y)); y += 5.5; };
    const bullet = (t: string) => { const y0 = y; wrapText(t, 20, W - 35, 3.5, 4.6); ctx.fillStyle = "#15315A"; ctx.beginPath(); ctx.arc(mm(17.2), mm(y0 - 1.2), mm(0.6), 0, 7); ctx.fill(); };

    if (page === 0) {
      // company logo and name at the top
      let x = 15;
      if (logo) {
        const nw = (logo.naturalWidth || logo.width) as number, nh = (logo.naturalHeight || logo.height) as number;
        const s = Math.min(45 / nw, 18 / nh); const lw = nw * s, lh = nh * s;
        ctx.drawImage(logo, mm(15), mm(y - 2), mm(lw), mm(lh)); x = 15 + lw + 5;
      }
      font(7, 700); ctx.fillStyle = "#15315A"; ctx.textAlign = "left"; ctx.fillText(company.name, mm(x), mm(y + 6));
      font(3.6, 400); ctx.fillStyle = "#6b7280"; ctx.fillText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), mm(x), mm(y + 12));
      y += 22;
      ctx.fillStyle = "#15315A"; ctx.fillRect(mm(15), mm(y - 3), mm(W - 30), mm(0.5)); y += 4;
      font(6, 700); ctx.fillStyle = "#111827"; ctx.fillText("PRINT INSTRUCTIONS: ID CARDS", mm(15), mm(y + 3)); y += 10;
      const count = items.length;
      wrapText(`Number of cards: ${count}` + (nStaff && nWorker ? `  (${nStaff} staff, ${nWorker} worker)` : ""), 15, W - 30, 4.4, 6, "#111827", 700);
      heading("The specification");
      CARD_SPEC_LINES.forEach(bullet);
      y += 1;
      GLOSSARY.forEach(([w, d]) => wrapText(`${w} = ${d}.`, 20, W - 35, 3.2, 4.2, "#4b5563"));
      heading("What to tell the shop");
      const msg = shopMessage(company.name, kinds);
      const boxTop = y - 3.5; const y0 = y;
      wrapText(msg, 18, W - 36, 3.5, 4.8, "#111827");
      ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = Math.max(1, mm(0.25)); ctx.strokeRect(mm(15), mm(boxTop), mm(W - 30), mm(y - boxTop - 0.5)); void y0;
      heading("Before you go to the shop");
      BEFORE_YOU_GO.forEach(bullet);
      heading("When you pick the cards up");
      WHEN_YOU_PICK_UP.forEach(bullet);
      heading("The cards in this order");
    } else {
      font(5, 700); ctx.fillStyle = "#15315A"; ctx.fillText(`${company.name}: the cards (continued)`, mm(15), mm(y + 4)); y += 12;
    }

    // names, in columns, as many as fit on this page
    font(3.3, 400); ctx.fillStyle = "#1f2937";
    const colW = (W - 30) / 2, lh = 4.3, bottom = H - 14;
    const perCol = Math.max(1, Math.floor((bottom - y) / lh));
    const start = nameIdx;
    for (let i = 0; i < perCol * 2 && nameIdx < names.length; i++, nameIdx++) {
      const col = Math.floor(i / perCol), row = i % perCol;
      ctx.fillText(`${nameIdx + 1}. ${names[nameIdx]}`.slice(0, 48), mm(15 + col * colW), mm(y + row * lh));
    }
    void start;
    if (page > 0) doc.addPage("a4", "portrait");
    doc.addImage(png(canvas), "PNG", 0, 0, W, H, undefined, "FAST");
    page++;
    await yieldUi();
  }
  return pdfBlob(doc);
}

export { shopMessage, kindWord };
