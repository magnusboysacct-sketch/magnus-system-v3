// src/lib/portalActivity.ts
//
// Fire-and-forget client portal activity logging. Calls the session-validated
// SECURITY DEFINER RPC public.log_portal_event, which derives client/company/IP
// server-side and silently ignores invalid input. Callers must NOT await this:
// it returns void, never throws, and a failure here can never affect the portal.
import { supabase } from "./supabase";

export function logPortalEvent(
  sessionToken: string | null | undefined,
  eventType: string,
  opts?: {
    entityType?: string;
    entityId?: string;
    projectId?: string | null;
    metadata?: Record<string, unknown>;
  }
): void {
  try {
    if (!sessionToken) return;
    // The RPC builder is lazy — .then() is what actually sends the request.
    supabase
      .rpc("log_portal_event", {
        p_session_token: sessionToken,
        p_event_type: eventType,
        p_entity_type: opts?.entityType ?? null,
        p_entity_id: opts?.entityId ?? null,
        p_project_id: opts?.projectId ?? null,
        p_metadata: opts?.metadata ?? {},
      })
      .then(
        () => {},
        () => {}
      );
  } catch {
    // logging must never affect the portal
  }
}