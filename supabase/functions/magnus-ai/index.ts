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
    if (action === "suggest_payment" || action === "chat" || action === "read_project" || action === "plan_milestones" || action === "draft_boq" || action === "match_boq" || action === "ask_project" || action === "contract_terms" || action === "material_list" || action === "milestone_tasks" || action === "compare_files") {
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

    // ── 📋 Draft BOQ from a saved Project Reader reading (step 3) ──────────────────────────────────────────────────────
    // 1. Claude copies the client's BOQ spreadsheet into sections / items EXACTLY (or, with no BOQ, builds one from what the
    //    reading saw on the drawing, quantities marked "check"). 2. Each item is matched to the company's Rate Library:
    //    the code picks the 6 closest library items by words and unit, Claude picks the right one (or none).
    //    Nothing is created here: the app shows the draft to check, then saves it as a new draft BOQ version.
    if (action === "draft_boq") {
      const readId = String(body.readId || "");
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path").in("id", rd.file_ids || []).eq("company_id", profile.company_id);
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
        } catch (_e) { /* skip */ }
        if (sheets.length > 150_000) { sheets = sheets.slice(0, 150_000); break; }
      }
      const callClaude = async (prompt: string, maxTokens: number) => {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
        });
        await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
        if (!r.ok) { const t = await r.text(); console.error("Claude API error (draft_boq):", r.status, t); throw new Error(`The AI could not make the BOQ (error ${r.status}).`); }
        const j = await r.json();
        const raw = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        const m = raw.match(/\{[\s\S]*\}/);
        return JSON.parse(m ? m[0] : raw);
      };

      const BOQ_PROMPT = `You are a careful Jamaican quantity surveyor working for ${intro}.
${sheets ? `Below is the client's BOQ spreadsheet, exact, as CSV (one line per row):\n${sheets}\n
Turn it into a clean BOQ. COPY the numbers EXACTLY as they are in the spreadsheet - never change a quantity or a rate:
- sections = the trade headings (e.g. SUBSTRUCTURE - Excavating and filling, IN SITU CONCRETE, BLOCKWORK, ROOF ...);
- one item per priced line; a description that wraps over several rows is ONE item (join the rows; the item takes the
  quantity / unit / rates from the row that has them); keep the item letter as "ref";
- "material_rate" and "labour_rate" per unit from the MATERIAL and LABOUR columns (0 if blank); if the sheet has one rate
  column only, put it in material_rate;
- skip headings with nothing priced, blank rows, page totals, collection / summary pages, cover / budget sheets and packing
  lists; keep lines that have a rate but no quantity with qty 0 (they are listed so nothing is lost);
