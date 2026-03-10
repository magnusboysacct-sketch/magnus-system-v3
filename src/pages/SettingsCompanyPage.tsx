import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // New fields
  const [tagline, setTagline] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [parish, setParish] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setMsg(null);

      try {
        // Get the current user's company_id
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          if (alive) setMsg("Not authenticated");
          return;
        }

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("company_id")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (!alive) return;

        if (!profile?.company_id) {
          setMsg("No company associated with your account");
          setLoading(false);
          return;
        }

        setCompanyId(profile.company_id);

        // Get or create company settings using the helper function
        const { data: settingsData, error: settingsError } = await supabase
          .rpc("get_or_create_company_settings", { p_company_id: profile.company_id });

        if (!alive) return;

        if (settingsError) {
          console.error(settingsError);
          setMsg(settingsError.message);
        } else if (settingsData && settingsData.length > 0) {
          const settings = settingsData[0] as CompanySettings;
          setCompanyName(settings.company_name || "");
          setLogoUrl(settings.logo_url || null);
          setTagline(settings.tagline || "");
          setAddressLine1(settings.address_line1 || "");
          setAddressLine2(settings.address_line2 || "");
          setParish(settings.parish || "");
          setCountry(settings.country || "");
          setPhone(settings.phone || "");
          setEmail(settings.email || "");
          setWebsite(settings.website || "");
        }
      } catch (err) {
        console.error(err);
        if (alive) setMsg("Error loading settings");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  async function saveAll() {
    if (!companyId) {
      setMsg("No company ID available");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("company_settings")
        .upsert({
          company_id: companyId,
          company_name: companyName.trim() || null,
          tagline: tagline.trim() || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
          parish: parish.trim() || null,
          country: country.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          website: website.trim() || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "company_id"
        });

      if (error) {
        console.error(error);
        setMsg(error.message);
      } else {
        setMsg("Saved successfully.");
      }
    } catch (err) {
      console.error(err);
      setMsg("Error saving settings");
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!companyId) {
      setMsg("No company ID available");
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const timestamp = Date.now();
      const path = `${companyId}/logo-${timestamp}.${ext}`;

      // Upload to company-logos bucket
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true });

      if (upErr) {
        console.error(upErr);
        setMsg(upErr.message);
        return;
      }

      // Get public URL
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      // Update database
      const { error: dbErr } = await supabase
        .from("company_settings")
        .upsert({
          company_id: companyId,
          logo_url: publicUrl,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "company_id"
        });

      if (dbErr) {
        console.error(dbErr);
        setMsg(dbErr.message);
        return;
      }

      setLogoUrl(publicUrl);
      setMsg("Logo uploaded successfully.");
    } catch (err) {
      console.error(err);
      setMsg("Error uploading logo");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-sm opacity-70">Loading company settings...</div>;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold">Company Settings</h1>
          <div className="text-sm opacity-70">Branding and contact information used throughout the system.</div>
        </div>
      </div>

      <div className="border border-white/10 rounded-xl bg-white/5 p-5 max-w-4xl">
        {/* Logo Upload Section */}
        <div className="flex items-center gap-4 mb-6">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Company logo"
              className="w-16 h-16 rounded-xl object-cover border border-white/10 bg-white/10"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl border border-white/10 bg-white/10 flex items-center justify-center text-xs opacity-70">
              LOGO
            </div>
          )}

          <div>
            <div className="text-xs opacity-70 mb-1">Upload Logo</div>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                uploadLogo(f);
                e.currentTarget.value = "";
              }}
              className="text-sm"
            />
            <div className="text-xs opacity-60 mt-1">Recommended: square PNG, ~512×512.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Company Name */}
          <div>
            <div className="text-xs opacity-70 mb-1">Company Name</div>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. Magnus Boys Construction"
            />
          </div>

          {/* Tagline */}
          <div>
            <div className="text-xs opacity-70 mb-1">Tagline</div>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. Building Excellence Since 1990"
            />
          </div>

          {/* Address Line 1 */}
          <div>
            <div className="text-xs opacity-70 mb-1">Address Line 1</div>
            <input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="123 Main Street"
            />
          </div>

          {/* Address Line 2 */}
          <div>
            <div className="text-xs opacity-70 mb-1">Address Line 2</div>
            <input
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="Suite 456"
            />
          </div>

          {/* Parish */}
          <div>
            <div className="text-xs opacity-70 mb-1">Parish</div>
            <input
              value={parish}
              onChange={(e) => setParish(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. St. Andrew"
            />
          </div>

          {/* Country */}
          <div>
            <div className="text-xs opacity-70 mb-1">Country</div>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. Jamaica"
            />
          </div>

          {/* Phone */}
          <div>
            <div className="text-xs opacity-70 mb-1">Phone</div>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. +1 876-123-4567"
            />
          </div>

          {/* Email */}
          <div>
            <div className="text-xs opacity-70 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. info@company.com"
            />
          </div>

          {/* Website */}
          <div className="md:col-span-2">
            <div className="text-xs opacity-70 mb-1">Website</div>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={busy}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="e.g. https://www.company.com"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={saveAll}
            disabled={busy}
            className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save All"}
          </button>
          {msg && <div className="text-sm opacity-80">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
