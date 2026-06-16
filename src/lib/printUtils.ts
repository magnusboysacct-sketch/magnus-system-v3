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

  // Add print tip banner
  const tip = w.document.createElement("div");
  tip.style.cssText = "position:fixed;top:0;left:0;right:0;background:#1a1a1a;color:white;text-align:center;padding:8px;font-size:11px;font-family:sans-serif;z-index:9999;";
  tip.innerHTML = "💡 To save as PDF: Change Destination to <b>Save as PDF</b> · Enable <b>Background graphics</b> for watermark";
  w.document.body.appendChild(tip);
  w.document.close();
  setTimeout(() => w.print(), 600);
}