// supabase/functions/magnus-ai/index.ts
//
// SECURITY: this function calls Anthropic's API with a server-side
// ANTHROPIC_API_KEY and previously had no auth check of any kind — despite
// config.toml's verify_jwt=true, that only proves the caller holds *a*
// valid Supabase JWT, and the public anon key (embedded in every frontend
// bundle) is itself a validly-signed JWT. So gateway-level verify_jwt
// doesn't distinguish a real logged-in user from anyone who loaded the
// site. The checks below do that distinction explicitly, mirroring
// admin-invite-user's pattern: resolve the real caller from their
// Authorization header, confirm they belong to an active company, then
// rate-limit per company before ever spending money on the Anthropic call.
import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-sonnet-4-5";

// CORS is browser-enforced only — it does nothing against a direct scripted
// HTTP call, so it was never the actual hole (the missing auth check was).
// Restricting it is still reasonable defense-in-depth against a malicious
// webpage riding a logged-in visitor's browser session. Unmatched origins
// get no Access-Control-Allow-Origin header at all, not a fallback value,
// so the browser blocks the preflight outright rather than silently
// pointing it at the prod domain.
const PROD_ORIGIN = Deno.env.get("APP_URL") || "https://app.magnusboys.com";
const ALLOWED_ORIGINS = [PROD_ORIGIN, "http://localhost:5173"];

function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const RATE_LIMIT_PER_HOUR = 100;

const PROMPTS: Record<string, string> = {
  scan_id: `You are scanning a Jamaican government ID card (National ID or Driver's Licence).
Extract these fields and return ONLY valid JSON, no markdown:
{
  "firstName": "first name uppercase",
  "middleName": "middle name uppercase or empty string",
  "lastName": "surname uppercase",
  "fullName": "full name",
  "idNumber": "8-digit ID number",
  "dateOfBirth": "YYYY-MM-DD",
  "expiryDate": "YYYY-MM-DD",
  "address": "full address",
  "documentType": "national_id or drivers_licence",
  "confidence": 0.95
}`,

  scan_receipt: `Extract receipt data. Return ONLY valid JSON:
{
  "vendor": "store name",
  "amount": 0.00,
  "date": "YYYY-MM-DD",
  "receiptNumber": "receipt number",
  "tax": 0.00,
  "lineItems": [{"description": "item", "quantity": 1, "unitPrice": 0.00, "amount": 0.00}],
  "paymentMethod": "cash/card/transfer",
  "confidence": 0.95
}`,

  scan_invoice: `Extract invoice data. Return ONLY valid JSON:
{
  "vendor": "supplier name",
  "vendorAddress": "address",
  "invoiceNumber": "number",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD",
  "amount": 0.00,
  "tax": 0.00,
  "lineItems": [{"description": "item", "quantity": 1, "unitPrice": 0.00, "amount": 0.00}],
  "confidence": 0.95
}`,

  scan_statement: `You are reading a bank or credit card statement image. Extract every transaction line you can clearly see.
Return ONLY valid JSON, no markdown, no explanation:
{
  "accountNumberLast4": "last 4 digits of account if visible, else empty string",
  "statementPeriod": "e.g. May 1 - May 31 2026, or empty string if not visible",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "transaction description exactly as printed",
      "amount": 0.00,
      "type": "credit or debit",
      "balanceAfter": 0.00
    }
  ],
  "confidence": 0.9
}
Rules:
- amount should always be a positive number; use the "type" field to indicate credit (money in) or debit (money out)
- if balanceAfter is not visible for a line, use null
- extract every transaction visible on this page or image, even if there are many
- if dates are partial, like May 5, infer the year from the statement period
- never invent transactions that are not visible`,
};

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured in Supabase secrets");
    }

    // ── Auth: resolve the real caller from their Authorization header ────────
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ success: false, error: "Missing Supabase secrets" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing Authorization header" }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    // ── Company check: must belong to an active company ──────────────────────
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, status, company_id")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError || !profile) {
      return jsonResponse({ success: false, error: "Caller profile not found" }, 403);
    }
    if (profile.status && profile.status !== "active") {
      return jsonResponse({ success: false, error: "Your account is not active" }, 403);
    }
    if (!profile.company_id) {
      return jsonResponse({ success: false, error: "No company associated with your account" }, 403);
    }

    // ── Rate limit: per company, before spending anything on Anthropic ───────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCalls } = await supabaseAdmin
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id)
      .gte("created_at", oneHourAgo);

    if ((recentCalls || 0) >= RATE_LIMIT_PER_HOUR) {
      return jsonResponse(
        { success: false, error: "AI usage limit reached for your company this hour. Please try again shortly." },
        429
      );
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      throw new Error("Invalid JSON body");
    }

    console.log("Magnus AI action:", body.action);

    const { action, imageBase64, data } = body;

    if (!action) throw new Error("action field is required");

    let messages: any[] = [];

    if (action === "scan_id" || action === "scan_receipt" || action === "scan_invoice" || action === "scan_statement") {
      if (!imageBase64) throw new Error("imageBase64 is required for " + action);

      const prompt = PROMPTS[action];
      if (!prompt) throw new Error("Unknown scan action: " + action);

      messages = [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      }];

    } else if (action === "suggest_payment") {
      messages = [{
        role: "user",
        content: `You are an AI assistant for Magnus Boys Construction ERP.
Based on this payment data, give smart suggestions. Return ONLY valid JSON:
{
  "suggestions": [{"type": "rate", "message": "suggestion text"}],
  "suggestedRate": 0.00,
  "suggestedTotal": 0.00,
  "riskLevel": "low",
  "riskReason": ""
}

Payment data: ${JSON.stringify(data || {})}`,
      }];

    } else if (action === "chat") {
      messages = [{
        role: "user",
        content: `You are the AI secretary for Magnus Boys Construction ERP.
Be concise and practical. Context: ${JSON.stringify(data?.context || {})}

User: ${data?.message || ""}`,
      }];

    } else {
      throw new Error("Unknown action: " + action);
    }

    // Call Claude
    console.log("Calling Claude API...");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: action === "scan_statement" ? 4096 : 1024,
        messages,
      }),
    });

    // Log the usage now — an attempt was made against Anthropic (and
    // presumably billed) regardless of whether Claude's own response below
    // turns out to be an error, so it counts against the company's quota
    // either way. Requests that failed validation above (bad JSON, missing
    // action) never reach this point and don't count.
    await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Claude API error:", response.status, errText);
      throw new Error(`Claude API error ${response.status}: ${errText}`);
    }

    const claudeData = await response.json();
    const rawText = claudeData.content?.[0]?.text || "";
    console.log("Claude response length:", rawText.length);

    // Parse JSON for structured actions
    let result: any = { rawText };
    if (action !== "chat") {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = { ...JSON.parse(jsonMatch[0]), rawText };
      } catch (e) {
        result = { rawText, parseError: "JSON parse failed" };
      }
    } else {
      result = { message: rawText };
    }

    return jsonResponse({ success: true, data: result }, 200);

  } catch (error: any) {
    console.error("Magnus AI error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
