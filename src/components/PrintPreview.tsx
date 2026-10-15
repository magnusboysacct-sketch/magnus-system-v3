// src/components/PrintPreview.tsx
//
// Full-screen print preview that lives INSIDE the app (no pop-up window, so a pop-up blocker can never stop it). The document is shown in a
// same-origin iframe (srcdoc), A4-ish wide and scrollable, on a light background, with a [Print] [Close] toolbar. It is opened with
// showPrintPreview() from lib/printPreview.ts; nothing renders this component directly.
//
// Print: the button's click handler calls the document frame's print() directly and synchronously — no await, no timer — so it always has the
// user's click. If that throws, or the frame is not ready, it falls back to window.print() on the main page, whose @media print rules (installed
// by lib/printPreview.ts for as long as the preview is open) hide the app and show only a copy of the document. That same copy is what prints on
// browsers that print the whole page when asked to print a frame (iOS Safari).
import React, { useEffect, useRef, useState } from "react";

const A4_WIDTH = 794;      // 210mm at 96dpi
const MIN_HEIGHT = 1123;   // 297mm at 96dpi — a short document still looks like a sheet of paper

export interface PrintPreviewProps {
  html: string;
  title: string;
  allowPrint: boolean;
  onPrint?: () => void;
  onClose: () => void;
}

const btnBase: React.CSSProperties = {
  font: "600 14px system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "9px 18px", borderRadius: 8, cursor: "pointer", lineHeight: 1.2,
  minHeight: 40, touchAction: "manipulation",
};

export default function PrintPreview({ html, title, allowPrint, onPrint, onClose }: PrintPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const [height, setHeight] = useState(MIN_HEIGHT);

  // Escape closes the preview (and nothing underneath it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Size the frame to its document so the overlay (not the frame) scrolls: that is what works on iOS and Android, and Print still prints it all.
  function fit() {
    const d = frameRef.current?.contentDocument;
    if (!d) return;
    const h = Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0);
    setHeight(Math.max(MIN_HEIGHT, h));
  }

  function onFrameLoad() {
    readyRef.current = true;
    const f = frameRef.current;
    const d = f?.contentDocument;
    if (!f || !d) return;
    if (title) { try { d.title = title; } catch { /* cosmetic */ } }
    fit();
    // images that finish loading after the frame did (the logo) change the height
    Array.from(d.images).forEach((img) => { if (!img.complete) { img.addEventListener("load", fit, { once: true }); img.addEventListener("error", fit, { once: true }); } });
    try {
      const ResizeObs = (f.contentWindow as any)?.ResizeObserver;
      if (ResizeObs) new ResizeObs(() => fit()).observe(d.documentElement);
    } catch { /* optional */ }
  }

  // Runs inside the click: nothing may come between the click and print().
  function handlePrint() {
    const w = frameRef.current?.contentWindow;
    if (w && readyRef.current) {
      try {
        w.focus();
        w.print();
        onPrint?.();
        return;
      } catch { /* fall through to the main-page print */ }
    }
    window.print();
    onPrint?.();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Print preview"}
      data-print-preview="overlay"
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "#e5e7eb", color: "#111827", display: "flex", flexDirection: "column", colorScheme: "light" }}
    >
      <div
        data-print-preview="toolbar"
        style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#ffffff", borderBottom: "1px solid #d1d5db", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
      >
        <div style={{ flex: 1, minWidth: 0, font: "600 15px system-ui, -apple-system, 'Segoe UI', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title || "Print preview"}
        </div>
        {allowPrint && (
          <button type="button" data-print-preview="print" onClick={handlePrint} style={{ ...btnBase, background: "#1d4ed8", color: "#ffffff", border: "1px solid #1d4ed8" }}>
            Print
          </button>
        )}
        <button type="button" data-print-preview="close" onClick={onClose} style={{ ...btnBase, background: "#ffffff", color: "#111827", border: "1px solid #9ca3af" }}>
          Close
        </button>
      </div>
      <div data-print-preview="scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", WebkitOverflowScrolling: "touch", padding: "16px 8px 32px" }}>
        <iframe
          ref={frameRef}
          data-print-preview="frame"
          title={title || "Document preview"}
          srcDoc={html}
          onLoad={onFrameLoad}
          style={{ display: "block", margin: "0 auto", width: A4_WIDTH, maxWidth: "100%", height, border: 0, background: "#ffffff", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}
        />
      </div>
    </div>
  );
}
