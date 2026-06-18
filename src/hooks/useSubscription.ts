// src/hooks/useSubscription.ts
// Subscription and trial status checker for Magnus Boys Construction ERP
// Checks trial expiry and subscription status for the current company

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export type SubscriptionStatus = "trial" | "active" | "expired" | "cancelled";

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  trialExpiresAt: Date | null;
  subscriptionExpiresAt: Date | null;
  subscriptionPlan: string | null;
  daysLeftInTrial: number;
  isExpired: boolean;
  isActive: boolean;
  isTrial: boolean;
  showWarning: boolean; // true when <= 5 days left in trial
  loading: boolean;
}

const DEFAULT: SubscriptionInfo = {
  status: "trial",
  trialExpiresAt: null,
  subscriptionExpiresAt: null,
  subscriptionPlan: null,
  daysLeftInTrial: 14,
  isExpired: false,
  isActive: true,
  isTrial: true,
  showWarning: false,
  loading: true,
};

export function useSubscription(): SubscriptionInfo {
  const [info, setInfo] = useState<SubscriptionInfo>(DEFAULT);

  useEffect(() => {
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setInfo({ ...DEFAULT, loading: false }); return; }

        const { data: profile } = await supabase
          .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
        if (!profile?.company_id) { setInfo({ ...DEFAULT, loading: false }); return; }

        const { data: cs } = await supabase
          .from("company_settings")
          .select("trial_expires_at, subscription_status, subscription_expires_at, subscription_plan")
          .eq("company_id", profile.company_id)
          .maybeSingle();

        if (!cs) { setInfo({ ...DEFAULT, loading: false }); return; }

        const now = new Date();
        const trialExpiresAt = cs.trial_expires_at ? new Date(cs.trial_expires_at) : null;
        const subscriptionExpiresAt = cs.subscription_expires_at ? new Date(cs.subscription_expires_at) : null;
        const status: SubscriptionStatus = cs.subscription_status || "trial";

        // Calculate days left in trial
        const daysLeftInTrial = trialExpiresAt
          ? Math.max(0, Math.ceil((trialExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        // Is subscription active?
        const subscriptionActive = status === "active" &&
          (!subscriptionExpiresAt || subscriptionExpiresAt > now);

        // Is trial still valid?
        const trialActive = status === "trial" && trialExpiresAt !== null && trialExpiresAt > now;

        // Is access expired?
        const isExpired = !subscriptionActive && !trialActive;

        setInfo({
          status,
          trialExpiresAt,
          subscriptionExpiresAt,
          subscriptionPlan: cs.subscription_plan || null,
          daysLeftInTrial,
          isExpired,
          isActive: subscriptionActive || trialActive,
          isTrial: status === "trial",
          showWarning: status === "trial" && daysLeftInTrial <= 5,
          loading: false,
        });
      } catch {
        setInfo({ ...DEFAULT, loading: false });
      }
    }
    check();
  }, []);

  return info;
}