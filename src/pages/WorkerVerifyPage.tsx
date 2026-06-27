// src/pages/WorkerVerifyPage.tsx
// Public page — no auth required. Opened by scanning the QR code on a printed
// Worker ID Card. Single job: tell whoever scanned it, in under two seconds,
// whether this is a real, currently active worker of the company.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ShieldCheck, ShieldAlert, ShieldX, Calendar, Hash, Briefcase } from "lucide-react";

type VerifyResult = {
  id: string;
  first_name: string;
  last_name: string;
  worker_type: string | null;
  status: "active" | "inactive" | "terminated";
  employee_id: string | null;
  hire_date: string | null;
  passport_photo_url: string | null;
  id_photo_url: string | null;
  company_name: string | null;
  logo_url: string | null;
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

const NOT_FOUND_THEME = { band: "#7A1F2B", bandSoft: "#931F2D", label: "NOT A VALID ID", sub: "This card could not be verified", Icon: ShieldX };

export default function WorkerVerifyPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const [worker, setWorker] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      if (!workerId) { setNotFound(true); setLoading(false); return; }
      const { data, error } = await supabase
        .from("worker_verify_view")
        .select("*")
        .eq("id", workerId)
        .maybeSingle();
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

  const theme = notFound || !worker ? NOT_FOUND_THEME : STATUS_THEME[worker.status] || STATUS_THEME.inactive;
  const Icon = theme.Icon;
  const photoUrl = worker?.passport_photo_url || worker?.id_photo_url || "";

  return (
    <div style={{ minHeight: "100vh", background: "#0B1220", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, borderRadius: 20, overflow: "hidden", background: "#101826", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

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
                {photoUrl ? <img src={photoUrl} alt={worker.first_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, opacity: 0.3 }}>👤</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
                  {worker.first_name} {worker.last_name}
                </div>
                <div style={{ fontSize: 11, color: "#7FA8C9", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
                  {roleLabel(worker.worker_type)}
                </div>
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
          {worker?.logo_url ? (
            <img src={worker.logo_url} alt="logo" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
          )}
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,0.45)" }}>
        {icon}
        <span style={{ fontSize: 11, letterSpacing: 0.3 }}>{label}</span>
      </div>
      <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", fontFamily: mono ? "monospace" : "inherit", fontWeight: 600 }}>
        {value}
      </span>
    </div>
  );
}