- "total_check": the BOQ grand total as printed in the spreadsheet.` :
`There is no BOQ spreadsheet. Build a first BOQ from what was read from the drawings (JSON below): the usual trade sections
and items for this job, quantities worked out from the drawing dimensions (show the working in "description"), units,
rates 0 (the user prices them), and source "drawing - check".`}

What was read from the project's documents (JSON): ${JSON.stringify(rd.result).slice(0, 30_000)}

Return ONLY valid JSON:
{ "currency": "JMD", "total_check": 0,
  "sections": [ { "title": "", "items": [ { "ref": "", "name": "short item name", "description": "full description", "unit": "m2", "qty": 0, "material_rate": 0, "labour_rate": 0, "source": "BOQ page BQ2" } ] } ],
  "notes": ["anything worth knowing: lines that were unclear, items with no quantity, totals that do not add up"] }`;

      const draft = await callClaude(BOQ_PROMPT, 16000);
      draft.kind = "boq_draft"; draft.from_read = rd.id;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: rd.project_id, file_ids: rd.file_ids || [], file_names: [],
        question: "Draft BOQ", result: draft, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, draft } }, 200);
    }

    // ── 📋 step 3b: match a saved draft BOQ to the company's Rate Library (own request, so neither runs too long) ────
    if (action === "match_boq") {
      const draftId = String(body.draftId || "");
      const { data: row } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, result").eq("id", draftId).maybeSingle();
      if (!row || row.company_id !== profile.company_id || row.result?.kind !== "boq_draft") return jsonResponse({ success: false, error: "Draft BOQ not found." }, 404);
      const draft: any = row.result;
      const items: any[] = [];
      for (const s of draft.sections || []) for (const it of s.items || []) { delete it.library; items.push(it); }
      const callClaude = async (prompt: string, maxTokens: number) => {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
        });
        await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
        if (!r.ok) { const t = await r.text(); console.error("Claude API error (match_boq):", r.status, t); throw new Error(`The AI could not make the BOQ (error ${r.status}).`); }
        const j = await r.json();
        const raw = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        const m = raw.match(/\{[\s\S]*\}/);
        return JSON.parse(m ? m[0] : raw);
      };

      // ── match to the Rate Library ──
      const { data: lib } = await supabaseAdmin.from("v_cost_items_current")
        .select("id, item_name, unit, item_type, current_rate, company_id, is_active")
        .or(`company_id.eq.${profile.company_id},company_id.is.null`).limit(6000);
      const libItems = (lib || []).filter((l: any) => l.is_active !== false && l.item_name);
      const unitKey = (u: string) => String(u || "").toLowerCase().replace(/\s|\./g, "").replace(/^(sqm|sq\.?m|m²)$/, "m2").replace(/^(cum|cu\.?m|m³)$/, "m3")
        .replace(/^(no|nos|nr|each|ea|pc|pcs)$/, "no").replace(/^(lm|lin\.?m|meter|metre|m)$/, "m").replace(/^(kgs?)$/, "kg");
      const STOP = new Set(["and", "the", "of", "in", "to", "as", "for", "with", "on", "a", "or", "by", "at", "be", "all", "including", "described", "other", "equal", "approved"]);
      const words = (t: string) => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
      const libWords = libItems.map((l: any) => ({ l, w: words(l.item_name), u: unitKey(l.unit) }));
      const cands = items.map((it) => {
        const w = words(`${it.name} ${it.description || ""}`);
        const u = unitKey(it.unit);
        return libWords.map(({ l, w: lw, u: lu }) => {
          let sc = 0; for (const x of lw) if (w.has(x)) sc += /\d/.test(x) ? 2 : 1;
          if (sc > 0 && lu && lu === u) sc += 1.5;
          return { l, sc };
        }).filter((c) => c.sc >= 2).sort((a, b) => b.sc - a.sc).slice(0, 6).map((c) => c.l);
      });
      if (libItems.length && cands.some((c) => c.length)) {
        const lines = items.map((it, i) => cands[i].length
          ? `${i}| ${it.name} | ${it.unit} | ${String(it.description || "").slice(0, 120)}\n${cands[i].map((c: any, k: number) => `   c${k}: ${c.item_name} | ${c.unit || "-"} | ${c.item_type || ""} | rate ${c.current_rate ?? "-"}`).join("\n")}`
          : "").filter(Boolean).join("\n");
        try {
          const mm = await callClaude(`Match each BOQ item to the company's Rate Library item that is the SAME work or material (same thing, same size / thickness / grade, sensible unit).
If none of the choices is really the same thing, answer null. Do not guess.
${lines}
Return ONLY valid JSON: { "matches": [ { "i": 0, "c": "c2" } ] }   (c is null when nothing matches)`, 4000);
          for (const m of mm.matches || []) {
            const i = Number(m.i), k = m.c ? Number(String(m.c).replace(/\D/g, "")) : NaN;
            if (items[i] && cands[i] && Number.isFinite(k) && cands[i][k]) {
              const c = cands[i][k];
              items[i].library = { id: c.id, name: c.item_name, unit: c.unit, type: c.item_type, rate: c.current_rate };
            }
          }
        } catch (e) { (draft.notes ||= []).push("Matching to the Rate Library did not finish: " + (e as Error).message); }
      }
      draft.library_size = libItems.length; draft.matched = items.filter((it) => it.library).length;
      await supabaseAdmin.from("project_ai_reads").update({ result: draft }).eq("id", row.id);
      return jsonResponse({ success: true, data: { id: row.id, draft } }, 200);
    }

    // ── 🎙️ Talk to your project: a question (typed or spoken) about a saved reading, with the conversation so far ─────────
    // Answers from the reading and the BOQ spreadsheets as text (cheap; the drawings are not sent again). Nothing is saved.
    if (action === "ask_project") {
      const readId = String(body.readId || "");
      const q = typeof body.question === "string" ? body.question.trim().slice(0, 1500) : "";
      const history: { q: string; a: string }[] = Array.isArray(body.history)
        ? body.history.slice(-6).map((h: any) => ({ q: String(h?.q || "").slice(0, 800), a: String(h?.a || "").slice(0, 1500) })) : [];
      if (!q) throw new Error("Ask something first.");
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: project } = await supabaseAdmin.from("projects").select("name").eq("id", rd.project_id).maybeSingle();
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path").in("id", rd.file_ids || []).eq("company_id", profile.company_id);
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
        } catch (_e) { /* skip */ }
        if (sheets.length > 120_000) { sheets = sheets.slice(0, 120_000); break; }
      }
      const ASK_PROMPT = `You are the site assistant of ${intro}, talking to a builder about the job "${String(project?.name || "").replace(/"/g, "'")}".
What was read from the job's drawings, BOQ and contract (JSON): ${JSON.stringify(rd.result).slice(0, 30_000)}
${sheets ? `The BOQ spreadsheet(s), exact, as CSV:\n${sheets}` : ""}
${history.length ? `The conversation so far:\n${history.map((h) => `Builder: ${h.q}\nYou: ${h.a}`).join("\n")}` : ""}

Builder: ${q}

Answer in plain, simple spoken English: short sentences, no tables, no markdown, no bullet symbols (it is read out loud).
Give the numbers with units. Say where it comes from (e.g. "the BOQ, page BQ6" or "the drawing"). Work things out when asked
(quantities, money, materials), showing the working in one sentence. If the documents do not say, say so plainly and suggest
what to check; never make it up. Keep it under 120 words unless a list is really needed.`;
      const ar = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, messages: [{ role: "user", content: ASK_PROMPT }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!ar.ok) { const t = await ar.text(); console.error("Claude API error (ask_project):", ar.status, t); throw new Error(`The AI could not answer (error ${ar.status}).`); }
      const aj = await ar.json();
      const answer = (aj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
      return jsonResponse({ success: true, data: { answer } }, 200);
    }

    // ── 📜 Contract terms from the project's documents (Project Reader) ──────────────────────────────────────────────
    // Reads the reading's files again with ONE job: the money and time terms (amount, retention, advance, payment stages,
    // dates, penalties, warranty). Nothing is created here: the app shows it to check, then makes a DRAFT contract.
    if (action === "contract_terms") {
      const readId = String(body.readId || "");
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path, folder")
        .in("id", rd.file_ids || []).eq("company_id", profile.company_id).in("folder", ["client_boq", "drawing"]);
      const toB64 = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
      const blocks: any[] = [];
      let total = 0;
      for (const f of files || []) {
        if (!String(f.file_path).startsWith(`${profile.company_id}/`)) continue;
        const name = String(f.file_name || "file"); const ext = (name.split(".").pop() || "").toLowerCase();
        const { data: blob } = await supabaseAdmin.storage.from("private-files").download(f.file_path);
        if (!blob) continue;
        const buf = new Uint8Array(await blob.arrayBuffer());
        total += buf.length; if (total > 28 * 1024 * 1024) break;
        if (ext === "pdf") { blocks.push({ type: "text", text: `=== FILE: ${name} ===` }); blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toB64(buf) } }); }
        else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) { blocks.push({ type: "text", text: `=== FILE: ${name} ===` }); blocks.push({ type: "image", source: { type: "base64", media_type: ext === "jpg" ? "image/jpeg" : `image/${ext}`, data: toB64(buf) } }); }
        else if (["xlsx", "xls", "csv"].includes(ext)) {
          try {
            const XLSX = await import("npm:xlsx@0.18.5");
            const wb = XLSX.read(buf, { type: "array" });
            let text = "";
            for (const sn of wb.SheetNames.slice(0, 20)) {
              const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false }).split("\n").map((l: string) => l.replace(/,+$/, "")).filter((l: string) => l.replace(/[,\s]/g, "") !== "").join("\n");
              if (csv) text += `\n--- SHEET: ${sn} ---\n${csv}\n`;
            }
            blocks.push({ type: "text", text: `=== FILE: ${name} (spreadsheet as CSV) ===\n${text.slice(0, 120_000)}` });
          } catch (_e) { /* skip */ }
        }
      }
      if (blocks.length === 0) throw new Error("No readable files in this reading.");
      const TERMS_PROMPT = `You are a careful Jamaican construction contracts administrator working for ${intro} (the CONTRACTOR).
Read the documents above and pull out ONLY the contract's money and time terms, exactly as written. Do not invent anything:
when a term is not in the documents, use null and list it in "missing".
- contract amount (the agreed price; if there is no contract, the BOQ / budget total, and say so in "amount_source");
- retention % and when it is released; advance / mobilisation payment (percent or amount); how and when payments are made;
- the payment stages (stage payments / milestones / valuations) with percent and / or amount and what triggers each;
- start date, completion date or duration, penalties / liquidated damages, warranty / defects period, governing law;
- a two or three sentence scope of work.
"billing_schedule" must be one of: "milestone", "monthly", "completion", "time_materials" (what the documents describe).
Return ONLY valid JSON:
{ "contract_name": "", "client": "", "reference": "", "contract_date": "YYYY-MM-DD or null", "start_date": null, "completion_date": null,
  "duration_weeks": null, "contract_amount": 0, "currency": "JMD", "amount_source": "contract | BOQ | budget",
  "retention_percent": null, "retention_release": null, "advance_percent": null, "advance_amount": null,
  "payment_terms": "the payment terms in plain words (e.g. paid within 14 days of each certified valuation)",
  "billing_schedule": "milestone", "penalty_clause": null, "warranty_period_months": null, "governing_law": "Jamaica",
  "scope_of_work": "",
  "payment_schedule": [ { "name": "", "description": "what has to be done to claim it", "percent": null, "amount": null, "due_date": null } ],
  "missing": ["terms not found in the documents"], "found_in": "which file / page the terms came from" }`;
      const tr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 4000, messages: [{ role: "user", content: [...blocks, { type: "text", text: TERMS_PROMPT }] }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!tr.ok) { const t = await tr.text(); console.error("Claude API error (contract_terms):", tr.status, t); throw new Error(`The AI could not read the terms (error ${tr.status}).`); }
      const tj = await tr.json();
      const raw = (tj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let terms: any;
      try { const m = raw.match(/\{[\s\S]*\}/); terms = JSON.parse(m ? m[0] : raw); } catch (_e) { throw new Error("The terms could not be read. Try again."); }
      terms.kind = "contract_terms"; terms.from_read = rd.id;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: rd.project_id, file_ids: rd.file_ids || [], file_names: [],
        question: "Contract terms", result: terms, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, terms } }, 200);
    }

    // ── 🧱 Materials list from a saved reading (Project Reader) ──────────────────────────────────────────────────────
    // The client's material / packing lists when there are any (copied exactly), otherwise worked out from the BOQ items.
    // Grouped by the kind of supplier, so the app can turn each group into a purchase order. Nothing is created here.
    if (action === "material_list") {
      const readId = String(body.readId || "");
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path").in("id", rd.file_ids || []).eq("company_id", profile.company_id);
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
        } catch (_e) { /* skip */ }
        if (sheets.length > 150_000) { sheets = sheets.slice(0, 150_000); break; }
      }
      const MAT_PROMPT = `You are an experienced Jamaican construction buyer working for ${intro}.
What was read from the job's documents (JSON): ${JSON.stringify(rd.result).slice(0, 25_000)}
${sheets ? `The job's spreadsheets, exact, as CSV:\n${sheets}` : "(No spreadsheet: work the materials out from the reading only.)"}

