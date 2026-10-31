// src/hooks/usePlatformStatus.ts — is the signed-in user a Magnus HQ platform admin?
// Non-admins only ever get { is_admin: false }; nothing hints that HQ exists.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchPlatformStatus, type PlatformStatus } from "../lib/hq/platformAdmin";

export function usePlatformStatus() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchPlatformStatus();
    setStatus(s);
    return s;
  }, []);

  useEffect(() => {
    let alive = true;
    fetchPlatformStatus().then((s) => { if (alive) setStatus(s); });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "MFA_CHALLENGE_VERIFIED") {
        // Defer: calling Supabase inside this callback can stall the auth client.
        setTimeout(() => {
          fetchPlatformStatus().then((s) => { if (alive) setStatus(s); });
        }, 0);
      }
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return { status, loading: status === null, refresh };
}
