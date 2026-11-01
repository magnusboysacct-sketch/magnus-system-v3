// src/hooks/useCompanyStatus.ts — is the signed-in user's company active, paused (read-only) or closed?
// Set by Magnus HQ. Before migration 20260958 (or on any error) everything reads as "active".

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export type CompanyStatus = {
  status: "active" | "paused" | "closed";
  reason?: string | null;
  purge_after?: string | null;
  /** Unpaid after the grace days: read-only until a payment is confirmed. */
  billing_locked?: boolean;
};

const ACTIVE: CompanyStatus = { status: "active" };

export async function fetchCompanyStatus(): Promise<CompanyStatus> {
  try {
    const { data, error } = await supabase.rpc("my_company_status");
    if (error || !data || typeof data !== "object") return ACTIVE;
    return data as CompanyStatus;
  } catch {
    return ACTIVE;
  }
}

export function useCompanyStatus() {
  const [status, setStatus] = useState<CompanyStatus>(ACTIVE);
  useEffect(() => {
    let alive = true;
    fetchCompanyStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);
  return status;
}
