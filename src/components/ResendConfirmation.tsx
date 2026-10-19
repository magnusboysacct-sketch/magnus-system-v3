// "Resend email" for the signup confirmation: one request, then a 60-second wait (shown as a countdown), with the answer shown right under the button.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { RESEND_SECONDS, resendErrorMessage, secondsUntilResend } from "../lib/signupPending";

export default function ResendConfirmation({ email, lastSentAt, onSent }: {
  email: string;
  lastSentAt: number;                 // Date.now() of the last email sent for this address, 0 = none yet
  onSent: (sentAt: number) => void;   // the parent keeps it (so the countdown survives a refresh)
}) {
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const left = secondsUntilResend(lastSentAt, now);
  const counting = left > 0;
  useEffect(() => {
    if (!counting) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [counting, lastSentAt]);

  async function resend() {
    if (sending || secondsUntilResend(lastSentAt, Date.now()) > 0) return;
    setSending(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) {
      setMsg({ ok: false, text: resendErrorMessage(error) });
      // Supabase says "wait": honour it with the same countdown instead of letting the button be pressed again at once
      if ((error as { status?: number }).status === 429 || (error as { code?: string }).code === "over_email_send_rate_limit") { const t = Date.now(); setNow(t); onSent(t); }
      return;
    }
    const t = Date.now();
    setNow(t);
    onSent(t);
    setMsg({ ok: true, text: "Email sent again. It can take a minute or two to arrive." });
  }

  return (
    <div>
      <button
        type="button"
        onClick={resend}
        disabled={sending || counting}
        className="w-full min-h-[48px] rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-3 text-sm font-semibold transition disabled:opacity-60 disabled:hover:bg-blue-50"
      >
        {sending ? "Sending…" : counting ? `Resend email (wait ${left}s)` : "Resend email"}
      </button>
      {counting && <p className="mt-1 text-center text-xs text-slate-500">You can ask for another email in {left} second{left === 1 ? "" : "s"} (of {RESEND_SECONDS}).</p>}
      {msg && (
        <p role="status" className={`mt-2 rounded-md border px-3 py-2 text-sm ${msg.ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200"}`}>{msg.text}</p>
      )}
    </div>
  );
}
