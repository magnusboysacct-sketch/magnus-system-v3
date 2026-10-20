// "Portal login" in the client form: the email the client signs in to the portal with, and (director / admin) a clear "Change portal email" action.
// The client's own Email field above is just contact details: changing it never changes who can sign in (the database keeps the login email, migration 20260953000000).
import { useState } from "react";
import { supabase } from "../lib/supabase";
import { canChangePortalEmail, changeConfirmation, portalEmailError, portalLoginEmail, validatePortalEmail, type PortalClientLike } from "../lib/clientPortalEmail";
import { Btn, Input, Field } from "./ui";

export default function ClientPortalEmail({ clientId, clientName, client, role, onChanged }: {
  clientId: string; clientName: string; client: PortalClientLike; role: string | null | undefined; onChanged: (newEmail: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = portalLoginEmail(client);
  const mayChange = canChangePortalEmail(role);

  async function submit() {
    setMsg(null);
    const problem = validatePortalEmail(value, current);
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    if (!window.confirm(changeConfirmation(clientName, current, value))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("change_client_portal_email", { p_client_id: clientId, p_new_email: value.trim() });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: portalEmailError(error) }); return; }
    const next = String((data as { new_email?: string } | null)?.new_email || value.trim().toLowerCase());
    onChanged(next);
    setOpen(false); setValue("");
    setMsg({ ok: true, text: `The portal login email is now ${next}.` });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-2" data-testid="client-portal-email">
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Portal login</div>
      <div className="text-xs text-slate-600 dark:text-slate-300">
        Signs in with: <span className="font-semibold break-all">{current || "(no email yet)"}</span>
        <div className="text-[10px] text-slate-500 mt-0.5">Changing the Email above does not change this.</div>
      </div>
      {msg && <div role="status" className={`text-xs ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.text}</div>}
      {mayChange ? (
        !open
          ? <Btn variant="secondary" size="sm" onClick={() => { setOpen(true); setMsg(null); }}>Change portal email</Btn>
          : (
            <div className="space-y-2">
              <Field label="New portal email"><Input type="email" placeholder="e.g. name@company.com" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></Field>
              <div className="flex gap-2">
                <Btn variant="primary" size="sm" onClick={() => void submit()} disabled={busy || !value.trim()}>{busy ? "Changing…" : "Change portal email"}</Btn>
                <Btn variant="ghost" size="sm" onClick={() => { setOpen(false); setValue(""); setMsg(null); }} disabled={busy}>Cancel</Btn>
              </div>
            </div>
          )
      ) : (
        <div className="text-[10px] text-slate-500">Only a director or admin can change the portal login email.</div>
      )}
    </div>
  );
}
