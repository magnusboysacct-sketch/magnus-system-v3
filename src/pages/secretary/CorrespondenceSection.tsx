// src/pages/secretary/CorrespondenceSection.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Send, Search, Sparkles, CheckCircle2, XCircle, Printer, Eye, Pencil, Trash2, Mail } from "lucide-react";
import { Card, CardHeader, Btn, Badge, Table, Th, Tr, Td, Modal, Field, Input, Select, Textarea, Alert, Spinner, Empty } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useProjectContext } from "../../context/ProjectContext";
import { canApproveSecretaryDocuments } from "../../lib/permissions";
import { magnusAI } from "../../lib/magnusAI";
import { openPrintWindow } from "../../lib/printUtils";
import { useCompanySettings, type CompanySettings } from "../../hooks/useCompanySettings";

type DocType = "job_letter" | "employment_letter" | "reference_letter";
type DocStatus = "draft" | "pending_approval" | "approved" | "printed" | "rejected";

// Real, confirmed workers columns only (base CREATE TABLE + tracked
// job_title/id_expiry_date ALTERs) — first_name/last_name, not a single
// "name" column. ssn_last_4 exists but is deliberately excluded from every
// letter/auto-fill below — a partial SSN has no business in printed
// correspondence.
type Worker = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  hire_date: string | null;
  employee_id: string | null;
  email: string | null;
  status: string;
};

type SecretaryDoc = {
  id: string;
  document_type: string;
  title: string;
  content: string | null;
  status: DocStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  worker_id: string | null;
};

const TEMPLATES: { type: DocType; name: string; desc: string }[] = [
  { type: "job_letter", name: "Job Letter", desc: "Confirms a worker's current role and status for external use (bank, visa, etc.)" },
  { type: "employment_letter", name: "Employment Letter", desc: "Formal offer/confirmation of employment terms" },
  { type: "reference_letter", name: "Reference Letter", desc: "Character/work reference for a current or former worker" },
];

const STATUS_COLOR: Record<string, "green" | "amber" | "slate" | "red" | "cyan"> = {
  draft: "slate", pending_approval: "amber", approved: "cyan", printed: "green", rejected: "red",
};

function fullName(w: Worker) {
  return [w.first_name, w.last_name].filter(Boolean).join(" ");
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-JM", { year: "numeric", month: "long", day: "numeric" });
}

function todayLong() {
  return new Date().toLocaleDateString("en-JM", { year: "numeric", month: "long", day: "numeric" });
}

