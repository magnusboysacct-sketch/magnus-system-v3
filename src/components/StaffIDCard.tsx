// src/components/StaffIDCard.tsx — Dark navy corporate ID card for internal
// staff (user_profiles: director/admin/accounts/etc.). Separate from
// WorkerIDCard.tsx, which is exclusively for the workers table (field/site
// workers) — do not merge these, they cover different id spaces.
//
// Visually synced to WorkerIDCard.tsx's actual current design: navy front
// with gold stripes/accents, light front-facing... i.e. light BACK
// (NAVY_TINT/AMBER banner, no stripes), circular logo top-center on both
// (large front, small back), no watermark. Colors below are copied from
// WorkerIDCard.tsx's real constants, not from memory — its front navy is
// #15315A, not #0f2744.
import React, { useEffect, useState } from "react";
import { User as UserIcon, QrCode } from "lucide-react";
import { supabase } from "../lib/supabase";

interface StaffProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  job_title: string | null;
  trn: string | null;
  avatar_url: string | null;
  employee_number: string | null;
  id_issued_date: string | null;
  id_expiry_date: string | null;
  company_id: string | null;
  created_at?: string | null;
}

interface CompanyInfo {
  company_name: string | null;
  logo_url: string | null;
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  parish: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
}

interface Props {
  userId: string;
  onClose: () => void;
}

// ─── Palette / tokens — copied from WorkerIDCard.tsx's real constants ──────
const NAVY = "#15315A";
const NAVY_TINT = "#E7EDF6";   // back face
const NAVY_TINT_LINE = "#C7D4E6";
const AMBER = "#F2A93B";       // back banner only — front uses GOLD
const INK = "#15315A";         // back-face text
const ALERT_RED = "#DC2626";
const GOLD = "#C9A84C";
// Same portrait CR80 footprint as WorkerIDCard.tsx (213x338 px preview,
// 54mm x 85.6mm print).
const CARD_W = 213, CARD_H = 338;