Make the list of MATERIALS to buy or receive for this job:
- If there are material / packing lists (e.g. "Local Packing List", "Overseas Packing List", "material list"), COPY them exactly:
  each line with its quantity, unit and unit price (0 if none). A "local" list is bought locally by the contractor; an
  "overseas" / shipped list is normally supplied by the client: mark it "supplied_by": "client" (unless it clearly says otherwise).
  Skip lines with no quantity (0 or blank).
- If there is no material list, work the main materials out from the BOQ items (cement in bags, sand and stone in m3,
  blocks, steel bars by size in lengths, timber, zinc sheets, nails, plumbing and electrical fittings, paint...) with
  quantities and the working in "note"; unit price 0 when unknown. Mark "supplied_by": "us".
- Group every line under ONE supplier kind: "Hardware & building", "Blocks, sand & stone", "Steel", "Lumber", "Roofing",
  "Plumbing", "Electrical", "Paint", "Tiles & finishes", "Other".
Return ONLY valid JSON:
{ "currency": "JMD",
  "items": [ { "name": "", "description": "", "qty": 0, "unit": "", "unit_price": 0, "group": "Hardware & building", "supplied_by": "us", "for": "which part of the job", "source": "Local Packing List", "note": "" } ],
  "notes": ["anything to know: prices missing, lists that disagree with the BOQ, items to confirm"] }`;
      const mr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 12000, messages: [{ role: "user", content: MAT_PROMPT }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!mr.ok) { const t = await mr.text(); console.error("Claude API error (material_list):", mr.status, t); throw new Error(`The AI could not make the list (error ${mr.status}).`); }
      const mj = await mr.json();
      const raw = (mj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let list: any;
      try { const m = raw.match(/\{[\s\S]*\}/); list = JSON.parse(m ? m[0] : raw); } catch (_e) { throw new Error("The list could not be read. Try again."); }
      list.kind = "material_list"; list.from_read = rd.id;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: rd.project_id, file_ids: rd.file_ids || [], file_names: [],
        question: "Materials list", result: list, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, list } }, 200);
    }

    // ── 🔨 Tasks for each milestone (Project Reader) ───────────────────────────────────────────────────────────────────
    // Reads the project's milestones (this company only) and the reading + BOQ, and suggests the site tasks for each.
    // Nothing is created here: the app shows them to check, then adds the ticked ones to the milestones.
    if (action === "milestone_tasks") {
      const readId = String(body.readId || "");
      const { data: rd } = await supabaseAdmin.from("project_ai_reads").select("id, company_id, project_id, file_ids, result").eq("id", readId).maybeSingle();
      if (!rd || rd.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Reading not found." }, 404);
      const { data: ms } = await supabaseAdmin.from("project_milestones")
        .select("id, milestone_no, milestone_name, description, planned_start_date, planned_end_date, planned_labour_cost, planned_material_cost")
        .eq("project_id", rd.project_id).eq("company_id", profile.company_id).order("milestone_no", { ascending: true }).limit(40);
      if (!ms || ms.length === 0) throw new Error("This project has no milestones yet. Make them first (📅 Milestones above), then come back.");
      const { data: have } = await supabaseAdmin.from("project_tasks").select("milestone_id, task_name").eq("project_id", rd.project_id).in("milestone_id", ms.map((m: any) => m.id));
      const { data: files } = await supabaseAdmin.from("project_files").select("id, file_name, file_path").in("id", rd.file_ids || []).eq("company_id", profile.company_id);
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
        } catch (_e) { /* skip */ }
        if (sheets.length > 100_000) { sheets = sheets.slice(0, 100_000); break; }
      }
      const msText = ms.map((m: any) => {
        const t = (have || []).filter((h: any) => h.milestone_id === m.id).map((h: any) => h.task_name);
        return `- id ${m.id} | #${m.milestone_no ?? ""} ${m.milestone_name} | ${m.description || ""} | ${m.planned_start_date || "?"} to ${m.planned_end_date || "?"}${t.length ? ` | ALREADY HAS TASKS: ${t.slice(0, 30).join("; ")}` : ""}`;
      }).join("\n");
      const TASK_PROMPT = `You are an experienced Jamaican construction site foreman working for ${intro}.
What was read from the job's documents (JSON): ${JSON.stringify(rd.result).slice(0, 20_000)}
${sheets ? `The job's BOQ spreadsheet(s), exact, as CSV:\n${sheets}` : "(No spreadsheet BOQ.)"}

