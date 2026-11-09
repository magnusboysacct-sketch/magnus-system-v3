// src/components/FileViewer.tsx — opens a file INSIDE the app (works the same on a phone, a tablet and a computer, no new tab):
// pictures, PDF (every page), Word .docx (text and tables), Excel / CSV (each sheet as a table) and text files. Anything else
// shows a Download button. The file is fetched from its private link; nothing is sent to any other service.
import { useEffect, useRef, useState } from "react";
import { docxToElement } from "../lib/docxView";

type Kind = "image" | "pdf" | "docx" | "sheet" | "text" | "other";
function kindOf(name: string, mime: string | null): Kind {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const m = mime || "";
  if (/^image\/(jpeg|png|gif|webp|bmp)/.test(m) || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || /wordprocessingml/.test(m)) return "docx";
  if (["xlsx", "xls", "csv", "ods"].includes(ext) || /spreadsheet|excel|text\/csv/.test(m)) return "sheet";
  if (["txt", "md", "json", "log"].includes(ext) || m === "text/plain") return "text";
  return "other";
}

export default function FileViewer({ url, downloadUrl, name, mime, onClose }: { url: string; downloadUrl?: string; name: string; mime: string | null; onClose: () => void }) {
  const kind = kindOf(name, mime);
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(kind === "image" || kind === "other" ? null : "Opening…");
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [sheetAt, setSheetAt] = useState(0);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (kind === "image" || kind === "other") return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`The file could not be fetched (${res.status}).`);
        const buf = await res.arrayBuffer();
        if (!alive) return;
        if (kind === "text") { setText(new TextDecoder().decode(buf).slice(0, 500_000)); setStatus(null); return; }
        if (kind === "docx") {
          const el = await docxToElement(buf);
          if (!alive || !box.current) return;
          box.current.replaceChildren(el); setStatus(null); return;
        }
        if (kind === "sheet") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          // cells are written as escaped text; links are taken out (a spreadsheet link is never followed from here)
          setSheets(wb.SheetNames.slice(0, 30).map((n) => ({ name: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" }).replace(/<a\b[^>]*>|<\/a>/gi, "") })));
          setStatus(null); return;
        }
        if (kind === "pdf") {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
          const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
          const holder = box.current;
          if (!holder) return;
          holder.replaceChildren();
          const width = Math.min(holder.clientWidth || 800, 1100);
          const pages = Math.min(pdf.numPages, 60);
          for (let i = 1; i <= pages && alive; i++) {
            setStatus(`Page ${i} of ${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const base = page.getViewport({ scale: 1 });
            const scale = (width / base.width) * (window.devicePixelRatio > 1 ? 1.5 : 1);
            const vp = page.getViewport({ scale });
            const c = document.createElement("canvas");
            c.width = vp.width; c.height = vp.height;
            c.style.width = "100%"; c.style.height = "auto"; c.className = "mb-3 rounded border border-slate-200 bg-white shadow-sm";
            await page.render({ canvasContext: c.getContext("2d")!, viewport: vp, canvas: c }).promise;
            holder.appendChild(c);
          }
          if (alive) setStatus(pdf.numPages > pages ? `Showing the first ${pages} of ${pdf.numPages} pages. Download to see all.` : null);
        }
      } catch (e) { if (alive) setStatus(e instanceof Error ? e.message : "This file could not be shown here."); }
    })();
    return () => { alive = false; };
  }, [url, kind]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900/90" role="dialog" aria-label={name}>
      <div className="flex items-center gap-2 bg-white dark:bg-[#0f151c] px-3 py-2 shadow">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</div>
        {downloadUrl && <a href={downloadUrl} download={name} className="rounded-lg border border-slate-300 dark:border-white/[0.15] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">⬇ Download</a>}
        <button onClick={onClose} className="rounded-lg bg-slate-800 dark:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900">✕ Close</button>
      </div>
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {status && <div className="mx-auto mb-3 max-w-3xl rounded-lg bg-white/90 px-4 py-2 text-center text-sm text-slate-700">{status}</div>}
        {kind === "image" && <img src={url} alt={name} className="mx-auto max-w-full rounded bg-white" />}
        {kind === "other" && (
          <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center text-sm text-slate-700 space-y-3">
            <div className="text-4xl">📄</div>
            <div>This kind of file can't be shown inside the app. Download it and open it with the right app on this device.</div>
            {downloadUrl && <a href={downloadUrl} download={name} className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">⬇ Download</a>}
          </div>
        )}
        {kind === "text" && text != null && <pre className="mx-auto max-w-4xl whitespace-pre-wrap rounded bg-white p-4 text-xs text-slate-800">{text}</pre>}
        {kind === "sheet" && sheets.length > 0 && (
          <div className="mx-auto max-w-6xl rounded bg-white p-3">
            {sheets.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {sheets.map((s, i) => <button key={s.name} onClick={() => setSheetAt(i)} className={`rounded px-2 py-1 text-xs font-semibold ${i === sheetAt ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700"}`}>{s.name}</button>)}
              </div>
            )}
            {/* SheetJS writes the cells as escaped text */}
            <div className="file-viewer-sheet overflow-auto text-xs text-slate-800 [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1" dangerouslySetInnerHTML={{ __html: sheets[sheetAt]?.html || "" }} />
          </div>
        )}
        <div ref={box} className={kind === "docx"
          ? "mx-auto max-w-3xl rounded bg-white p-6 sm:p-10 text-sm leading-relaxed text-slate-900 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-3 [&_h4]:font-bold [&_p]:my-1.5 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_td]:align-top"
          : kind === "pdf" ? "mx-auto max-w-5xl" : "hidden"} />
      </div>
    </div>
  );
}
