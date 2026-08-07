// src/pages/SettingsCompanyPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, CardHeader, Btn, Input, Field,
  Alert, Divider, Spinner, cn
} from "../components/ui";
import { Building2, Save, RefreshCw, Globe, Phone, Mail, MapPin, ImageIcon, Upload, Eye, EyeOff, PenTool } from "lucide-react";
import SignaturePad from "../components/SignaturePad";
import PhotoCropModal from "../components/PhotoCropModal";

type CompanySettings = {
  id: number;
  company_id: string;
  company_name: string;
  logo_url: string | null;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  parish: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export default function SettingsCompanyPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    company_name: "", tagline: "", address_line1: "",
    address_line2: "", parish: "", country: "",
    phone: "", email: "", website: "",
  });

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  // File picked via "Upload photo/scan" goes through the crop modal before
  // it's persisted — same PhotoCropModal used for staff photos (built
  // earlier this session), just with a wider aspect ratio suited to a
  // signature strip instead of a portrait headshot. Holds the picked file's
  // object URL until the user confirms the crop or cancels.
  const [signatureCropSrc, setSignatureCropSrc] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [paymentNotificationsEnabled, setPaymentNotificationsEnabled] = useState(true);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [watermarkSize, setWatermarkSize] = useState(25);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) throw new Error("No company associated with your account");
      setCompanyId(profile.company_id);

      // Try RPC first, fallback to direct query
      let settings: CompanySettings | null = null;
      const { data: rpcData, error: rpcError } = await supabase
        .rpc("get_or_create_company_settings", { p_company_id: profile.company_id });

      if (!rpcError && rpcData && rpcData.length > 0) {
        settings = rpcData[0] as CompanySettings;
      } else {
        // Fallback: direct select
        const { data: direct } = await supabase
          .from("company_settings")
          .select("*")
          .eq("company_id", profile.company_id)
          .maybeSingle();
        settings = direct;
      }

      if (settings) {
        setLogoUrl(settings.logo_url || null);
        setSignatureUrl((settings as any).signature_url || null);
        setWatermarkUrl((settings as any).watermark_url || null);
        setWatermarkEnabled((settings as any).watermark_enabled || false);
        setPaymentNotificationsEnabled((settings as any).payment_notifications_enabled !== false);
        setWatermarkOpacity((settings as any).watermark_opacity || 0.15);
        setWatermarkSize((settings as any).watermark_size || 25);
        setForm({
          company_name:  settings.company_name  || "",
          tagline:       settings.tagline        || "",
          address_line1: settings.address_line1  || "",
          address_line2: settings.address_line2  || "",
          parish:        settings.parish         || "",
          country:       settings.country        || "",
          phone:         settings.phone          || "",
          email:         settings.email          || "",
          website:       settings.website        || "",
        });
      }
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!companyId) return;
    setSaving(true); setMsg(null);
    try {
      const { error } = await supabase.from("company_settings").upsert({
        company_id:    companyId,
        company_name:  form.company_name.trim()  || null,
        tagline:       form.tagline.trim()        || null,
        address_line1: form.address_line1.trim()  || null,
        address_line2: form.address_line2.trim()  || null,
        parish:        form.parish.trim()          || null,
        country:       form.country.trim()         || null,
        phone:         form.phone.trim()           || null,
        email:         form.email.trim()           || null,
        website:       form.website.trim()         || null,
                logo_url:          logoUrl || null,
                signature_url:     signatureUrl || null,
                watermark_url:     watermarkUrl || null,
        watermark_enabled: watermarkEnabled,
        payment_notifications_enabled: paymentNotificationsEnabled,
        watermark_opacity: watermarkOpacity,
        watermark_size: watermarkSize,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "company_id" });
      if (error) throw error;
      setMsg({ type: "success", text: "Company settings saved successfully." });
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  }

  // Uploads the drawn signature PNG to storage and stores its public URL —
  // same upload-then-getPublicUrl pattern as the logo above and as
  // ContractsPage's signContract(), reusing the "project-files" bucket.
  // Persisted immediately (not deferred to the main "Save Changes" button)
  // so a director doesn't lose a freshly-drawn signature if they navigate
  // away before hitting Save elsewhere on the page.
  // Shared by both input methods below — drawing (SignaturePad, always a
  // PNG data URL) and uploading a real signature photo/scan (any image
  // type the user picks). Persisted immediately (not deferred to the main
  // "Save Changes" button) so it isn't lost by navigating away before
  // hitting Save elsewhere on the page.
  async function persistSignatureBlob(blob: Blob, contentType: string, ext: string) {
    if (!companyId) return;
    setSavingSignature(true); setMsg(null);
    try {
      const path = `signatures/${companyId}/${Date.now()}_signature.${ext}`;
      const { error: ue } = await supabase.storage.from("project-files").upload(path, blob, { upsert: true, contentType });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from("project-files").getPublicUrl(path);
      setSignatureUrl(ud.publicUrl);
      const { error } = await supabase.from("company_settings")
        .update({ signature_url: ud.publicUrl, updated_at: new Date().toISOString() })
        .eq("company_id", companyId);
      if (error) throw error;
      setShowSignaturePad(false);
      setMsg({ type: "success", text: "Signature saved." });
    } catch (e: any) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSavingSignature(false);
    }
  }

  async function saveSignature(dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob();
    await persistSignatureBlob(blob, "image/png", "png");
  }

  // Selecting a file no longer uploads it directly — it opens the crop
  // modal first (see signatureCropSrc/handleSignatureCropDone below), same
  // pattern as the staff photo upload.
  function handleSignatureFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  // Crop modal's canvas output has no filename, so this always writes as
  // .png — same as the drawn-signature path, which was already PNG-only.
  async function handleSignatureCropDone(blob: Blob) {
    if (signatureCropSrc) URL.revokeObjectURL(signatureCropSrc);
    setSignatureCropSrc(null);
    await persistSignatureBlob(blob, "image/png", "png");
  }

  function handleSignatureCropCancel() {
    if (signatureCropSrc) URL.revokeObjectURL(signatureCropSrc);
    setSignatureCropSrc(null);
  }

  async function removeSignature() {
    if (!companyId) return;
    setSignatureUrl(null);
    await supabase.from("company_settings")
      .update({ signature_url: null, updated_at: new Date().toISOString() })
      .eq("company_id", companyId);
  }

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10] flex items-center justify-center">
      <div className="flex items-center gap-2.5 text-xs text-slate-600">
        <Spinner size={16}/> Loading company settings...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader
        title="Company Settings"
        subtitle="Your company profile and contact information"
        back={() => nav("/settings")}
        actions={
          <Btn variant="primary" size="sm" icon={<Save size={13}/>}
            onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Btn>
        }
      />

      <div className="p-6 max-w-2xl space-y-5">
        {msg && (
          <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>
        )}

        {/* Logo upload */}
        <Card>
          <CardHeader title="Company Logo"/>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain"/>
              ) : (
                <Building2 size={24} className="text-slate-700"/>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-400 mb-1">
                {logoUrl ? "Logo loaded" : "No logo uploaded"}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition">
                  <Upload size={13} className="text-slate-600"/>
                  <span className="text-[11px] text-slate-500">{uploadingLogo ? "Uploading..." : "Click to upload PNG or SVG"}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f || !companyId) return;
                    setUploadingLogo(true);
                    try {
                      const path = `logos/${companyId}/${Date.now()}_logo.${f.name.split(".").pop()}`;
                      const { error: ue } = await supabase.storage.from("project-files").upload(path, f, { upsert: true });
                      if (!ue) {
                        const { data: ud } = supabase.storage.from("project-files").getPublicUrl(path);
                        setLogoUrl(ud.publicUrl);
                      } else {
                        setMsg({ type: "error", text: ue.message });
                      }
                    } finally {
                      setUploadingLogo(false);
                    }
                  }}/>
                </label>
                {logoUrl && (
                  <button onClick={() => setLogoUrl(null)} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
              <div className="text-[10px] text-slate-700 mt-1.5">
                This logo appears on your dashboard, reports, and client-facing documents.
              </div>
            </div>
          </div>
        </Card>

        {/* Authorized signature — drawn once here, reused on ID card backs */}
        <Card>
          <CardHeader title="Authorized Signature"/>
          <div className="flex items-center gap-4">
            <div className="w-32 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
              {signatureUrl ? (
                <img src={signatureUrl} alt="Signature" className="w-full h-full object-contain"/>
              ) : (
                <PenTool size={20} className="text-slate-400"/>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-400 mb-1">
                {signatureUrl ? "Signature saved" : "No signature saved"}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowSignaturePad(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500"
                >
                  <PenTool size={13} className="text-slate-600"/>
                  {signatureUrl ? "Redraw signature" : "Draw signature"}
                </button>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500">
                  <Upload size={13} className="text-slate-600"/>
                  {savingSignature ? "Uploading..." : "Upload photo/scan"}
                  <input type="file" accept="image/*" className="hidden" disabled={savingSignature}
                    onChange={handleSignatureFileSelect}/>
                </label>
                {signatureUrl && (
                  <button onClick={removeSignature} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>
                )}
              </div>
              <div className="text-[10px] text-slate-700 mt-1.5">
                Appears as the "Authorized Signature" on Worker and Staff ID card backs, in place of a blank hand-sign line.
              </div>
            </div>
          </div>
        </Card>

        {/* Basic info */}
        <Card>
          <CardHeader title="Company Information"/>
          <div className="space-y-4">
            <Field label="Company Name">
              <Input
                placeholder="e.g. Magnus Construction Ltd"
                value={form.company_name}
                onChange={set("company_name")}
              />
            </Field>
            <Field label="Tagline (optional)">
              <Input
                placeholder="e.g. Building Jamaica's Future"
                value={form.tagline}
                onChange={set("tagline")}
              />
            </Field>
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader title="Contact Details" subtitle="How clients and partners can reach you"/>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone">
                <div className="relative">
                  <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
                  <Input className="pl-8" placeholder="876-555-0100" value={form.phone} onChange={set("phone")}/>
                </div>
              </Field>
              <Field label="Email">
                <div className="relative">
                  <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
                  <Input className="pl-8" type="email" placeholder="info@company.com" value={form.email} onChange={set("email")}/>
                </div>
              </Field>
            </div>
            <Field label="Website">
              <div className="relative">
                <Globe size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
                <Input className="pl-8" placeholder="https://www.company.com" value={form.website} onChange={set("website")}/>
              </div>
            </Field>
          </div>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader title="Address" subtitle="Your registered business address"/>
          <div className="space-y-4">
            <Field label="Address Line 1">
              <div className="relative">
                <MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700"/>
                <Input className="pl-8" placeholder="12 Main Street" value={form.address_line1} onChange={set("address_line1")}/>
              </div>
            </Field>
            <Field label="Address Line 2 (optional)">
              <Input placeholder="Suite 4, Kingston Mall" value={form.address_line2} onChange={set("address_line2")}/>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Parish / State">
                <Input placeholder="Kingston" value={form.parish} onChange={set("parish")}/>
              </Field>
              <Field label="Country">
                <Input placeholder="Jamaica" value={form.country} onChange={set("country")}/>
              </Field>
            </div>
          </div>
        </Card>

        {/* Watermark Settings */}
        <Card>
          <CardHeader title="Document Watermark" subtitle="Applied to ID cards, receipts and printed documents"/>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-300">Enable Watermark</div>
                <div className="text-[10px] text-slate-600">Show watermark on all printed documents</div>
              </div>
              <button onClick={()=>setWatermarkEnabled(!watermarkEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative ${watermarkEnabled?"bg-cyan-600":"bg-slate-300 dark:bg-white/[0.08]"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${watermarkEnabled?"left-5":"left-0.5"}`}/>
              </button>
            </div>
            {watermarkUrl&&(
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02]">
                <img src={watermarkUrl} className="w-16 h-16 object-contain rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04]"/>
                <div className="flex-1">
                  <div className="text-xs text-slate-300 font-semibold mb-1">Watermark Image</div>
                  <div className="text-[10px] text-slate-600">Current watermark uploaded</div>
                  <button onClick={()=>setWatermarkUrl(null)} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remove</button>
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-2">Upload Watermark Image</div>
              <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition">
                <Upload size={14} className="text-slate-600"/>
                <span className="text-xs text-slate-500">{uploadingWatermark?"Uploading...":"Click to upload PNG or SVG"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={async(e)=>{
                  const f=e.target.files?.[0]; if(!f||!companyId) return;
                  setUploadingWatermark(true);
                  const path=`watermarks/${companyId}/${Date.now()}_watermark.png`;
                  const {error:ue}=await supabase.storage.from("project-files").upload(path,f,{upsert:true});
                  if(!ue){const{data:ud}=supabase.storage.from("project-files").getPublicUrl(path);setWatermarkUrl(ud.publicUrl);}
                  setUploadingWatermark(false);
                }}/>
              </label>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Opacity</span>
                <span>{Math.round(watermarkOpacity*100)}%</span>
              </div>
              <input type="range" min="5" max="50" value={Math.round(watermarkOpacity*100)}
                onChange={e=>setWatermarkOpacity(Number(e.target.value)/100)}
                className="w-full accent-cyan-500"/>
              <div className="flex justify-between text-[10px] text-slate-700 mt-1">
                <span>Light</span><span>Heavy</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Size</span><span>{watermarkSize}mm</span>
              </div>
              <input type="range" min="10" max="60" value={watermarkSize} onChange={e=>setWatermarkSize(Number(e.target.value))} className="w-full accent-cyan-500"/>
              <div className="flex justify-between text-[10px] text-slate-700 mt-1">
                <span>Small</span><span>Large</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Payment Notifications */}
        <Card>
          <CardHeader title="Client Payment Notifications" subtitle="Send a thank-you message when a client payment is recorded"/>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-300">Enable Payment Notifications</div>
              <div className="text-[10px] text-slate-600">Show a thank-you popup with WhatsApp/Email send buttons after recording a payment</div>
            </div>
            <button onClick={()=>setPaymentNotificationsEnabled(!paymentNotificationsEnabled)}
              className={`w-10 h-5 rounded-full transition-colors relative ${paymentNotificationsEnabled?"bg-cyan-600":"bg-slate-300 dark:bg-white/[0.08]"}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${paymentNotificationsEnabled?"left-5":"left-0.5"}`}/>
            </button>
          </div>
        </Card>

        {/* Save button at bottom */}
        <div className="flex justify-end pb-6">
          <Btn variant="primary" size="md" icon={<Save size={14}/>}
            onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save All Changes"}
          </Btn>
        </div>
      </div>

      {showSignaturePad && (
        <SignaturePad
          title="Authorized Signature"
          subtitle="Draw the signature that will appear on ID card backs."
          onSave={saveSignature}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}

      {signatureCropSrc && (
        <PhotoCropModal
          imageSrc={signatureCropSrc}
          aspect={4 / 1} // wide strip, not the 65:80 headshot default — matches a signature's proportions
          title="Crop Signature"
          onCancel={handleSignatureCropCancel}
          onCropDone={handleSignatureCropDone}
        />
      )}
    </div>
  );
}
