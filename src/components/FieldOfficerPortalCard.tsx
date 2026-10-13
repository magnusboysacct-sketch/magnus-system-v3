// src/components/FieldOfficerPortalCard.tsx
//
// "Field officer portal access" card for a project (staff side). The project's contact (projects.contact_id) can be
// given their OWN client-portal login that sees only the projects assigned to them. Everything here goes through the
// server functions get_project_contact_portal_status / invite_project_contact_to_portal / revoke_contact_portal_access,
// which do the real permission and company checks and raise readable errors; this component only shows them.
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildContactInviteMessage, buildWhatsAppUrl, formatJamaicaDateTime, getContactPortalUrl } from "../lib/portalShare";
import { useCompanySettings } from "../hooks/useCompanySettings";
import { companyDisplayName } from "../lib/companyName";

// The same staff roles the three RPCs allow.
const FIELD_OFFICER_PORTAL_ROLES = ["director", "admin", "estimator", "supervisor", "office_user", "secretary"];

type PortalStatus = "no_contact" | "not_invited" | "invited" | "active" | "revoked";
interface ContactPortalStatus {
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  client_portal_enabled: boolean | null;
  status: PortalStatus;
  portal_token: string | null;
  invited_at: string | null;
  activated_at: string | null;
}

// Readable text from anything thrown (the RPCs raise plain Errors).
function errText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "";
}

const btn = "px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50";
const btnPrimary = `${btn} bg-cyan-600 hover:bg-cyan-500 text-white border-transparent`;
const btnGhost = `${btn} bg-slate-50 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]`;
const btnDanger = `${btn} bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30`;

export default function FieldOfficerPortalCard({ projectId, userRole }: { projectId: string; userRole: string | null }) {
  const allowed = !!userRole && FIELD_OFFICER_PORTAL_ROLES.includes(userRole);
  const [info, setInfo] = useState<ContactPortalStatus | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("the client");
  const [projectName, setProjectName] = useState<string>("");
  const { settings: companySettings } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("get_project_contact_portal_status", { p_project_id: projectId });
      if (rpcError) throw new Error(rpcError.message);
      const s = data as ContactPortalStatus;
      setInfo(s);
      // The contact's phone (for the WhatsApp message) and the client's name (for the "turn on the portal" hint) are plain reads
      // staff are already allowed to make; a failure here only means a missing phone number / generic wording.
      setPhone(null);
      if (s?.contact_id) {
        const { data: c } = await supabase.from("client_contacts").select("phone").eq("id", s.contact_id).maybeSingle();
        setPhone((c as { phone?: string | null } | null)?.phone ?? null);
      }
      const { data: p } = await supabase.from("projects").select("name, clients(name)").eq("id", projectId).maybeSingle();
      const row = p as { name?: string | null; clients?: { name?: string } | { name?: string }[] | null } | null;
      const nm = row?.clients;
      const resolved = Array.isArray(nm) ? nm[0]?.name : nm?.name;
      if (resolved) setClientName(resolved);
      setProjectName(row?.name || "");
    } catch (e: unknown) {
      setInfo(null);
      setError(errText(e) || "Could not load portal access for this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (allowed && projectId) void load();
  }, [allowed, projectId, load]);

  if (!allowed) return null;

  async function invite() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("invite_project_contact_to_portal", { p_project_id: projectId });
      if (rpcError) throw new Error(rpcError.message);
      await load();
      setNotice("Invite ready. Copy the link or send it on WhatsApp.");
    } catch (e: unknown) {
      setError(errText(e) || "Could not create the invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!info?.contact_id) return;
    if (!confirm(`Revoke portal access for ${info.contact_name || "this contact"}?\n\nTheir link and password stop working immediately and any open portal session is signed out. You can invite them again later with a new link.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc("revoke_contact_portal_access", { p_contact_id: info.contact_id });
      if (rpcError) throw new Error(rpcError.message);
      await load();
      setNotice("Access revoked.");
    } catch (e: unknown) {
      setError(errText(e) || "Could not revoke access.");
    } finally {
      setBusy(false);
    }
  }

  const url = getContactPortalUrl(info?.portal_token);

  async function copyLink() {
    if (!url) return;
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Invite link copied.");
    } catch {
      setNotice("");
      setError("Could not copy automatically. Link: " + url);
    }
  }

  function sendWhatsApp() {
    if (!url || !info) return;
    const text = buildContactInviteMessage({
      contactName: info.contact_name,
      companyName: companyDisplayName(companySettings?.company_name),
      projectName,
      url,
    });
    window.open(buildWhatsAppUrl(phone, text), "_blank", "noopener");
  }

  let body: React.ReactNode;
  if (loading && !info) {
    body = <p className="text-xs text-slate-500">Loading…</p>;
  } else if (!info) {
    body = null;
  } else if (info.status === "no_contact") {
    body = <p className="text-xs text-slate-500">No contact assigned to this project.</p>;
  } else if (info.client_portal_enabled === false) {
    body = <p className="text-xs text-slate-500">Turn on the client portal for {clientName} first (Clients page).</p>;
  } else {
    const who = (
      <p className="text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-800 dark:text-slate-200">{info.contact_name}</span>
        {info.contact_email ? <span> · {info.contact_email}</span> : <span className="text-amber-600 dark:text-amber-400"> · no email on file</span>}
      </p>
    );
    if (info.status === "not_invited") {
      body = (
        <div className="space-y-3">
          {who}
          <div><button className={btnPrimary} disabled={busy} onClick={invite}>Invite to portal</button></div>
        </div>
      );
    } else if (info.status === "invited") {
      body = (
        <div className="space-y-3">
          {who}
          <p className="text-xs text-slate-500">Invited {formatJamaicaDateTime(info.invited_at)}, not set up yet.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} disabled={busy} onClick={copyLink}>Copy invite link</button>
            <button className={btnGhost} disabled={busy} onClick={sendWhatsApp}>Send on WhatsApp</button>
            <button className={btnDanger} disabled={busy} onClick={revoke}>Revoke</button>
          </div>
        </div>
      );
    } else if (info.status === "active") {
      body = (
        <div className="space-y-3">
          {who}
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Active since {formatJamaicaDateTime(info.activated_at)}.</p>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} disabled={busy} onClick={copyLink}>Copy invite link</button>
            <button className={btnGhost} disabled={busy} onClick={sendWhatsApp}>Send on WhatsApp</button>
            <button className={btnDanger} disabled={busy} onClick={revoke}>Revoke</button>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="space-y-3">
          {who}
          <p className="text-xs text-red-600 dark:text-red-400">Access revoked.</p>
          <div>
            <button className={btnPrimary} disabled={busy} onClick={invite}>Invite again</button>
            <span className="ml-2 text-[11px] text-slate-500">Issues a new link; the old link and password stop working.</span>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Field officer portal access</div>
      </div>
      {body}
      {notice && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{notice}</p>}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400 break-words">{error}</p>}
    </div>
  );
}