function roleLabel(role?: string | null) {
  return (role || "Staff").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Prefers the free-text job title over the system role for display — same
// fallback WorkerIDCard.tsx uses (job_title || roleLabel(worker_type)).
function displayTitle(staff: StaffProfile) {
  return staff.job_title?.trim() || roleLabel(staff.role);
}

function fmtMonthYear(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// Falls back to issued + 2 years when no explicit id_expiry_date is set —
// same convention WorkerIDCard.tsx uses for hire_date-based workers.
function resolveExpiry(staff: StaffProfile): Date | null {
  if (staff.id_expiry_date) return new Date(staff.id_expiry_date);
  const base = staff.id_issued_date || staff.created_at;
  if (!base) return null;
  const dt = new Date(base);
  dt.setFullYear(dt.getFullYear() + 2);
  return dt;
}

function isExpired(expiryDate: Date | null): boolean {
  return !!expiryDate && expiryDate.getTime() < Date.now();
}

// 3-tier (red/amber/green) rather than WorkerIDCard's 2-tier (red/gold) —
// an existing Staff-specific enhancement (expiring-soon warning), not a
// container/styling concern, so kept as-is per "keep whatever fields are
// specific to Staff." The red itself is aligned to WorkerIDCard's ALERT_RED
// for exact color parity when actually expired.
function getExpiryColor(expiryDate: Date | null): string {
  if (!expiryDate) return "rgba(255,255,255,0.5)";
  if (isExpired(expiryDate)) return ALERT_RED;
  const days = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
  if (days < 60) return "#fbbf24";  // amber — expiring soon
  return "#4ade80";                  // green — valid
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, width: "100%" }}>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 8, color: valueColor || "rgba(255,255,255,0.9)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function FrontLogo({ company, companyName }: { company: CompanyInfo | null; companyName: string }) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", background: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {company?.logo_url
        ? <img src={company.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{companyName.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function BackLogo({ company, companyName }: { company: CompanyInfo | null; companyName: string }) {
  return (
    <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", background: NAVY, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {company?.logo_url
        ? <img src={company.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>{companyName.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function CardFront({ staff, company, companyName }: { staff: StaffProfile; company: CompanyInfo | null; companyName: string }) {
  const expiry = resolveExpiry(staff);
  const expiryColor = getExpiryColor(expiry);
  const issued = staff.id_issued_date || staff.created_at || null;
  const expired = isExpired(expiry);

  return (
    <div style={{
      width: CARD_W, height: CARD_H, background: NAVY, borderRadius: 8, overflow: "hidden",
      display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <div style={{ height: 5, background: GOLD, flexShrink: 0 }} />

      {/* OFFICIAL badge — top right, matches WorkerIDCard's exactly */}
      <div style={{ position: "absolute", top: 9, right: 10, background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.4)", color: GOLD, fontSize: 7, fontWeight: 700, padding: "2px 5px", borderRadius: 3, textAlign: "center", lineHeight: 1.4, zIndex: 1 }}>OFFICIAL<br/>ID</div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 14px 0" }}>
        {/* Logo top-center — large/prominent, matches WorkerIDCard's front */}
        <FrontLogo company={company} companyName={companyName} />
        <div style={{ fontSize: 7, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: 1, marginTop: 6, textAlign: "center" }}>{companyName}</div>

        <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0" }} />

        {/* Photo */}
        <div style={{
          width: 65, height: 80, borderRadius: 5, overflow: "hidden", flexShrink: 0,
          border: "1.5px solid rgba(201,168,76,0.6)", background: "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {staff.avatar_url
            ? <img src={staff.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <UserIcon size={26} color="rgba(255,255,255,0.25)" />}
        </div>
        <div style={{ fontSize: 7, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center", marginTop: 6 }}>
          {displayTitle(staff)}
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 8, textAlign: "center", lineHeight: 1.2 }}>{staff.full_name || "—"}</div>
        <div style={{ fontSize: 7, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>STAFF IDENTIFICATION CARD</div>

        <div style={{ width: "100%", borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0" }} />

        <InfoRow label="TRN" value={staff.trn || "—"} />

        {/* QR — decorative placeholder (no /verify-staff route exists), pushed down against the footer */}
        <div style={{ marginTop: "auto", paddingTop: 8, paddingBottom: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: 44, height: 44, background: "#fff", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <QrCode size={30} color={NAVY} />
          </div>
          <div style={{ fontSize: 6, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" }}>Scan to verify</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        height: 28, flexShrink: 0, background: "rgba(201,168,76,0.12)", borderTop: `1px solid ${GOLD}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px",
      }}>
        <div><div style={{ fontSize: 6, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>Issued</div><div style={{ fontSize: 8, color: GOLD, fontWeight: 600 }}>{fmtMonthYear(issued)}</div></div>
        <div style={{ fontSize: 6, color: "rgba(255,255,255,0.2)", letterSpacing: 1 }}>{staff.employee_number || "—"}</div>
        <div><div style={{ fontSize: 6, color: expired ? ALERT_RED : "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>{expired ? "Expired" : "Expires"}</div><div style={{ fontSize: 8, color: expiryColor, fontWeight: 600 }}>{expiry ? fmtMonthYear(expiry.toISOString()) : "—"}</div></div>
      </div>

      <div style={{ height: 3, background: GOLD, flexShrink: 0 }} />
    </div>
  );
}

// Matches WorkerIDCard's back exactly: light NAVY_TINT face, amber "if
// found" banner, company name/tagline, address/contact block, certification
// paragraph, signature line + QR. No gold stripes — WorkerIDCard's back has
// none either, only the front does.
function CardBack({ company, companyName }: { company: CompanyInfo | null; companyName: string }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H, background: NAVY_TINT, color: INK, borderRadius: 8, overflow: "hidden",
      display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <div style={{ display: "flex", justifyContent: "center", padding: "14px 14px 0" }}>
        <BackLogo company={company} companyName={companyName} />
      </div>

      <div style={{ background: AMBER, color: NAVY, fontSize: 7, fontWeight: 700, textAlign: "center", padding: "5px 10px", letterSpacing: 0.5, marginTop: 10, lineHeight: 1.4 }}>
        IF FOUND, RETURN TO ISSUING COMPANY BELOW
      </div>

      <div style={{ textAlign: "center", padding: "8px 14px 0" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{companyName}</div>
        <div style={{ fontSize: 7, opacity: 0.6, marginTop: 2 }}>{company?.tagline || "Building With Integrity"}</div>
      </div>

      <div style={{ borderTop: `1px solid ${NAVY_TINT_LINE}`, margin: "8px 14px" }} />

      <div style={{ padding: "0 14px", fontSize: 7, lineHeight: 1.7, opacity: 0.75 }}>
        {[company?.address_line1, company?.address_line2].filter(Boolean).join(", ") && (
          <div>{[company?.address_line1, company?.address_line2].filter(Boolean).join(", ")}</div>
        )}
        {[company?.parish, company?.country].filter(Boolean).join(", ") && (
          <div>{[company?.parish, company?.country].filter(Boolean).join(", ")}</div>
        )}
        {company?.phone && <div>Tel: {company.phone}</div>}
        {company?.email && <div>Email: {company.email}</div>}
      </div>

      <div style={{ padding: "8px 14px 0", fontSize: 7, fontStyle: "italic", opacity: 0.85, lineHeight: 1.6 }}>
        This card certifies the bearer is an authorized staff member of {companyName}. This card remains company property and must be surrendered upon termination.
      </div>

      <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "10px 14px 14px", borderTop: `1px solid ${NAVY_TINT_LINE}` }}>
        <div>
          <div style={{ width: 90, borderBottom: "1px solid rgba(28,26,20,0.4)", height: 16 }} />
          <div style={{ fontSize: 5.5, opacity: 0.5, letterSpacing: 0.5, marginTop: 2 }}>AUTHORIZED SIGNATURE</div>
        </div>
        {/* Decorative placeholder — same reasoning as the front's QR */}
        <div style={{ width: 34, height: 34, background: "#fff", borderRadius: 2, border: `1px solid ${NAVY_TINT_LINE}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <QrCode size={22} color={INK} />
        </div>
      </div>
    </div>
  );
}

export function StaffIDCard({ userId, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id, full_name, email, role, job_title, trn, avatar_url, employee_number, id_issued_date, id_expiry_date, company_id, created_at")
        .eq("id", userId)
        .maybeSingle();
      setStaff(profile as StaffProfile | null);

      if (profile?.company_id) {
        const { data: cs } = await supabase
          .from("company_settings")
          .select("company_name, logo_url, tagline, address_line1, address_line2, parish, country, phone, email")
          .eq("company_id", profile.company_id)
          .maybeSingle();
        setCompany(cs as CompanyInfo | null);
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  function handlePrint() {
    if (!staff) return;
    const win = window.open("", "_blank", "width=700,height=650");
    if (!win) return;
    // Both faces are re-rendered as static HTML rather than reusing the React
    // tree — printed output needs to live in an independent document.
    const companyName = company?.company_name || "Company";
    const expiry = resolveExpiry(staff);
    const expiryColor = getExpiryColor(expiry);
    const expired = isExpired(expiry);
    const issued = staff.id_issued_date || staff.created_at || null;

    // Portrait CR80 (54mm x 85.6mm) — matches WorkerIDCard.tsx's print size.
    const frontFaceStyle = `width:54mm;height:85.6mm;background:${NAVY};color:#fff;border-radius:3mm;overflow:hidden;position:relative;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;`;
    const backFaceStyle = `width:54mm;height:85.6mm;background:${NAVY_TINT};color:${INK};border-radius:3mm;overflow:hidden;position:relative;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;`;
    const logoHTML = (size: string, bg: string, fg: string) => company?.logo_url
      ? `<img src="${company.logo_url}" style="width:100%;height:100%;object-fit:cover"/>`
      : `<span style="font-size:${size};font-weight:800;color:${fg}">${companyName.charAt(0).toUpperCase()}</span>`;

    const frontHTML = `
      <div class="card" style="${frontFaceStyle}">
        <div style="height:1.3mm;background:${GOLD}"></div>
        <div style="position:absolute;top:2.4mm;right:2.6mm;background:rgba(201,168,76,0.15);border:0.2mm solid rgba(201,168,76,0.4);color:${GOLD};font-size:1.6mm;font-weight:700;padding:0.5mm 1.3mm;border-radius:0.8mm;text-align:center;line-height:1.4;z-index:1">OFFICIAL<br/>ID</div>
        <div style="display:flex;flex-direction:column;align-items:center;padding:2.6mm 3.6mm 0;position:relative;z-index:1">
          <div style="width:14mm;height:14mm;border-radius:50%;overflow:hidden;background:${GOLD};display:flex;align-items:center;justify-content:center">
            ${logoHTML("5.6mm", GOLD, NAVY)}
          </div>
          <div style="font-size:1.8mm;font-weight:600;color:#fff;text-transform:uppercase;letter-spacing:0.3mm;margin-top:1.5mm;text-align:center">${companyName}</div>
          <div style="width:100%;border-top:0.1mm solid rgba(255,255,255,0.12);margin:1.5mm 0"></div>
          <div style="width:16.5mm;height:20mm;border-radius:1.3mm;overflow:hidden;border:0.4mm solid rgba(201,168,76,0.6);background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center">
            ${staff.avatar_url ? `<img src="${staff.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:7mm;color:rgba(255,255,255,0.25)">👤</span>`}
          </div>
          <div style="font-size:1.8mm;color:${GOLD};text-transform:uppercase;letter-spacing:0.2mm;text-align:center;margin-top:1.5mm">${displayTitle(staff)}</div>
          <div style="font-size:3.5mm;font-weight:700;color:#fff;margin-top:2mm;text-align:center;line-height:1.2">${staff.full_name || "—"}</div>
          <div style="font-size:1.8mm;color:rgba(255,255,255,0.55);margin-top:0.5mm">STAFF IDENTIFICATION CARD</div>
          <div style="width:100%;border-top:0.1mm solid rgba(255,255,255,0.12);margin:1.5mm 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;width:100%">
            <span style="font-size:1.8mm;color:rgba(255,255,255,0.45);text-transform:uppercase">TRN</span>
            <span style="font-size:2mm;color:rgba(255,255,255,0.9);font-weight:600">${staff.trn || "—"}</span>
          </div>
        </div>
        <div style="position:absolute;bottom:9mm;left:0;right:0;display:flex;flex-direction:column;align-items:center;z-index:1">
          <div style="width:11mm;height:11mm;background:#fff;border-radius:1mm;display:flex;align-items:center;justify-content:center;font-size:6mm;color:${NAVY}">▦</div>
          <div style="font-size:1.5mm;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.2mm;margin-top:0.6mm">Scan to verify</div>
        </div>
        <div style="position:absolute;bottom:1.6mm;left:0;right:0;height:7mm;background:rgba(201,168,76,0.12);border-top:0.3mm solid ${GOLD};display:flex;align-items:center;justify-content:space-between;padding:0 2.6mm;z-index:1">
          <div><div style="font-size:1.5mm;color:rgba(255,255,255,0.35);text-transform:uppercase">${expired ? "Expired" : "Issued"}</div><div style="font-size:2mm;color:${GOLD};font-weight:600">${fmtMonthYear(issued)}</div></div>
          <div style="font-size:1.5mm;color:rgba(255,255,255,0.2)">${staff.employee_number || "—"}</div>
          <div><div style="font-size:1.5mm;color:${expired ? ALERT_RED : "rgba(255,255,255,0.35)"};text-transform:uppercase">${expired ? "Expired" : "Expires"}</div><div style="font-size:2mm;color:${expiryColor};font-weight:600">${expiry ? fmtMonthYear(expiry.toISOString()) : "—"}</div></div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:1mm;background:${GOLD}"></div>
      </div>`;

    const contactLines = [
      [company?.address_line1, company?.address_line2].filter(Boolean).join(", "),
      [company?.parish, company?.country].filter(Boolean).join(", "),
      company?.phone ? `Tel: ${company.phone}` : null,
      company?.email ? `Email: ${company.email}` : null,
    ].filter(Boolean);

    const backHTML = `
      <div class="card" style="${backFaceStyle}">
        <div style="display:flex;justify-content:center;padding:3mm 3.6mm 0">
          <div style="width:6.5mm;height:6.5mm;border-radius:50%;overflow:hidden;background:${NAVY};display:flex;align-items:center;justify-content:center">
            ${logoHTML("2.6mm", NAVY, "#fff")}
          </div>
        </div>
        <div style="background:${AMBER};color:${NAVY};font-size:1.8mm;font-weight:700;text-align:center;padding:1.3mm 2.6mm;letter-spacing:0.15mm;margin-top:2.6mm;line-height:1.4">
          IF FOUND, RETURN TO ISSUING COMPANY BELOW
        </div>
        <div style="text-align:center;padding:2mm 3.6mm 0">
          <div style="font-size:2.8mm;font-weight:700;text-transform:uppercase;letter-spacing:0.15mm">${companyName}</div>
          <div style="font-size:1.8mm;opacity:0.6;margin-top:0.5mm">${company?.tagline || "Building With Integrity"}</div>
        </div>
        <div style="border-top:0.1mm solid ${NAVY_TINT_LINE};margin:2mm 3.6mm"></div>
        <div style="padding:0 3.6mm;font-size:1.8mm;line-height:1.7;opacity:0.75">
          ${contactLines.map(l => `<div>${l}</div>`).join("")}
        </div>
        <div style="padding:2mm 3.6mm 0;font-size:1.8mm;font-style:italic;opacity:0.85;line-height:1.6">
          This card certifies the bearer is an authorized staff member of ${companyName}. This card remains company property and must be surrendered upon termination.
        </div>
        <div style="position:absolute;bottom:2.6mm;left:0;right:0;display:flex;align-items:flex-end;justify-content:space-between;padding:0 3.6mm;border-top:0.1mm solid ${NAVY_TINT_LINE};padding-top:2.6mm">
          <div>
            <div style="width:24mm;border-bottom:0.1mm solid rgba(28,26,20,0.4);height:4mm"></div>
            <div style="font-size:1.4mm;opacity:0.5;letter-spacing:0.15mm;margin-top:0.5mm">AUTHORIZED SIGNATURE</div>
          </div>
          <div style="width:9mm;height:9mm;background:#fff;border:0.1mm solid ${NAVY_TINT_LINE};border-radius:0.5mm;display:flex;align-items:center;justify-content:center;font-size:5mm;color:${INK}">▦</div>
        </div>
      </div>`;

    win.document.write(`<!DOCTYPE html><html><head><title>Staff ID — ${staff.full_name || ""}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f0f0; display: flex; gap: 10mm; align-items: center; justify-content: center; min-height: 100vh; padding: 10mm; }
        @media print {
          body { background: #fff; padding: 0; gap: 8mm; }
          .card { page-break-inside: avoid; }
        }
      </style></head><body>${frontHTML}${backHTML}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center">
          <div className="text-sm text-gray-500">Loading ID card...</div>
        </div>
      </div>
    );
  }

  if (!staff) return null;
  const companyName = company?.company_name || "Company";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Staff ID Card</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex justify-center">
          {showBack
            ? <CardBack company={company} companyName={companyName} />
            : <CardFront staff={staff} company={company} companyName={companyName} />}
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={() => setShowBack(v => !v)}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {showBack ? "Show Front" : "Show Back"}
          </button>
          <button onClick={handlePrint}
            className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
            🖨️ Print ID Card
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaffIDCard;
