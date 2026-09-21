// supabase/functions/portal-sign-contract/index.ts
//
// Server-side replacement for the client portal's contract signing, which used to run in
// the browser: upload a PNG to storage, then UPDATE client_contracts by id only. That had
// no ownership check, the "contractor must sign first" rule lived only in the UI, and the
// stored IP was the literal word "portal".
//
// Everything is now decided here, with the service role:
//   - the session must be valid (client_portal_sessions row, not expired, portal enabled);
//   - the contract must be THIS client's, have been sent (shared_at), be contractor-signed
//     and not yet client-signed;
//   - the signature must be a small, real PNG;
//   - the file is uploaded FIRST; if that fails nothing is marked signed;
//   - the contract is updated with a guard (client_signed_at IS NULL, exactly one row) and
//     the client's real IP is recorded;
//   - a contract_sign activity row is written (best effort - logging never fails a signing).
//
// The portal calls this with only the anon key (a JWT), so verify_jwt can stay at its default
// (true), exactly like client-portal-login and client-password-reset.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  sessionToken?: string;
  contractId?: string;
  signaturePng?: string;
};

const MAX_SIGNATURE_BYTES = 500 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNG_DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Returns the decoded PNG bytes, or a plain error message.
function parseSignature(dataUrl: string): { bytes: Uint8Array } | { error: string } {
  const m = PNG_DATA_URL_RE.exec(dataUrl);
  if (!m) return { error: "Signature must be a PNG image" };
  const b64 = m[1].replace(/\s+/g, "");
  if (!b64) return { error: "Signature is empty" };
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  if (Math.floor((b64.length * 3) / 4) - padding > MAX_SIGNATURE_BYTES) {
    return { error: "Signature image is too large (500 KB maximum)" };
  }
  let bin: string;
  try {
    bin = atob(b64);
  } catch (_err) {
    return { error: "Signature must be a PNG image" };
  }
  if (bin.length === 0) return { error: "Signature is empty" };
  if (bin.length > MAX_SIGNATURE_BYTES) return { error: "Signature image is too large (500 KB maximum)" };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
    return { error: "Signature must be a PNG image" };
  }
  return { bytes };
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
    const signaturePng = String(body.signaturePng || "");

    const sessionExpired = () => jsonResponse({ error: "Your session has expired. Please sign in again." }, 401);

    // 1. Session - the same rule the database functions use.
    if (!sessionToken) return sessionExpired();
    const { data: sess, error: sessErr } = await supabaseAdmin
      .from("client_portal_sessions")
      .select("id, client_id")
      .eq("session_token", sessionToken)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (sessErr) {
      console.error("portal-sign-contract session lookup failed:", sessErr.message);
      return jsonResponse({ error: "Could not verify your session. Please try again." }, 500);
    }
    if (!sess) return sessionExpired();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, company_id")
      .eq("id", sess.client_id)
      .eq("portal_enabled", true)
      .maybeSingle();
    if (!client) return sessionExpired();

    // 2. The contract: this client's, sent, contractor-signed, not yet client-signed.
    if (!UUID_RE.test(contractId)) return jsonResponse({ error: "Contract not available" }, 403);
    const { data: contract } = await supabaseAdmin
      .from("client_contracts")
      .select("id, client_id, project_id, status, shared_at, contractor_signed_at, client_signed_at")
      .eq("id", contractId)
      .maybeSingle();
    if (!contract || contract.client_id !== client.id || !contract.shared_at || contract.status === "cancelled") {
      return jsonResponse({ error: "Contract not available" }, 403);
    }
    if (!contract.contractor_signed_at) {
      return jsonResponse({ error: "The contractor has not signed yet" }, 400);
    }
    if (contract.client_signed_at) {
      return jsonResponse({ error: "Already signed" }, 409);
    }

    // 3. The signature: a real, small PNG.
    const parsed = parseSignature(signaturePng);
    if ("error" in parsed) return jsonResponse({ error: parsed.error }, 400);

    // 4. Upload first. If this fails, the contract is NOT marked signed.
    const path = `client-signatures/${contractId}_${Date.now()}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("project-files")
      .upload(path, parsed.bytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      console.error("portal-sign-contract upload failed:", uploadError.message);
      return jsonResponse({ error: "Could not save the signature. Please try again." }, 500);
    }
    const signatureUrl = supabaseAdmin.storage.from("project-files").getPublicUrl(path).data.publicUrl;

    // 5. Mark signed - guarded, and exactly one row must change.
    const ip =
      req.headers.get("cf-connecting-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      "unknown";
    const signedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("client_contracts")
      .update({
        client_signed_at: signedAt,
        client_signature_url: signatureUrl,
        client_signed_ip: ip,
      })
      .eq("id", contractId)
      .eq("client_id", client.id)
      .is("client_signed_at", null)
      .select("id");

    if (updateError || !updated || updated.length !== 1) {
      // Best effort: don't leave an orphaned signature file behind.
      try {
        await supabaseAdmin.storage.from("project-files").remove([path]);
      } catch (_err) {
        // ignore
      }
      if (updateError) {
        console.error("portal-sign-contract update failed:", updateError.message);
        return jsonResponse({ error: "Could not record the signature. Please try again." }, 500);
      }
      return jsonResponse({ error: "Already signed" }, 409);
    }

    // 6. Activity log - best effort, never fails the signing.
    const logRun = (async () => {
      try {
        await supabaseAdmin.from("client_portal_activity").insert({
          company_id: client.company_id ?? null,
          client_id: client.id,
          project_id: contract.project_id ?? null,
          session_id: String(sess.id),
          event_type: "contract_sign",
          entity_type: "contract",
          entity_id: contractId,
          ip_address: ip,
          user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
          metadata: {},
        });
      } catch (_err) {
        // logging must never affect the signing
      }
    })();
    try {
      (globalThis as any).EdgeRuntime?.waitUntil?.(logRun);
    } catch (_err) {
      // ignore
    }

    return jsonResponse({ ok: true, client_signed_at: signedAt, client_signature_url: signatureUrl });
  } catch (err) {
    console.error("Unexpected error in portal-sign-contract:", err);
    return jsonResponse(
      { error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
