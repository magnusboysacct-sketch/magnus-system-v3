// src/lib/printPreview.ts
//
// One way to print anything in the app: showPrintPreview(html, { title }) opens a full-screen preview INSIDE the app (see
// components/PrintPreview.tsx) with [Print] and [Close]. No pop-up window and no hidden frame, so nothing can be blocked: the Print button's own
// click calls print(). It can be called at any time (after awaits, from a timer…) because opening an in-page overlay needs no user activation.
//
// While the preview is open:
//   - document.title is the document's title (so "Save as PDF" suggests a good file name); it is restored on close
//   - the page behind it does not scroll
//   - a hidden copy of the document sits in the main page, and @media print rules hide the app and show only that copy. It is what prints if
//     the browser prints the whole page instead of the frame (iOS Safari), or if the frame's own print() fails and window.print() is used.
// On iPhone / iPad that main-page print is the primary path (see components/PrintPreview.tsx), so the hidden copy must be a faithful rendering.
// Only one preview is open at a time; opening another replaces the first.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import PrintPreview from "../components/PrintPreview";

export interface PrintPreviewOptions {
  // Shown in the toolbar and used as document.title. Defaults to the document's own <title>.
  title?: string;
  // false = look only (no Print button). Default true.
  allowPrint?: boolean;
  // Called right after Print was pressed and the browser's print was requested.
  onPrint?: () => void;
}

export interface PrintPreviewHandle { close: () => void }

const HOST_ATTR = "data-print-preview-host";
const PRINT_ROOT_ID = "pp-print-root";
const PRINT_STYLE_ID = "pp-print-style";

let current: PrintPreviewHandle | null = null;

function decodeEntities(s: string): string {
  if (!/[&<]/.test(s)) return s;
  try { return new DOMParser().parseFromString(s, "text/html").documentElement.textContent || s; } catch { return s; }
}

function titleOf(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

// The main-page copy of the document used for window.print() (and for browsers that print the page rather than the frame). It lives in a shadow root
// so the document's own CSS (which resets margins on *, styles body…) cannot touch the app; body/html rules are re-pointed at the shadow host.
function installPrintCopy(html: string): () => void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const host = document.createElement("div");
  host.id = PRINT_ROOT_ID;
  const bodyStyle = parsed.body.getAttribute("style");
  if (bodyStyle) host.setAttribute("style", bodyStyle);
  const shadow = host.attachShadow({ mode: "open" });

  const pageRules: string[] = [];
  parsed.head.querySelectorAll("style, link[rel='stylesheet']").forEach((node) => {
    if (node.tagName === "STYLE") {
      const css = node.textContent || "";
      (css.match(/@page\s*[^{]*\{[^}]*\}/g) || []).forEach((r) => pageRules.push(r));
      const style = document.createElement("style");
      style.textContent = css.replace(/(^|[{},;\s])(?:html|body)(?=[\s,{.:#[>+~])/g, "$1:host");
      shadow.appendChild(style);
    } else {
      shadow.appendChild(node.cloneNode(true));
    }
  });
  parsed.body.querySelectorAll("style").forEach((node) => {
    const css = node.textContent || "";
    (css.match(/@page\s*[^{]*\{[^}]*\}/g) || []).forEach((r) => pageRules.push(r));
    const style = document.createElement("style");
    style.textContent = css.replace(/(^|[{},;\s])(?:html|body)(?=[\s,{.:#[>+~])/g, "$1:host");
    shadow.appendChild(style);
    node.remove();
  });
  const content = document.createElement("div");
  content.innerHTML = parsed.body.innerHTML;
  shadow.appendChild(content);

  const printStyle = document.createElement("style");
  printStyle.id = PRINT_STYLE_ID;
  printStyle.textContent =
    `#${PRINT_ROOT_ID}{display:none}` +
    `@media print{body > *:not(#${PRINT_ROOT_ID}){display:none !important}#${PRINT_ROOT_ID}{display:block !important;background:#fff}${pageRules.join("")}}`;
  document.head.appendChild(printStyle);
  document.body.appendChild(host);
  return () => { host.remove(); printStyle.remove(); };
}

export function showPrintPreview(html: string, options: PrintPreviewOptions = {}): PrintPreviewHandle {
  current?.close();

  const title = (options.title != null ? decodeEntities(options.title) : titleOf(html)) || "Print preview";
  const previousTitle = document.title;
  const previousOverflow = document.body.style.overflow;
  document.title = title;
  document.body.style.overflow = "hidden";

  const host = document.createElement("div");
  host.setAttribute(HOST_ATTR, "");
  document.body.appendChild(host);
  let root: Root | null = createRoot(host);

  let removeCopy: () => void = () => {};
  try { removeCopy = installPrintCopy(html); } catch { /* the frame alone still prints on browsers that print frames */ }

  let closed = false;
  const handle: PrintPreviewHandle = {
    close() {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      const r = root; root = null;
      try { r?.unmount(); } catch { /* already gone */ }
      host.remove();
      removeCopy();
      document.title = previousTitle;
      document.body.style.overflow = previousOverflow;
    },
  };
  current = handle;

  root.render(
    React.createElement(PrintPreview, {
      html,
      title,
      allowPrint: options.allowPrint !== false,
      onPrint: options.onPrint,
      onClose: () => handle.close(),
    }),
  );
  return handle;
}
