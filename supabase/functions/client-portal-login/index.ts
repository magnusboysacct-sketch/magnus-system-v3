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
// Contact logins (one field officer, only their assigned projects):
//   - contactLinkSetup/contactLinkLogin anchor on the contact's own invite
//     token (client_contact_portal_access.portal_token), for the same reason
//     as the magic-link actions above.
//   - lookup/setup/login also accept a contact's email, but ONLY when no
//     client login uses that email: the client (manager) login always wins.
//   - A contact session carries contact_id; the database functions use it to
//     show only that contact's projects (see migration 20260936000000).
//
// Passwords use _shared/portalPassword.ts (PBKDF2, per-user salt). Old
// shared-salt hashes still work and are upgraded on the next good login.
// portal_password_hash / password_hash never leave this function.
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateToken, hashPassword, normalizeEmail, verifyPassword } from "../_shared/portalPassword.ts";
import { findPortalClientByEmail } from "../_shared/portalClientLookup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "lookup" | "setup" | "login"
  | "magicLinkSetup" | "magicLinkLogin"
  | "contactLinkSetup" | "contactLinkLogin";

type RequestBody = {
  action?: Action;
  email?: string;
  password?: string;
  portalToken?: string;
};

type ClientRow = {
  id: string;
  name: string | null;
  contact_name: string | null;
  portal_password_hash: string | null;
  portal_activated_at: string | null;
  portal_enabled: boolean | null;
};

