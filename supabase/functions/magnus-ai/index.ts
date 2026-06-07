// supabase/functions/magnus-ai/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CLAUDE_MODEL = "claude-sonnet-4-5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured in Supabase secrets");
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch(e) {
      throw new Error("Invalid JSON body");
    }

    console.log("Magnus AI action:", body.action);

    const { action, imageBase64, data } = body;

    if (!action) throw new Error("action field is required");

    let messages: any[] = [];

    if (action === "scan_id" || action === "scan_receipt" || action === "scan_invoice") {
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
        max_tokens: 1024,
        messages,
      }),
    });

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
      } catch(e) {
        result = { rawText, parseError: "JSON parse failed" };
      }
    } else {
      result = { message: rawText };
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: any) {
    console.error("Magnus AI error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});