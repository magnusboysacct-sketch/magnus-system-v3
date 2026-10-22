// The two database calls behind "Mark as sent" and "Undo - back to draft" (migration 20260954000000). Errors become plain messages.
import { supabase } from "./supabase";
import { markSentError, type MarkSentInput } from "./invoiceMarkSent";

export async function markInvoiceSent(invoiceId: string, i: MarkSentInput): Promise<void> {
  const { error } = await supabase.rpc("mark_invoice_sent", {
    p_invoice_id: invoiceId, p_sent_date: i.sentDate, p_method: i.method, p_note: i.note.trim() || null, p_reminders: i.reminders, p_portal: i.portal,
  });
  if (error) throw new Error(markSentError(error));
}

export async function undoMarkedSent(invoiceId: string): Promise<void> {
  const { error } = await supabase.rpc("unmark_invoice_sent", { p_invoice_id: invoiceId });
  if (error) throw new Error(markSentError(error));
}
