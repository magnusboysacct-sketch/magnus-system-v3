// src/components/WorkerIDCard.tsx — Navy/amber security-badge design, front + back, single-page print with cut guides
import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import { useCompanySettings } from "../hooks/useCompanySettings";

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  employee_id?: string | null;
  worker_type?: string | null;
  job_title?: string | null;
  id_number?: string | null;
  national_id_type?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  id_expiry_date?: string | null;
  passport_photo_url?: string | null;
  id_photo_url?: string | null;
}

interface Props {
  workerId: string;
  companyName?: string;
  onClose: () => void;
}

// ─── Palette / tokens ───────────────────────────────────────────────────────
// Front and back now share one navy "card stock" family — back is a lighter
// tint of the same hue rather than a separate light paper tone, so the two
// faces read as one card rather than two clashing designs.
const NAVY_BASE = "#15315A";   // lightened front base (was near-black #0A2342)
const NAVY_PANEL = "#1C3D6B";  // header band
const NAVY_TINT = "#E7EDF6";   // back face — pale tint of the same navy hue
const NAVY_TINT_LINE = "#C7D4E6";
const AMBER = "#F2A93B";
const AMBER_DIM = "rgba(242,169,59,0.18)";
const STEEL = "#7FA8C9";
const INK = "#15315A"; // back-face text uses the same navy as ink, for unity
const ALERT_RED = "#DC2626";

