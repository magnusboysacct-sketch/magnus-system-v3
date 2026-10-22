// "Mark as sent" for a draft client invoice: records that it was delivered by hand / WhatsApp / printed / not sent at all, without sending any email or WhatsApp.
// The invoice becomes "sent" for the books (status, sent date, AR aging); reminders and the client portal follow the two checkboxes.
import { useEffect, useState } from "react";
import { SENT_METHODS, defaultMarkSent, jamaicaToday, validateMarkSent, type MarkSentInput } from "../lib/invoiceMarkSent";
import { markInvoiceSent } from "../lib/invoiceMarkSentApi";

export default function MarkAsSentModal({ open, invoice, clientName, clientHasPortal, onClose, onDone }: {
  open: boolean;
  invoice: { id: string; invoice_number: string } | null;
  clientName?: string | null;
  clientHasPortal: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<MarkSentInput>(() => defaultMarkSent(clientHasPortal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm(defaultMarkSent(clientHasPortal)); setError(null); setBusy(false); }
  }, [open, invoice?.id, clientHasPortal]);

  if (!open || !invoice) return null;
  const today = jamaicaToday();
  const set = (patch: Partial<MarkSentInput>) => setForm((f) => ({ ...f, ...patch }));

  async function submit() {
    const problem = validateMarkSent(form, today);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try { await markInvoiceSent(invoice!.id, form); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : "The invoice could not be updated."); setBusy(false); }
  }

  const input = "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100";
  const label = "mb-1 block text-sm font-medium text-slate-500 dark:text-slate-400";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Mark as sent">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Mark Invoice #{invoice.invoice_number} as sent</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Records that the invoice{clientName ? ` for ${clientName}` : ""} was given to the client. It counts as sent in your books and receivables.
          <strong> No email or WhatsApp is sent.</strong>
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={label} htmlFor="mas-date">Date sent</label>
            <input id="mas-date" type="date" className={input} value={form.sentDate} max={today} onChange={(e) => set({ sentDate: e.target.value })} />
          </div>

          <div>
            <label className={label} htmlFor="mas-method">How it was delivered</label>
            <select id="mas-method" className={input} value={form.method} onChange={(e) => set({ method: e.target.value as MarkSentInput["method"] })}>
              {SENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="mas-note">Note{form.method === "other" ? " (required)" : " (optional)"}</label>
            <input id="mas-note" type="text" className={input} maxLength={500} value={form.note} placeholder="e.g. left with the site foreman"
              onChange={(e) => set({ note: e.target.value })} />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" className="mt-0.5" checked={form.reminders} onChange={(e) => set({ reminders: e.target.checked })} />
            <span>
              Send automatic payment reminders to the client
              {form.reminders && form.method === "not_sent" && (
                <span className="block text-xs text-amber-600 dark:text-amber-400">The client has not been given this invoice yet, so a reminder would reach them first.</span>
              )}
            </span>
          </label>

          {clientHasPortal ? (
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={form.portal} onChange={(e) => set({ portal: e.target.checked })} />
              <span>Show in the client portal</span>
            </label>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">This client does not have portal access, so the invoice will not appear in a client portal.</p>
          )}
        </div>

        {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy}
            className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Mark as sent"}
          </button>
        </div>
      </div>
    </div>
  );
}
