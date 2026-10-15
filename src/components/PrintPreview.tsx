// src/components/PrintPreview.tsx
//
// Full-screen print preview that lives INSIDE the app (no pop-up window, so a pop-up blocker can never stop it). The document is shown in a
// same-origin iframe (srcdoc), A4-ish wide and scrollable, on a light background, with a [Print] [Close] toolbar. It is opened with
// showPrintPreview() from lib/printPreview.ts; nothing renders this component directly.
//
// Print: the button's click/tap handler calls print directly and synchronously — no await, no timer — so it always has the user's gesture.
//   - Desktop and Android: the document frame's own print() (prints exactly the document). If that throws or the frame is not ready, it
//     falls back to window.print() on the main page.
//   - iPhone / iPad (Safari and the home-screen app): window.print() on the main page is the PRIMARY path. iOS Safari does not reliably print a
//     frame (it prints the page that contains it), so lib/printPreview.ts keeps a hidden copy of the document in the main page and @media print
//     rules that hide the app and show only that copy for as long as the preview is open.
// The toolbar is touch-sized, respects the notch / home-bar safe areas (the installed app draws under the status bar), and never blocks
// pinch-zoom: the document area scrolls and zooms like any page.
import React, { useEffect, useRef, useState } from "react";
import { isIOSLike } from "../lib/platform";

const A4_WIDTH = 794;      // 210mm at 96dpi
const MIN_HEIGHT = 1123;   // 297mm at 96dpi — a short document still looks like a sheet of paper

export interface PrintPreviewProps {
  html: string;
  title: string;
  allowPrint: boolean;
  onPrint?: () => void;
  onClose: () => void;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// Button sizes: comfortable with a mouse, large for a finger (coarse pointer = touch screen).
const CSS = `
.pp-btn{font:600 15px ${FONT};min-height:42px;padding:0 20px;border-radius:10px;cursor:pointer;line-height:1.2;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-appearance:none;appearance:none}
.pp-btn-print{background:#1d4ed8;color:#fff;border:1px solid #1d4ed8}
.pp-btn-close{background:#fff;color:#111827;border:1px solid #9ca3af}
@media (pointer:coarse){.pp-btn{min-height:52px;min-width:96px;padding:0 28px;font-size:18px;border-radius:12px}}
.pp-bar{padding:max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 10px max(14px, env(safe-area-inset-left))}
@media (pointer:coarse){.pp-bar{padding-bottom:12px}}
.pp-scroll{padding:16px max(8px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left))}
`;

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
      const ResizeObs = (f.contentWindow as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
      if (ResizeObs) new ResizeObs(() => fit()).observe(d.documentElement);
    } catch { /* optional */ }
  }

  // Runs inside the click / tap: nothing may come between the gesture and print().
  function handlePrint() {
    if (!isIOSLike()) {
      const w = frameRef.current?.contentWindow;
      if (w && readyRef.current) {
        try {
          w.focus();
          w.print();
          onPrint?.();
          return;
        } catch { /* fall through to the main-page print */ }
      }
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
      <style>{CSS}</style>
      <div
        data-print-preview="toolbar"
        className="pp-bar"
        style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, background: "#ffffff", borderBottom: "1px solid #d1d5db", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
      >
        <div style={{ flex: 1, minWidth: 0, font: `600 15px ${FONT}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title || "Print preview"}
        </div>
        {allowPrint && (
          <button type="button" data-print-preview="print" className="pp-btn pp-btn-print" onClick={handlePrint}>
            Print
          </button>
        )}
        <button type="button" data-print-preview="close" className="pp-btn pp-btn-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div data-print-preview="scroll" className="pp-scroll" style={{ flex: 1, minHeight: 0, overflow: "auto", WebkitOverflowScrolling: "touch" }}>
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
