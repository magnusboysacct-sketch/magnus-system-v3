// src/components/IdCardLogo.tsx — the logo on the on-screen Worker / Staff ID card previews. Layout rules live in lib/idCardLogo.ts.
import React from "react";
import { ID_LOGO, PLATE_IMG_MAX_W, PLATE_IMG_MAX_H } from "../lib/idCardLogo";

// Front (navy): white rounded plate with a thin gold border; the logo inside at its natural aspect ratio (contain), never cropped or stretched.
export function FrontLogoPlate({ logoUrl, initial, gold, navy }: { logoUrl?: string | null; initial: string; gold: string; navy: string }) {
  const border = `${ID_LOGO.plateBorder}px solid ${gold}`;
  return (
    <div style={{ height: ID_LOGO.plateMaxH, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {logoUrl ? (
        <div style={{ background: "#fff", border, borderRadius: ID_LOGO.plateRadius, padding: ID_LOGO.platePad, lineHeight: 0 }}>
          <img src={logoUrl} alt="logo" style={{ display: "block", width: "auto", height: "auto", maxWidth: PLATE_IMG_MAX_W, maxHeight: PLATE_IMG_MAX_H, objectFit: "contain" }} />
        </div>
      ) : (
        <div style={{ boxSizing: "border-box", width: ID_LOGO.plateMaxH, height: ID_LOGO.plateMaxH, background: "#fff", border, borderRadius: ID_LOGO.plateRadius, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: navy }}>{initial}</span>
        </div>
      )}
    </div>
  );
}

// Back (light): no plate — the logo at its natural aspect ratio, centred, no taller than the old small circle and no wider than half the card.
export function BackLogoMark({ logoUrl, initial, navy, initialSize }: { logoUrl?: string | null; initial: string; navy: string; initialSize: number }) {
  return (
    <div style={{ height: ID_LOGO.backMaxH, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {logoUrl ? (
        <img src={logoUrl} alt="logo" style={{ display: "block", width: "auto", height: "auto", maxWidth: ID_LOGO.backMaxW, maxHeight: ID_LOGO.backMaxH, objectFit: "contain" }} />
      ) : (
        <div style={{ boxSizing: "border-box", width: ID_LOGO.backMaxH, height: ID_LOGO.backMaxH, borderRadius: 6, background: navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: initialSize, fontWeight: 800, color: "#fff" }}>{initial}</span>
        </div>
      )}
    </div>
  );
}

