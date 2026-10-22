// "Mark as sent" for client invoices handed over (or never sent) instead of emailed from the app: the rules, the wording and the two database calls.
// The database does the work (migration 20260954000000: mark_invoice_sent / unmark_invoice_sent); this is what the dialog and the invoice page share.
// (The two database calls are in invoiceMarkSentApi.ts, so this file stays free of the Supabase client and can be tested on its own.)

export type SentMethod = "hand_delivered" | "whatsapp" | "printed" | "not_sent" | "other";

export const SENT_METHODS: Array<{ value: SentMethod; label: string }> = [
  { value: "hand_delivered", label: "Hand delivered" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "printed", label: "Printed" },
  { value: "not_sent", label: "Not sent (records only)" },
  { value: "other", label: "Other" },
];

export const sentMethodLabel = (m: string | null | undefined): string => SENT_METHODS.find((x) => x.value === m)?.label ?? (m ? String(m) : "");

// Same roles as "Send to Client" (the database function share_with_client)
const SEND_ROLES = ["director", "admin", "estimator", "supervisor", "office_user", "secretary"];
export const canMarkSent = (role: string | null | undefined): boolean => SEND_ROLES.includes(String(role ?? ""));
export const canUndoMarkedSent = (role: string | null | undefined): boolean => role === "director" || role === "admin";

// today in Jamaica (the app's day), as YYYY-MM-DD
export function jamaicaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Jamaica", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface MarkSentInput { sentDate: string; method: SentMethod | ""; note: string; reminders: boolean; portal: boolean }

// the dialog's checks, before anything is sent (the database repeats them)
export function validateMarkSent(i: MarkSentInput, today: string = jamaicaToday()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.sentDate || "") || Number.isNaN(Date.parse(i.sentDate))) return "Enter the date the invoice was sent.";
  if (i.sentDate > today) return "The date sent cannot be in the future.";
  if (!i.method || !SENT_METHODS.some((m) => m.value === i.method)) return "Choose how the invoice was delivered.";
  if (i.method === "other" && !i.note.trim()) return "Add a note saying how it was delivered.";
  if (i.note.trim().length > 500) return "The note is too long (500 characters at most).";
  return null;
}

// defaults of the two checkboxes: reminders OFF; the portal ON only when the client has portal access (otherwise it cannot be shown)
export const defaultMarkSent = (clientHasPortal: boolean, today: string = jamaicaToday()): MarkSentInput =>
  ({ sentDate: today, method: "hand_delivered", note: "", reminders: false, portal: !!clientHasPortal });

export interface MarkedSentLike {
  status?: string | null; marked_sent_at?: string | null; marked_sent_by_name?: string | null; sent_date?: string | null;
  sent_method?: string | null; marked_sent_note?: string | null; marked_sent_reminders?: boolean | null; marked_sent_portal?: boolean | null;
}

export const isMarkedSent = (inv: MarkedSentLike | null | undefined): boolean => !!inv?.marked_sent_at && !!inv?.sent_method && inv.status !== "draft";

const longDate = (d: string): string => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

// "Marked as sent by Jane Smith on Oct 3, 2026 - Hand delivered"  (the date is the date it was SENT, which may be back-dated)
export function markedSentLine(inv: MarkedSentLike): string {
  const who = String(inv.marked_sent_by_name ?? "").trim();
  const date = inv.sent_date && /^\d{4}-\d{2}-\d{2}/.test(inv.sent_date) ? longDate(inv.sent_date.slice(0, 10)) : "";
  return `Marked as sent${who ? ` by ${who}` : ""}${date ? ` on ${date}` : ""} - ${sentMethodLabel(inv.sent_method)}`;
}

export function markedSentDetails(inv: MarkedSentLike): string[] {
  const out: string[] = [];
  if (inv.marked_sent_note) out.push(`Note: ${inv.marked_sent_note}`);
  out.push(inv.marked_sent_reminders ? "Automatic payment reminders: on" : "Automatic payment reminders: off");
  out.push(inv.marked_sent_portal ? "Shown in the client portal" : "Not shown in the client portal");
  return out;
}

export function markSentError(e: { message?: string; code?: string } | null | undefined): string {
  const m = String(e?.message ?? "");
  if (e?.code === "42501" || /Only a director or admin/i.test(m)) return "Only a director or admin can take an invoice back to draft.";
  if (/Not allowed/i.test(m)) return "Your role cannot send or mark invoices as sent.";
  if (/Only a draft invoice/i.test(m)) return "Only a draft invoice can be marked as sent. Refresh the page and check its status.";
  if (/payment is recorded/i.test(m)) return "A payment is recorded against this invoice, so it can no longer be taken back to draft.";
  if (/also sent to the client/i.test(m)) return "This invoice was also sent to the client. Withdraw it from the client instead.";
  if (/not marked as sent/i.test(m)) return "This invoice was not marked as sent, or it is already draft or paid.";
  if (/future|Enter the date|Choose how|Add a note|too long|Item not found/i.test(m)) return m;
  return m ? `The invoice could not be updated: ${m}` : "The invoice could not be updated.";
}
