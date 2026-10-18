// src/pages/IdVerifyPage.tsx
// Public page (no sign-in) opened by scanning the QR code on a Staff or Worker ID card: /v/<code>. It shows only what verify_id returns - name, job title,
// photo, company, and whether the card is valid or expired - never a TRN, ID number, phone or employee number. Same look as the older /verify/:workerId page.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ShieldCheck, ShieldAlert, ShieldX, Calendar, Briefcase, User } from "lucide-react";
import VerifyHeader from "../components/VerifyHeader";
import { useVerifyPhoto } from "../lib/verifyPhoto";
import { verifyPhotoInfo } from "../lib/verifyPhotoCore";

type VerifyIdResult = {
  kind: "staff" | "worker";
  name: string;
  title: string | null;
  has_photo?: boolean;                    // the picture itself comes from the verify-photo function (a 5-minute signed URL)
  photo_url?: string | null;              // (older database function: a ready URL)
  company_name: string | null;
  logo_url: string | null;
  id_card_primary?: string | null;
  id_card_accent?: string | null;
  status: "active" | "inactive" | string;
  valid: boolean;
  expired: boolean;
  expiry_date: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Theme = { band: string; bandSoft: string; label: string; sub: string; Icon: typeof ShieldCheck };
const VALID_THEME: Theme = { band: "#14532d", bandSoft: "#166534", label: "VALID ID", sub: "This card is currently valid", Icon: ShieldCheck };
const EXPIRED_THEME: Theme = { band: "#7A1F2B", bandSoft: "#931F2D", label: "ID EXPIRED", sub: "This ID card has expired", Icon: ShieldX };
const INACTIVE_THEME: Theme = { band: "#4A4F58", bandSoft: "#5C6270", label: "INACTIVE", sub: "Not currently active", Icon: ShieldAlert };
const NOT_FOUND_THEME: Theme = { band: "#7A1F2B", bandSoft: "#931F2D", label: "NOT A VALID ID", sub: "This card could not be verified", Icon: ShieldX };

export default function IdVerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [result, setResult] = useState<VerifyIdResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoInfo = verifyPhotoInfo(result);
  const photoSrc = useVerifyPhoto({ code }, photoInfo.hasPhoto, photoInfo.legacyUrl);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!code) { setLoading(false); return; }
      const { data, error } = await supabase.rpc("verify_id", { p_code: code });
      if (!alive) return;
      setResult(!error && data ? (data as VerifyIdResult) : null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [code]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1220" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "sans-serif" }}>Verifying…</div>
      </div>
    );
  }

  // Expired wins over everything; then anything not active is grey; only an active, in-date card is green.
  const theme = !result ? NOT_FOUND_THEME : result.expired ? EXPIRED_THEME : result.valid ? VALID_THEME : INACTIVE_THEME;
  const Icon = theme.Icon;
  const photoUrl = photoFailed ? "" : (photoSrc || "");
  const initials = result ? result.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") : "";

  return (
    <div style={{ minHeight: "100vh", background: "#0B1220", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, borderRadius: 20, overflow: "hidden", background: "#101826", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        {result && <VerifyHeader logoUrl={result.logo_url} companyName={result.company_name} theme={{ primary: result.id_card_primary, accent: result.id_card_accent }} />}
        <div style={{ background: theme.band, padding: "32px 24px 28px", textAlign: "center", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${theme.band}, ${theme.bandSoft})` }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Icon size={28} color="#fff" strokeWidth={2.2} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: 0.5, lineHeight: 1.15 }}>{theme.label}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, letterSpacing: 0.3 }}>{theme.sub}</div>
          </div>
        </div>

        {!result ? (
          <div style={{ padding: "28px 24px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              This QR code does not match an ID card on record. Do not rely on this card. If you believe this is a mistake, contact the issuing company directly.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, padding: "22px 24px 18px", alignItems: "center" }}>
              <div style={{ width: 56, height: 70, borderRadius: 8, overflow: "hidden", background: "#1a2436", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {photoUrl ? <img src={photoUrl} alt={result.name} onError={() => setPhotoFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.55)" }}>{initials || "—"}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{result.name}</div>
                <div style={{ fontSize: 11, color: "#7FA8C9", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{result.title || (result.kind === "staff" ? "Staff" : "Worker")}</div>
                {result.expired ? (
                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, background: "#7A1F2B", color: "#FFD9DE", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Expired</span>
                ) : result.valid ? (
                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, background: "#14532d", color: "#bbf7d0", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Valid ID</span>
                ) : (
                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, background: "#3a3f48", color: "#d1d5db", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Inactive</span>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 24px" }} />

            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              <DetailRow icon={<User size={13} />} label="Card type" value={result.kind === "staff" ? "Staff" : "Worker"} />
              <DetailRow icon={<Briefcase size={13} />} label="Company" value={result.company_name || "—"} />
              <DetailRow icon={<Calendar size={13} />} label={result.expired ? "Expired on" : "Valid until"} value={fmtDate(result.expiry_date)} />
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
            Verified live against {result?.company_name || "company"} records · not a stored screenshot
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
        {icon}
        <span style={{ fontSize: 11, letterSpacing: 0.3 }}>{label}</span>
      </div>
      <span style={{ textAlign: "right", fontSize: 12.5, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