function fmtDate(d?: string | null) {
  return (d ? new Date(d) : new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
// Falls back to hire_date + 2 years when no explicit id_expiry_date is set,
// preserving the card's old behavior for workers added before this field existed.
function resolveExpiryDate(worker: Worker): Date {
  if (worker.id_expiry_date) return new Date(worker.id_expiry_date);
  const dt = worker.hire_date ? new Date(worker.hire_date) : new Date();
  dt.setFullYear(dt.getFullYear() + 2);
  return dt;
}
function expiry(worker: Worker) {
  return resolveExpiryDate(worker).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function isIdExpired(worker: Worker) {
  return resolveExpiryDate(worker) < new Date();
}
function roleLabel(t?: string | null) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function displayTitle(worker: Worker) {
  return worker.job_title?.trim() || roleLabel(worker.worker_type);
}

const BASE_URL = window.location.origin;
const CARD_W = 338, CARD_H = 213; // CR80-ish ratio at print scale

export function WorkerIDCard({ workerId, companyName: propCompanyName, onClose }: Props) {
  const { settings: companySettings } = useCompanySettings();
  const companyName = propCompanyName || companySettings?.company_name || "Magnus Boys Construction";
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Watermark: prefer a dedicated watermark image from settings, fall back to the regular logo.
  const cs: any = companySettings || {};
  const watermarkEnabled = cs.watermark_enabled !== false; // default on if unset
  const watermarkUrl: string | null = cs.watermark_url || cs.logo_url || null;
  const watermarkOpacity: number = typeof cs.watermark_opacity === "number" ? cs.watermark_opacity : 0.08;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("workers")
        .select("id,first_name,last_name,employee_id,worker_type,job_title,id_number,national_id_type,address,city,phone,hire_date,id_expiry_date,passport_photo_url,id_photo_url")
        .eq("id", workerId)
        .single();
      setWorker(data);

      const scanUrl = `${BASE_URL}/verify/${workerId}`;
      const qr = await QRCode.toDataURL(scanUrl, {
        width: 80,
        margin: 1,
        color: { dark: NAVY_BASE, light: "#ffffff" },
      });
      setQrDataUrl(qr);
      setLoading(false);
    }
    load();
  }, [workerId]);

  // ── Front face (canvas) ────────────────────────────────────────────────
  function drawFront(ctx: CanvasRenderingContext2D, ox: number, oy: number, S: number, photo?: HTMLImageElement, logoImage?: HTMLImageElement, qrCanvas?: HTMLCanvasElement, watermarkImg?: HTMLImageElement) {
    const W = CARD_W * S, H = CARD_H * S;
    ctx.save();
    ctx.translate(ox, oy);

    // Background
    ctx.fillStyle = NAVY_BASE;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10 * S); ctx.fill();

    // Watermark — sits behind all content, clipped to card bounds
    if (watermarkEnabled && watermarkImg) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10 * S); ctx.clip();
      drawWatermark(ctx, W, H, S, watermarkImg, watermarkOpacity * 1.6, -0.14); // slightly stronger on dark navy, nudged left of QR
      ctx.restore();
    }

    // Header band
    ctx.fillStyle = NAVY_PANEL;
    ctx.fillRect(0, 0, W, 46 * S);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 46 * S); ctx.lineTo(W, 46 * S); ctx.stroke();

    // Amber accent strip under header
    ctx.fillStyle = AMBER;
    ctx.fillRect(0, 46 * S, W, 2.5 * S);

    // Logo circle
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(22 * S, 23 * S, 13 * S, 0, Math.PI * 2); ctx.fill();
    if (logoImage) {
      ctx.save();
      ctx.beginPath(); ctx.arc(22 * S, 23 * S, 12 * S, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logoImage, 10 * S, 11 * S, 24 * S, 24 * S);
      ctx.restore();
    } else {
      ctx.fillStyle = NAVY_BASE;
      ctx.font = `bold ${8 * S}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("MB", 22 * S, 23 * S);
    }

    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${10 * S}px sans-serif`;
    ctx.fillText(companyName.toUpperCase(), 40 * S, 20 * S);
    ctx.fillStyle = AMBER;
    ctx.font = `${6 * S}px sans-serif`;
    ctx.fillText("SITE IDENTIFICATION", 40 * S, 31 * S);

    // OFFICIAL badge
    ctx.fillStyle = AMBER_DIM;
    ctx.strokeStyle = "rgba(242,169,59,0.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(283 * S, 11 * S, 46 * S, 24 * S, 3 * S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = AMBER;
    ctx.font = `bold ${5.5 * S}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("OFFICIAL", 306 * S, 21 * S);
    ctx.fillText("ID", 306 * S, 29 * S);

    // Photo frame
    const px = 12 * S, py = 55 * S, pw = 68 * S, ph = 86 * S;
    ctx.fillStyle = "#1a3a5c";
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 5 * S); ctx.fill();
    ctx.strokeStyle = "rgba(242,169,59,0.4)"; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 5 * S); ctx.stroke();
    if (photo) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(px + S, py + S, pw - 2*S, ph - 2*S, 4*S); ctx.clip();
      ctx.drawImage(photo, px + S, py + S, pw - 2*S, ph - 2*S);
      ctx.restore();
    }

    // Worker info
    const ix = 90 * S;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${13 * S}px sans-serif`;
    ctx.fillText(`${worker!.first_name} ${worker!.last_name}`.toUpperCase(), ix, 68 * S);
    ctx.fillStyle = STEEL;
    ctx.font = `${7 * S}px sans-serif`;
    ctx.fillText(displayTitle(worker!).toUpperCase(), ix, 79 * S);

    const rows = [
      worker!.id_number ? [`${worker!.national_id_type || "ID"}`, worker!.id_number] : null,
      (worker!.address || worker!.city) ? ["Address", [worker!.address, worker!.city].filter(Boolean).join(", ")] : null,
      worker!.phone ? ["Phone", worker!.phone] : null,
    ].filter(Boolean) as [string, string][];

    rows.forEach(([label, value], i) => {
      const y = (90 + i * 12) * S;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `${5.5 * S}px sans-serif`;
      ctx.fillText(label.toUpperCase(), ix, y);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `${7 * S}px monospace`;
      ctx.fillText(String(value).slice(0, 26), ix + 42 * S, y);
    });

    // QR
    if (qrCanvas) {
      const qrSize = 52 * S;
      const qrX = W - qrSize - 10 * S;
      const qrY = 50 * S;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.roundRect(qrX - 2*S, qrY - 2*S, qrSize + 4*S, qrSize + 4*S, 3*S); ctx.fill();
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${5 * S}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("SCAN TO VERIFY", qrX + qrSize/2, qrY + qrSize + 8*S);
    }

    // Footer
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.roundRect(0, 170*S, W, 43*S, [0,0,10*S,10*S]); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 170*S); ctx.lineTo(W, 170*S); ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `${5.5 * S}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("ISSUED", 12*S, 181*S);
    ctx.fillStyle = AMBER;
    ctx.font = `bold ${7.5 * S}px sans-serif`;
    ctx.fillText(fmtDate(worker!.hire_date), 12*S, 193*S);

    ctx.fillStyle = isIdExpired(worker!) ? ALERT_RED : "rgba(255,255,255,0.35)";
    ctx.font = `${5.5 * S}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(isIdExpired(worker!) ? "EXPIRED" : "EXPIRES", (CARD_W-12)*S, 181*S);
    ctx.fillStyle = isIdExpired(worker!) ? ALERT_RED : AMBER;
    ctx.font = `bold ${7.5 * S}px sans-serif`;
    ctx.fillText(expiry(worker!), (CARD_W-12)*S, 193*S);

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = `${5.5 * S}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText((worker!.employee_id || worker!.id_number || "").toUpperCase(), W/2, 190*S);

    ctx.restore();
  }

  // ── Back face (canvas) ─────────────────────────────────────────────────
  function drawBack(ctx: CanvasRenderingContext2D, ox: number, oy: number, S: number, logoImage?: HTMLImageElement, barcodeCanvas?: HTMLCanvasElement, watermarkImg?: HTMLImageElement) {
    const W = CARD_W * S, H = CARD_H * S;
    ctx.save();
    ctx.translate(ox, oy);

    // Paper-toned background — distinct from front, reads as the "info/legal" side
    ctx.fillStyle = NAVY_TINT;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10 * S); ctx.fill();

    // Watermark — sits behind all content, clipped to card bounds
    if (watermarkEnabled && watermarkImg) {
      ctx.save();
      ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10 * S); ctx.clip();
      drawWatermark(ctx, W, H, S, watermarkImg, watermarkOpacity);
      ctx.restore();
    }

    // Top amber safety stripe
    ctx.fillStyle = AMBER;
    ctx.fillRect(0, 0, W, 16 * S);
    ctx.fillStyle = NAVY_BASE;
    ctx.font = `bold ${7.5 * S}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("IF FOUND, RETURN TO ISSUING COMPANY BELOW", W/2, 8 * S);

    // Logo + company block
    const cy = 30; // unscaled baseline y — scaled consistently at each use below
    ctx.fillStyle = NAVY_BASE;
    ctx.beginPath(); ctx.arc(22 * S, (cy + 8) * S, 11 * S, 0, Math.PI * 2); ctx.fill();
    if (logoImage) {
      ctx.save();
      ctx.beginPath(); ctx.arc(22 * S, (cy + 8) * S, 10 * S, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logoImage, 12 * S, (cy - 2) * S, 20 * S, 20 * S);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${7 * S}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("MB", 22 * S, (cy + 8) * S);
    }

    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK;
    ctx.font = `bold ${10 * S}px sans-serif`;
    ctx.fillText(companyName.toUpperCase(), 40 * S, (cy + 5) * S);
    ctx.fillStyle = "rgba(28,26,20,0.55)";
    ctx.font = `${6 * S}px sans-serif`;
    const tagline = companySettings?.tagline || "Building With Integrity";
    ctx.fillText(tagline, 40 * S, (cy + 14) * S);

    // Divider
    ctx.strokeStyle = NAVY_TINT_LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(12 * S, 58 * S); ctx.lineTo((CARD_W - 12) * S, 58 * S); ctx.stroke();

    // Contact block
    const contactLines = [
      [companySettings?.address_line1, companySettings?.address_line2].filter(Boolean).join(", "),
      [cs.parish, cs.country].filter(Boolean).join(", "),
      companySettings?.phone ? `Tel: ${companySettings.phone}` : null,
      companySettings?.email ? `Email: ${companySettings.email}` : null,
    ].filter(Boolean) as string[];

    let ly = 70 * S;
    ctx.font = `${6.5 * S}px sans-serif`;
    contactLines.forEach(line => {
      ctx.fillStyle = "rgba(28,26,20,0.7)";
      ctx.fillText(String(line), 12 * S, ly);
      ly += 9 * S;
    });

    // Authorization statement
    ly += 4 * S;
    ctx.fillStyle = "rgba(28,26,20,0.85)";
    ctx.font = `italic ${6.5 * S}px sans-serif`;
    const authText = `This card certifies the bearer is an authorized worker of ${companyName}. This card remains company property and must be surrendered upon termination.`;
    wrapText(ctx, authText, 12 * S, ly, (CARD_W - 24) * S, 8.5 * S);

    // Barcode-style strip + signature line, bottom area
    const stripY = 168 * S;
    ctx.strokeStyle = NAVY_TINT_LINE; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(12 * S, stripY); ctx.lineTo((CARD_W-12) * S, stripY); ctx.stroke();

    // Signature line (left)
    ctx.strokeStyle = "rgba(28,26,20,0.4)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(12*S, 195*S); ctx.lineTo(110*S, 195*S); ctx.stroke();
    ctx.fillStyle = "rgba(28,26,20,0.45)";
    ctx.font = `${5.5 * S}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("AUTHORIZED SIGNATURE", 12*S, 203*S);

    // Mini barcode/QR (right) — secondary verify stamp
    if (barcodeCanvas) {
      const bs = 34 * S;
      const bx = (CARD_W - 12) * S - bs;
      const by = 173 * S;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.roundRect(bx - 2*S, by - 2*S, bs + 4*S, bs + 4*S, 2*S); ctx.fill();
      ctx.drawImage(barcodeCanvas, bx, by, bs, bs);
    }

    ctx.restore();
  }

  // ── Print: both faces on one page with crop-mark cut guides ───────────
  async function handlePrint() {
    if (!worker) return;
    const photoUrl = worker.passport_photo_url || worker.id_photo_url || "";
    const scanUrl = `${BASE_URL}/verify/${workerId}`;

    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, scanUrl, { width: 72 * 3, margin: 1, color: { dark: NAVY_BASE, light: "#ffffff" } });
    const barcodeCanvas = document.createElement("canvas");
    await QRCode.toCanvas(barcodeCanvas, scanUrl, { width: 34 * 3, margin: 0, color: { dark: NAVY_BASE, light: "#ffffff" } });

    const S = 3;
    const gap = 18 * S; // space between front/back for cutting + crop marks
    const pad = 24 * S; // outer margin for crop marks
    const W = CARD_W * S + pad * 2;
    const H = CARD_H * S * 2 + gap + pad * 2;

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const logoUrl = companySettings?.logo_url;
    let photo: HTMLImageElement | undefined;
    let logo: HTMLImageElement | undefined;
    let watermarkImg: HTMLImageElement | undefined;
    if (photoUrl) { try { photo = await loadImage(photoUrl); } catch {} }
    if (logoUrl) { try { logo = await loadImage(logoUrl); } catch {} }
    if (watermarkEnabled && watermarkUrl) { try { watermarkImg = await loadImage(watermarkUrl); } catch {} }

    const frontX = pad, frontY = pad;
    const backX = pad, backY = pad + CARD_H * S + gap;

    drawFront(ctx, frontX, frontY, S, photo, logo, qrCanvas, watermarkImg);
    drawBack(ctx, backX, backY, S, logo, barcodeCanvas, watermarkImg);

    // Cut guides — dashed border around each card + corner crop marks
    drawCutGuide(ctx, frontX, frontY, CARD_W * S, CARD_H * S);
    drawCutGuide(ctx, backX, backY, CARD_W * S, CARD_H * S);

    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank", "width=600,height=900");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>ID Card — ${worker.first_name} ${worker.last_name}</title>
<style>*{margin:0;padding:0}body{background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
img{width:${W/S}px;height:${H/S}px}
@media print{body{background:#fff;margin:0}}</style>
</head><body><img src="${dataUrl}"/></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  if (loading) return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center">
        <div className="text-sm text-gray-500">Loading ID card...</div>
      </div>
    </div>
  );

  if (!worker) return null;
  const photoUrl = worker.passport_photo_url || worker.id_photo_url || "";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Worker ID Card</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Front preview */}
        <div style={{ width:CARD_W, height:CARD_H, borderRadius:10, overflow:"hidden", background:NAVY_BASE, color:"#fff", display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(0,0,0,0.4)", margin:"0 auto", position:"relative" }}>
          {watermarkEnabled && watermarkUrl && (
            <div style={{ position:"absolute", inset:0, backgroundImage:`url(${watermarkUrl})`, backgroundSize:"38% auto", backgroundPosition:"38% center", backgroundRepeat:"no-repeat", opacity:watermarkOpacity * 1.6, pointerEvents:"none" }} />
          )}
          <div style={{ background:NAVY_PANEL, borderBottom:`2.5px solid ${AMBER}`, padding:"8px 12px", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:26, height:26, borderRadius:"50%", overflow:"hidden", background:"#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {companySettings?.logo_url
                ? <img src={companySettings.logo_url} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:8, fontWeight:800, color:NAVY_BASE }}>MB</span>}
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#fff", textTransform:"uppercase", letterSpacing:0.5 }}>{companyName}</div>
              <div style={{ fontSize:7, color:AMBER, textTransform:"uppercase", letterSpacing:1 }}>Site Identification</div>
            </div>
            <div style={{ marginLeft:"auto", background:AMBER_DIM, border:`1px solid rgba(242,169,59,0.5)`, color:AMBER, fontSize:7, fontWeight:700, padding:"2px 5px", borderRadius:3, textAlign:"center", lineHeight:1.4 }}>OFFICIAL<br/>ID</div>
          </div>

          <div style={{ display:"flex", flex:1, padding:"8px 12px", gap:8, alignItems:"flex-start" }}>
            <div style={{ width:66, height:84, borderRadius:5, background:"#1a3a5c", border:`2px solid rgba(242,169,59,0.4)`, overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {photoUrl ? <img src={photoUrl} alt="passport" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ fontSize:24, opacity:0.3 }}>👤</span>}
            </div>
            <div style={{ flex:1, minWidth:0, paddingTop:2 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#fff", lineHeight:1.1, marginBottom:2 }}>{worker.first_name} {worker.last_name}</div>
              <div style={{ fontSize:8, color:STEEL, fontWeight:600, letterSpacing:1.5, textTransform:"uppercase", marginBottom:5 }}>{displayTitle(worker)}</div>
              {worker.id_number && <InfoRow label={worker.national_id_type || "ID"} value={worker.id_number} />}
              {(worker.address || worker.city) && <InfoRow label="Address" value={[worker.address, worker.city].filter(Boolean).join(", ")} />}
              {worker.phone && <InfoRow label="Phone" value={worker.phone} />}
            </div>
            <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              {qrDataUrl ? (
                <div style={{ background:"#fff", borderRadius:4, padding:2 }}>
                  <img src={qrDataUrl} alt="QR" style={{ width:54, height:54, display:"block" }} />
                </div>
              ) : <div style={{ width:58, height:58, background:"rgba(255,255,255,0.05)", borderRadius:4, border:"1px solid rgba(255,255,255,0.1)" }} />}
              <div style={{ fontSize:6, color:"rgba(255,255,255,0.4)", letterSpacing:0.5, textTransform:"uppercase" }}>Scan to verify</div>
            </div>
          </div>

          <div style={{ background:"rgba(0,0,0,0.25)", borderTop:"1px solid rgba(255,255,255,0.05)", padding:"5px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div><div style={{ fontSize:6, color:"rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:1 }}>Issued</div><div style={{ fontSize:8, color:AMBER, fontWeight:600 }}>{fmtDate(worker.hire_date)}</div></div>
            <div style={{ fontSize:6, color:"rgba(255,255,255,0.2)", letterSpacing:1 }}>{(worker.employee_id || worker.id_number || "").toUpperCase()}</div>
            <div><div style={{ fontSize:6, color: isIdExpired(worker) ? ALERT_RED : "rgba(255,255,255,0.35)", textTransform:"uppercase", letterSpacing:1 }}>{isIdExpired(worker) ? "Expired" : "Expires"}</div><div style={{ fontSize:8, color: isIdExpired(worker) ? ALERT_RED : AMBER, fontWeight:600 }}>{expiry(worker)}</div></div>
          </div>
        </div>

        {/* Back preview */}
        <div style={{ width:CARD_W, height:CARD_H, borderRadius:10, overflow:"hidden", background:NAVY_TINT, color:INK, display:"flex", flexDirection:"column", boxShadow:"0 4px 20px rgba(0,0,0,0.25)", margin:"14px auto 0", position:"relative" }}>
          {watermarkEnabled && watermarkUrl && (
            <div style={{ position:"absolute", inset:0, backgroundImage:`url(${watermarkUrl})`, backgroundSize:"38% auto", backgroundPosition:"center", backgroundRepeat:"no-repeat", opacity:watermarkOpacity, pointerEvents:"none" }} />
          )}
          <div style={{ background:AMBER, color:NAVY_BASE, fontSize:8, fontWeight:700, textAlign:"center", padding:"4px 8px", letterSpacing:0.5 }}>
            IF FOUND, RETURN TO ISSUING COMPANY BELOW
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px 4px" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", overflow:"hidden", background:NAVY_BASE, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {companySettings?.logo_url
                ? <img src={companySettings.logo_url} alt="logo" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:7, fontWeight:800, color:"#fff" }}>MB</span>}
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>{companyName}</div>
              <div style={{ fontSize:7, opacity:0.6 }}>{companySettings?.tagline || "Building With Integrity"}</div>
            </div>
          </div>
          <div style={{ borderTop:`1px solid ${NAVY_TINT_LINE}`, margin:"2px 12px" }} />
          <div style={{ padding:"6px 12px", fontSize:6.5, lineHeight:1.6, opacity:0.75 }}>
            {[companySettings?.address_line1, companySettings?.address_line2].filter(Boolean).join(", ") && (
              <div>{[companySettings?.address_line1, companySettings?.address_line2].filter(Boolean).join(", ")}</div>
            )}
            {[cs.parish, cs.country].filter(Boolean).join(", ") && (
              <div>{[cs.parish, cs.country].filter(Boolean).join(", ")}</div>
            )}
            {companySettings?.phone && <div>Tel: {companySettings.phone}</div>}
            {companySettings?.email && <div>Email: {companySettings.email}</div>}
          </div>
          <div style={{ padding:"0 12px", fontSize:6.5, fontStyle:"italic", opacity:0.85, lineHeight:1.5 }}>
            This card certifies the bearer is an authorized worker of {companyName}. This card remains company property and must be surrendered upon termination.
          </div>
          <div style={{ marginTop:"auto", display:"flex", alignItems:"flex-end", justifyContent:"space-between", padding:"8px 12px", borderTop:`1px solid ${NAVY_TINT_LINE}` }}>
            <div>
              <div style={{ width:90, borderBottom:"1px solid rgba(28,26,20,0.4)", height:14 }} />
              <div style={{ fontSize:5.5, opacity:0.5, letterSpacing:0.5, marginTop:2 }}>AUTHORIZED SIGNATURE</div>
            </div>
            {qrDataUrl && <img src={qrDataUrl} alt="verify" style={{ width:34, height:34, borderRadius:2 }} />}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-3">Prints front + back on one page with cut guides — trim along the dashed border, then glue back-to-back.</p>

        <div className="flex gap-3 mt-3">
          <button onClick={handlePrint} className="flex-1 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors">
            🖨️ Print ID Card
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, S: number, img?: HTMLImageElement, opacity = 0.08, xOffsetFrac = 0) {
  if (!img) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  const size = Math.max(w, h) * 0.38;
  ctx.translate(w / 2 + w * xOffsetFrac, h / 2);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawCutGuide(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const m = 8; // crop mark length
  ctx.save();
  // Dashed border directly around the card edge
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(x - 0.5, y - 0.5, w, h);
  ctx.setLineDash([]);

  // Corner crop marks (printer-register style) just outside the corners
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1.25;
  const drawMark = (cx: number, cy: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * m, cy);
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + dy * m);
    ctx.stroke();
  };
  drawMark(x, y, -1, -1);
  drawMark(x + w, y, 1, -1);
  drawMark(x, y + h, -1, 1);
  drawMark(x + w, y + h, 1, 1);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, curY);
      line = words[i] + " ";
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line.trim(), x, curY);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:"flex", gap:4, marginBottom:3 }}>
      <span style={{ fontSize:6.5, color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:1, minWidth:40 }}>{label}</span>
      <span style={{ fontSize:7, color:"rgba(255,255,255,0.8)", wordBreak:"break-word" }}>{value}</span>
    </div>
  );
}

export default WorkerIDCard;
