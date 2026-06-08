// src/pages/VerifyWorkerPage.tsx
// Opened when QR code is scanned — shows worker identity + logs access
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  worker_type: string;
  status: string;
  id_number?: string | null;
  employee_id?: string | null;
  passport_photo_url?: string | null;
  id_photo_url?: string | null;
  company_id: string;
}

function roleLabel(t?: string) {
  return (t || "worker").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function VerifyWorkerPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [logged, setLogged] = useState(false);
  const [scanTime] = useState(new Date());

  useEffect(() => {
    if (!workerId) return;
    async function load() {
      const { data } = await supabase
        .from("workers")
        .select("id,first_name,last_name,worker_type,status,id_number,employee_id,passport_photo_url,id_photo_url,company_id")
        .eq("id", workerId)
        .single();

      setWorker(data);
      setLoading(false);

      // Log the access
      if (data) {
        await supabase.from("access_logs").insert({
          worker_id: data.id,
          company_id: data.company_id,
          device_info: navigator.userAgent.slice(0, 200),
          action: "verify",
        });
        setLogged(true);
      }
    }
    load();
  }, [workerId]);

  const photoUrl = worker?.passport_photo_url || worker?.id_photo_url || "";
  const authorized = worker?.status === "active";

  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.loadingDot} />
        <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 16 }}>Verifying identity...</p>
      </div>
    </div>
  );

  if (!worker) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.statusBadge, background: "#7f1d1d", borderColor: "#ef4444" }}>
          <span style={styles.statusDot}>✗</span>
          <span style={styles.statusText}>UNKNOWN WORKER</span>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 16, textAlign: "center" }}>
          This ID card is not registered in the system.
        </p>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Company header */}
        <div style={styles.header}>
          <div style={styles.mbBadge}>MB</div>
          <div>
            <div style={styles.companyName}>Magnus Boys Construction</div>
            <div style={styles.companySubtitle}>Identity Verification</div>
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          ...styles.statusBadge,
          background: authorized ? "#052e16" : "#7f1d1d",
          borderColor: authorized ? "#22c55e" : "#ef4444",
        }}>
          <span style={{ ...styles.statusDot, color: authorized ? "#22c55e" : "#ef4444" }}>
            {authorized ? "✓" : "✗"}
          </span>
          <span style={{ ...styles.statusText, color: authorized ? "#22c55e" : "#ef4444" }}>
            {authorized ? "AUTHORIZED" : "ACCESS DENIED"}
          </span>
        </div>

        {/* Worker photo */}
        <div style={styles.photoFrame}>
          {photoUrl
            ? <img src={photoUrl} alt={worker.first_name} style={styles.photo} />
            : <span style={styles.photoPlaceholder}>👤</span>
          }
        </div>

        {/* Worker info */}
        <div style={styles.name}>{worker.first_name} {worker.last_name}</div>
        <div style={styles.role}>{roleLabel(worker.worker_type)}</div>

        {/* Details */}
        <div style={styles.detailsBox}>
          {worker.employee_id && (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>Employee ID</span>
              <span style={styles.detailValue}>{worker.employee_id}</span>
            </div>
          )}
          {worker.id_number && (
            <div style={styles.detailRow}>
              <span style={styles.detailLabel}>National ID</span>
              <span style={styles.detailValue}>{worker.id_number}</span>
            </div>
          )}
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Status</span>
            <span style={{ ...styles.detailValue, color: authorized ? "#22c55e" : "#ef4444", textTransform: "capitalize" }}>
              {worker.status}
            </span>
          </div>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Scanned at</span>
            <span style={styles.detailValue}>
              {scanTime.toLocaleTimeString()} — {scanTime.toLocaleDateString()}
            </span>
          </div>
        </div>

        {logged && (
          <div style={styles.loggedNote}>
            ✓ Access logged
          </div>
        )}

        <div style={styles.footer}>Magnus Boys Construction ERP</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0f172a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    fontFamily: "system-ui, sans-serif",
  },
  card: {
    background: "#1e293b",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    width: "100%",
  },
  mbBadge: {
    width: 36,
    height: 36,
    background: "#0A2342",
    border: "2px solid #3b82f6",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
    color: "#60a5fa",
  },
  companyName: { fontSize: 13, fontWeight: 700, color: "#f1f5f9" },
  companySubtitle: { fontSize: 11, color: "#64748b" },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    borderRadius: 8,
    border: "1px solid",
    marginBottom: 20,
    width: "100%",
    justifyContent: "center",
  },
  statusDot: { fontSize: 18, fontWeight: 700 },
  statusText: { fontSize: 15, fontWeight: 700, letterSpacing: 2 },
  photoFrame: {
    width: 100,
    height: 120,
    borderRadius: 10,
    overflow: "hidden",
    background: "#0f172a",
    border: "3px solid #3b82f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  photo: { width: "100%", height: "100%", objectFit: "cover" },
  photoPlaceholder: { fontSize: 40, opacity: 0.3 },
  name: { fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 4, textAlign: "center" },
  role: { fontSize: 12, color: "#60a5fa", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 },
  detailsBox: {
    width: "100%",
    background: "#0f172a",
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 16,
    border: "1px solid rgba(255,255,255,0.05)",
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  detailLabel: { fontSize: 11, color: "#64748b" },
  detailValue: { fontSize: 12, color: "#cbd5e1", fontWeight: 500 },
  loggedNote: {
    fontSize: 11,
    color: "#22c55e",
    marginBottom: 12,
  },
  footer: { fontSize: 10, color: "#334155", marginTop: 8 },
  loadingDot: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "3px solid #3b82f6",
    borderTopColor: "transparent",
    animation: "spin 1s linear infinite",
  },
};
