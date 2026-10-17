// src/pages/WorkerVerifyPage.tsx
// Public page — no auth required. Opened by scanning the QR code on a printed
// Worker ID Card. Single job: tell whoever scanned it, in under two seconds,
// whether this is a real, currently active worker of the company.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ShieldCheck, ShieldAlert, ShieldX, Calendar, Hash, Briefcase } from "lucide-react";
import VerifyHeader from "../components/VerifyHeader";

type VerifyResult = {
  id: string;
  first_name: string;
  last_name: string;
  worker_type: string | null;
  status: "active" | "inactive" | "terminated";
  employee_id: string | null;
  hire_date: string | null;
  photo_url: string | null;   // the passport / profile photo only: an ID-document scan is never sent to this public page
  company_name: string | null;
  logo_url: string | null;
  id_card_primary?: string | null;
  id_card_accent?: string | null;
  // from verify_worker: still valid (active and not past its expiry) / past its expiry
  valid?: boolean;
  expired?: boolean;
};

function roleLabel(t?: string | null) {
  return (t || "Worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Status drives the entire page mood — the color is the verdict, readable
// before any text needs to be parsed by someone glancing at a phone at a gate.
const STATUS_THEME: Record<string, { band: string; bandSoft: string; label: string; sub: string; Icon: typeof ShieldCheck }> = {
  active:     { band: "#15315A", bandSoft: "#1C3D6B", label: "ACTIVE WORKER",      sub: "Currently authorized",        Icon: ShieldCheck },
  inactive:   { band: "#4A4F58", bandSoft: "#5C6270", label: "INACTIVE",           sub: "Not currently active",        Icon: ShieldAlert },
  terminated: { band: "#7A1F2B", bandSoft: "#931F2D", label: "NOT AUTHORIZED",     sub: "Employment has ended",        Icon: ShieldX },
};

// An expired ID turns the whole band red, whatever the worker's status
const EXPIRED_THEME = { band: "#7A1F2B", bandSoft: "#931F2D", label: "ID EXPIRED", sub: "This ID card has expired", Icon: ShieldX };

const NOT_FOUND_THEME = { band: "#7A1F2B", bandSoft: "#931F2D", label: "NOT A VALID ID", sub: "This card could not be verified", Icon: ShieldX };

export default function WorkerVerifyPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const [worker, setWorker] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    async function load() {
      if (!workerId) { setNotFound(true); setLoading(false); return; }
      // One worker at a time, only what this page shows (verify_worker); the old all-workers view is closed to signed-out users.
      const { data, error } = await supabase.rpc("verify_worker", { p_worker_id: workerId });
      if (error || !data) {
        setNotFound(true);
      } else {
        setWorker(data as VerifyResult);
      }
      setLoading(false);
    }
    load();
  }, [workerId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B1220" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "sans-serif" }}>Verifying…</div>
      </div>
    );
  }

  const theme = notFound || !worker ? NOT_FOUND_THEME : worker.expired ? EXPIRED_THEME : STATUS_THEME[worker.status] || STATUS_THEME.inactive;
  const Icon = theme.Icon;
  const photoUrl = photoFailed ? "" : (worker?.photo_url || "");
  const initials = worker ? ((worker.first_name || "").trim().charAt(0) + (worker.last_name || "").trim().charAt(0)).toUpperCase() : "";

  return (
    <div style={{ minHeight: "100vh", background: "#0B1220", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, borderRadius: 20, overflow: "hidden", background: "#101826", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

        {worker && <VerifyHeader logoUrl={worker.logo_url} companyName={worker.company_name} theme={{ primary: worker.id_card_primary, accent: worker.id_card_accent }} />}

        {/* Status band — the signature element. Color is the verdict. */}
        <div style={{ background: theme.band, padding: "32px 24px 28px", textAlign: "center", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${theme.band}, ${theme.bandSoft})` }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Icon size={28} color="#fff" strokeWidth={2.2} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: 0.5, lineHeight: 1.15 }}>
              {theme.label}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, letterSpacing: 0.3 }}>
              {theme.sub}
            </div>
          </div>
        </div>

        {notFound || !worker ? (
          <div style={{ padding: "28px 24px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              This QR code does not match an active worker record. If you believe this is in error, contact the issuing company directly rather than relying on this card.
            </div>
          </div>
        ) : (
          <>
            {/* Worker identity */}
            <div style={{ display: "flex", gap: 14, padding: "22px 24px 18px", alignItems: "center" }}>
              <div style={{ width: 56, height: 70, borderRadius: 8, overflow: "hidden", background: "#1a2436", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {photoUrl ? <img src={photoUrl} alt={worker.first_name} onError={() => setPhotoFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "rgba(255,255,255,0.55)" }}>{initials || "—"}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                  {worker.first_name} {worker.last_name}
                </div>
                <div style={{ fontSize: 11, color: "#7FA8C9", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
                  {roleLabel(worker.worker_type)}
                </div>
                {worker.expired ? (
                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, background: "#7A1F2B", color: "#FFD9DE", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Expired</span>
                ) : worker.valid ? (
                  <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, background: "#14532d", color: "#bbf7d0", fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>Valid ID</span>
                ) : null}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 24px" }} />

            {/* Details */}
            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              <DetailRow icon={<Hash size={13} />} label="ID Number" value={worker.employee_id || "—"} mono />
              <DetailRow icon={<Calendar size={13} />} label="Hired" value={fmtDate(worker.hire_date)} />
              <DetailRow icon={<Briefcase size={13} />} label="Company" value={worker.company_name || "—"} />
            </div>
          </>
        )}

        {/* Footer — company branding for legitimacy, and a live-data note */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3 }}>
            Verified live against {worker?.company_name || "company"} records · not a stored screenshot
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>
        {icon}
        <span style={{ fontSize: 11, letterSpacing: 0.3 }}>{label}</span>
      </div>
      <span style={{ textAlign: "right", fontSize: 12.5, color: "rgba(255,255,255,0.9)", fontFamily: mono ? "monospace" : "inherit", fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}