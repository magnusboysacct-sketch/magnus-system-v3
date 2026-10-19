// src/pages/settings/companySettingsState.ts
// The company settings form (company details, logo, signature, watermark, payment notifications), shared by the Settings tabs that show parts of it
// (Company, Documents, Notifications & Portal, and the logo / name the Branding tab previews). One load, one state, ONE save: "Save changes" on any of those tabs
// saves exactly the same thing it saved on the old single Company page. The signature is stored the moment it is drawn or uploaded (as before).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { loadLogoImage, type LogoInfo } from "../../lib/logoImage";
import { normalizeWorkerPrefix, validateWorkerPrefix } from "../../lib/workerNumber";

type CompanySettings = {
  id: number; company_id: string; company_name: string; logo_url: string | null; tagline: string | null; address_line1: string | null; address_line2: string | null;
  parish: string | null; country: string | null; phone: string | null; email: string | null; website: string | null;
};
type Message = { type: "success" | "error"; text: string } | null;
const EMPTY_FORM = { company_name: "", tagline: "", address_line1: "", address_line2: "", parish: "", country: "", phone: "", email: "", website: "", worker_number_prefix: "" };

export function useCompanySettingsState(resetToken: number) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Message>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  // A signature file goes through the crop modal before it is stored (same as the staff photo upload); holds the picked file's object URL.
  const [signatureCropSrc, setSignatureCropSrc] = useState<string | null>(null);
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [paymentNotificationsEnabled, setPaymentNotificationsEnabled] = useState(true);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);
  const [logoInfo, setLogoInfo] = useState<LogoInfo | null>(null);        // what the stored logo is (pixel size, type, file size) and any quality warning
  const [watermarkSize, setWatermarkSize] = useState(25);
  const [baseline, setBaseline] = useState<string | null>(null);          // the saved values, to tell whether there is anything unsaved

  const snapshot = useCallback(() => JSON.stringify({ form, logoUrl, watermarkUrl, watermarkEnabled, paymentNotificationsEnabled, watermarkOpacity, watermarkSize }),
    [form, logoUrl, watermarkUrl, watermarkEnabled, paymentNotificationsEnabled, watermarkOpacity, watermarkSize]);
  const current = useMemo(() => snapshot(), [snapshot]);
  const dirty = baseline !== null && current !== baseline;

  // a new resetToken means the person chose to discard unsaved changes: load what is saved again
  useEffect(() => { void loadSettings(); }, [resetToken]);
  useEffect(() => {
    let alive = true;
    if (!logoUrl) { setLogoInfo(null); return; }
    setLogoInfo((cur) => (cur && cur.bytes ? cur : null));           // keep the upload's own details (with the file size) until the URL changes
    loadLogoImage(logoUrl).then((l) => { if (alive) setLogoInfo((cur) => ({ ...l.info, type: cur?.type || l.info.type, bytes: cur?.bytes, sourceWidth: cur?.sourceWidth, trimmedFrom: cur?.trimmedFrom })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [logoUrl]);

  // The first render after a load / save records what is "saved"
  const [pendingBaseline, setPendingBaseline] = useState(false);
  useEffect(() => { if (pendingBaseline) { setBaseline(current); setPendingBaseline(false); } }, [pendingBaseline, current]);

  async function loadSettings() {
    setLoading(true); setMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) throw new Error("No company associated with your account");
      setCompanyId(profile.company_id);

      // Try RPC first, fallback to direct query
      let settings: CompanySettings | null = null;
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_or_create_company_settings", { p_company_id: profile.company_id });
      if (!rpcError && rpcData && rpcData.length > 0) {
        settings = rpcData[0] as CompanySettings;
      } else {
        const { data: direct } = await supabase.from("company_settings").select("*").eq("company_id", profile.company_id).maybeSingle();
        settings = direct;
      }

      if (settings) {
        const s = settings as CompanySettings & Record<string, unknown>;
        setLogoUrl(settings.logo_url || null);
        setSignatureUrl((s.signature_url as string) || null);
        setWatermarkUrl((s.watermark_url as string) || null);
        setWatermarkEnabled((s.watermark_enabled as boolean) || false);
        setPaymentNotificationsEnabled(s.payment_notifications_enabled !== false);
        setWatermarkOpacity((s.watermark_opacity as number) || 0.15);
        setWatermarkSize((s.watermark_size as number) || 25);
        setForm({
          company_name: settings.company_name || "", tagline: settings.tagline || "", address_line1: settings.address_line1 || "", address_line2: settings.address_line2 || "",
          parish: settings.parish || "", country: settings.country || "", phone: settings.phone || "", email: settings.email || "", website: settings.website || "",
          worker_number_prefix: normalizeWorkerPrefix(s.worker_number_prefix as string),
        });
      }
      setPendingBaseline(true);
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!companyId) return;
    const prefixProblem = validateWorkerPrefix(form.worker_number_prefix);
    if (prefixProblem) { setMsg({ type: "error", text: prefixProblem }); return; }
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
        worker_number_prefix: form.worker_number_prefix,
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
      setBaseline(current);
      setMsg({ type: "success", text: "Company settings saved successfully." });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : (e as { message?: string })?.message || String(e) });
    } finally {
      setSaving(false);
    }
  }

  // Stores the drawn / uploaded signature at once (not waiting for "Save changes"), so a freshly drawn signature is never lost by moving to another tab.
  async function persistSignatureBlob(blob: Blob, contentType: string, ext: string) {
    if (!companyId) return;
    setSavingSignature(true); setMsg(null);
    try {
      // Public bucket on purpose (the signature is embedded in ID cards and documents), company id FIRST so the bucket's company-scoped write policy applies.
      const path = `${companyId}/signature/${Date.now()}_signature.${ext}`;
      const { error: ue } = await supabase.storage.from("company-assets").upload(path, blob, { upsert: true, contentType });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from("company-assets").getPublicUrl(path);
      setSignatureUrl(ud.publicUrl);
      const { error } = await supabase.from("company_settings").update({ signature_url: ud.publicUrl, updated_at: new Date().toISOString() }).eq("company_id", companyId);
      if (error) throw error;
      setShowSignaturePad(false);
      setMsg({ type: "success", text: "Signature saved." });
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : (e as { message?: string })?.message || String(e) });
    } finally {
      setSavingSignature(false);
    }
  }
  async function saveSignature(dataUrl: string) {
    const blob = await (await fetch(dataUrl)).blob();
    await persistSignatureBlob(blob, "image/png", "png");
  }
  function handleSignatureFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }
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
    await supabase.from("company_settings").update({ signature_url: null, updated_at: new Date().toISOString() }).eq("company_id", companyId);
  }
  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return {
    loading, saving, dirty, companyId, msg, setMsg, form, set,
    logoUrl, setLogoUrl, logoInfo, setLogoInfo,
    signatureUrl, showSignaturePad, setShowSignaturePad, savingSignature, signatureCropSrc, saveSignature, handleSignatureFileSelect, handleSignatureCropDone, handleSignatureCropCancel, removeSignature,
    watermarkUrl, setWatermarkUrl, watermarkEnabled, setWatermarkEnabled, watermarkOpacity, setWatermarkOpacity, watermarkSize, setWatermarkSize, uploadingWatermark, setUploadingWatermark,
    paymentNotificationsEnabled, setPaymentNotificationsEnabled,
    saveSettings,
  };
}

export type CompanySettingsForm = ReturnType<typeof useCompanySettingsState>;
export const CompanySettingsCtx = createContext<CompanySettingsForm | null>(null);

export function useCompanySettingsForm(): CompanySettingsForm {
  const v = useContext(CompanySettingsCtx);
  if (!v) throw new Error("useCompanySettingsForm must be used inside CompanySettingsProvider");
  return v;
}
