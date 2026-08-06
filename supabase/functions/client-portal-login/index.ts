// supabase/functions/client-portal-login/index.ts
//
// Server-side replacement for the two client-facing entry points that used
// to query `clients` directly with the anon key and compare
// portal_password_hash in the browser:
//   - ClientLoginPage.tsx's email+password flow → lookup/setup/login,
//     identity anchored on the submitted email (re-derived server-side,
//     never trusting a client-supplied id — mirrors client-password-reset's
//     "confirm" action).
//   - ClientPortalPage.tsx's /portal/:token magic-link flow → the
//     magicLinkSetup/magicLinkLogin actions below, identity anchored on
//     portalToken instead of email. This is deliberate, not an
//     inconsistency: reusing the email-anchored actions here would let
//     someone who clicked their own magic link type a *different*
//     portal-enabled client's email during "setup" and hijack that other,
//     not-yet-activated account. portalToken is the actual capability this
//     entry point already depends on (equivalent sensitivity to a session
//     token), so it — not an arbitrary submitted email — is what has to
//     stay authoritative for who's being set up or logged in.
//
// Both families follow the same structure as client-password-reset/index.ts
// (service-role key, portal_password_hash never leaves this function).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  action?: "lookup" | "setup" | "login" | "magicLinkSetup" | "magicLinkLogin";
  email?: string;
  password?: string;
  portalToken?: string;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashPassword(p: string): Promise<string> {
  const data = new TextEncoder().encode(p + "magnus_portal_2026");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const body = (await req.json()) as RequestBody;
    const action = body.action;
    const isMagicLinkAction = action === "magicLinkSetup" || action === "magicLinkLogin";

    // Email is the identity anchor for lookup/setup/login; the magic-link
    // actions anchor on portalToken instead (magicLinkSetup still accepts
    // an email, but only as a value to store, never to locate the row —
    // see the header comment).
    const email = String(body.email || "").trim().toLowerCase();
    if (!isMagicLinkAction && (!email || !email.includes("@"))) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }

    const portalToken = String(body.portalToken || "").trim();
    if (isMagicLinkAction && !portalToken) {
      return jsonResponse({ error: "Missing portal link token" }, 400);
    }

    async function findClient() {
      const { data } = await supabaseAdmin
        .from("clients")
        .select("id, name, contact_name, portal_password_hash, portal_activated_at, portal_enabled")
        .or(`email.eq.${email},portal_email.eq.${email}`)
        .eq("portal_enabled", true)
        .maybeSingle();
      return data;
    }

    async function findClientByToken() {
      const { data } = await supabaseAdmin
        .from("clients")
        .select("id, name, contact_name, portal_password_hash, portal_activated_at, portal_enabled")
        .eq("portal_token", portalToken)
        .eq("portal_enabled", true)
        .maybeSingle();
      return data;
    }

    async function createSession(clientId: string) {
      const sessionToken = generateToken();
      const { error } = await supabaseAdmin.from("client_portal_sessions").insert({
        client_id: clientId,
        session_token: sessionToken,
        // Read from the request itself rather than trusting a
        // client-submitted field — matches how the browser can't be
        // trusted for portal_password_hash either.
        device_info: (req.headers.get("user-agent") || "").slice(0, 200),
      });
      if (error) return { error };
      return { sessionToken };
    }

    if (action === "lookup") {
      const client = await findClient();
      if (!client) {
        return jsonResponse({ error: "No account found with that email. Contact your contractor." }, 404);
      }
      // Only what the UI needs to decide setup-vs-login and greet the
      // client by name — never portal_password_hash, never the row id.
      return jsonResponse({
        mode: client.portal_activated_at ? "login" : "setup",
        displayName: client.contact_name || client.name,
      });
    }

    const password = String(body.password || "");

    if (action === "setup") {
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }
      const client = await findClient();
      if (!client) {
        return jsonResponse({ error: "No account found with that email." }, 404);
      }
      if (client.portal_activated_at) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const hash = await hashPassword(password);
      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update({
          portal_email: email,
          portal_password_hash: hash,
          portal_activated_at: new Date().toISOString(),
        })
        .eq("id", client.id);
      if (updateError) return jsonResponse({ error: updateError.message }, 500);

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error.message }, 500);
      return jsonResponse({ sessionToken: session.sessionToken });
    }

    if (action === "login") {
      if (!password) {
        return jsonResponse({ error: "Please enter your password." }, 400);
      }
      const client = await findClient();
      if (!client) {
        return jsonResponse({ error: "No account found with that email." }, 404);
      }

      const hash = await hashPassword(password);
      if (hash !== client.portal_password_hash) {
        return jsonResponse({ error: "Incorrect password. Please try again." }, 401);
      }

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error.message }, 500);
      return jsonResponse({ sessionToken: session.sessionToken });
    }

    if (action === "magicLinkSetup") {
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }
      const client = await findClientByToken();
      if (!client) {
        return jsonResponse({ error: "This portal link is invalid or has been disabled." }, 404);
      }
      if (client.portal_activated_at) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const hash = await hashPassword(password);
      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update({
          // Only when a value was actually submitted — the magic-link
          // setup form pre-fills this from the client's existing email,
          // but doesn't require re-typing it.
          ...(email ? { portal_email: email } : {}),
          portal_password_hash: hash,
          portal_activated_at: new Date().toISOString(),
        })
        .eq("id", client.id);
      if (updateError) return jsonResponse({ error: updateError.message }, 500);

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error.message }, 500);
      return jsonResponse({ sessionToken: session.sessionToken });
    }

    if (action === "magicLinkLogin") {
      if (!password) {
        return jsonResponse({ error: "Please enter your password." }, 400);
      }
      const client = await findClientByToken();
      if (!client) {
        return jsonResponse({ error: "This portal link is invalid or has been disabled." }, 404);
      }

      const hash = await hashPassword(password);
      if (hash !== client.portal_password_hash) {
        return jsonResponse({ error: "Incorrect password. Please try again." }, 401);
      }

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error.message }, 500);
      return jsonResponse({ sessionToken: session.sessionToken });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("Unexpected error in client-portal-login:", err);
    return jsonResponse(
      { error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
