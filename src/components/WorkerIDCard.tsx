// src/components/WorkerIDCard.tsx — Clean rebuild, navy blue design
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  employee_id?: string | null;
  worker_type?: string | null;
  id_number?: string | null;
  national_id_type?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  passport_photo_url?: string | null;
  id_photo_url?: string | null;
}

interface Props {
  workerId: string;
  companyName?: string;
  onClose: () => void;
}

function fmtDate(d?: string | null) {
  return (d ? new Date(d) : new Date()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function expiry(d?: string | null) {
  const dt = d ? new Date(d) : new Date();
  dt.setFullYear(dt.getFullYear() + 2);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function roleLabel(t?: string | null) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function WorkerIDCard({ workerId, companyName = "Magnus Boys Construction", onClose }: Props) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);

  // Always fetch fresh from DB when card opens
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("workers")
        .select("id,first_name,last_name,employee_id,worker_type,id_number,national_id_type,address,city,phone,hire_date,passport_photo_url,id_photo_url")
        .eq("id", workerId)
        .single();
      setWorker(data);
      setLoading(false);
    }
    load();
  }, [workerId]);

  function handlePrint() {
    if (!worker) return;
    const photoUrl = worker.passport_photo_url || worker.id_photo_url || "";

    const canvas = document.createElement("canvas");
    const S = 3;
    canvas.width = 338 * S;
    canvas.height = 213 * S;
    const ctx = canvas.getContext("2d")!;

    const drawCard = (photo?: HTMLImageElement) => {
      const W = canvas.width, H = canvas.height;

      // Background
      ctx.fillStyle = "#0A2342";
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 12 * S);
      ctx.fill();

      // Header bar
      ctx.fillStyle = "#0d2d54";
      ctx.fillRect(0, 0, W, 46 * S);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 46 * S);
      ctx.lineTo(W, 46 * S);
      ctx.stroke();

      // MB circle
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(22 * S, 23 * S, 13 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0A2342";
      ctx.font = `bold ${8 * S}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("MB", 22 * S, 23 * S);

      // Company name
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${10 * S}px sans-serif`;
      ctx.fillText(companyName.toUpperCase(), 40 * S, 19 * S);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `${6 * S}px sans-serif`;
      ctx.fillText("EMPLOYEE IDENTIFICATION", 40 * S, 30 * S);

      // OFFICIAL badge
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(285 * S, 12 * S, 44 * S, 22 * S, 3 * S);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${5.5 * S}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("OFFICIAL", 307 * S, 20 * S);
      ctx.fillText("ID", 307 * S, 28 * S);

      // Photo frame
      const px = 12 * S, py = 56 * S, pw = 70 * S, ph = 88 * S;
      ctx.fillStyle = "#1a3a5c";
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 5 * S);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 5 * S);
      ctx.stroke();

      if (photo) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(px + S, py + S, pw - 2 * S, ph - 2 * S, 4 * S);
        ctx.clip();
        ctx.drawImage(photo, px + S, py + S, pw - 2 * S, ph - 2 * S);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = `${24 * S}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👤", px + pw / 2, py + ph / 2);
      }

      // Worker info
      const ix = 92 * S;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${14 * S}px sans-serif`;
      ctx.fillText(`${worker!.first_name} ${worker!.last_name}`.toUpperCase(), ix, 72 * S);

      ctx.fillStyle = "#64B5F6";
      ctx.font = `${7.5 * S}px sans-serif`;
      ctx.fillText(roleLabel(worker!.worker_type).toUpperCase(), ix, 84 * S);

      const rows = [
        worker!.id_number ? [`${worker!.national_id_type || "ID"}`, worker!.id_number] : null,
        (worker!.address || worker!.city) ? ["Address", [worker!.address, worker!.city].filter(Boolean).join(", ")] : null,
        worker!.phone ? ["Phone", worker!.phone] : null,
      ].filter(Boolean) as [string, string][];

      rows.forEach(([label, value], i) => {
        const y = (95 + i * 13) * S;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = `${6 * S}px sans-serif`;
        ctx.fillText(label.toUpperCase(), ix, y);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `${7.5 * S}px sans-serif`;
        ctx.fillText(String(value).slice(0, 28), ix + 44 * S, y);
      });

      // Footer
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.roundRect(0, 170 * S, W, 43 * S, [0, 0, 12 * S, 12 * S]);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 170 * S);
      ctx.lineTo(W, 170 * S);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${5.5 * S}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("ISSUED", 12 * S, 180 * S);
      ctx.fillStyle = "#64B5F6";
      ctx.font = `bold ${7.5 * S}px sans-serif`;
      ctx.fillText(fmtDate(worker!.hire_date), 12 * S, 192 * S);

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${5.5 * S}px sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText("EXPIRES", (338 - 12) * S, 180 * S);
      ctx.fillStyle = "#64B5F6";
      ctx.font = `bold ${7.5 * S}px sans-serif`;
      ctx.fillText(expiry(worker!.hire_date), (338 - 12) * S, 192 * S);

      // Employee ID center
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = `${6 * S}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText((worker!.employee_id || worker!.id_number || "").toUpperCase(), W / 2, 190 * S);

      // Print
      const img = canvas.toDataURL("image/png");
      const win = window.open("", "_blank", "width=500,height=400");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>ID Card</title>
<style>*{margin:0;padding:0}body{background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh}
img{width:338px;height:213px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3)}
@media print{body{margin:0;background:#f5f5f5}}</style>
</head><body><img src="${img}"/></body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 600);
    };

    if (photoUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => drawCard(img);
      img.onerror = () => drawCard();
      img.src = photoUrl;
    } else {
      drawCard();
    }
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">Worker ID Card</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {/* Card Preview */}
        <div style={{
          width: 338, height: 213, borderRadius: 12, overflow: "hidden",
          background: "#0A2342", color: "#fff", display: "flex", flexDirection: "column",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)", margin: "0 auto",
        }}>
          {/* Header */}
          <div style={{ background: "#0d2d54", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, background: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#0A2342", flexShrink: 0 }}>MB</div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{companyName}</div>
              <div style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1 }}>Employee Identification</div>
            </div>
            <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 7, fontWeight: 700, padding: "2px 5px", borderRadius: 3, textAlign: "center", lineHeight: 1.4 }}>OFFICIAL<br/>ID</div>
          </div>

          {/* Body */}
          <div style={{ display: "flex", flex: 1, padding: "8px 12px", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 70, height: 88, borderRadius: 5, background: "#1a3a5c", border: "2px solid rgba(255,255,255,0.25)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {photoUrl
                ? <img src={photoUrl} alt="passport" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ fontSize: 28, opacity: 0.3 }}>👤</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.1, marginBottom: 2 }}>{worker.first_name} {worker.last_name}</div>
              <div style={{ fontSize: 8, color: "#64B5F6", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{roleLabel(worker.worker_type)}</div>
              {worker.id_number && <InfoRow label={worker.national_id_type || "ID"} value={worker.id_number} />}
              {(worker.address || worker.city) && <InfoRow label="Address" value={[worker.address, worker.city].filter(Boolean).join(", ")} />}
              {worker.phone && <InfoRow label="Phone" value={worker.phone} />}
            </div>
          </div>

          {/* Footer */}
          <div style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid rgba(255,255,255,0.05)", padding: "5px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 6, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>Issued</div><div style={{ fontSize: 8, color: "#64B5F6", fontWeight: 600 }}>{fmtDate(worker.hire_date)}</div></div>
            <div style={{ fontSize: 6, color: "rgba(255,255,255,0.25)", letterSpacing: 1 }}>{(worker.employee_id || worker.id_number || "").toUpperCase()}</div>
            <div><div style={{ fontSize: 6, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>Expires</div><div style={{ fontSize: 8, color: "#64B5F6", fontWeight: 600 }}>{expiry(worker.hire_date)}</div></div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 3 }}>
      <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1, minWidth: 44 }}>{label}</span>
      <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.8)", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export default WorkerIDCard;
