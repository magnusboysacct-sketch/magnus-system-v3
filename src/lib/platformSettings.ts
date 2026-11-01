// src/lib/platformSettings.ts — platform-wide settings set in Magnus HQ (banner, maintenance mode, sign-ups)
// and the feature switches that apply to the signed-in company (or the platform switches when signed out).
// Loaded once, shared by every component, refreshed every 5 minutes and when the tab comes back.
// Before the HQ migrations (or on any error) everything is ON and nothing is shown, so the app keeps working.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type FeatureKey = "ocr" | "client_portal" | "worker_portal" | "payroll" | "public_receipts" | "ai";

export const FEATURE_NAMES: Record<FeatureKey, string> = {
  ocr: "Receipt scanning",
  client_portal: "Client & field-officer portals",
  worker_portal: "Worker portal",
  payroll: "Payroll",
  public_receipts: "Receipts by WhatsApp link",
  ai: "AI assistant",
};

export type Banner = { id: string; kind: "news" | "heads_up" | "urgent"; text: string; link: string | null; on: boolean } | null;

export type PlatformSnapshot = {
  banner: Banner;
  maintenance: { on: boolean; message: string };
  signupsOpen: boolean;
  features: Record<FeatureKey, boolean>;
  supportContact: { whatsapp: string; email: string };
  loaded: boolean;
};

const ALL_ON: Record<FeatureKey, boolean> = { ocr: true, client_portal: true, worker_portal: true, payroll: true, public_receipts: true, ai: true };

let snapshot: PlatformSnapshot = {
  banner: null, maintenance: { on: false, message: "" }, signupsOpen: true, features: ALL_ON,
  supportContact: { whatsapp: "", email: "" }, loaded: false,
};
const listeners = new Set<(s: PlatformSnapshot) => void>();
let inflight: Promise<PlatformSnapshot> | null = null;
let lastLoad = 0;

async function load(): Promise<PlatformSnapshot> {
  const [s, f] = await Promise.allSettled([supabase.rpc("get_platform_settings"), supabase.rpc("my_features")]);
  const settings = (s.status === "fulfilled" && !s.value.error ? s.value.data : null) as Record<string, unknown> | null;
  const feats = (f.status === "fulfilled" && !f.value.error ? f.value.data : null) as Partial<Record<FeatureKey, boolean>> | null;
  const m = (settings?.maintenance ?? {}) as { on?: boolean; message?: string };
  const b = settings?.banner as Banner | undefined;
  const sc = (settings?.support_contact ?? {}) as { whatsapp?: string; email?: string };
  snapshot = {
    banner: b && typeof b === "object" && b.on ? b : null,
    maintenance: { on: !!m.on, message: m.message ?? "" },
    signupsOpen: settings?.signups_open !== false,
    features: { ...ALL_ON, ...(feats ?? {}) },
    supportContact: { whatsapp: sc.whatsapp ?? "", email: sc.email ?? "" },
    loaded: true,
  };
  lastLoad = Date.now();
  listeners.forEach((l) => l(snapshot));
  return snapshot;
}

export function refreshPlatformSettings(): Promise<PlatformSnapshot> {
  inflight = inflight ?? load().finally(() => { inflight = null; });
  return inflight;
}

export function getPlatformSettings(): Promise<PlatformSnapshot> {
  return snapshot.loaded && Date.now() - lastLoad < 5 * 60_000 ? Promise.resolve(snapshot) : refreshPlatformSettings();
}

/** Throws a plain message when a feature is switched off (for AI and scanning calls). */
export async function requireFeature(key: FeatureKey): Promise<void> {
  const s = await getPlatformSettings().catch(() => snapshot);
  if (!s.features[key]) throw new Error(`${FEATURE_NAMES[key]} is turned off for your company right now.`);
}

let started = false;
function startAutoRefresh() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.setInterval(() => { void refreshPlatformSettings(); }, 5 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastLoad > 60_000) void refreshPlatformSettings();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => { void refreshPlatformSettings(); }, 0);
  });
}

export function usePlatformSettings(): PlatformSnapshot {
  const [s, setS] = useState<PlatformSnapshot>(snapshot);
  useEffect(() => {
    listeners.add(setS);
    startAutoRefresh();
    void getPlatformSettings();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
