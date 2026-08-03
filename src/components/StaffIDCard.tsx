// src/components/StaffIDCard.tsx — Dark navy corporate ID card for internal
// staff (user_profiles: director/admin/accounts/etc.). Separate from
// WorkerIDCard.tsx, which is exclusively for the workers table (field/site
// workers) — do not merge these, they cover different id spaces.
import React, { useEffect, useState } from "react";
import { User as UserIcon, QrCode } from "lucide-react";
import { supabase } from "../lib/supabase";

interface StaffProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
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
  address_line1: string | null;
  parish: string | null;
  phone: string | null;
}

interface Props {
  userId: string;
  onClose: () => void;
}

const NAVY = "#0f2744";
const GOLD = "#C9A84C";
const CARD_W = 320, CARD_H = 202;

function roleLabel(role?: string | null) {
  return (role || "Staff").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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

function getExpiryColor(expiryDate: Date | null): string {
  if (!expiryDate) return "rgba(255,255,255,0.5)";
  const days = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
  if (days < 0) return "#f87171";   // red — expired
  if (days < 60) return "#fbbf24";  // amber — expiring soon
  return "#4ade80";                  // green — valid
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 8, color: valueColor || "rgba(255,255,255,0.9)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Watermark({ text }: { text: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", pointerEvents: "none", zIndex: 0,
    }}>
      <div style={{
        fontSize: 40, fontWeight: 900, color: "rgba(255,255,255,0.04)", whiteSpace: "nowrap",
        transform: "rotate(-30deg)", textTransform: "uppercase", letterSpacing: 4,
      }}>
        {text}
      </div>
    </div>
  );
}

