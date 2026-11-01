// src/public/Forms.tsx — "Book a demo" and "Ideas & feedback" forms for the public website.
// Each has a hidden field robots fill in and people never see; the database also limits how often one visitor can send.

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { sendFeedback, sendLead } from "./publicApi";

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#1b2a6b] focus:ring-2 focus:ring-[#1b2a6b]/15 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:placeholder-slate-500";
const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

// Hidden from people (off-screen, not focusable); bots that fill every field get caught.
function Trap({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label>Website<input tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} name="website" /></label>
    </div>
  );
}

function Done({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
      <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> {text}
    </div>
  );
}

export function DemoForm() {
  const [f, setF] = useState({ name: "", company: "", phone: "", email: "", message: "", trap: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  if (done) return <Done text="Thanks! We'll call or WhatsApp you soon to set up your demo." />;

  return (
    <form className="relative space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await sendLead(f); setDone(true); } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
    }}>
      <Trap value={f.trap} onChange={(v) => setF({ ...f, trap: v })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor="d-name">Your name</label><input id="d-name" className={input} value={f.name} onChange={set("name")} autoComplete="name" required /></div>
        <div><label className={label} htmlFor="d-co">Company</label><input id="d-co" className={input} value={f.company} onChange={set("company")} autoComplete="organization" /></div>
        <div><label className={label} htmlFor="d-phone">Phone / WhatsApp</label><input id="d-phone" className={input} value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="876 ..." /></div>
        <div><label className={label} htmlFor="d-email">Email</label><input id="d-email" type="email" className={input} value={f.email} onChange={set("email")} autoComplete="email" /></div>
      </div>
      <div><label className={label} htmlFor="d-msg">What would you like to see? (optional)</label><textarea id="d-msg" rows={3} className={input} value={f.message} onChange={set("message")} placeholder="e.g. payroll for 25 workers and purchase orders" /></div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#c8102e] px-5 py-3 text-sm font-semibold text-white hover:bg-[#a50d26] disabled:opacity-60">
        <Send size={15} /> {busy ? "Sending..." : "Book my demo"}
      </button>
    </form>
  );
}

const KINDS = [
  { key: "idea", label: "An idea" },
  { key: "problem", label: "Something's not working" },
  { key: "like", label: "Something I like" },
  { key: "other", label: "Other" },
];

export function FeedbackForm({ compact }: { compact?: boolean }) {
  const [f, setF] = useState({ kind: "idea", message: "", contact: "", trap: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <Done text="Thank you! Every message is read by the Magnus team." />;

  return (
    <form className="relative space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await sendFeedback({ ...f, page: document.referrer ? new URL(document.referrer).pathname : window.location.pathname }); setDone(true); }
      catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
    }}>
      <Trap value={f.trap} onChange={(v) => setF({ ...f, trap: v })} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What is this about?">
        {KINDS.map((k) => (
          <button key={k.key} type="button" role="radio" aria-checked={f.kind === k.key} onClick={() => setF({ ...f, kind: k.key })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${f.kind === k.key
              ? "border-[#1b2a6b] bg-[#1b2a6b] text-white dark:border-white dark:bg-white dark:text-slate-900"
              : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"}`}>
            {k.label}
          </button>
        ))}
      </div>
      <div><label className={label} htmlFor="f-msg">Your message</label><textarea id="f-msg" rows={compact ? 3 : 5} className={input} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required /></div>
      <div><label className={label} htmlFor="f-contact">How can we reach you? (optional)</label><input id="f-contact" className={input} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="Phone, WhatsApp or email" /></div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#1b2a6b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#15215a] disabled:opacity-60 dark:bg-white dark:text-slate-900">
        <Send size={14} /> {busy ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
