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

// The caller's own company name, for the AI prompts below: one short line of plain text ("" when unavailable).
function promptCompanyName(raw: unknown): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}
function companyIntro(name: string): string {
  return name
    ? `${name}, a construction company using the Magnus ERP`
    : "a Jamaica-based construction company using the Magnus ERP";
}

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
    // scan_id may also send the BACK of the ID (some Jamaican IDs carry the address / details there)
    const imageBase64Back = action === "scan_id" && typeof body.imageBase64Back === "string" && body.imageBase64Back.length > 100 ? body.imageBase64Back : null;

    // The prompts below name the caller's real company (read here, server-side, from their own company's settings).
    let intro = companyIntro("");
    if (action === "suggest_payment" || action === "chat" || action === "read_project" || action === "plan_milestones") {
      try {
        const { data: cs } = await supabaseAdmin
          .from("company_settings")
          .select("company_name")
          .eq("company_id", profile.company_id)
          .maybeSingle();
        intro = companyIntro(promptCompanyName(cs?.company_name));
      } catch (_e) {
        /* keep the generic wording */
      }
    }

    if (!action) throw new Error("action field is required");

    // ── Feature switch (Magnus HQ): the same rule as the app. Scans count as "Receipt scanning" (ocr), the rest as
    // "AI". Checked here too, so switching it off in HQ works even if someone calls this function directly.
    // my_features() runs with the caller's own login, so it applies their company's plan and switches.
    const feature = /scan/i.test(String(action)) ? "ocr" : "ai";
    const { data: features, error: featuresError } = await supabaseUser.rpc("my_features");
    if (featuresError || !features || (features as Record<string, boolean>)[feature] === false) {
      return jsonResponse({
        success: false,
        error: featuresError
          ? "Could not check whether this feature is switched on. Please try again."
          : feature === "ocr"
            ? "Receipt scanning is switched off for your company."
            : "The AI assistant is switched off for your company.",
      }, featuresError ? 503 : 403);
    }

    // ── 🤖 Project Reader: read a project's drawings / BOQ / contract (migration 20261006000000) ─────────────────────
    // The files are fetched HERE from the private bucket (never sent by the browser), only files of the caller's own
    // company and of this project, from the "Client BOQ" and "Drawings & contract" folders. Excel / CSV are turned into
    // text here (exact numbers, cheaper); PDFs and pictures go to Claude as they are. The result is saved with the project.
    if (action === "read_project") {
      const projectId = String(body.projectId || "");
      const fileIds: string[] = Array.isArray(body.fileIds) ? body.fileIds.map(String).slice(0, 12) : [];
      const question = typeof body.question === "string" ? body.question.trim().slice(0, 1500) : "";
      if (!projectId || fileIds.length === 0) throw new Error("Pick the project and at least one file.");

      const { data: project } = await supabaseAdmin.from("projects").select("id, name, company_id").eq("id", projectId).maybeSingle();
      if (!project || project.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Project not found." }, 404);
      const { data: files } = await supabaseAdmin.from("project_files")
        .select("id, file_name, file_path, mime_type, folder").in("id", fileIds)
        .eq("project_id", projectId).eq("company_id", profile.company_id).in("folder", ["client_boq", "drawing"]);
      if (!files || files.length === 0) throw new Error("Those files were not found in this project.");

      const toB64 = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
      const blocks: any[] = [];
      const notes: string[] = [];
      let total = 0;
      let textBudget = 150_000;
      for (const f of files) {
        if (!String(f.file_path).startsWith(`${profile.company_id}/`)) { notes.push(`${f.file_name}: skipped (not this company's file).`); continue; }
        const name = String(f.file_name || "file");
        const ext = (name.split(".").pop() || "").toLowerCase();
        const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("private-files").download(f.file_path);
        if (dlErr || !blob) { notes.push(`${name}: could not be opened.`); continue; }
        const buf = new Uint8Array(await blob.arrayBuffer());
        total += buf.length;
        if (total > 28 * 1024 * 1024) { notes.push(`${name}: skipped (too much at once; read fewer or smaller files).`); continue; }
        if (ext === "pdf") {
          blocks.push({ type: "text", text: `=== FILE: ${name} (${f.folder === "drawing" ? "drawing / contract" : "BOQ"}) ===` });
          blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toB64(buf) } });
        } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
          blocks.push({ type: "text", text: `=== FILE: ${name} (picture) ===` });
          blocks.push({ type: "image", source: { type: "base64", media_type: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: toB64(buf) } });
        } else if (["xlsx", "xls", "csv"].includes(ext)) {
          try {
            const XLSX = await import("npm:xlsx@0.18.5");
            const wb = XLSX.read(buf, { type: "array" });
            let text = "";
            for (const sn of wb.SheetNames.slice(0, 20)) {
              const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false })
                .split("\n").map((l: string) => l.replace(/,+$/, "")).filter((l: string) => l.replace(/[,\s]/g, "") !== "").join("\n");
              if (csv) text += `\n--- SHEET: ${sn} ---\n${csv}\n`;
            }
            if (text.length > textBudget) { notes.push(`${name}: very long, only the first part was read.`); text = text.slice(0, textBudget); }
            textBudget -= text.length;
            blocks.push({ type: "text", text: `=== FILE: ${name} (spreadsheet, as CSV: one line per row) ===\n${text}` });
          } catch (_e) { notes.push(`${name}: the spreadsheet could not be read.`); }
        } else {
          notes.push(`${name}: this kind of file can't be read yet (save Word or HEIC files as PDF or JPG).`);
        }
      }
      if (blocks.length === 0) throw new Error(notes.join(" ") || "Nothing could be read.");

      const READ_PROMPT = `You are an experienced Jamaican construction estimator and quantity surveyor working for ${intro}.
Above are the documents of one project ("${String(project.name).replace(/"/g, "'")}"): drawings, a BOQ / bill of quantities, a contract or scope. Read ALL of them carefully.
Explain the job in plain, simple English (the reader is a builder, not an office person; short sentences; this text may be read out loud).
Then CHECK the documents against each other like a careful QS would:
- quantities in the BOQ that don't match what the drawing shows (show the drawing figure and your working, in the units used);
- typos or impossible values (e.g. a thickness that is 10 times too big);
- items with a rate but no quantity, or a quantity but no rate, and anything that looks missing for what the drawing shows;
- names, places, dates, totals that don't agree between the documents; sums that don't add up;
- risks or things to ask the client before pricing or starting.
Only say what the documents show; when you are not sure, say so. Money: keep the currency of the document (JMD unless it says otherwise).
${question ? `\nThe user also asks: "${question.replace(/"/g, "'")}" — answer it in "answer".` : ""}
Return ONLY valid JSON, no other text:
{
  "title": "short name of the job",
  "summary": "3 to 6 short paragraphs in plain words: what is being built, where, how big, main materials and methods, total value if shown",
  "job": { "client": "", "location": "", "date": "", "total": "", "currency": "" },
  "scope": ["main pieces of work, in order of building"],
  "key_facts": [ { "label": "e.g. Building size", "value": "e.g. 16'-0\\" x 12'-0\\" (about 17.8 m2)", "source": "which file / sheet / drawing" } ],
  "checks": [ { "level": "problem | warning | info", "text": "what is wrong or worth checking, with the numbers", "where": "file / page / item" } ],
  "questions": ["questions to ask the client or engineer"],
  "answer": ${question ? `"the answer to the user's question"` : `""`}
}`;

      const rr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 8000, messages: [{ role: "user", content: [...blocks, { type: "text", text: READ_PROMPT }] }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!rr.ok) {
        const t = await rr.text();
        console.error("Claude API error (read_project):", rr.status, t);
        throw new Error(rr.status === 413 || /too large|too long|maximum/i.test(t) ? "The files are too big to read at once. Pick fewer files (or a smaller PDF)." : `The AI could not read the files (error ${rr.status}).`);
      }
      const cj = await rr.json();
      const raw = (cj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let result: any;
      try { const m = raw.match(/\{[\s\S]*\}/); result = JSON.parse(m ? m[0] : raw); }
      catch (_e) { result = { title: project.name, summary: raw, checks: [], questions: [], key_facts: [], scope: [] }; }
      if (notes.length) result.file_notes = notes;
      result.usage = cj.usage || null;

      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: projectId, file_ids: files.map((f: any) => f.id), file_names: files.map((f: any) => f.file_name),
        question: question || null, result, created_by: callerId,
      }).select("id, created_at").maybeSingle();

      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, result } }, 200);
    }

    // ── 🗓 Milestones from a saved Project Reader reading (step 2) ─────────────────────────────────────────────────────
    // Uses the reading (already paid for) plus the BOQ spreadsheets of that reading as exact text (cheap). Drawings / PDFs
    // are NOT sent again: the reading already has what they show. Nothing is created here: the app shows the plan to edit.
    if (action === "plan_milestones") {
      const readId = String(body.readId || "");
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 800) : "";
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: project } = await supabaseAdmin.from("projects").select("id, name").eq("id", rd.project_id).maybeSingle();
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path")
        .in("id", rd.file_ids || []).eq("company_id", profile.company_id);
      let sheets = "";
      for (const f of files || []) {
        if (!/\.(xlsx|xls|csv)$/i.test(String(f.file_name)) || !String(f.file_path).startsWith(`${profile.company_id}/`)) continue;
        const { data: blob } = await supabaseAdmin.storage.from("private-files").download(f.file_path);
        if (!blob) continue;
        try {
          const XLSX = await import("npm:xlsx@0.18.5");
          const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
          for (const sn of wb.SheetNames.slice(0, 20)) {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false })
              .split("\n").map((l: string) => l.replace(/,+$/, "")).filter((l: string) => l.replace(/[,\s]/g, "") !== "").join("\n");
            if (csv) sheets += `\n--- ${f.file_name} / SHEET: ${sn} ---\n${csv}\n`;
          }
        } catch (_e) { /* skip a sheet that can't be read */ }
        if (sheets.length > 150_000) { sheets = sheets.slice(0, 150_000); break; }
      }
      const PLAN_PROMPT = `You are an experienced Jamaican construction project manager working for ${intro}.
Project: "${String(project?.name || "").replace(/"/g, "'")}".
Here is what was read from the project's drawings, BOQ and contract (JSON):
${JSON.stringify(rd.result).slice(0, 40_000)}
${sheets ? `\nThe BOQ spreadsheet(s), exact, as CSV:\n${sheets}` : "\n(No spreadsheet BOQ: use the reading only, and leave money at 0 where it is not known.)"}
${note ? `\nThe user adds: "${note.replace(/"/g, "'")}"` : ""}

