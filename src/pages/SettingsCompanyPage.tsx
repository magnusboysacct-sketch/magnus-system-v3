// src/pages/SettingsCompanyPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  PageHeader, Card, CardHeader, Btn, Input, Field,
  Alert, Divider, Spinner, cn
} from "../components/ui";
import { Building2, Save, RefreshCw, Globe, Phone, Mail, MapPin, ImageIcon, Upload, Eye, EyeOff } from "lucide-react";

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
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.15);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);

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
        setWatermarkUrl((settings as any).watermark_url || null);
        setWatermarkEnabled((settings as any).watermark_enabled || false);
        setWatermarkOpacity((settings as any).watermark_opacity || 0.15);
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

        {/* Logo preview */}
        <Card>
          <CardHeader title="Company Logo"/>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-white/[0.08] bg-white/[0.04] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain"/>
              ) : (
                <Building2 size={24} className="text-slate-700"/>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">
                {logoUrl ? "Logo loaded" : "No logo uploaded"}
              </div>
              <div className="text-[10px] text-slate-700">
                Logo upload available in the full company settings panel.
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
                className={`w-10 h-5 rounded-full transition-colors relative ${watermarkEnabled?"bg-cyan-600":"bg-white/[0.08]"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${watermarkEnabled?"left-5":"left-0.5"}`}/>
              </button>
            </div>
            {watermarkUrl&&(
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.07] bg-white/[0.02]">
                <img src={watermarkUrl} className="w-16 h-16 object-contain rounded-lg border border-white/[0.08] bg-white/[0.04]"/>
                <div className="flex-1">
                  <div className="text-xs text-slate-300 font-semibold mb-1">Watermark Image</div>
                  <div className="text-[10px] text-slate-600">Current watermark uploaded</div>
                  <button onClick={()=>setWatermarkUrl(null)} className="text-[10px] text-red-400 hover:text-red-300 mt-1">Remove</button>
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-2">Upload Watermark Image</div>
              <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/[0.1] hover:border-cyan-500/40 cursor-pointer transition">
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
    </div>
  );
}
