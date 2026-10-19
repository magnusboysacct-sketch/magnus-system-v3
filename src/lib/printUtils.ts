// src/lib/printUtils.ts — Centralized print utility for Magnus Boys ERP
// All print functions across the app should use this
import { showPrintPreview } from "./printPreview";

export interface PrintOptions {
  title?: string;
  watermark?: { url: string; opacity: number; size?: number } | null;
  tagline?: string;
}

// The full document that gets printed (title + base styles + the html + the optional watermark).
export function buildPrintDocument(html: string, options: PrintOptions = {}): string {
  const { title = "Magnus Boy's System", watermark, tagline } = options;

  const wmHtml = watermark?.url
    ? `<img class="wm" src="${watermark.url}"/>${tagline ? `<div class="wm-tag">${tagline.toUpperCase()}</div>` : ""}`
    : "";

  return `<!DOCTYPE html><html><head>
    <title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white}
      .wm{position:fixed;bottom:6mm;right:6mm;height:${watermark?.size||25}mm;width:${watermark?.size||25}mm;object-fit:contain;object-position:bottom right;opacity:${watermark?.opacity||0.15};pointer-events:none;z-index:-1;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .wm-tag{position:fixed;bottom:3mm;right:6mm;text-align:right;font-size:7px;letter-spacing:2px;text-transform:uppercase;color:#bbb;pointer-events:none;z-index:-1}
      @media print{@page{size:A4 portrait;margin:15mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style>
  </head><body>${html}${wmHtml}</body></html>`;
}

// Shows the document in the in-app print preview (components/PrintPreview.tsx): no pop-up window, so nothing can block it. Print is pressed in
// the preview. onPrint runs when Print was pressed; allowPrint:false shows the document without a Print button.
export function openPrintPreview(html: string, options: PrintOptions & { onPrint?: () => void; allowPrint?: boolean } = {}): boolean {
  showPrintPreview(buildPrintDocument(html, options), { title: options.title, onPrint: options.onPrint, allowPrint: options.allowPrint });
  return true;
}