Plan the job as MILESTONES in the order the work is really built on site (e.g. site prep & substructure, superstructure walls,
roof, finishes, plumbing & sanitary, electrical, painting, handover) - group BOQ trades sensibly, usually 4 to 9 milestones.
For each milestone give:
- a short name, a one or two sentence description of the work in it, and which BOQ sections / pages it covers;
- "weeks": a realistic duration in weeks for a small Jamaican crew (decimals allowed, e.g. 0.5);
- "material" and "labour": the money for it FROM THE BOQ (sum of the material and labour of the items in it, in the BOQ's
  currency). If the BOQ only shows one cost, put it in "material" and say so in "money_note". Never invent money: 0 if unknown;
- "payment": what to claim from the client when it is done (normally material + labour of that milestone).
Also give the BOQ grand total you used and whether your milestone money adds up to it.
Return ONLY valid JSON:
{
  "currency": "JMD",
  "boq_total": 0,
  "milestones": [ { "name": "", "description": "", "boq_sections": "", "weeks": 1, "material": 0, "labour": 0, "payment": 0, "money_note": "" } ],
  "total_weeks": 0,
  "notes": ["anything the user should know: assumptions, money that did not fit, overlaps that can run together"]
}`;
      const pr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 6000, messages: [{ role: "user", content: PLAN_PROMPT }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!pr.ok) { const t = await pr.text(); console.error("Claude API error (plan_milestones):", pr.status, t); throw new Error(`The AI could not make the plan (error ${pr.status}).`); }
      const pj = await pr.json();
      const raw = (pj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let plan: any;
      try { const m = raw.match(/\{[\s\S]*\}/); plan = JSON.parse(m ? m[0] : raw); } catch (_e) { throw new Error("The AI's plan could not be read. Try again."); }
      plan.kind = "milestones"; plan.from_read = rd.id; plan.note = note || null;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: rd.project_id, file_ids: rd.file_ids || [], file_names: [],
        question: "Milestone plan", result: plan, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, plan } }, 200);
    }

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
          ...(imageBase64Back ? [{
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64Back },
          }] : []),
          { type: "text", text: imageBase64Back
            ? `The first picture is the FRONT of the ID card and the second picture is the BACK of the same card. Read BOTH sides and combine them into one answer (the address, and sometimes other details, are often on the back).\n\n${prompt}`
            : prompt },
        ],
      }];

    } else if (action === "suggest_payment") {
      messages = [{
        role: "user",
        content: `You are an AI assistant for ${intro}.
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
        content: `You are the AI secretary for ${intro}.
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