The project's MILESTONES:
${msText}

For EACH milestone, list the site TASKS a crew does, in the order they are done (usually 3 to 10 per milestone). Take the
work and quantities from the BOQ items that belong to that milestone. Do not repeat tasks a milestone ALREADY HAS.
For each task give:
- "name" (short, e.g. "Excavate foundation trench"), "description" (one sentence, which BOQ item(s) it comes from);
- "trade": ONE of General Labour, Mason, Carpenter, Painter, Electrician, Plumber, Steel Fixer, Tiler, Welder, Equipment Operator, Driver, Landscaping, Other;
- "qty" and "unit" from the BOQ (unit one of m², m³, m, no., bag, block, ton, kg, L, hr, day, ls - use "ls" with qty 1 for a lump sum);
- "crew": a realistic number of workers; "per_day": how much ONE worker does in a day, in the same unit (so days = qty / (crew x per_day));
  for a lump sum give per_day so the days come out realistic (e.g. qty 1, crew 2, per_day 0.25 = 2 days);
- "boq_labour_rate": the BOQ's labour rate per unit for that item if the BOQ shows one, else 0 (this is the CLIENT's price, not the worker's pay).
Return ONLY valid JSON:
{ "milestones": [ { "milestone_id": "the id above", "tasks": [ { "name": "", "description": "", "trade": "Mason", "qty": 0, "unit": "m²", "crew": 2, "per_day": 10, "boq_labour_rate": 0 } ] } ],
  "notes": ["anything to know: work that did not fit any milestone, guesses to check"] }`;
      const tr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 12000, messages: [{ role: "user", content: TASK_PROMPT }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!tr.ok) { const t = await tr.text(); console.error("Claude API error (milestone_tasks):", tr.status, t); throw new Error(`The AI could not make the tasks (error ${tr.status}).`); }
      const tj = await tr.json();
      const raw = (tj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let plan: any;
      try { const m = raw.match(/\{[\s\S]*\}/); plan = JSON.parse(m ? m[0] : raw); } catch (_e) { throw new Error("The tasks could not be read. Try again."); }
      const ids = new Set(ms.map((m: any) => m.id));
      plan.milestones = (Array.isArray(plan.milestones) ? plan.milestones : []).filter((m: any) => ids.has(m?.milestone_id)).map((m: any) => {
        const src = ms.find((x: any) => x.id === m.milestone_id);
        return { ...m, name: src?.milestone_name || "", start: src?.planned_start_date || null, end: src?.planned_end_date || null };
      });
      plan.kind = "milestone_tasks"; plan.from_read = rd.id;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: rd.project_id, file_ids: rd.file_ids || [], file_names: [],
        question: "Milestone tasks", result: plan, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, plan } }, 200);
    }

    // ── 🔁 What changed: compare an OLD and a NEW version of a project's drawings / BOQ (Project Reader) ────────────────
    // Only this company's files of this project, from the "Client BOQ" and "Drawings & contract" folders. Nothing is changed:
    // the result is a list of the differences (and the money effect), saved with the project.
    if (action === "compare_files") {
      const projectId = String(body.projectId || "");
      const oldIds: string[] = Array.isArray(body.oldIds) ? body.oldIds.map(String).slice(0, 4) : [];
      const newIds: string[] = Array.isArray(body.newIds) ? body.newIds.map(String).slice(0, 4) : [];
      if (!projectId || oldIds.length === 0 || newIds.length === 0) throw new Error("Pick at least one OLD and one NEW file.");
      if (oldIds.some((id) => newIds.includes(id))) throw new Error("A file can't be both the old and the new version.");
      const { data: project } = await supabaseAdmin.from("projects").select("id, name, company_id").eq("id", projectId).maybeSingle();
      if (!project || project.company_id !== profile.company_id) return jsonResponse({ success: false, error: "Project not found." }, 404);
      const { data: files } = await supabaseAdmin.from("project_files")
        .select("id, file_name, file_path, folder, created_at").in("id", [...oldIds, ...newIds])
        .eq("project_id", projectId).eq("company_id", profile.company_id).in("folder", ["client_boq", "drawing"]);
      const toB64 = (u8: Uint8Array) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
      const blocks: any[] = [];
      const notes: string[] = [];
      let total = 0;
      let textBudget = 140_000;
      for (const side of ["OLD", "NEW"] as const) {
        const ids = side === "OLD" ? oldIds : newIds;
        const list = (files || []).filter((f: any) => ids.includes(f.id));
        if (list.length === 0) throw new Error(`The ${side.toLowerCase()} file(s) were not found in this project.`);
        for (const f of list) {
          if (!String(f.file_path).startsWith(`${profile.company_id}/`)) { notes.push(`${f.file_name}: skipped.`); continue; }
          const name = String(f.file_name || "file");
          const ext = (name.split(".").pop() || "").toLowerCase();
          const { data: blob } = await supabaseAdmin.storage.from("private-files").download(f.file_path);
          if (!blob) { notes.push(`${name}: could not be opened.`); continue; }
          const buf = new Uint8Array(await blob.arrayBuffer());
          total += buf.length;
          if (total > 28 * 1024 * 1024) { notes.push(`${name}: skipped (too much at once).`); continue; }
          const label = `=== ${side} VERSION · FILE: ${name} (uploaded ${String(f.created_at).slice(0, 10)}) ===`;
          if (ext === "pdf") {
            blocks.push({ type: "text", text: label });
            blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toB64(buf) } });
          } else if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
            blocks.push({ type: "text", text: label });
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
              const cap = Math.floor(textBudget / 2);
              if (text.length > cap) { notes.push(`${name}: very long, only the first part was compared.`); text = text.slice(0, cap); }
              blocks.push({ type: "text", text: `${label}\n(spreadsheet as CSV)\n${text}` });
            } catch (_e) { notes.push(`${name}: the spreadsheet could not be read.`); }
          } else notes.push(`${name}: this kind of file can't be compared (save it as PDF, a picture or Excel).`);
        }
      }
      if (!blocks.some((b) => b.text?.startsWith("=== OLD")) || !blocks.some((b) => b.text?.startsWith("=== NEW"))) throw new Error(notes.join(" ") || "Both versions are needed.");
      const CMP_PROMPT = `You are an experienced Jamaican quantity surveyor working for ${intro}.
Above are the OLD and the NEW version of documents for the project "${String(project.name).replace(/"/g, "'")}" (drawings and/or BOQ).
Compare them carefully and list EVERYTHING that changed from OLD to NEW:
- BOQ: items added, removed, or with a different quantity, unit, rate or amount (give old and new values); section and grand totals;
- drawings: sizes, levels, rooms, doors / windows, roof, structure (beams, columns, steel), finishes, notes, revision boxes;
- anything else (client, dates, scope wording).
Say what each change means for the job and the money (more work = a variation to claim; less work = a deduction).
Plain, simple English (the reader is a builder). Only say what the documents show; if something is unclear, say so.
Return ONLY valid JSON:
{ "summary": "2 to 4 short sentences: what changed overall and the money effect",
  "currency": "JMD", "old_total": 0, "new_total": 0,
  "changes": [ { "kind": "added | removed | changed", "area": "e.g. Roof / BOQ section 3 / Drawing A-2", "item": "what", "old": "old value or blank", "new": "new value or blank", "money": 0, "note": "what it means" } ],
  "actions": ["what to do now, e.g. update the BOQ item 3.2, ask the client to approve a variation, re-order steel"],
  "unchanged": "one line on what stayed the same" }
"money" = the change in amount for that line (new minus old; negative when it goes down; 0 when not known). Totals 0 when not shown.`;
      const cr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 10000, messages: [{ role: "user", content: [...blocks, { type: "text", text: CMP_PROMPT }] }] }),
      });
      await supabaseAdmin.from("ai_usage_log").insert({ company_id: profile.company_id });
      if (!cr.ok) {
        const t = await cr.text(); console.error("Claude API error (compare_files):", cr.status, t);
        throw new Error(cr.status === 413 || /too large|too long|maximum/i.test(t) ? "The files are too big to compare at once. Pick fewer or smaller files." : `The AI could not compare the files (error ${cr.status}).`);
      }
      const cj = await cr.json();
      const raw = (cj.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      let result: any;
      try { const m = raw.match(/\{[\s\S]*\}/); result = JSON.parse(m ? m[0] : raw); } catch (_e) { result = { summary: raw, changes: [], actions: [] }; }
      const nameOf = (ids: string[]) => (files || []).filter((f: any) => ids.includes(f.id)).map((f: any) => f.file_name);
      result.kind = "compare"; result.old_files = nameOf(oldIds); result.new_files = nameOf(newIds);
      if (notes.length) result.file_notes = notes;
      const { data: saved } = await supabaseAdmin.from("project_ai_reads").insert({
        company_id: profile.company_id, project_id: projectId, file_ids: [...oldIds, ...newIds], file_names: [...result.old_files, ...result.new_files],
        question: "What changed", result, created_by: callerId,
      }).select("id, created_at").maybeSingle();
      return jsonResponse({ success: true, data: { id: saved?.id || null, created_at: saved?.created_at || null, result } }, 200);
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
