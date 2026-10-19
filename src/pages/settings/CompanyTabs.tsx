// src/pages/settings/CompanyTabs.tsx — the tabs that show parts of the company settings form (CompanySettingsContext): Company, Documents, Notifications & Portal.
// The sections are the ones from the old single Company page, unchanged; each tab has the same "Save changes" (it saves the whole company form, as before).
import React from "react";
import { PageHeader, Card, CardHeader, Btn, Input, Field, Alert, Spinner } from "../../components/ui";
import { Building2, Save, Globe, Phone, Mail, MapPin, Upload, PenTool } from "lucide-react";
import SignaturePad from "../../components/SignaturePad";
import PhotoCropModal from "../../components/PhotoCropModal";
import LogoUploadPanel from "../../components/LogoUploadPanel";
import { LOGO_SMALL_WARNING, LOGO_MARGIN_HINT, describeLogo, logoIsSmall, marginsAreWasteful } from "../../lib/logoImage";
import { supabase } from "../../lib/supabase";
import { useCompanySettingsForm } from "./companySettingsState";
import { normalizeWorkerPrefix, previewWorkerNumber, validateWorkerPrefix } from "../../lib/workerNumber";

function TabFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const c = useCompanySettingsForm();
  if (c.loading) {
    return <div className="flex items-center justify-center py-16"><div className="flex items-center gap-2.5 text-xs text-slate-600"><Spinner size={16} /> Loading company settings...</div></div>;
  }
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle}
        actions={<Btn variant="primary" size="sm" icon={<Save size={13} />} onClick={c.saveSettings} disabled={c.saving}>{c.saving ? "Saving..." : "Save Changes"}</Btn>} />
      <div className="p-4 sm:p-6 max-w-2xl space-y-5">
        {c.msg && <Alert type={c.msg.type} onClose={() => c.setMsg(null)}>{c.msg.text}</Alert>}
        {c.dirty && <div className="text-[11px] text-amber-500">You have unsaved changes.</div>}
        {children}
        <div className="flex justify-end pb-6">
          <Btn variant="primary" size="md" icon={<Save size={14} />} onClick={c.saveSettings} disabled={c.saving}>{c.saving ? "Saving..." : "Save All Changes"}</Btn>
        </div>
      </div>
    </div>
  );
}

