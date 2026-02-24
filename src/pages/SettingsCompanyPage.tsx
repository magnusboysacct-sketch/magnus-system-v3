import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type CompanySettings = {
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

      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (!alive) return;

      if (error) {
        console.error(error);
        setMsg(error.message);
      } else if (data) {
        setCompanyName(data.company_name || "");
        setLogoUrl(data.logo_url || null);
        setTagline(data.tagline || "");
        setAddressLine1(data.address_line1 || "");
        setAddressLine2(data.address_line2 || "");
        setParish(data.parish || "");
        setCountry(data.country || "");
        setPhone(data.phone || "");
        setEmail(data.email || "");
        setWebsite(data.website || "");
      }

      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  async function saveAll() {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("company_settings")
        .update({
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
        })
        .eq("id", 1);

      if (error) {
        console.error(error);
        setMsg(error.message);
      } else {
        setMsg("Saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("COMPANY-ASSETS")
        .upload(path, file, { upsert: true });

      if (upErr) {
        console.error(upErr);
        setMsg(upErr.message);
        return;
      }

      const { data } = supabase.storage.from("COMPANY-ASSETS").getPublicUrl(path);
      const publicUrl = data.publicUrl;

      const { error: dbErr } = await supabase
        .from("company_settings")
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", 1);

      if (dbErr) {
        console.error(dbErr);
        setMsg(dbErr.message);
        return;
      }

      setLogoUrl(publicUrl);
      setMsg("Logo updated.");
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
