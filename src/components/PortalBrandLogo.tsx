// src/components/PortalBrandLogo.tsx
//
// The company logo on the client-facing sign-in screens (client login, portal setup/login/invite). It adapts to the logo's own shape:
// natural proportions (width/height auto), capped in height and width, object-fit contain, no border-radius, no circle or coloured box
// behind it, centred. On a narrow phone the width cap shrinks to the screen. With no logo, a company-initial tile is shown instead.
import React from "react";

export default function PortalBrandLogo({
  logoUrl,
  companyName,
  maxHeight = 56,
  maxWidth = 220,
  marginBottom = 10,
}: {
  logoUrl?: string | null;
  companyName?: string | null;
  maxHeight?: number;
  maxWidth?: number;
  marginBottom?: number;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={companyName || "Company logo"}
        style={{
          display: "block",
          width: "auto",
          height: "auto",
          maxHeight,
          maxWidth: `min(${maxWidth}px, 100%)`,
          objectFit: "contain",
          margin: `0 auto ${marginBottom}px`,
        }}
      />
    );
  }
  const initial = (String(companyName || "").trim() || "M")[0].toUpperCase();
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        background: "linear-gradient(135deg,#0891b2,#06b6d4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: 18,
        margin: `0 auto ${marginBottom}px`,
        color: "#fff",
      }}
    >
      {initial}
    </div>
  );
}
