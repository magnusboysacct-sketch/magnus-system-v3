// src/pages/hq/HQAskSettings.tsx — Settings → Ask HQ: on/off, monthly US$ limit, model and prices (owner-admin only).
// The Anthropic key is NEVER typed here: it lives only in Vercel as ANTHROPIC_API_KEY.

import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Progress, Spinner } from "../../components/ui";
import { fetchAssistantStatus, saveAssistant, usd, type AssistantStatus } from "../../lib/hq/ask";

export default function HQAskSettings({ isOwner }: { isOwner: boolean }) {
  const [s, setS] = useState<AssistantStatus | null>(null);
  const [form, setForm] = useState({ on: false, cap: "", model: "", pin: "", pout: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const v = await fetchAssistantStatus();
    setS(v);
    setForm({ on: v.on, cap: String(v.cap_usd), model: v.model, pin: String(v.price_in), pout: String(v.price_out) });
  }, []);
  useEffect(() => { load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); }, [load]);

  async function save() {
    setBusy(true); setError(null);
    try {
      await saveAssistant({ on: form.on, cap_usd: Number(form.cap), model: form.model.trim(), price_in: Number(form.pin), price_out: Number(form.pout) }, reason.trim());
      setAsking(false); setReason("");
      await load();
      setNotice("Ask HQ settings saved.");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!s) return <Card>{error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-6"><Spinner /></div>}</Card>;

  const dirty = form.on !== s.on || Number(form.cap) !== s.cap_usd || form.model.trim() !== s.model || Number(form.pin) !== s.price_in || Number(form.pout) !== s.price_out;

  return (
    <Card>
      <CardHeader title="Ask HQ assistant" subtitle="A chat in HQ that explains the numbers and suggests actions. You confirm every action."
        action={s.on ? <Badge color="green">On</Badge> : <Badge color="slate">Off</Badge>} />
      <div className="space-y-4">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 mb-1">
            <span className="flex items-center gap-1.5"><Bot size={13} /> Spent this month: <b>{usd(s.spent_usd)}</b> of {usd(s.cap_usd)}</span>
            <span>{s.questions_this_month} question{s.questions_this_month === 1 ? "" : "s"}</span>
          </div>
          <Progress value={Math.min(s.spent_usd, s.cap_usd)} max={Math.max(s.cap_usd, 0.0001)} color={s.spent_usd >= s.cap_usd * 0.8 ? "amber" : "cyan"} />
          <p className="text-[11px] text-slate-500 mt-1">When the limit is reached, Ask HQ stops until next month (Jamaica time) or until you raise it.</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
          <input type="checkbox" checked={form.on} disabled={!isOwner} onChange={(e) => setForm({ ...form, on: e.target.checked })} className="h-4 w-4" />
          Ask HQ switched on
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly limit (US$)"><Input inputMode="decimal" value={form.cap} disabled={!isOwner} onChange={(e) => setForm({ ...form, cap: e.target.value })} /></Field>
          <Field label="Model" hint="From Anthropic's model list, e.g. claude-sonnet-5-5"><Input value={form.model} disabled={!isOwner} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
          <Field label="Price in (US$ per million tokens)"><Input inputMode="decimal" value={form.pin} disabled={!isOwner} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></Field>
          <Field label="Price out (US$ per million tokens)"><Input inputMode="decimal" value={form.pout} disabled={!isOwner} onChange={(e) => setForm({ ...form, pout: e.target.value })} /></Field>
        </div>
        <p className="text-[11px] text-slate-500">
          Copy the prices from Anthropic's price page for the model you use, so the cost shown here matches your Anthropic bill.
          A normal question costs about 2 to 5 US cents. The key is never typed here: it goes only in Vercel as ANTHROPIC_API_KEY.
        </p>

        {isOwner ? (
          <div className="flex justify-end gap-2">
            {dirty && <Btn onClick={() => setForm({ on: s.on, cap: String(s.cap_usd), model: s.model, pin: String(s.price_in), pout: String(s.price_out) })}>Undo</Btn>}
            <Btn variant="primary" disabled={!dirty} onClick={() => setAsking(true)}>Save</Btn>
          </div>
        ) : <p className="text-[11px] text-slate-500">Only the owner-admin can change these.</p>}
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title="Save Ask HQ settings" subtitle="Goes in the HQ activity log.">
        <div className="space-y-3">
          <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. switching it on, US$10 a month" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAsking(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={busy || reason.trim().length < 3} onClick={() => { void save(); }}>Save</Btn>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
