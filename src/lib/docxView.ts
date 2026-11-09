// src/lib/docxView.ts — show a Word (.docx) file inside the app, with no extra library and without sending the file anywhere.
// A .docx is a zip; word/document.xml holds the text. This reads the zip (the browser's own DecompressionStream) and builds
// simple, safe page elements: headings, paragraphs (bold / italic / underline), line breaks and tables. Pictures, colours and
// exact layout are not shown (Download opens the real file in Word).

// ── a small zip reader ────────────────────────────────────────────────────────────────────────────────────────────
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzipFile(buf: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const v = new DataView(buf), b = new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) { if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= b.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      if (v.getUint32(local, true) !== 0x04034b50) return null;
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = b.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflate(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ── document.xml → page elements ──────────────────────────────────────────────────────────────────────────────────
const kids = (el: Element, name: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name);
const kid = (el: Element, name: string) => kids(el, name)[0] as Element | undefined;
const on = (rPr: Element | undefined, name: string) => { const e = rPr && kid(rPr, name); return !!e && !["0", "false", "none"].includes(e.getAttribute("w:val") || ""); };

function runs(p: Element, out: HTMLElement) {
  const walk = (el: Element) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 1) continue;
      const e = n as Element;
      if (e.localName === "r") {
        const rPr = kid(e, "rPr");
        let target: HTMLElement = out;
        const wrap = (tag: string) => { const w = document.createElement(tag); target.appendChild(w); target = w; };
        const pieces = Array.from(e.childNodes).filter((x): x is Element => x.nodeType === 1);
        if (!pieces.some((x) => ["t", "tab", "br", "cr"].includes(x.localName))) continue;
        if (on(rPr, "b")) wrap("strong");
        if (on(rPr, "i")) wrap("em");
        if (on(rPr, "u")) wrap("u");
        for (const x of pieces) {
          if (x.localName === "t") target.appendChild(document.createTextNode(x.textContent || ""));
          else if (x.localName === "tab") target.appendChild(document.createTextNode("    "));
          else if (x.localName === "br" || x.localName === "cr") target.appendChild(document.createElement("br"));
        }
      } else if (["hyperlink", "ins", "smartTag", "sdt", "sdtContent", "fldSimple"].includes(e.localName)) {
        walk(e);                                   // text inside links / tracked insertions / content controls
      }
    }
  };
  walk(p);
}

function paragraph(p: Element): HTMLElement {
  const style = kid(kid(p, "pPr") || p, "pStyle")?.getAttribute("w:val") || "";
  const level = /^Title$/i.test(style) ? 1 : Number(/^heading\s*([1-3])$/i.exec(style)?.[1] || 0);
  const list = !!kid(kid(p, "pPr") || p, "numPr");
  const el = document.createElement(level ? `h${Math.min(4, level + 1)}` : "p");
  if (list) el.appendChild(document.createTextNode("• "));
  runs(p, el);
  if (!el.textContent?.trim() && !el.querySelector("br")) el.appendChild(document.createElement("br"));
  return el;
}

function block(el: Element, out: HTMLElement) {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== 1) continue;
    const e = n as Element;
    if (e.localName === "p") out.appendChild(paragraph(e));
    else if (e.localName === "tbl") {
      const t = document.createElement("table");
      for (const tr of kids(e, "tr")) {
        const row = document.createElement("tr");
        for (const tc of kids(tr, "tc")) { const td = document.createElement("td"); block(tc, td); row.appendChild(td); }
        t.appendChild(row);
      }
      out.appendChild(t);
    } else if (e.localName === "sdt") { const c = kid(e, "sdtContent"); if (c) block(c, out); }
  }
}

export async function docxToElement(buf: ArrayBuffer): Promise<HTMLElement> {
  const xml = await unzipFile(buf, "word/document.xml");
  if (!xml) throw new Error("This Word file could not be read.");
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(xml), "application/xml");
  const body = doc.getElementsByTagNameNS("*", "body")[0];
  if (!body) throw new Error("This Word file could not be read.");
  const out = document.createElement("div");
  block(body, out);
  return out;
}
