// supabase/functions/client-portal-login/index.ts
//
// Server-side replacement for ClientLoginPage.tsx's old direct anon-key
// queries against `clients`. Follows the same structure as
// client-password-reset/index.ts (service-role key, never returns
// portal_password_hash to the caller) — that function already established
// the correct pattern for this table; this one applies it to lookup/setup/
// login instead of the reset flow.
//
// Every action re-derives the client record from the submitted email via
// the service-role key rather than trusting a client-supplied id, mirroring
// client-password-reset's "confirm" action.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  action?: "lookup" | "setup" | "login";
  email?: string;
  password?: string;
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
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required" }, 400);
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

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("Unexpected error in client-portal-login:", err);
    return jsonResponse(
      { error: "Unexpected server error", details: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