// Starter body text per template type — a sensible first draft the secretary
// edits before submitting, never a finished letter. [Bracket] placeholders
// are reserved for the true "no worker selected yet" starting point only —
// once a real worker is chosen, a missing field (job_title/hire_date not on
// file) must never render as literal bracket text, since that reads exactly
// like an unfilled template to whoever's reading the letter. It gets a
// plain, non-bracket note instead, and the on-screen Field hint below warns
// the secretary before they print.
function starterBody(type: DocType, worker: Worker | null, companyName: string): string {
  const name = worker ? fullName(worker) : "[Worker Name]";
  const title = worker ? (worker.job_title || "(job title not on file)") : "[Job Title]";
  const since = worker
    ? (worker.hire_date ? formatDate(worker.hire_date) : "(start date not on file)")
    : "[Start Date]";
  const empId = worker?.employee_id ? ` (Employee ID: ${worker.employee_id})` : "";

  if (type === "job_letter") {
    return `${todayLong()}

TO WHOM IT MAY CONCERN

This letter confirms that ${name}${empId} is currently employed with ${companyName} in the position of ${title}, since ${since}.

This letter is issued at the employee's request for official purposes.

Please contact us if any further verification is required.

Sincerely,

_____________________
${companyName}`;
  }

  if (type === "employment_letter") {
    return `${todayLong()}

Dear ${name},

This letter confirms your employment with ${companyName} in the position of ${title}, effective ${since}.

[Outline employment terms here — pay rate/type, work schedule, reporting structure, and any other agreed conditions.]

Please sign and return a copy of this letter to acknowledge your acceptance of these terms.

Sincerely,

_____________________
${companyName}`;
  }

  return `${todayLong()}

TO WHOM IT MAY CONCERN

I am writing to provide a reference for ${name}, who has worked with ${companyName} as ${title} since ${since}.

[Describe their performance, conduct, reliability, and any notable contributions.]

I recommend ${name} without reservation and am happy to be contacted for further information.

Sincerely,

_____________________
${companyName}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Matches the exact [Bracket Text] pattern every starterBody() template
// uses for its own "needs human judgment" prompts (e.g. "[Outline
// employment terms here...]"), plus the "no worker selected" fallbacks
// ([Worker Name], [Job Title], [Start Date]). Deduped since the same
// bracket text could appear more than once in a longer letter.
function findUnresolvedBrackets(content: string | null | undefined): string[] {
  const matches = (content || "").match(/\[[^\]]+\]/g) || [];
  return Array.from(new Set(matches));
}

// Same window/style shell as printUtils.ts's openPrintWindow, minus the
// w.print() call — a faithful visual preview of exactly what Print would
// produce, without triggering the browser's print dialog. Kept local to
// this file rather than added as an option on the shared printUtils.ts,
// since that file is used by other pages (ContractsPage.tsx) this task
// doesn't touch.
function openPreviewWindow(html: string, title: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head>
    <title>${title} — Preview</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Georgia,serif;color:#1a1a1a;background:white}
      @media print{@page{size:A4 portrait;margin:15mm}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style>
  </head><body>${html}</body></html>`);
  w.document.close();
}

// Compact address block beside the logo — company name + address lines +
// parish/country + phone/email, each piece included only if actually set.
// parish/country replace the hook's old (never-real) city/state fields —
// see useCompanySettings.ts. No line, separator, or trailing comma appears
// for a field that's null, so a company with a partially-filled Settings
// page still gets a clean block, not blank lines or stray punctuation.
function addressBlock(companyName: string, settings: CompanySettings | null): string {
  const line2 = settings?.address_line2 ? `${escapeHtml(settings.address_line2)}<br/>` : "";
  const line1 = settings?.address_line1 ? `${escapeHtml(settings.address_line1)}<br/>${line2}` : line2;
  const isStr = (x: string | null | undefined): x is string => !!x;
  const cityLine = [settings?.parish, settings?.country].filter(isStr).map(escapeHtml).join(", ");
  const contactLine = [settings?.phone, settings?.email].filter(isStr).map(escapeHtml).join(" · ");

  return `<div style="font-size:11px;line-height:1.6;color:#444;">
    <div style="font-weight:700;font-size:13px;color:#1a1a1a;margin-bottom:2px;">${escapeHtml(companyName)}</div>
    ${line1}
    ${cityLine ? `${cityLine}<br/>` : ""}
    ${contactLine}
  </div>`;
}

