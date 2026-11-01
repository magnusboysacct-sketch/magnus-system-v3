// src/components/PlatformGates.tsx — maintenance mode and feature switches set in Magnus HQ.
//  * MaintenanceGate: while maintenance is on, only platform admins get past it (sign-in, HQ and /status stay open).
//  * FeatureGate: wraps a route; if the feature is switched off it says so (the data is kept, just hidden).

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Wrench, PowerOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { FEATURE_NAMES, usePlatformSettings, type FeatureKey } from "../lib/platformSettings";
import { usePlatformStatus } from "../hooks/usePlatformStatus";

const OPEN_DURING_MAINTENANCE = /^\/(hq|login|auth|reset-password|accept-invite|status)(\/|$)/;

function Screen({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-900 dark:bg-white/10 text-white flex items-center justify-center mb-4">{icon}</div>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h1>
        <div className="text-sm text-slate-500 mt-2 whitespace-pre-line">{children}</div>
      </div>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { maintenance } = usePlatformSettings();
  const { status } = usePlatformStatus();
  const loc = useLocation();
  if (!maintenance.on || OPEN_DURING_MAINTENANCE.test(loc.pathname) || status?.is_admin) return <>{children}</>;
  return (
    <Screen icon={<Wrench size={22} />} title="Magnus is being updated">
      {maintenance.message || "We're doing some work on Magnus Boy's System. Please try again shortly."}
      <div className="mt-6">
        <button className="text-xs underline" onClick={() => { void supabase.auth.signOut(); }}>Sign out</button>
      </div>
    </Screen>
  );
}

export function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { features, loaded } = usePlatformSettings();
  if (!loaded || features[feature]) return <>{children}</>;
  return (
    <Screen icon={<PowerOff size={22} />} title={`${FEATURE_NAMES[feature]} is turned off`}>
      This part of Magnus isn&apos;t available right now. Nothing has been deleted. Ask your company&apos;s director, or Magnus support, to turn it back on.
    </Screen>
  );
}
