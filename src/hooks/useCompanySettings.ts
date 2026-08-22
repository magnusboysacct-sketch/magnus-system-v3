// src/hooks/useCompanySettings.ts
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface CompanySettings {
  company_id: string;
  company_name: string;
  tagline: string | null;
  logo_url: string | null;
  signature_url: string | null;
  // Real columns (20260627050200_ensure_company_settings_table.sql) that
  // this interface was missing entirely — watermark_opacity is 0-1
  // (default 0.15), watermark_size is millimeters (default 25), sized for
  // a small corner mark (see printUtils.ts's .wm CSS / ContractsPage.tsx's
  // existing watermark usage), not a percentage.
  watermark_url: string | null;
  watermark_enabled: boolean | null;
  watermark_opacity: number | null;
  watermark_size: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  // city/state were never real columns on this table — confirmed against
  // the same tracked migration above, which has parish + country (default
  // 'Jamaica'), not city/state. Replaced rather than kept alongside, since
  // nothing in the codebase referenced the old (wrong) names.
  parish: string | null;
  country: string | null;
}

let cachedSettings: CompanySettings | null = null;

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings | null>(cachedSettings);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    if (cachedSettings) { setSettings(cachedSettings); return; }
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (!profile?.company_id) return;
      const { data } = await supabase
        .from("company_settings").select("*").eq("company_id", profile.company_id).maybeSingle();
      if (data) { cachedSettings = data; setSettings(data); }
      setLoading(false);
    }
    load();
  }, []);

  return { settings, loading };
}