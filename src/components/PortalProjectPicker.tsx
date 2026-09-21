// src/components/PortalProjectPicker.tsx
//
// Project picker for the client portal. Rendered by ClientPortalPage ONLY when the client has more than
// one project; a client with one project never sees it. One card per project (scrolls sideways on a phone)
// with the name, a status dot and label, and its own thin progress bar. The selected card is outlined.
import React from "react";
import type { PortalProject } from "../lib/portalProjects";

const STATUS_COLOR: Record<string, string> = { active: "#22c55e", planning: "#3b82f6", on_hold: "#f59e0b", completed: "#94a3b8", cancelled: "#ef4444" };

export default function PortalProjectPicker({ projects, selectedId, onSelect }: { projects: PortalProject[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 20px 0" }}>
      <div style={{ fontSize: 10, color: "#0284c7", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Your Projects</div>
      <div role="group" aria-label="Choose a project" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 2px 8px" }}>
        {projects.map((p) => {
          const sel = p.id === selectedId;
          const color = STATUS_COLOR[p.status] || "#3b82f6";
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={sel}
              onClick={() => onSelect(p.id)}
              style={{ flex: "0 0 auto", width: 210, textAlign: "left", padding: "12px 14px", borderRadius: 14, cursor: "pointer", border: "1px solid", borderColor: sel ? "#0891b2" : "#e2e8f0", background: sel ? "#ecfeff" : "#ffffff", boxShadow: sel ? "0 0 0 2px #0891b2" : "none", transition: "all 0.2s" }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#64748b", textTransform: "capitalize" }}>{p.status ? p.status.replace("_", " ") : "—"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${p.progress_pct}%`, background: "linear-gradient(90deg,#3b82f6,#06b6d4)", borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: sel ? "#0891b2" : "#64748b" }}>{p.progress_pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
