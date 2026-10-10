// src/pages/MySignaturePage.tsx - a user's own signature, open to every role.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, CardHeader, Alert, Spinner } from "../components/ui";
import { PenTool, Upload } from "lucide-react";
import SignaturePad from "../components/SignaturePad";
import PhotoCropModal from "../components/PhotoCropModal";
import { clearMySignature, loadMySignature, saveMySignature, type MySignature } from "../lib/userSignature";

export default function MySignaturePage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<MySignature | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPad, setShowPad] = useState(false);
  // Picked file waiting in the crop modal (same flow and 4:1 strip as the company signature).
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  async function refresh() {
    try {
      setMine(await loadMySignature());
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Your signature could not be loaded." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function persist(blob: Blob) {
    setSaving(true);
    setMsg(null);
    try {
      await saveMySignature(blob);
      setShowPad(false);
      setMsg({ type: "success", text: "Signature saved." });
      await refresh();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Your signature could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function saveDrawn(dataUrl: string) {
    await persist(await (await fetch(dataUrl)).blob());
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  async function handleCropDone(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    await persist(blob);
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function remove() {
    if (!window.confirm("Remove your saved signature? The company's default signature will be used instead.")) return;
    setSaving(true);
    setMsg(null);
    try {
      await clearMySignature();
      setMsg({ type: "success", text: "Signature removed." });
      await refresh();
    } catch (e: any) {
      setMsg({ type: "error", text: e?.message || "Your signature could not be removed." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-600">
        <Spinner size={16}/> Loading...
      </div>
    </div>
  );

  const hasPersonal = !!mine?.personalUrl;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="My Signature"
        subtitle="Your personal signature for signing documents"
        back={() => nav(-1)}
      />

      <div className="p-6 max-w-2xl space-y-5">
        {msg && (
          <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>
        )}

        {mine?.columnMissing && (
          <Alert type="error">Personal signatures aren't switched on yet. Ask your administrator to apply the latest database update.</Alert>
        )}

        <Card>
          <CardHeader title="Your Signature"/>
          <p className="text-xs text-slate-500 mb-4">
            This signature will be used by default when you sign documents. If you don't set one, the company's default signature will be used instead.
            Right now it is offered as "Use my saved signature" when you sign a contract as the contractor.
          </p>
          <div className="flex items-center gap-4">
            <div className="w-32 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
              {hasPersonal ? (
                <img src={mine!.personalUrl!} alt="My signature" className="w-full h-full object-contain"/>
              ) : (
                <PenTool size={20} className="text-slate-400"/>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-400 mb-1">
                {hasPersonal
                  ? "Your signature is saved"
                  : mine?.personalPath
                    ? "Your saved signature could not be loaded right now. Try again in a moment."
                    : mine?.companyUrl ? "No personal signature saved - the company's default is used" : "No signature saved"}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowPad(true)}
                  disabled={saving || !!mine?.columnMissing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500 disabled:opacity-50"
                >
                  <PenTool size={13} className="text-slate-600"/>
                  {hasPersonal || mine?.personalPath ? "Redraw signature" : "Draw signature"}
                </button>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500 ${mine?.columnMissing ? "opacity-50" : ""}`}>
                  <Upload size={13} className="text-slate-600"/>
                  {saving ? "Saving..." : "Upload photo/scan"}
                  <input type="file" accept="image/*" className="hidden" disabled={saving || !!mine?.columnMissing} onChange={handleFileSelect}/>
                </label>
                {mine?.personalPath && (
                  <button onClick={remove} disabled={saving} className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50">Remove</button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {!hasPersonal && mine?.companyUrl && (
          <Card>
            <CardHeader title="Company Default Signature"/>
            <div className="flex items-center gap-4">
              <div className="w-32 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={mine.companyUrl} alt="Company signature" className="w-full h-full object-contain"/>
              </div>
              <div className="text-xs text-slate-400">This is what will be used for you until you save your own signature.</div>
            </div>
          </Card>
        )}
      </div>

      {showPad && (
        <SignaturePad
          title="My Signature"
          subtitle="Draw the signature you want to use when you sign documents."
          onSave={saveDrawn}
          onCancel={() => setShowPad(false)}
        />
      )}

      {cropSrc && (
        <PhotoCropModal
          imageSrc={cropSrc}
          aspect={4 / 1}
          title="Crop Signature"
          onCancel={handleCropCancel}
          onCropDone={handleCropDone}
        />
      )}
    </div>
  );
}