// Logo and watermark come from real company_settings data via
// useCompanySettings() — no static /public files at all anymore (the red
// accent bar was dropped entirely in the previous round; there's no real
// field for it).
//
// Layout: logo top-left with the company name/address/contact block beside
// it (standard letterhead layout), not centered. Watermark: small
// bottom-right corner mark, matching printUtils.ts's own proven .wm CSS
// class exactly (position:fixed, bottom/right offset, object-fit:contain,
// print-color-adjust:exact) rather than the previous round's large
// centered placement — position bottom:6mm;right:6mm (~0.25in, matching
// the requested quarter-inch offset). watermark_size (real, millimeters,
// DB default 25) now drives height/width directly, since a small corner
// mark is what this field was actually designed for — see the hook's own
// comment. watermark_opacity (real, 0-1, DB default 0.15) and
// watermark_enabled are used exactly as already wired; the watermark is
// omitted entirely if disabled or no URL is set.
//
// Logo is likewise omitted entirely (no <img> tag) if logo_url is null —
// never a broken-image icon.
function letterHtml(body: string, settings: CompanySettings | null) {
  const paragraphs = body
    .split("\n\n")
    .map(p => `<p style="margin:0 0 14px;white-space:pre-wrap;">${escapeHtml(p)}</p>`)
    .join("");

  const companyName = settings?.company_name || "Magnus Boys Construction";
  const opacity = settings?.watermark_opacity ?? 0.15;
  const size = settings?.watermark_size ?? 25;

  const watermarkImg = settings?.watermark_enabled && settings?.watermark_url
    ? `<img src="${settings.watermark_url}" style="position:fixed;bottom:6mm;right:6mm;height:${size}mm;width:${size}mm;object-fit:contain;object-position:bottom right;opacity:${opacity};z-index:-1;pointer-events:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;" />`
    : "";
  const logoImg = settings?.logo_url
    ? `<img src="${settings.logo_url}" style="height:70px;width:auto;display:block;" />`
    : "";

  return `<div class="page" style="max-width:720px;margin:0 auto;padding:60px;font-size:14px;line-height:1.7;">
    ${watermarkImg}
    <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:32px;">
      ${logoImg}
      ${addressBlock(companyName, settings)}
    </div>
    ${paragraphs}
  </div>`;
}

