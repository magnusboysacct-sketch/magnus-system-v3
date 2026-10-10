import { useEffect, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Alert, Btn, Field, Input } from "./ui";
import {
  CONTACTS_NOT_READY_MESSAGE,
  addClientContact,
  deleteClientContact,
  fetchClientContacts,
  setPrimaryContact,
  updateClientContact,
  type ClientContact,
} from "../lib/clientContacts";

interface Props {
  clientId: string;
  // What the client row holds today, used to pre-fill the first contact so adding it doesn't blank those details out
  // (the client's contact_name / phone / email follow the primary contact once there is one).
  clientContactName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  // Called with the fresh list after the list loads and after every change, so the page can refresh the client's mirrored fields.
  onChanged?: (contacts: ClientContact[]) => void;
  // Called when the contacts table doesn't exist yet, so the page can fall back to its old single "Contact Person" field.
  onNotReady?: () => void;
}

const EMPTY = { name: "", title: "", phone: "", email: "" };

// The contacts of one client: list, add, edit, delete, and "make primary". The database keeps exactly one primary and mirrors it
// onto the client's own contact columns.
export default function ClientContactsManager({ clientId, clientContactName, clientPhone, clientEmail, onChanged, onNotReady }: Props) {
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  async function reload(notify: boolean) {
    try {
      const list = await fetchClientContacts(clientId);
      setContacts(list);
      if (notify) onChanged?.(list);
      return list;
    } catch (e: any) {
      if (e?.message === CONTACTS_NOT_READY_MESSAGE) onNotReady?.();
      setError(e?.message || "Contacts could not be loaded.");
      return null;
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setEditingId(null);
    (async () => {
      const list = await reload(true);
      if (alive) setLoading(false);
      return list;
    })();
    return () => { alive = false; };
  }, [clientId]);

  function startAdd() {
    setError(null);
    // First contact for a client that already has details on its row: start from those, so nothing is lost when they get mirrored.
    setForm(contacts.length === 0
      ? { name: clientContactName || "", title: "", phone: clientPhone || "", email: clientEmail || "" }
      : EMPTY);
    setEditingId("new");
  }

  function startEdit(c: ClientContact) {
    setError(null);
    setForm({ name: c.name, title: c.title || "", phone: c.phone || "", email: c.email || "" });
    setEditingId(c.id);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await action();
      await reload(true);
    } catch (e: any) {
      setError(e?.message || "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await run(async () => {
      if (editingId === "new") await addClientContact(clientId, form);
      else if (editingId) await updateClientContact(editingId, form);
      setEditingId(null);
    });
  }

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">Contacts</div>
        {editingId === null && !loading && (
          <button type="button" onClick={startAdd} disabled={busy}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-400 disabled:opacity-50">
            <Plus size={12}/> Add contact
          </button>
        )}
      </div>

      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <div className="text-xs text-slate-500">Loading contacts…</div>
      ) : contacts.length === 0 && editingId === null ? (
        <div className="text-xs text-slate-500">No contacts yet. Add one - the first becomes the primary contact.</div>
      ) : (
        <ul className="space-y-1.5">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 dark:border-white/[0.08] px-3 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</span>
                    {c.title && <span className="text-[11px] text-slate-500">{c.title}</span>}
                    {c.is_primary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-500 px-2 py-0.5 text-[10px] font-bold">
                        <Star size={9}/> Primary
                      </span>
                    )}
                  </div>
                  {(c.phone || c.email) && (
                    <div className="text-[11px] text-slate-500 truncate">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!c.is_primary && (
                    <button type="button" disabled={busy} onClick={() => run(() => setPrimaryContact(c.id))}
                      className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:text-amber-500 hover:bg-amber-500/10 disabled:opacity-50" title="Make this the primary contact">
                      Make primary
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => startEdit(c)}
                    className="rounded p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 disabled:opacity-50" title="Edit contact"><Pencil size={12}/></button>
                  <button type="button" disabled={busy}
                    onClick={() => { if (window.confirm(`Delete ${c.name}?${c.is_primary && contacts.length > 1 ? " The next contact becomes the primary." : ""}`)) run(() => deleteClientContact(c.id)); }}
                    className="rounded p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50" title="Delete contact"><Trash2 size={12}/></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId !== null && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input placeholder="e.g. John Smith" value={form.name} onChange={set("name")} autoFocus/></Field>
            <Field label="Title (optional)"><Input placeholder="e.g. Site Manager" value={form.title} onChange={set("title")}/></Field>
            <Field label="Phone"><Input placeholder="e.g. 876-555-0100" value={form.phone} onChange={set("phone")}/></Field>
            <Field label="Email"><Input type="email" placeholder="e.g. john@abc.com" value={form.email} onChange={set("email")}/></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => { setEditingId(null); setError(null); }} disabled={busy}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={busy || !form.name.trim()}>{busy ? "Saving..." : editingId === "new" ? "Add contact" : "Save contact"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
