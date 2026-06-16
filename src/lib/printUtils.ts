// src/lib/printUtils.ts — Centralized print utility for Magnus Boys ERP
// All print functions across the app should use this

export interface PrintOptions {
  title?: string;
  watermark?: { url: string; opacity: number; size?: number } | null;
  tagline?: string;
}

export function openPrintWindow(html: string, options: PrintOptions = {}) {
  const { title = "Magnus Boys ERP", watermark, tagline } = options;
  const w = window.open("", "_blank");
  if (!w) return;

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
  setTimeout(() => w.print(), 600);
}