// quickCreateWorkerId/onQuickCreateHandled: narrow, additive-only hook so
// WorkerAdminSection's "Create Employment Letter" shortcut can trigger this
// component's own existing create flow instead of duplicating it — per
// Veron's explicit "reuse, don't duplicate" instruction for that feature.
// Both optional, default to inert (undefined), so CorrespondenceSection's
// own standalone behavior when rendered from its own tab is completely
// unchanged. Flagged clearly since Veron's Worker Admin handoff said not to
// touch this file this round — this was the smallest change that could
// satisfy "reuse" without either duplicating the letter-creation UI in
// WorkerAdminSection or lifting this component's entire modal state up to
// a shared context.
export default function CorrespondenceSection({
  quickCreateWorkerId,
  onQuickCreateHandled,
}: {
  quickCreateWorkerId?: string | null;
  onQuickCreateHandled?: () => void;
} = {}) {
  const { userId, userRole } = useProjectContext();
  const canApprove = canApproveSecretaryDocuments(userRole);

  // Same hook ContractsPage.tsx already uses for logo/watermark — replaces
  // the ad-hoc company_settings SELECT this component used to run just for
  // company_name (removed from init() below, no longer needed here).
  const { settings } = useCompanySettings();
  const companyName = settings?.company_name || "Magnus Boys Construction";

  const [companyId, setCompanyId] = useState<string>("");

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [docs, setDocs] = useState<SecretaryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Header "Create New" no longer hardcodes a type — it opens this small
  // picker first so the user explicitly chooses, same as the per-template
  // "Use Template" card buttons already do (those call openCreate(type)
  // directly and were never ambiguous; this picker exists only because the
  // header button had no template of its own to be unambiguous about).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Create/Edit modal state — editingDocId null means "creating new" (insert
  // on save); set means "editing that row" (update on save, no duplicate
  // row created). Must be reset to null on every path that closes or reopens
  // this modal for a fresh create, or a stray edit could silently turn a
  // later "Create New" into an update of the wrong row.
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [docType, setDocType] = useState<DocType>("job_letter");
  const [workerSearch, setWorkerSearch] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");

  // Send-by-email dialog state. emailTarget non-null = dialog open for that
  // row. No worker-email pre-fill yet — that depends on secretary_documents
  // having a real worker_id column, which Veron hasn't confirmed is applied
  // yet (separate migration, separate handoff) — recipient starts blank and
  // is always manually entered until that lands.
  const [emailTarget, setEmailTarget] = useState<SecretaryDoc | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailErr, setEmailErr] = useState("");

  useEffect(() => { init(); }, []);

  // Fires once workers has actually loaded (need the real worker record,
  // not just an id). Deliberately does NOT chain openCreate() + onSelectWorker()
  // the way an earlier version did — setDocType() inside openCreate() is a
  // state setter, not a synchronous mutation, so onSelectWorker() running in
  // the same tick would still read the OLD docType from its closure (the
  // <Select> looked right because it picks up the new state on the next
  // render, but title/body had already been computed one render too early
  // from the stale type). Instead this computes docType/title/body from
  // explicit local values in one pass — the exact same title-format and
  // starterBody() call the manual flow uses, just without relying on two
  // state-dependent functions to run back-to-back in the same synchronous
  // block. Result is identical to picking Employment Letter + this worker
  // by hand.
  useEffect(() => {
    if (!quickCreateWorkerId || workers.length === 0) return;
    const type: DocType = "employment_letter";
    const w = workers.find(x => x.id === quickCreateWorkerId) || null;
    const tpl = TEMPLATES.find(t => t.type === type)!;
    setEditingDocId(null);
    setDocType(type);
    setSelectedWorkerId(quickCreateWorkerId);
    setWorkerSearch("");
    setTitle(w ? `${tpl.name} — ${fullName(w)}` : "");
    setBody(starterBody(type, w, companyName));
    setSaveErr("");
    setAiErr("");
    setCreateOpen(true);
    onQuickCreateHandled?.();
  }, [quickCreateWorkerId, workers]);

  async function init() {
    setLoading(true);
    setLoadErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadErr("Not signed in."); setLoading(false); return; }

      const { data: profile, error: profileErr } = await supabase
        .from("user_profiles").select("company_id").eq("id", user.id).maybeSingle();
      if (profileErr || !profile?.company_id) { setLoadErr("Could not load company."); setLoading(false); return; }
      setCompanyId(profile.company_id);

      const [{ data: workersData, error: workersErr }, { data: docsData, error: docsErr }] = await Promise.all([
        supabase.from("workers").select("id, first_name, last_name, job_title, hire_date, employee_id, email, status")
          .eq("company_id", profile.company_id).order("first_name"),
        supabase.from("secretary_documents").select("id, document_type, title, content, status, created_by, approved_by, approved_at, created_at, worker_id")
          .eq("company_id", profile.company_id).order("created_at", { ascending: false }),
      ]);

      if (workersErr) throw workersErr;
      if (docsErr) throw docsErr;
      setWorkers((workersData || []) as Worker[]);
      setDocs((docsData || []) as SecretaryDoc[]);
    } catch (e: any) {
      setLoadErr(e.message || "Failed to load correspondence data.");
    }
    setLoading(false);
  }

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(w => fullName(w).toLowerCase().includes(q) || (w.job_title || "").toLowerCase().includes(q));
  }, [workers, workerSearch]);

  const selectedWorker = useMemo(() => workers.find(w => w.id === selectedWorkerId) || null, [workers, selectedWorkerId]);

  function openCreate(type: DocType) {
    setEditingDocId(null);
    setDocType(type);
    setSelectedWorkerId("");
    setWorkerSearch("");
    setTitle("");
    setBody(starterBody(type, null, companyName));
    setSaveErr("");
    setAiErr("");
    setCreateOpen(true);
  }

  // Pre-fills title/body (always stored) and, now that secretary_documents
  // has a real worker_id column, restores the worker picker's original
  // selection too — worker_id is null for rows created before that
  // migration (or where no worker was ever selected), which naturally
  // falls back to the same "opens unselected" behavior as before; no
  // special-casing needed since setSelectedWorkerId("") is exactly what an
  // empty string already does.
  function openEdit(doc: SecretaryDoc) {
    const tpl = TEMPLATES.find(t => t.type === doc.document_type) || TEMPLATES[0];
    setEditingDocId(doc.id);
    setDocType(tpl.type);
    setSelectedWorkerId(doc.worker_id || "");
    setWorkerSearch("");
    setTitle(doc.title);
    setBody(doc.content || "");
    setSaveErr("");
    setAiErr("");
    setCreateOpen(true);
  }

  function onSelectWorker(id: string) {
    setSelectedWorkerId(id);
    const w = workers.find(x => x.id === id) || null;
    const tpl = TEMPLATES.find(t => t.type === docType)!;
    setTitle(w ? `${tpl.name} — ${fullName(w)}` : "");
    setBody(starterBody(docType, w, companyName));
  }

  function onDocTypeChange(type: DocType) {
    setDocType(type);
    const tpl = TEMPLATES.find(t => t.type === type)!;
    setTitle(selectedWorker ? `${tpl.name} — ${fullName(selectedWorker)}` : "");
    setBody(starterBody(type, selectedWorker, companyName));
  }

  // AI assist is a pure convenience layer over the manual textarea — a
  // thrown/failed call never blocks editing, it just leaves body as-is and
  // surfaces a non-fatal warning. Same call shape as ContractsPage.tsx's
  // aiGenerateScope(): magnusAI.chat(promptString).
  async function aiAssist() {
    setAiErr("");
    setAiLoading(true);
    try {
      const tpl = TEMPLATES.find(t => t.type === docType)!;
      const text = await magnusAI.chat(
        `You are an HR/admin assistant for a Jamaica construction company (${companyName}).
Improve and expand the following draft ${tpl.name.toLowerCase()} into a complete, professional letter.
Keep any real details (name, job title, dates) exactly as given — do not invent facts you weren't given.
Worker: ${selectedWorker ? fullName(selectedWorker) : "not selected"}
Job Title: ${selectedWorker?.job_title || "unknown"}
Employed since: ${selectedWorker?.hire_date ? formatDate(selectedWorker.hire_date) : "unknown"}

Current draft:
${body}

Respond with ONLY the improved letter body text, no preamble or explanation.`
      );
      const clean = String(text || "").trim();
      if (clean) setBody(clean);
      else setAiErr("AI returned an empty draft — your current text was kept.");
    } catch {
      setAiErr("AI draft assist failed — you can still edit the letter manually.");
    }
    setAiLoading(false);
  }

  // Branches insert vs update on editingDocId. Editing never touches status —
  // it stays whatever it already was (in practice always 'draft', since Edit
  // is only offered for draft rows) — so this can't accidentally push a row
  // past what RLS allows a secretary to write for their own rows.
  async function saveLetter() {
    if (!title.trim()) { setSaveErr("Enter a title."); return; }
    if (!body.trim()) { setSaveErr("Letter body can't be empty."); return; }
    setSaving(true);
    setSaveErr("");
    try {
      if (editingDocId) {
        // worker_id included here too, not just insert — the task listed
        // insert explicitly, but leaving update out would make re-picking a
        // different worker during Edit silently not stick, since worker_id
        // wouldn't be part of either persisted path. Round-tripping
        // (openEdit restores the selection, saveLetter persists a changed
        // one) needs both.
        const { error: updateErr } = await supabase.from("secretary_documents")
          .update({ document_type: docType, title: title.trim(), content: body, worker_id: selectedWorkerId || null })
          .eq("id", editingDocId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from("secretary_documents").insert({
          company_id: companyId,
          document_type: docType,
          title: title.trim(),
          content: body,
          status: "draft",
          created_by: userId,
          worker_id: selectedWorkerId || null,
        });
        if (insertErr) throw insertErr;
      }
      setCreateOpen(false);
      setEditingDocId(null);
      await init();
    } catch (e: any) {
      setSaveErr(e.message || "Failed to save letter.");
    }
    setSaving(false);
  }

  // Shared status-transition helper — .select("id") after the update lets us
  // tell "RLS silently allowed 0 rows" apart from "actually failed", since
  // an RLS-blocked UPDATE returns no error, just zero affected rows.
  async function updateStatus(doc: SecretaryDoc, newStatus: DocStatus) {
    setBusyId(doc.id);
    setActionErr("");
    const { data, error: err } = await supabase
      .from("secretary_documents")
      .update({ status: newStatus })
      .eq("id", doc.id)
      .select("id");
    if (err) {
      setActionErr(err.message || "Failed to update status.");
    } else if (!data || data.length === 0) {
      setActionErr("That action didn't apply — you may not have permission for it.");
    } else {
      await init();
    }
    setBusyId(null);
  }

  // Shared gate for Submit/Approve/Print/Email — re-checks doc.content fresh
  // from the current docs array on every click, so an edit that removes the
  // brackets clears the block immediately on the next attempt, no separate
  // "recheck" step needed. Reject is deliberately NOT gated by this — you're
  // allowed to reject a letter that still has unresolved placeholders, that
  // may be exactly why it's being rejected.
  function blockedByBrackets(doc: SecretaryDoc): boolean {
    const found = findUnresolvedBrackets(doc.content);
    if (found.length > 0) {
      setActionErr(`This letter still contains: ${found.join(", ")} — please replace before continuing.`);
      return true;
    }
    return false;
  }

  // Print persists the printed-status transition too, but only admin/director
  // can actually make it stick — secretary_documents_update_own's RLS caps a
  // secretary's own-row updates to draft/pending_approval, so an
  // approved -> printed write from a secretary would silently no-op. Print is
  // gated to canApprove below for exactly that reason, not an arbitrary choice.
  async function printDoc(doc: SecretaryDoc) {
    if (blockedByBrackets(doc)) return;
    openPrintWindow(letterHtml(doc.content || "", settings), { title: doc.title });
    await updateStatus(doc, "printed");
  }

  function openEmailDialog(doc: SecretaryDoc) {
    if (blockedByBrackets(doc)) return;
    const linkedWorker = doc.worker_id ? workers.find(w => w.id === doc.worker_id) : null;
    setEmailTarget(doc);
    setEmailTo(linkedWorker?.email || "");
    setEmailErr("");
  }

  // On success, reuses the same terminal 'printed' status Print already
  // writes via updateStatus — "delivered" reusing the existing state
  // machine's terminal edge, not a new status value. On failure, status is
  // never touched (approved -> printed is only attempted after Resend
  // confirms success), so a failed send leaves the document exactly as it
  // was: approved, retryable.
  async function sendEmail() {
    if (!emailTarget) return;
    const recipient = emailTo.trim();
    if (!recipient || !recipient.includes("@")) { setEmailErr("Enter a valid email address."); return; }
    setEmailSending(true);
    setEmailErr("");
    try {
      const { data, error: err } = await supabase.functions.invoke("send-secretary-document-email", {
        body: { documentId: emailTarget.id, to: recipient },
      });
      if (err) throw err;
      if (data?.error) throw new Error(data.error);
      setEmailTarget(null);
      await updateStatus(emailTarget, "printed");
    } catch (e: any) {
      setEmailErr(e.message || "Failed to send email.");
    }
    setEmailSending(false);
  }

  // Preview never touches status or triggers the print dialog — available
  // at any status, purely a visual check.
  function previewDoc(doc: SecretaryDoc) {
    openPreviewWindow(letterHtml(doc.content || "", settings), doc.title);
  }

  // Human-readable past-tense label for the non-draft delete warning below
  // — names the letter's real current status rather than a generic phrase.
  const NON_DRAFT_STATUS_LABEL: Record<string, string> = {
    pending_approval: "submitted for approval",
    approved: "approved",
    printed: "printed",
    rejected: "rejected",
  };

  // Draft deletes (by creator or canApprove) keep the plain confirm — no
  // need to scare someone off deleting their own unsent draft. A non-draft
  // delete (admin/director only — RLS itself already allowed this at any
  // status, this was previously a UI-only restriction, now lifted per
  // Veron's decision) gets a stronger warning naming the letter's actual
  // current status, since deleting an already-submitted/approved/printed/
  // rejected letter removes real history, not just a draft in progress.
  async function deleteDoc(doc: SecretaryDoc) {
    const confirmed = doc.status === "draft"
      ? window.confirm(`Delete "${doc.title}"? This can't be undone.`)
      : window.confirm(
          `This letter has already been ${NON_DRAFT_STATUS_LABEL[doc.status] || doc.status} and may represent a real document that was issued. Deleting it removes it permanently, including any audit trail that it existed.\n\nAre you sure you want to delete "${doc.title}"?`
        );
    if (!confirmed) return;
    setBusyId(doc.id);
    setActionErr("");
    const { error: err } = await supabase.from("secretary_documents").delete().eq("id", doc.id);
    if (err) setActionErr(err.message || "Failed to delete.");
    else await init();
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      {loadErr && <Alert type="error">{loadErr}</Alert>}
      {actionErr && <Alert type="error" onClose={() => setActionErr("")}>{actionErr}</Alert>}

      <Card>
        <div className="flex items-center justify-between">
          <CardHeader title="Letter Templates" subtitle="Start a new letter from a template" />
          <Btn variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setPickerOpen(true)}>Create New</Btn>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TEMPLATES.map(t => (
            <div key={t.type} className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0c1018] flex flex-col">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                <FileText size={15} className="text-cyan-400" />
              </div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">{t.name}</div>
              <div className="text-xs text-slate-500 mb-3 flex-1">{t.desc}</div>
              <Btn variant="secondary" size="xs" onClick={() => openCreate(t.type)}>Use Template</Btn>
            </div>
          ))}
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-2">
          <Send size={14} className="text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Sent Letter Log</span>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center"><Spinner /></div>
        ) : docs.length === 0 ? (
          <Empty icon={<FileText size={22} />} title="No letters yet" body="Letters you create will show up here." />
        ) : (
          <Table minWidth={760}>
            <thead><tr><Th>Title</Th><Th>Type</Th><Th>Status</Th><Th>Date</Th><Th right>Actions</Th></tr></thead>
            <tbody>
              {docs.map(d => (
                <Tr key={d.id}>
                  <Td>{d.title}</Td>
                  <Td muted>{TEMPLATES.find(t => t.type === d.document_type)?.name || d.document_type}</Td>
                  <Td><Badge color={STATUS_COLOR[d.status]} dot>{d.status.replace("_", " ")}</Badge></Td>
                  <Td muted>{formatDate(d.created_at)}</Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-1.5">
                      <Btn variant="secondary" size="xs" icon={<Eye size={12} />} onClick={() => previewDoc(d)}>Preview</Btn>
                      {d.status === "draft" && (d.created_by === userId || canApprove) && (
                        <Btn variant="secondary" size="xs" icon={<Pencil size={12} />} onClick={() => openEdit(d)}>Edit</Btn>
                      )}
                      {(d.status === "draft" ? (d.created_by === userId || canApprove) : canApprove) && (
                        <Btn variant="secondary" size="xs" icon={<Trash2 size={12} />} disabled={busyId === d.id} onClick={() => deleteDoc(d)}>Delete</Btn>
                      )}
                      {d.status === "draft" && (d.created_by === userId || canApprove) && (
                        <Btn variant="secondary" size="xs" disabled={busyId === d.id} onClick={() => { if (!blockedByBrackets(d)) updateStatus(d, "pending_approval"); }}>Submit</Btn>
                      )}
                      {d.status === "pending_approval" && canApprove && (
                        <>
                          <Btn variant="secondary" size="xs" icon={<CheckCircle2 size={12} />} disabled={busyId === d.id} onClick={() => { if (!blockedByBrackets(d)) updateStatus(d, "approved"); }}>Approve</Btn>
                          <Btn variant="secondary" size="xs" icon={<XCircle size={12} />} disabled={busyId === d.id} onClick={() => updateStatus(d, "rejected")}>Reject</Btn>
                        </>
                      )}
                      {d.status === "approved" && canApprove && (
                        <>
                          <Btn variant="primary" size="xs" icon={<Printer size={12} />} disabled={busyId === d.id} onClick={() => printDoc(d)}>Print</Btn>
                          <Btn variant="secondary" size="xs" icon={<Mail size={12} />} disabled={busyId === d.id} onClick={() => openEmailDialog(d)}>Email</Btn>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="New Letter" subtitle="Choose a letter type to start">
        <div className="space-y-2">
          {TEMPLATES.map(t => (
            <button
              key={t.type}
              onClick={() => { setPickerOpen(false); openCreate(t.type); }}
              className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-white/[0.07] hover:border-cyan-400 dark:hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                <FileText size={14} className="text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t.name}</div>
                <div className="text-[11px] text-slate-500">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setEditingDocId(null); }}
        title={editingDocId ? "Edit Letter" : "New Letter"}
        subtitle={editingDocId ? "Re-picking a worker here will regenerate the letter body — only do this if you want to reset your edits" : "Pick a worker to auto-fill, then edit before saving"}
        width="max-w-2xl"
      >
        <div className="space-y-4">
          <Field label="Letter Type">
            <Select value={docType} onChange={e => onDocTypeChange(e.target.value as DocType)}>
              {TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.name}</option>)}
            </Select>
          </Field>

          <Field label="Worker" hint="Search and select to auto-fill name, job title, and start date">
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input value={workerSearch} onChange={e => setWorkerSearch(e.target.value)} placeholder="Search workers…" className="pl-8" />
            </div>
            <Select value={selectedWorkerId} onChange={e => onSelectWorker(e.target.value)}>
              <option value="">— Select a worker —</option>
              {filteredWorkers.map(w => (
                <option key={w.id} value={w.id}>{fullName(w)}{w.job_title ? ` — ${w.job_title}` : ""}</option>
              ))}
            </Select>
            {filteredWorkers.length === 0 && <p className="text-[10px] text-slate-500 mt-1">No workers match "{workerSearch}".</p>}
            {selectedWorker && (!selectedWorker.job_title || !selectedWorker.hire_date) && (
              <p className="text-[10px] text-amber-500 mt-1">
                This worker is missing {!selectedWorker.job_title && !selectedWorker.hire_date ? "job title and hire date" : !selectedWorker.job_title ? "a job title" : "a hire date"} on file — check the letter body below before printing.
              </p>
            )}
          </Field>

          <Field label="Title">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Job Letter — Marcus Bailey" />
          </Field>

          <Field label="Letter Body" hint="Pre-filled from the template — edit freely before saving">
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={12} />
          </Field>

          {aiErr && <Alert type="warning">{aiErr}</Alert>}
          {saveErr && <Alert type="error">{saveErr}</Alert>}

          <div className="flex items-center justify-between pt-2">
            <Btn variant="secondary" size="sm" icon={<Sparkles size={13} />} disabled={aiLoading} onClick={aiAssist}>
              {aiLoading ? "Drafting…" : "AI Draft Assist"}
            </Btn>
            <div className="flex items-center gap-2">
              <Btn variant="secondary" size="sm" onClick={() => { setCreateOpen(false); setEditingDocId(null); }}>Cancel</Btn>
              <Btn variant="primary" size="sm" disabled={saving} onClick={saveLetter}>{saving ? "Saving…" : editingDocId ? "Save Changes" : "Save Draft"}</Btn>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!emailTarget} onClose={() => setEmailTarget(null)} title="Send by Email" subtitle={emailTarget ? emailTarget.title : undefined}>
        <div className="space-y-4">
          <Field label="Send to" hint="Editable — some letters go to a bank, visa office, or other third party, not the worker">
            <Input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="name@example.com" />
          </Field>
          {emailErr && <Alert type="error">{emailErr}</Alert>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Btn variant="secondary" size="sm" onClick={() => setEmailTarget(null)}>Cancel</Btn>
            <Btn variant="primary" size="sm" icon={<Mail size={13} />} disabled={emailSending} onClick={sendEmail}>{emailSending ? "Sending…" : "Send"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
