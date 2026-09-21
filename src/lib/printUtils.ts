// src/lib/printUtils.ts — Centralized print utility for Magnus Boys ERP
// All print functions across the app should use this

export interface PrintOptions {
  title?: string;
  watermark?: { url: string; opacity: number; size?: number } | null;
  tagline?: string;
  // Wait until every <img> in the print window has loaded (or failed) before printing, instead of a
  // fixed delay. Off by default so existing prints behave exactly as before.
  waitForImages?: boolean;
}

// Prints once every image in the window has loaded or failed. A slow or broken image never blocks
// printing: after maxWaitMs it prints anyway. print() is called at most once.
function printWhenImagesReady(w: Window, maxWaitMs = 8000) {
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    try { w.focus(); w.print(); } catch { /* ignore */ }
  };
  try {
    const pending = Array.from(w.document.images).filter((img) => !img.complete);
    if (pending.length === 0) { setTimeout(go, 150); return; }
    let left = pending.length;
    const settled = () => { left -= 1; if (left <= 0) setTimeout(go, 100); };
    pending.forEach((img) => {
      img.addEventListener("load", settled, { once: true });
      img.addEventListener("error", settled, { once: true });
    });
    setTimeout(go, maxWaitMs);
  } catch {
    setTimeout(go, 600);
  }
}

export function openPrintWindow(html: string, options: PrintOptions = {}): boolean {
  const { title = "Magnus Boys ERP", watermark, tagline, waitForImages } = options;
  const w = window.open("", "_blank");
  if (!w) return false;

  const wmHtml = watermark?.url
    ? `<img class="wm" src="${watermark.url}"/>${tagline ? `<div class="wm-tag">${tagline.toUpperCase()}</div>` : ""}`
    : "";

  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white}
      .wm{position:fixed;bottom:6mm;right:6mm;height:${watermark?.size||25}mm;width:${watermark?.size||25}mm;object-fit:contain;object-position:bottom right;opacity:${watermark?.opacity||0.15};pointer-events:none;z-index:-1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .wm-tag{position:fixed;bottom:3mm;right:6mm;text-align:right;font-size:7px;letter-spacing:2px;text-transform:uppercase;color:#bbb;pointer-events:none;z-index:-1}
      @media print{@page{size:A4 portrait;margin:15mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style>
  </head><body>${html}${wmHtml}</body></html>`);

  w.document.close();
  if (waitForImages) printWhenImagesReady(w);
  else setTimeout(() => w.print(), 600);
  return true;
}