function CardFront({ staff, company, companyName }: { staff: StaffProfile; company: CompanyInfo | null; companyName: string }) {
  const expiry = resolveExpiry(staff);
  const expiryColor = getExpiryColor(expiry);
  const issued = staff.id_issued_date || staff.created_at || null;

  return (
    <div style={{
      width: CARD_W, height: CARD_H, background: NAVY, borderRadius: 8, overflow: "hidden",
      display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <div style={{ height: 5, background: GOLD, flexShrink: 0 }} />
      <Watermark text={companyName} />

      <div style={{ flex: 1, display: "flex", padding: "10px 12px", gap: 10, position: "relative", zIndex: 1 }}>
        {/* Photo + job title */}
        <div style={{ width: 72, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{
            width: 72, height: 82, borderRadius: 6, overflow: "hidden", flexShrink: 0,
            border: "1.5px solid rgba(201,168,76,0.6)", background: "rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {staff.avatar_url
              ? <img src={staff.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <UserIcon size={30} color="rgba(255,255,255,0.25)" />}
          </div>
          <div style={{ fontSize: 7, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center", marginTop: 5, lineHeight: 1.3 }}>
            {roleLabel(staff.role)}
          </div>
        </div>

        {/* Info column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0, overflow: "hidden",
              background: GOLD, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {company?.logo_url
                ? <img src={company.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 10, fontWeight: 800, color: NAVY }}>{companyName.charAt(0).toUpperCase()}</span>}
            </div>
            <span style={{ fontSize: 8, color: "#fff", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{companyName}</span>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", margin: "6px 0" }} />

          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>{staff.full_name || "—"}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", marginTop: 2, marginBottom: 6 }}>STAFF IDENTIFICATION CARD</div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", marginBottom: 6 }} />

          <InfoRow label="Emp No." value={staff.employee_number || "—"} />
          <InfoRow label="TRN" value={staff.trn || "—"} />
          <InfoRow label="Issued" value={fmtMonthYear(issued)} />
          <InfoRow label="Expires" value={expiry ? fmtMonthYear(expiry.toISOString()) : "—"} valueColor={expiryColor} />
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        height: 28, flexShrink: 0, background: "rgba(201,168,76,0.12)", borderTop: `1px solid ${GOLD}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px",
        position: "relative", zIndex: 1,
      }}>
        <span style={{ fontSize: 6, color: "rgba(255,255,255,0.4)", letterSpacing: 0.3, textTransform: "uppercase" }}>
          If found please return to {companyName}
        </span>
        <QrCode size={16} color="rgba(255,255,255,0.3)" />
      </div>
      <div style={{ height: 3, background: GOLD, flexShrink: 0 }} />
    </div>
  );
}

function CardBack({ company, companyName }: { company: CompanyInfo | null; companyName: string }) {
  return (
    <div style={{
      width: CARD_W, height: CARD_H, background: NAVY, borderRadius: 8, overflow: "hidden",
      display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    }}>
      <div style={{ height: 5, background: GOLD, flexShrink: 0 }} />
      <Watermark text={companyName} />

      <div style={{ height: 28, background: "rgba(0,0,0,0.6)", flexShrink: 0, position: "relative", zIndex: 1 }} />

      <div style={{ padding: "12px 14px", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{
          height: 26, background: "rgba(255,255,255,0.9)", borderRadius: 3, display: "flex",
          alignItems: "flex-end", padding: "0 8px 3px", marginBottom: 10,
        }}>
          <span style={{ fontSize: 6, color: "rgba(15,39,68,0.6)", letterSpacing: 0.5 }}>SIGNATURE</span>
        </div>

        <p style={{ fontSize: 7, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, margin: 0 }}>
          This card is the property of {companyName}. If found, please return.
          Unauthorised use is prohibited.
        </p>

        <div style={{ marginTop: "auto", fontSize: 7, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
          <div>📍 {[company?.address_line1, company?.parish].filter(Boolean).join(", ") || `${companyName}, Jamaica`}</div>
          {company?.phone && <div>📞 {company.phone}</div>}
        </div>
      </div>

      <div style={{ height: 3, background: GOLD, flexShrink: 0 }} />
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
        .select("id, full_name, email, role, trn, avatar_url, employee_number, id_issued_date, id_expiry_date, company_id, created_at")
        .eq("id", userId)
        .maybeSingle();
      setStaff(profile as StaffProfile | null);

      if (profile?.company_id) {
        const { data: cs } = await supabase
          .from("company_settings")
          .select("company_name, logo_url, address_line1, parish, phone")
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
    const win = window.open("", "_blank", "width=700,height=500");
    if (!win) return;
    // Both faces are re-rendered as static HTML rather than reusing the React
    // tree — printed output needs to live in an independent document.
    const companyName = company?.company_name || "Company";
    const expiry = resolveExpiry(staff);
    const expiryColor = getExpiryColor(expiry);
    const issued = staff.id_issued_date || staff.created_at || null;

    const faceStyle = `width:85.6mm;height:54mm;background:${NAVY};color:#fff;border-radius:3mm;overflow:hidden;position:relative;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;`;

    const frontHTML = `
      <div class="card" style="${faceStyle}">
        <div style="height:1.6mm;background:${GOLD}"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;z-index:0">
          <div style="font-size:13mm;font-weight:900;color:rgba(255,255,255,0.04);white-space:nowrap;transform:rotate(-30deg);text-transform:uppercase;letter-spacing:1mm">${companyName}</div>
        </div>
        <div style="display:flex;padding:3mm;gap:3mm;position:relative;z-index:1">
          <div style="width:22mm;flex-shrink:0;display:flex;flex-direction:column;align-items:center">
            <div style="width:22mm;height:25mm;border-radius:2mm;overflow:hidden;border:0.5mm solid rgba(201,168,76,0.6);background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center">
              ${staff.avatar_url ? `<img src="${staff.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:9mm;color:rgba(255,255,255,0.25)">👤</span>`}
            </div>
            <div style="font-size:2.1mm;color:${GOLD};text-transform:uppercase;letter-spacing:0.2mm;text-align:center;margin-top:1.5mm">${roleLabel(staff.role)}</div>
          </div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;gap:1.8mm">
              <div style="width:6mm;height:6mm;border-radius:1.2mm;flex-shrink:0;overflow:hidden;background:${GOLD};display:flex;align-items:center;justify-content:center">
                ${company?.logo_url ? `<img src="${company.logo_url}" style="width:100%;height:100%;object-fit:cover"/>` : `<span style="font-size:3mm;font-weight:800;color:${NAVY}">${companyName.charAt(0).toUpperCase()}</span>`}
              </div>
              <span style="font-size:2.3mm;color:#fff;text-transform:uppercase;letter-spacing:0.3mm;font-weight:600">${companyName}</span>
            </div>
            <div style="border-top:0.1mm solid rgba(255,255,255,0.12);margin:1.6mm 0"></div>
            <div style="font-size:4.2mm;font-weight:700;color:#fff;line-height:1.15">${staff.full_name || "—"}</div>
            <div style="font-size:2.3mm;color:rgba(255,255,255,0.55);margin-top:0.6mm;margin-bottom:1.6mm">STAFF IDENTIFICATION CARD</div>
            <div style="border-top:0.1mm solid rgba(255,255,255,0.12);margin-bottom:1.6mm"></div>
            ${[
              ["Emp No.", staff.employee_number || "—", "rgba(255,255,255,0.9)"],
              ["TRN", staff.trn || "—", "rgba(255,255,255,0.9)"],
              ["Issued", fmtMonthYear(issued), "rgba(255,255,255,0.9)"],
              ["Expires", expiry ? fmtMonthYear(expiry.toISOString()) : "—", expiryColor],
            ].map(([label, value, color]) => `
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.8mm">
                <span style="font-size:1.9mm;color:rgba(255,255,255,0.45);text-transform:uppercase">${label}</span>
                <span style="font-size:2.1mm;color:${color};font-weight:600">${value}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <div style="position:absolute;bottom:1.6mm;left:0;right:0;height:7.4mm;background:rgba(201,168,76,0.12);border-top:0.3mm solid ${GOLD};display:flex;align-items:center;justify-content:space-between;padding:0 2.6mm;z-index:1">
          <span style="font-size:1.6mm;color:rgba(255,255,255,0.4);text-transform:uppercase">If found return to ${companyName}</span>
          <span style="font-size:2.6mm">▦</span>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:1.6mm;background:${GOLD}"></div>
      </div>`;

    const backHTML = `
      <div class="card" style="${faceStyle}">
        <div style="height:1.6mm;background:${GOLD}"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;z-index:0">
          <div style="font-size:13mm;font-weight:900;color:rgba(255,255,255,0.04);white-space:nowrap;transform:rotate(-30deg);text-transform:uppercase;letter-spacing:1mm">${companyName}</div>
        </div>
        <div style="height:7.4mm;background:rgba(0,0,0,0.6);position:relative;z-index:1"></div>
        <div style="padding:3mm 3.6mm;position:relative;z-index:1">
          <div style="height:6.8mm;background:rgba(255,255,255,0.9);border-radius:0.8mm;display:flex;align-items:flex-end;padding:0 2mm 0.8mm;margin-bottom:2.6mm">
            <span style="font-size:1.6mm;color:rgba(15,39,68,0.6);letter-spacing:0.2mm">SIGNATURE</span>
          </div>
          <p style="font-size:1.9mm;color:rgba(255,255,255,0.65);line-height:1.5;margin:0 0 4mm">
            This card is the property of ${companyName}. If found, please return. Unauthorised use is prohibited.
          </p>
          <div style="font-size:1.9mm;color:rgba(255,255,255,0.5);line-height:1.6">
            <div>${[company?.address_line1, company?.parish].filter(Boolean).join(", ") || `${companyName}, Jamaica`}</div>
            ${company?.phone ? `<div>Tel: ${company.phone}</div>` : ""}
          </div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:1.6mm;background:${GOLD}"></div>
      </div>`;

    win.document.write(`<!DOCTYPE html><html><head><title>Staff ID — ${staff.full_name || ""}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f0f0f0; display: flex; gap: 10mm; align-items: center; justify-content: center; min-height: 100vh; padding: 10mm; }
        @media print {
          @page { size: 85.6mm 54mm; margin: 0; }
          body { background: #fff; padding: 0; gap: 0; }
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