function LogoSection() {
  const c = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Company Logo" />
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {c.logoUrl ? <img src={c.logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <Building2 size={24} className="text-slate-700" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-400 mb-1">{c.logoUrl ? "Logo loaded" : "No logo uploaded"}</div>
          <LogoUploadPanel companyId={c.companyId} hasLogo={!!c.logoUrl}
            onUploaded={(url, info) => { c.setLogoInfo(info); c.setLogoUrl(url); }}
            onRemove={() => c.setLogoUrl(null)}
            onError={(text) => c.setMsg({ type: "error", text })} />
          <div className="text-[10px] text-slate-700 mt-1.5">This logo appears on your dashboard, reports, and client-facing documents.</div>
          {c.logoUrl && c.logoInfo && (
            <div className="mt-2 text-[11px] space-y-1" data-testid="logo-quality">
              <div className="text-slate-500 dark:text-slate-400">Logo: {describeLogo(c.logoInfo)}</div>
              {logoIsSmall(c.logoInfo) && <div className="text-amber-600 dark:text-amber-400">{LOGO_SMALL_WARNING}</div>}
              {marginsAreWasteful(c.logoInfo.margins) && <div className="text-amber-600 dark:text-amber-400">This logo {LOGO_MARGIN_HINT}</div>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function CompanyInfoSection() {
  const { form, set } = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Company Information" />
      <div className="space-y-4">
        <Field label="Company Name"><Input placeholder="e.g. Magnus Construction Ltd" value={form.company_name} onChange={set("company_name")} /></Field>
        <Field label="Tagline (optional)"><Input placeholder="e.g. Building Jamaica's Future" value={form.tagline} onChange={set("tagline")} /></Field>
      </div>
    </Card>
  );
}

function WorkerNumberSection() {
  const { form, set } = useCompanySettingsForm();
  const problem = validateWorkerPrefix(form.worker_number_prefix);
  return (
    <Card>
      <CardHeader title="Worker Numbers" subtitle="Every worker gets a number like the example below when they are added" />
      <div className="space-y-3">
        <Field label="Prefix (2 to 5 letters)">
          <Input placeholder="MBW" maxLength={5} value={form.worker_number_prefix} onChange={(e) => set("worker_number_prefix")({ target: { value: normalizeWorkerPrefix(e.target.value) } } as never)} />
        </Field>
        <div className="text-xs text-slate-500 dark:text-slate-400" data-testid="worker-number-preview">
          Preview: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{previewWorkerNumber(form.worker_number_prefix)}</span>, then {previewWorkerNumber(form.worker_number_prefix).replace("001", "002")}, and so on.
        </div>
        {problem && <div className="text-[11px] text-amber-600 dark:text-amber-400">{problem}</div>}
        <div className="text-[10px] text-slate-500">Changing the prefix only affects workers added from now on. Numbers already given keep their prefix and are never reused.</div>
      </div>
    </Card>
  );
}

function ContactSection() {
  const { form, set } = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Contact Details" subtitle="How clients and partners can reach you" />
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone">
            <div className="relative"><Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" /><Input className="pl-8" placeholder="876-555-0100" value={form.phone} onChange={set("phone")} /></div>
          </Field>
          <Field label="Email">
            <div className="relative"><Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" /><Input className="pl-8" type="email" placeholder="info@company.com" value={form.email} onChange={set("email")} /></div>
          </Field>
        </div>
        <Field label="Website">
          <div className="relative"><Globe size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" /><Input className="pl-8" placeholder="https://www.company.com" value={form.website} onChange={set("website")} /></div>
        </Field>
      </div>
    </Card>
  );
}

function AddressSection() {
  const { form, set } = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Address" subtitle="Your registered business address" />
      <div className="space-y-4">
        <Field label="Address Line 1">
          <div className="relative"><MapPin size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" /><Input className="pl-8" placeholder="12 Main Street" value={form.address_line1} onChange={set("address_line1")} /></div>
        </Field>
        <Field label="Address Line 2 (optional)"><Input placeholder="Suite 4, Kingston Mall" value={form.address_line2} onChange={set("address_line2")} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Parish / State"><Input placeholder="Kingston" value={form.parish} onChange={set("parish")} /></Field>
          <Field label="Country"><Input placeholder="Jamaica" value={form.country} onChange={set("country")} /></Field>
        </div>
      </div>
    </Card>
  );
}

function SignatureSection() {
  const c = useCompanySettingsForm();
  return (
    <>
      <Card>
        <CardHeader title="Authorized Signature" />
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-32 h-16 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
            {c.signatureUrl ? <img src={c.signatureUrl} alt="Signature" className="w-full h-full object-contain" /> : <PenTool size={20} className="text-slate-400" />}
          </div>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-xs text-slate-400 mb-1">{c.signatureUrl ? "Signature saved" : "No signature saved"}</div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => c.setShowSignaturePad(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500">
                <PenTool size={13} className="text-slate-600" />{c.signatureUrl ? "Redraw signature" : "Draw signature"}
              </button>
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition text-[11px] text-slate-500">
                <Upload size={13} className="text-slate-600" />{c.savingSignature ? "Uploading..." : "Upload photo/scan"}
                <input type="file" accept="image/*" className="hidden" disabled={c.savingSignature} onChange={c.handleSignatureFileSelect} />
              </label>
              {c.signatureUrl && <button onClick={c.removeSignature} className="text-[11px] text-red-400 hover:text-red-300">Remove</button>}
            </div>
            <div className="text-[10px] text-slate-700 mt-1.5">Appears as the "Authorized Signature" on Worker and Staff ID card backs, in place of a blank hand-sign line.</div>
          </div>
        </div>
      </Card>
      {c.showSignaturePad && (
        <SignaturePad title="Authorized Signature" subtitle="Draw the signature that will appear on ID card backs." onSave={c.saveSignature} onCancel={() => c.setShowSignaturePad(false)} />
      )}
      {c.signatureCropSrc && (
        <PhotoCropModal imageSrc={c.signatureCropSrc} aspect={4 / 1} title="Crop Signature" onCancel={c.handleSignatureCropCancel} onCropDone={c.handleSignatureCropDone} />
      )}
    </>
  );
}

function WatermarkSection() {
  const c = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Document Watermark" subtitle="Applied to ID cards, receipts and printed documents" />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-300">Enable Watermark</div>
            <div className="text-[10px] text-slate-600">Show watermark on all printed documents</div>
          </div>
          <button onClick={() => c.setWatermarkEnabled(!c.watermarkEnabled)} aria-pressed={c.watermarkEnabled}
            className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${c.watermarkEnabled ? "bg-cyan-600" : "bg-slate-300 dark:bg-white/[0.08]"}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${c.watermarkEnabled ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
        {c.watermarkUrl && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02]">
            <img src={c.watermarkUrl} className="w-16 h-16 object-contain rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.04]" />
            <div className="flex-1">
              <div className="text-xs text-slate-300 font-semibold mb-1">Watermark Image</div>
              <div className="text-[10px] text-slate-600">Current watermark uploaded</div>
              <button onClick={() => c.setWatermarkUrl(null)} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remove</button>
            </div>
          </div>
        )}
        <div>
          <div className="text-xs text-slate-500 mb-2">Upload Watermark Image</div>
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition">
            <Upload size={14} className="text-slate-600" />
            <span className="text-xs text-slate-500">{c.uploadingWatermark ? "Uploading..." : "Click to upload PNG or SVG"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f || !c.companyId) return;
              c.setUploadingWatermark(true);
              const path = `${c.companyId}/watermark/${Date.now()}_watermark.png`; // public bucket, company id first
              const { error: ue } = await supabase.storage.from("company-assets").upload(path, f, { upsert: true });
              if (!ue) { const { data: ud } = supabase.storage.from("company-assets").getPublicUrl(path); c.setWatermarkUrl(ud.publicUrl); }
              c.setUploadingWatermark(false);
            }} />
          </label>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Opacity</span><span>{Math.round(c.watermarkOpacity * 100)}%</span></div>
          <input type="range" min="5" max="50" value={Math.round(c.watermarkOpacity * 100)} onChange={(e) => c.setWatermarkOpacity(Number(e.target.value) / 100)} className="w-full accent-cyan-500" />
          <div className="flex justify-between text-[10px] text-slate-700 mt-1"><span>Light</span><span>Heavy</span></div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Size</span><span>{c.watermarkSize}mm</span></div>
          <input type="range" min="10" max="60" value={c.watermarkSize} onChange={(e) => c.setWatermarkSize(Number(e.target.value))} className="w-full accent-cyan-500" />
          <div className="flex justify-between text-[10px] text-slate-700 mt-1"><span>Small</span><span>Large</span></div>
        </div>
      </div>
    </Card>
  );
}

