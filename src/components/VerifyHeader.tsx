// src/components/VerifyHeader.tsx — the company strip at the top of the public verify pages (/v/:code and /verify/:workerId).
// The company colour is used HERE only; the status band below it (valid green / expired red / inactive grey) is fixed.
// The logo is always shown whole: on a padded white plate, never cropped or stretched (contain, height auto), at most ~80% of the width.
import React, { useState } from "react";
import { headerColors, type MaybeTheme } from "../lib/idCardTheme";

interface Props {
  logoUrl?: string | null;
  companyName?: string | null;
  theme?: MaybeTheme | null;
}

export default function VerifyHeader({ logoUrl, companyName, theme }: Props) {
  const [failed, setFailed] = useState(false);
  const c = headerColors(theme);
  const name = (companyName || "").trim();
  const showLogo = !!logoUrl && !failed;
  if (!showLogo && !name) return null;
  return (
    <div style={{ background: c.bg, padding: "18px 16px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, borderBottom: `3px solid ${c.accent}` }}>
      {showLogo && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "10px 14px", maxWidth: "80%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
          <img src={logoUrl!} alt={name ? `${name} logo` : "Company logo"} onError={() => setFailed(true)}
            style={{ display: "block", maxWidth: "100%", width: "auto", height: "auto", maxHeight: 64, objectFit: "contain" }} />
        </div>
      )}
      {name && (
        <div style={{ color: c.fg, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", textAlign: "center", lineHeight: 1.3, maxWidth: "90%", overflowWrap: "anywhere" }}>{name}</div>
      )}
    </div>
  );
}
