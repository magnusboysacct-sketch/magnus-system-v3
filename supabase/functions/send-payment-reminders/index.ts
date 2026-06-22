// supabase/functions/send-payment-reminders/index.ts
// Runs on a daily cron schedule. Checks all invoices with reminders enabled,
// sends an email via Resend to any client whose invoice is due for a reminder today.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function buildReminderEmail(invoice: any, client: any, companyName: string) {
  const isOverdue = new Date(invoice.due_date) < new Date();
  const greeting = client.contact_name || client.name;
  const intro = isOverdue ? "This is a friendly reminder that" : "This is a reminder that";
  const dueText = isOverdue ? "is now overdue" : `is due on ${fmtDate(invoice.due_date)}`;

  const text = `Hi ${greeting},\n\n${intro} Invoice #${invoice.invoice_number} for ${fmtJMD(Number(invoice.balance_due))} ${dueText}.\n\nPlease arrange payment at your earliest convenience. Let us know if you have any questions.\n\nThank you,\n${companyName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <p>Hi ${greeting},</p>
      <p>${intro} <strong>Invoice #${invoice.invoice_number}</strong> for <strong>${fmtJMD(Number(invoice.balance_due))}</strong> ${dueText}.</p>
      <p>Please arrange payment at your earliest convenience. Let us know if you have any questions.</p>
      <p>Thank you,<br/>${companyName}</p>
    </div>
  `;

  return { subject: `Payment Reminder - Invoice #${invoice.invoice_number}`, text, html };
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${res.status} - ${err}`);
  }
  return res.json();
}

function isReminderDue(invoice: any): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(invoice.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const daysBefore = invoice.reminder_days_before ?? 3;
  const repeatDays = invoice.reminder_repeat_days ?? 7;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / msPerDay);

  if (daysUntilDue === daysBefore && !invoice.last_reminder_sent_at) return true;

  if (daysUntilDue < 0) {
    if (!invoice.last_reminder_sent_at) return true;
    const lastSent = new Date(invoice.last_reminder_sent_at);
    const daysSinceLastReminder = Math.floor((today.getTime() - lastSent.getTime()) / msPerDay);
    if (daysSinceLastReminder >= repeatDays) return true;
  }

  return false;
}

Deno.serve(async (req) => {
  try {
    const { data: invoices, error: invErr } = await supabase
      .from("client_invoices")
      .select("id, company_id, client_id, invoice_number, due_date, balance_due, status, reminder_enabled, reminder_days_before, reminder_repeat_days, last_reminder_sent_at")
      .eq("reminder_enabled", true)
      .gt("balance_due", 0)
      .not("status", "in", '("paid","cancelled","draft")');

    if (invErr) throw invErr;
    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No invoices to process" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const dueToday = invoices.filter(isReminderDue);
    let sentCount = 0;
    const results: any[] = [];

    for (const invoice of dueToday) {
      try {
        const { data: client } = await supabase
          .from("clients")
          .select("name, contact_name, email")
          .eq("id", invoice.client_id)
          .maybeSingle();

        if (!client?.email) {
          results.push({ invoice: invoice.invoice_number, status: "skipped", reason: "no email on file" });
          continue;
        }

        const { data: company } = await supabase
          .from("company_settings")
          .select("company_name")
          .eq("company_id", invoice.company_id)
          .maybeSingle();

        const companyName = company?.company_name || "Magnus Boys Construction";
        const { subject, html, text } = buildReminderEmail(invoice, client, companyName);

        await sendEmail(client.email, subject, html, text);

        await supabase
          .from("client_invoices")
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq("id", invoice.id);

        sentCount++;
        results.push({ invoice: invoice.invoice_number, status: "sent", to: client.email });
      } catch (e: any) {
        results.push({ invoice: invoice.invoice_number, status: "error", error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount, total_checked: invoices.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});