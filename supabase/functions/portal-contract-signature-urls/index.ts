// supabase/functions/portal-contract-signature-urls/index.ts
//
// Sign-on-read for contract signatures, for the client portal. Portal visitors have no Supabase session (they use the
// portal session-token system), so they cannot sign storage URLs themselves; this function does it with the service
// role AFTER applying the same checks as portal-sign-contract:
//   - the session must be valid (client_portal_sessions row, not expired) and the client must have the portal enabled;
//   - the contract must be THIS client's, have been sent (shared_at) and not be cancelled.
//
// client_contracts.contractor_signature_url / client_signature_url hold either
//   - a storage PATH in the private "private-files" bucket (new signatures): signed here for 1 hour, never stored; or
//   - a permanent public URL (older contracts): passed through unchanged.
//
// Body: { sessionToken, contractId }   Returns: { contractorSignatureUrl, clientSignatureUrl } (each may be null).
//
// The portal calls this with only the anon key (a JWT), so verify_jwt stays at its default (true), like portal-sign-contract.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  sessionToken?: string;
  contractId?: string;
};

const SIGNED_BUCKET = "private-files";
const SIGNATURE_URL_TTL_SECONDS = 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// null when there is nothing to show or signing fails; legacy URLs pass through unchanged.
async function resolveSignature(admin: any, stored: unknown): Promise<string | null> {
  if (typeof stored !== "string" || !stored.trim()) return null;
  const value = stored.trim();
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const { data, error } = await admin.storage.from(SIGNED_BUCKET).createSignedUrl(value, SIGNATURE_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (_err) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing Supabase secrets" }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch (_err) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    const sessionToken = String(body.sessionToken || "").trim();
    const contractId = String(body.contractId || "").trim();

    const sessionExpired = () => jsonResponse({ error: "Your session has expired. Please sign in again." }, 401);

    // 1. Session - the same rule the database functions and portal-sign-contract use.
    if (!sessionToken) return sessionExpired();
    const { data: sess, error: sessErr } = await supabaseAdmin
      .from("client_portal_sessions")
      .select("id, client_id")
      .eq("session_token", sessionToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessErr) {
      console.error("portal-contract-signature-urls session lookup failed:", sessErr.message);
      return jsonResponse({ error: "Could not verify your session. Please try again." }, 500);
    }
    if (!sess) return sessionExpired();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("id", sess.client_id)
      .eq("portal_enabled", true)
      .maybeSingle();
    if (!client) return sessionExpired();

    // 2. The contract: this client's, sent, not cancelled.
    if (!UUID_RE.test(contractId)) return jsonResponse({ error: "Contract not available" }, 403);
    const { data: contract } = await supabaseAdmin
      .from("client_contracts")
      .select("id, client_id, status, shared_at, contractor_signature_url, client_signature_url")
      .eq("id", contractId)
      .maybeSingle();
    if (!contract || contract.client_id !== client.id || !contract.shared_at || contract.status === "cancelled") {
      return jsonResponse({ error: "Contract not available" }, 403);
    }

    // 3. Sign (paths) or pass through (legacy URLs).
    const [contractorSignatureUrl, clientSignatureUrl] = await Promise.all([
      resolveSignature(supabaseAdmin, contract.contractor_signature_url),
      resolveSignature(supabaseAdmin, contract.client_signature_url),
    ]);

    return jsonResponse({ contractorSignatureUrl, clientSignatureUrl });
  } catch (err) {
    console.error("Unexpected error in portal-contract-signature-urls:", err);
    return jsonResponse(
      { error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
