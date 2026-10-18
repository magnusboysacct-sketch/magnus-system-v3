// src/components/LogoUploadPanel.tsx — picking and uploading the company logo (Settings → Company).
// Pick a PNG or JPG (up to 5 MB) → a before / after preview with "Trim empty space" (on by default when more than 10% of the image is empty margin) → Upload.
// The picked file is always kept untouched: without trimming it is uploaded as it is; with trimming the cropped PNG becomes the logo and the original is stored
// next to it as a separate file (<company>/logo/original/…). A new file name every time, so an earlier logo is never overwritten.
import React, { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import { LOGO_ACCEPT, analyzeLogoFile, logoExtension, logoType, trimLogoFile, type LogoInfo, type TrimmedLogo } from "../lib/logoImage";

interface Props {
  companyId: string | null;
  hasLogo: boolean;
  onUploaded: (publicUrl: string, info: LogoInfo) => void;
  onRemove: () => void;
  onError: (message: string) => void;
}

interface Pending { file: File; info: LogoInfo; trimmed: TrimmedLogo | null; trim: boolean; beforeUrl: string; afterUrl: string | null }

// a light chequerboard behind both previews, so transparent margins can be seen
const CHECKER: React.CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage: "linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%)",
  backgroundSize: "12px 12px", backgroundPosition: "0 0,6px 6px",
};

export default function LogoUploadPanel({ companyId, hasLogo, onUploaded, onRemove, onError }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  // preview addresses are released when they are replaced or the panel goes away (not when only the checkbox changes)
  const beforeUrl = pending?.beforeUrl, afterUrl = pending?.afterUrl;
  useEffect(() => () => { if (beforeUrl) URL.revokeObjectURL(beforeUrl); if (afterUrl) URL.revokeObjectURL(afterUrl); }, [beforeUrl, afterUrl]);

  async function pick(f: File) {
    setBusy(true);
    try {
      const info = await analyzeLogoFile(f);                    // PNG or JPG up to 5 MB, else a readable message
      const trimmed = await trimLogoFile(f);                    // null when there is nothing worth trimming (10% or less)
      setPending({ file: f, info, trimmed, trim: !!trimmed, beforeUrl: URL.createObjectURL(f), afterUrl: trimmed ? URL.createObjectURL(trimmed.blob) : null });
    } catch (err) {
      onError(err instanceof Error ? err.message : "The logo could not be read.");
    } finally { setBusy(false); }
  }

  async function upload() {
    if (!pending || !companyId) return;
    setBusy(true);
    try {
      const { file, info, trimmed, trim } = pending;
      const type = logoType(file);
      const stamp = Date.now();
      const bucket = supabase.storage.from("company-logos");
      let path: string, body: Blob = file, contentType = type, done: LogoInfo = info;
      if (trim && trimmed) {
        // the untouched original first (kept), then the trimmed PNG as the logo
        const originalPath = `${companyId}/logo/original/${stamp}_original.${logoExtension(type)}`;
        const { error: oe } = await bucket.upload(originalPath, file, { upsert: false, contentType: type });
        if (oe) throw new Error(oe.message);
        path = `${companyId}/logo/${stamp}_logo.png`; body = trimmed.blob; contentType = "image/png";
        done = { ...info, type: "image/png", width: trimmed.width, height: trimmed.height, bytes: trimmed.blob.size, margins: null, sourceWidth: info.width, trimmedFrom: { width: trimmed.fromWidth, height: trimmed.fromHeight } };
      } else {
        path = `${companyId}/logo/${stamp}_logo.${logoExtension(type)}`;
      }
      const { error: ue } = await bucket.upload(path, body, { upsert: false, contentType });
      if (ue) throw new Error(ue.message);
      onUploaded(bucket.getPublicUrl(path).data.publicUrl, done);
      setPending(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "The logo could not be uploaded.");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition">
          <Upload size={13} className="text-slate-600" />
          <span className="text-[11px] text-slate-500">{busy && !pending ? "Reading…" : "Click to upload a PNG or JPG (up to 5 MB)"}</span>
          <input type="file" accept={LOGO_ACCEPT} className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
        </label>
        {hasLogo && <button onClick={onRemove} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>}
      </div>

      {pending && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-white/[0.08] p-3" data-testid="logo-pending">
          <div className="flex flex-wrap gap-4">
            <figure className="m-0">
              <div style={{ ...CHECKER, width: 160, height: 110 }} className="rounded-lg border border-slate-200 dark:border-white/[0.1] flex items-center justify-center overflow-hidden">
                <img src={pending.beforeUrl} alt="Logo before trimming" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
              <figcaption className="text-[10px] text-slate-500 mt-1">{pending.trimmed ? "Before" : "Your logo"}: {pending.info.width} × {pending.info.height} px</figcaption>
            </figure>
            {pending.trimmed && pending.afterUrl && (
              <figure className="m-0">
                <div style={{ ...CHECKER, width: 160, height: 110, opacity: pending.trim ? 1 : 0.45 }} className="rounded-lg border border-slate-200 dark:border-white/[0.1] flex items-center justify-center overflow-hidden">
                  <img src={pending.afterUrl} alt="Logo after trimming" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
                <figcaption className="text-[10px] text-slate-500 mt-1">After: {pending.trimmed.width} × {pending.trimmed.height} px</figcaption>
              </figure>
            )}
          </div>

          {pending.trimmed ? (
            <label className="mt-3 flex items-start gap-2 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={pending.trim} onChange={(e) => setPending({ ...pending, trim: e.target.checked })} />
              <span>
                <b>Trim empty space</b> — about {Math.round(pending.trimmed.emptyShare * 100)}% of this image is empty {pending.trimmed.basis === "transparent" ? "transparent" : "white"} margin.
                The trimmed copy is used as the logo, so it shows larger on cards and documents. Your original file is kept as well.
              </span>
            </label>
          ) : (
            <div className="mt-3 text-[11px] text-slate-500">This logo has little empty space around it, so it is uploaded as it is.</div>
          )}

          <div className="mt-3 flex gap-2">
            <button onClick={upload} disabled={busy} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-semibold">{busy ? "Uploading…" : "Upload logo"}</button>
            <button onClick={() => setPending(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/[0.12] text-xs text-slate-600 dark:text-slate-300">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