type ContactLogin = {
  contactId: string;
  clientId: string;
  name: string | null;
  passwordHash: string | null;
  activatedAt: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    const action = body.action;
    const isTokenAction =
      action === "magicLinkSetup" || action === "magicLinkLogin" ||
      action === "contactLinkSetup" || action === "contactLinkLogin";

    // Email is the identity anchor for lookup/setup/login; the link actions
    // anchor on portalToken instead (the setup actions still accept an
    // email, but only as a value to store, never to locate the row — see the
    // header comment). normalizeEmail() also keeps the value safe to place
    // inside the PostgREST filters below: a raw value containing commas or
    // brackets could otherwise add conditions to them.
    const rawEmail = String(body.email || "").trim();
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    if (!isTokenAction && !email) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }
    if (isTokenAction && rawEmail && !email) {
      return jsonResponse({ error: "Please enter a valid email address." }, 400);
    }

    const portalToken = String(body.portalToken || "").trim();
    if (isTokenAction && !portalToken) {
      return jsonResponse({ error: "Missing portal link token" }, 400);
    }

    const CLIENT_COLS = "id, name, contact_name, portal_password_hash, portal_activated_at, portal_enabled";

    async function findClient(): Promise<ClientRow | null> {
      if (!email) return null;
      // a client with a portal_email is found only by it; the contact email counts only while there is none (_shared/portalClientLookup.ts)
      return await findPortalClientByEmail<ClientRow>(supabaseAdmin, email, CLIENT_COLS);
    }

    async function findClientByToken(): Promise<ClientRow | null> {
      const { data } = await supabaseAdmin
        .from("clients")
        .select(CLIENT_COLS)
        .eq("portal_token", portalToken)
        .eq("portal_enabled", true)
        .maybeSingle();
      return (data as ClientRow) ?? null;
    }

    // A contact login, but only while it is usable: enabled, not revoked, the
    // contact still exists, and the contact's CURRENT client has the portal on.
    // The session is always bound to that current client.
    async function findContactLogin(by: "email" | "token"): Promise<ContactLogin | null> {
      let q = supabaseAdmin
        .from("client_contact_portal_access")
        .select("contact_id, password_hash, activated_at, enabled, revoked_at")
        .eq("enabled", true)
        .is("revoked_at", null);
      if (by === "email") {
        if (!email) return null;
        q = q.eq("portal_email", email);
      } else {
        q = q.eq("portal_token", portalToken);
      }
      const { data: access } = await q.maybeSingle();
      if (!access) return null;

      const { data: contact } = await supabaseAdmin
        .from("client_contacts")
        .select("id, name, client_id")
        .eq("id", access.contact_id)
        .maybeSingle();
      if (!contact) return null;

      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("id", contact.client_id)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (!client) return null;

      return {
        contactId: contact.id,
        clientId: client.id,
        name: contact.name,
        passwordHash: access.password_hash,
        activatedAt: access.activated_at,
      };
    }

    // Best-effort audit trail (client_portal_activity). Fire-and-forget: the
    // promise below never rejects, and EdgeRuntime.waitUntil (when the runtime
    // provides it) keeps it alive after the response is sent, so logging never
    // delays, blocks, or alters a login response. `action` is read from the
    // enclosing request scope.
    function logPortalActivity(
      clientId: string,
      eventType: string,
      sessionId: string | null = null,
      contactId: string | null = null,
    ) {
      const run = (async () => {
        try {
          const { data: c } = await supabaseAdmin
            .from("clients")
            .select("company_id")
            .eq("id", clientId)
            .maybeSingle();
          const ip =
            req.headers.get("cf-connecting-ip") ||
            (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
            null;
          await supabaseAdmin.from("client_portal_activity").insert({
            company_id: c?.company_id ?? null,
            client_id: clientId,
            ...(contactId ? { contact_id: contactId } : {}),
            session_id: sessionId ? String(sessionId) : null,
            event_type: eventType,
            ip_address: ip,
            user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
            metadata: { action },
          });
        } catch (_err) {
          // logging must never affect the login flow
        }
      })();
      try {
        (globalThis as any).EdgeRuntime?.waitUntil?.(run);
      } catch (_err) {
        // ignore
      }
    }

    async function createSession(clientId: string, contactId: string | null = null) {
      const sessionToken = generateToken();
      const { data: sessionRows, error } = await supabaseAdmin.from("client_portal_sessions").insert({
        client_id: clientId,
        // Only contact logins set this; the manager login's rows stay exactly as before.
        ...(contactId ? { contact_id: contactId } : {}),
        session_token: sessionToken,
        // Read from the request itself rather than trusting a
        // client-submitted field — matches how the browser can't be
        // trusted for portal_password_hash either.
        device_info: (req.headers.get("user-agent") || "").slice(0, 200),
      }).select("id");
      if (error) return { error };
      logPortalActivity(clientId, "login", sessionRows?.[0]?.id ?? null, contactId);
      return { sessionToken };
    }

    function sessionResponse(sessionToken: string, contactId: string | null = null) {
      return jsonResponse(
        contactId ? { sessionToken, kind: "contact", contactId } : { sessionToken, kind: "manager" },
      );
    }

    const password = String(body.password || "");

    // ── Shared steps ──────────────────────────────────────────────────

    async function setupClient(client: ClientRow | null, storeEmail: string | null) {
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }
      if (!client) {
        return jsonResponse({ error: "No account found with that email." }, 404);
      }
      if (client.portal_activated_at) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const hash = await hashPassword(password);
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("clients")
        .update({
          ...(storeEmail ? { portal_email: storeEmail } : {}),
          portal_password_hash: hash,
          portal_activated_at: new Date().toISOString(),
        })
        .eq("id", client.id)
        .is("portal_activated_at", null) // two setups racing: only the first can win
        .select("id");
      if (updateError) return jsonResponse({ error: updateError.message }, 500);
      if (!updated?.length) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error?.message }, 500);
      return sessionResponse(session.sessionToken);
    }

    async function loginClient(client: ClientRow | null, notFound: string) {
      if (!password) {
        return jsonResponse({ error: "Please enter your password." }, 400);
      }
      if (!client) {
        return jsonResponse({ error: notFound }, 404);
      }

      const check = await verifyPassword(password, client.portal_password_hash);
      if (!check.ok) {
        logPortalActivity(client.id, "login_failed");
        return jsonResponse({ error: "Incorrect password. Please try again." }, 401);
      }
      if (check.needsRehash) {
        // Silent upgrade from the old shared-salt hash; a failure here must not block the login.
        const { error } = await supabaseAdmin
          .from("clients")
          .update({ portal_password_hash: await hashPassword(password) })
          .eq("id", client.id)
          .eq("portal_password_hash", client.portal_password_hash);
        if (error) console.error("client-portal-login: hash upgrade failed:", error.message);
      }

      const session = await createSession(client.id);
      if ("error" in session) return jsonResponse({ error: session.error?.message }, 500);
      return sessionResponse(session.sessionToken);
    }

    async function setupContact(login: ContactLogin | null, storeEmail: string | null, notFound: string) {
      if (password.length < 6) {
        return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
      }
      if (!login) {
        return jsonResponse({ error: notFound }, 404);
      }
      if (login.activatedAt) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("client_contact_portal_access")
        .update({
          ...(storeEmail ? { portal_email: storeEmail } : {}),
          password_hash: await hashPassword(password),
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("contact_id", login.contactId)
        .is("activated_at", null)
        .select("contact_id");
      if (updateError) {
        // The only expected failure: that email already signs in to another contact login.
        const taken = String(updateError.code) === "23505";
        return jsonResponse(
          { error: taken ? "That email is already used by another portal login. Please use a different one." : updateError.message },
          taken ? 409 : 500,
        );
      }
      if (!updated?.length) {
        return jsonResponse({ error: "This account is already set up. Please sign in instead." }, 409);
      }

      const session = await createSession(login.clientId, login.contactId);
      if ("error" in session) return jsonResponse({ error: session.error?.message }, 500);
      return sessionResponse(session.sessionToken, login.contactId);
    }

    async function loginContact(login: ContactLogin | null, notFound: string) {
      if (!password) {
        return jsonResponse({ error: "Please enter your password." }, 400);
      }
      if (!login) {
        return jsonResponse({ error: notFound }, 404);
      }
      if (!login.activatedAt) {
        return jsonResponse({ error: "This account isn't set up yet. Open your invite link to create a password." }, 409);
      }

      const check = await verifyPassword(password, login.passwordHash);
      if (!check.ok) {
        logPortalActivity(login.clientId, "login_failed", null, login.contactId);
        return jsonResponse({ error: "Incorrect password. Please try again." }, 401);
      }
      if (check.needsRehash) {
        const { error } = await supabaseAdmin
          .from("client_contact_portal_access")
          .update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
          .eq("contact_id", login.contactId)
          .eq("password_hash", login.passwordHash);
        if (error) console.error("client-portal-login: contact hash upgrade failed:", error.message);
      }

      const session = await createSession(login.clientId, login.contactId);
      if ("error" in session) return jsonResponse({ error: session.error?.message }, 500);
      return sessionResponse(session.sessionToken, login.contactId);
    }

    // ── Email-anchored actions (ClientLoginPage.tsx). Client login first, then a contact login. ──

    if (action === "lookup") {
      const client = await findClient();
      if (client) {
        // Only what the UI needs to decide setup-vs-login and greet the
        // client by name — never portal_password_hash, never the row id.
        return jsonResponse({
          mode: client.portal_activated_at ? "login" : "setup",
          displayName: client.contact_name || client.name,
          kind: "manager",
        });
      }
      const contact = await findContactLogin("email");
      if (contact) {
        return jsonResponse({
          mode: contact.activatedAt ? "login" : "setup",
          displayName: contact.name,
          kind: "contact",
        });
      }
      return jsonResponse({ error: "No account found with that email. Contact your contractor." }, 404);
    }

    if (action === "setup") {
      const client = await findClient();
      if (client) return setupClient(client, email);
      return setupContact(await findContactLogin("email"), null, "No account found with that email.");
    }

    if (action === "login") {
      const client = await findClient();
      if (client) return loginClient(client, "No account found with that email.");
      return loginContact(await findContactLogin("email"), "No account found with that email.");
    }

    // ── Client magic link (/portal/:token) ──

    if (action === "magicLinkSetup") {
      // Only store an email when one was actually submitted — the magic-link
      // setup form pre-fills this from the client's existing email, but
      // doesn't require re-typing it.
      const client = await findClientByToken();
      if (!client) return jsonResponse({ error: "This portal link is invalid or has been disabled." }, 404);
      return setupClient(client, email);
    }

    if (action === "magicLinkLogin") {
      return loginClient(await findClientByToken(), "This portal link is invalid or has been disabled.");
    }

    // ── Contact invite link (/portal/contact/:token) ──

    if (action === "contactLinkSetup") {
      return setupContact(await findContactLogin("token"), email, "This invite link is invalid or has been withdrawn.");
    }

    if (action === "contactLinkLogin") {
      return loginContact(await findContactLogin("token"), "This invite link is invalid or has been withdrawn.");
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