function NotificationsSection() {
  const c = useCompanySettingsForm();
  return (
    <Card>
      <CardHeader title="Client Payment Notifications" subtitle="Send a thank-you message when a client payment is recorded" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-300">Enable Payment Notifications</div>
          <div className="text-[10px] text-slate-600">Show a thank-you popup with WhatsApp/Email send buttons after recording a payment</div>
        </div>
        <button onClick={() => c.setPaymentNotificationsEnabled(!c.paymentNotificationsEnabled)} aria-pressed={c.paymentNotificationsEnabled}
          className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${c.paymentNotificationsEnabled ? "bg-cyan-600" : "bg-slate-300 dark:bg-white/[0.08]"}`}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${c.paymentNotificationsEnabled ? "left-5" : "left-0.5"}`} />
        </button>
      </div>
    </Card>
  );
}

export function CompanyTab() {
  return (
    <TabFrame title="Company" subtitle="Your company profile, contact details and logo">
      <LogoSection />
      <CompanyInfoSection />
      <WorkerNumberSection />
      <ContactSection />
      <AddressSection />
    </TabFrame>
  );
}

export function DocumentsTab() {
  return (
    <TabFrame title="Documents" subtitle="Signature and watermark used on ID cards, receipts and printed documents">
      <SignatureSection />
      <WatermarkSection />
    </TabFrame>
  );
}

export function NotificationsTab() {
  return (
    <TabFrame title="Notifications & Portal" subtitle="Messages sent to clients">
      <NotificationsSection />
    </TabFrame>
  );
}
