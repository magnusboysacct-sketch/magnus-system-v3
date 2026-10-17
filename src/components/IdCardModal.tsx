// src/components/IdCardModal.tsx — the ID card dialog shared by StaffIDCard and WorkerIDCard: front/back preview (the same renderer as the print files), tap the QR
// to open it large and white for scanning from the screen, Print, and "Download for printing".
import React, { useEffect, useMemo, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import { loadStaffCard, loadWorkerCard, type LoadedCard } from "../lib/idCardData";
import { CARD_H_MM, CARD_W_MM, SCREEN_PPM, renderIdCardFace, renderQrCanvas, verifyUrl } from "../lib/idCardRender";
import { showPrintPreview } from "../lib/printPreview";
import { IdCardDownloadDialog } from "./IdCardDownload";

interface Props { kind: "staff" | "worker"; id: string; companyName?: string; onClose: () => void }

export default function IdCardModal({ kind, id, companyName, onClose }: Props) {
  const [card, setCard] = useState<LoadedCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [face, setFace] = useState<"front" | "back">("front");
  const [bigQr, setBigQr] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    (kind === "staff" ? loadStaffCard(id) : loadWorkerCard(id, companyName))
      .then((c) => { if (alive) { setCard(c); if (!c) setError("This ID card could not be found."); } })
      .catch((e) => { console.error("ID card load error:", e); if (alive) setError("Could not load the ID card. If this keeps happening, ask your administrator to check that the latest database update has been applied."); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [kind, id, companyName]);

  const rendered = useMemo(() => {
    if (!card) return null;
    const r = renderIdCardFace(face, card.data, card.company, card.images, { ppm: SCREEN_PPM, bleedMm: 0 });
    return { r, src: r.canvas.toDataURL("image/png") };
  }, [card, face]);

  async function handlePrint() {
    if (!card) return;
    setPrinting(true);
    try {
      // ~300 dpi, no bleed: exactly 54 x 85.6 mm on the page
      const ppm = 300 / 25.4;
      const imgs = (["front", "back"] as const).map((f) => renderIdCardFace(f, card.data, card.company, card.images, { ppm, bleedMm: 0 }).canvas.toDataURL("image/png"));
      const html = `<!DOCTYPE html><html><head><title>${kind === "staff" ? "Staff" : "Worker"} ID — ${card.data.name.replace(/[<>&]/g, "")}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #f0f0f0; display: flex; gap: 10mm; align-items: center; justify-content: center; min-height: 100vh; padding: 10mm; }
          img { width: ${CARD_W_MM}mm; height: ${CARD_H_MM}mm; display: block; }
          @media print { body { background: #fff; padding: 0; gap: 8mm; } img { page-break-inside: avoid; } }
        </style></head><body><img src="${imgs[0]}"/><img src="${imgs[1]}"/></body></html>`;
      showPrintPreview(html);
    } catch (e) {
      console.error("Print ID card failed:", e);
      alert("Could not print the ID card: " + (e instanceof Error && e.message ? e.message : "please try again."));
    } finally {
      setPrinting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center"><div className="text-sm text-gray-500">Loading ID card...</div></div>
      </div>
    );
  }
  if (error || !card || !rendered) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 text-center max-w-sm">
          <div className="text-sm text-gray-700 dark:text-gray-200 mb-4">{error || "This ID card could not be found."}</div>
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300">Close</button>
        </div>
      </div>
    );
  }

  const { r, src } = rendered;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-xl my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">{kind === "staff" ? "Staff ID Card" : "Worker ID Card"}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex justify-center">
          <div style={{ position: "relative", width: `min(${r.widthPx}px, 100%)`, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", lineHeight: 0 }}>
            <img src={src} alt={`${card.data.name} ID card ${face}`} style={{ width: "100%", height: "auto", display: "block" }} />
            <button onClick={() => setBigQr(true)} aria-label="Open the QR code large for scanning" title="Tap to open the QR code large"
              style={{ position: "absolute", left: pct(r.qr.x, r.widthPx), top: pct(r.qr.y, r.heightPx), width: pct(r.qr.w, r.widthPx), height: pct(r.qr.h, r.heightPx), background: "transparent", border: "none", cursor: "zoom-in", padding: 0 }} />
          </div>
        </div>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">Tap the QR code to open it large and scan it from another phone.</p>

        <div className="flex gap-3 mt-4 flex-wrap">
          <button onClick={() => setFace((f) => (f === "front" ? "back" : "front"))}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {face === "back" ? "Show Front" : "Show Back"}
          </button>
          <button onClick={handlePrint} disabled={printing}
            className="flex-1 min-w-[9rem] bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
            <Printer size={16} />{printing ? "Preparing…" : "Print ID Card"}
          </button>
          <button onClick={() => setDownloading(true)}
            className="flex-1 min-w-[9rem] border border-blue-700 text-blue-700 dark:text-blue-300 dark:border-blue-400 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors">
            <Download size={16} />Download for printing
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Close
          </button>
        </div>
      </div>

      {bigQr && <BigQr code={card.data.verifyCode} name={card.data.name} onClose={() => setBigQr(false)} />}
      {downloading && <IdCardDownloadDialog cards={[card]} onClose={() => setDownloading(false)} />}
    </div>
  );
}

// The QR alone on pure white, as large as the screen allows, for scanning from another phone.
function BigQr({ code, name, onClose }: { code: string; name: string; onClose: () => void }) {
  const url = verifyUrl(code);
  const src = useMemo(() => {
    const side = Math.max(240, Math.min(window.innerWidth, window.innerHeight) * 0.88);
    const modulePx = Math.max(4, Math.floor(side / 37));          // 29 modules + 4-module margins; whole pixels per module
    const c = renderQrCanvas(url, modulePx);
    return { url: c.toDataURL("image/png"), px: c.width };
  }, [url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} role="dialog" aria-label="QR code" style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 70, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 12 }}>
      <img src={src.url} alt={`QR code for ${name}`} style={{ width: src.px, maxWidth: "100%", height: "auto", imageRendering: "pixelated", display: "block" }} />
      <div style={{ color: "#15315A", fontWeight: 600, marginTop: 10, fontSize: 16, textAlign: "center" }}>{name}</div>
      <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Scan to verify · tap anywhere to close</div>
    </div>
  );
}
