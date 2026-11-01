// src/pages/hq/HQLeadsTab.tsx — demo requests from the website (and people who phoned in).
// New → Called → On trial → Won / Lost, with a note. WhatsApp / Call / Email buttons open straight from the card.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Phone, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Alert, Badge, Btn, Card, Field, Input, Modal, Select, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import {
  addLead, ago, deleteLead, fetchLeads, LEAD_LABEL, LEAD_STATUSES, saveLead, when, whatsAppLink,
  type Lead, type LeadStatus,
} from "../../lib/hq/website";

const COLOR: Record<LeadStatus, "amber" | "blue" | "violet" | "green" | "slate"> = {
  new: "amber", called: "blue", trial: "violet", won: "green", lost: "slate",
};

type Filter = LeadStatus | "open" | "all";

function LeadCard({ lead, isOwner, onSaved, onError, onDelete }: {
  lead: Lead; isOwner: boolean; onSaved: (msg: string) => void; onError: (msg: string) => void; onDelete: (l: Lead) => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [note, setNote] = useState(lead.note ?? "");
  const [busy, setBusy] = useState(false);
  const changed = status !== lead.status || note.trim() !== (lead.note ?? "");
  const first = lead.name.split(/\s+/)[0];
  const wa = whatsAppLink(lead.phone, `Hi ${first}, this is Magnus Boy's System. Thanks for asking for a demo. When is a good time to show you?`);

  async function save(next = status) {
    setBusy(true);
    try {
      await saveLead(lead.id, next, note);
      onSaved(`${lead.name}: ${LEAD_LABEL[next]}.`);
    } catch (e: unknown) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <Card padding={false}>
      <div className={cn("p-4 border-l-4 rounded-l-xl space-y-3", lead.status === "new" ? "border-l-amber-400" : "border-l-slate-200 dark:border-l-white/10")}>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{lead.name}</span>
              <Badge color={COLOR[lead.status]}>{LEAD_LABEL[lead.status]}</Badge>
              {lead.source === "hq" && <Badge color="slate">Added by hand</Badge>}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {lead.company ? `${lead.company} · ` : ""}{lead.phone ?? ""}{lead.phone && lead.email ? " · " : ""}{lead.email ?? ""}
            </div>
          </div>
          <span className="text-[11px] text-slate-500" title={when(lead.created_at)}>{ago(lead.created_at)}</span>
        </div>

        {lead.message && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{lead.message}</p>}

        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">
              <MessageCircle size={13} /> WhatsApp
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              <Phone size={13} /> Call
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}?subject=${encodeURIComponent("Your Magnus Boy's System demo")}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]">
              <Mail size={13} /> Email
            </a>
          )}
          {lead.status === "new" && <Btn variant="primary" disabled={busy} onClick={() => { setStatus("called"); void save("called"); }}>Mark called</Btn>}
        </div>

        <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto] items-start">
          <Select value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)} aria-label="Status">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_LABEL[s]}</option>)}
          </Select>
          <Textarea rows={1} value={note} placeholder="Note (e.g. call back Friday, wants payroll)" onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Btn variant="primary" disabled={!changed || busy} onClick={() => { void save(); }}>Save</Btn>
            {isOwner && (
              <button type="button" title="Delete (junk / spam only)" aria-label="Delete" onClick={() => onDelete(lead)}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        {lead.updated_at !== lead.created_at && <p className="text-[10px] text-slate-500">Last changed {when(lead.updated_at)}</p>}
      </div>
    </Card>
  );
}

export default function HQLeadsTab({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", message: "" });
  const [removing, setRemoving] = useState<Lead | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await fetchLeads()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setRows((r) => r ?? []); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const count = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0, open: 0 };
    for (const r of rows ?? []) { c[r.status] = (c[r.status] ?? 0) + 1; if (r.status !== "won" && r.status !== "lost") c.open++; }
    return c;
  }, [rows]);

  const shown = (rows ?? []).filter((r) =>
    filter === "all" ? true : filter === "open" ? r.status !== "won" && r.status !== "lost" : r.status === filter);

  async function saved(msg: string) { setNotice(msg); await load(); }

  async function add() {
    setBusy(true); setError(null);
    try {
      await addLead(form);
      setAdding(false); setForm({ name: "", company: "", phone: "", email: "", message: "" });
      await saved("Added.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true); setError(null);
    try {
      await deleteLead(removing.id, reason.trim());
      setRemoving(null); setReason("");
      await saved("Deleted.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "open", label: "Open" },
    ...LEAD_STATUSES.map((s) => ({ key: s as Filter, label: LEAD_LABEL[s] })),
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Btn key={c.key} variant={filter === c.key ? "primary" : "secondary"} onClick={() => setFilter(c.key)}>
            {c.label} ({count[c.key] ?? 0})
          </Btn>
        ))}
        <div className="flex-1" />
        <Btn icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add by hand</Btn>
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>

      {rows === null ? <div className="flex justify-center py-12"><Spinner /></div> : shown.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-slate-500"><Users size={16} />
            {rows.length === 0 ? "No demo requests yet. They come from the form on the home page." : "Nothing here."}
          </div>
        </Card>
      ) : shown.map((l) => (
        <LeadCard key={`${l.id}:${l.updated_at}`} lead={l} isOwner={isOwner}
          onSaved={(m) => { void saved(m); }} onError={setError} onDelete={setRemoving} />
      ))}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a demo request by hand" subtitle="For someone who phoned or messaged you.">
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Phone / WhatsApp"><Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="What they want"><Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAdding(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={busy || form.name.trim().length < 2} onClick={() => { void add(); }}>Add</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} subtitle="Only for junk or spam. Use Lost for real people.">
        <div className="space-y-3">
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. spam" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setRemoving(null)}>Cancel</Btn>
            <Btn variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => { void remove(); }}>Delete</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
