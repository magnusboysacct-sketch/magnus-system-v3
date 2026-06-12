// src/hooks/useCompanySettings.ts
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface CompanySettings {
  company_id: string;
  company_name: string;
  tagline: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
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