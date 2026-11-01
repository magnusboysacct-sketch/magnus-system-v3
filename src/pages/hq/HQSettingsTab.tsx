// src/pages/hq/HQSettingsTab.tsx — Magnus HQ Settings: message to everyone, maintenance mode, new sign-ups,
// feature switches and the support contact. Every change asks for a reason and goes in the activity log.
// (Jamaican statutory rates arrive in Step 8b.)

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Power, UserPlus, Wrench } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Select, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchRawSettings, saveSetting } from "../../lib/hq/platformAdmin";
import { FEATURE_NAMES, refreshPlatformSettings, type FeatureKey } from "../../lib/platformSettings";

type Pending = { key: string; value: unknown; title: string; danger?: boolean; note?: string } | null;

export default function HQSettingsTab() {
  const [s, setS] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [bKind, setBKind] = useState<"news" | "heads_up" | "urgent">("news");
  const [bText, setBText] = useState("");
  const [bLink, setBLink] = useState("");
  const [mMsg, setMMsg] = useState("");
  const [wa, setWa] = useState("");
  const [email, setEmail] = useState("");

  const apply = useCallback((v: Record<string, unknown>) => {
    setS(v);
    const m = (v.maintenance ?? {}) as { message?: string };
    setMMsg(m.message ?? "");
    const c = (v.support_contact ?? {}) as { whatsapp?: string; email?: string };
    setWa(c.whatsapp ?? ""); setEmail(c.email ?? "");
  }, []);

  useEffect(() => {
    let alive = true;
    fetchRawSettings().then((v) => { if (alive) apply(v); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [apply]);

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      await saveSetting(pending.key, pending.value, reason.trim());
      setNotice(`${pending.title}: saved.`);
      setPending(null); setReason("");
      apply(await fetchRawSettings());
      void refreshPlatformSettings();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!s) return error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-16"><Spinner /></div>;

  const banner = s.banner as { kind: string; text: string; link: string | null; on: boolean } | null;
  const maint = (s.maintenance ?? {}) as { on?: boolean; message?: string };
  const signups = s.signups_open !== false;
  const feats = (s.features ?? {}) as Record<string, boolean>;

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Banner */}
        <Card>
          <CardHeader title="Message to everyone" subtitle="A banner on every screen. Each person can close it once." />
          {banner?.on ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 dark:border-white/10 p-3 text-xs">
              <Megaphone size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1"><Badge color={banner.kind === "urgent" ? "red" : banner.kind === "heads_up" ? "amber" : "blue"}>{banner.kind.replace("_", " ")}</Badge> {banner.text}</div>
              <Btn size="xs" onClick={() => setPending({ key: "banner", value: null, title: "Remove the message" })}>Remove</Btn>
            </div>
          ) : <p className="text-xs text-slate-500 mb-3">No message showing.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Type">
              <Select value={bKind} onChange={(e) => setBKind(e.target.value as typeof bKind)}>
                <option value="news">News</option><option value="heads_up">Heads up</option><option value="urgent">Urgent</option>
              </Select>
            </Field>
            <div className="sm:col-span-2"><Field label="Link (optional)"><Input value={bLink} onChange={(e) => setBLink(e.target.value)} placeholder="/status or https://..." /></Field></div>
          </div>
          <Field label="Message"><Textarea rows={2} maxLength={300} value={bText} onChange={(e) => setBText(e.target.value)} placeholder="e.g. Magnus will be updated tonight from 10 pm to 11 pm." /></Field>
          <div className="mt-2 flex justify-end">
            <Btn variant="primary" disabled={bText.trim().length < 3}
              onClick={() => setPending({ key: "banner", value: { kind: bKind, text: bText.trim(), link: bLink.trim() || null, on: true }, title: "Show the message to everyone" })}>
              Show to everyone
            </Btn>
          </div>
        </Card>

        {/* Maintenance */}
        <Card>
          <CardHeader title="Maintenance mode" subtitle="Everyone except platform admins sees a 'being updated' page." />
          <div className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 mb-3",
            maint.on ? "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/5" : "border-slate-200 dark:border-white/10")}>
            <div className="flex items-center gap-2 text-sm font-semibold"><Wrench size={15} /> {maint.on ? "Maintenance is ON" : "Maintenance is off"}</div>
            <Btn variant={maint.on ? "primary" : "danger"}
              onClick={() => setPending({ key: "maintenance", value: { on: !maint.on, message: mMsg.trim() }, title: maint.on ? "Turn maintenance OFF" : "Turn maintenance ON", danger: !maint.on,
                note: maint.on ? undefined : "Every company user, client and worker is locked out until you turn it off. You (HQ admins) still get in." })}>
              {maint.on ? "Turn off" : "Turn on"}
            </Btn>
          </div>
          <Field label="Message people see"><Textarea rows={2} maxLength={400} value={mMsg} onChange={(e) => setMMsg(e.target.value)} placeholder="We're updating Magnus. Back by 11 pm." /></Field>
          {maint.on && mMsg !== (maint.message ?? "") && (
            <div className="mt-2 flex justify-end"><Btn onClick={() => setPending({ key: "maintenance", value: { on: true, message: mMsg.trim() }, title: "Update the maintenance message" })}>Update message</Btn></div>
          )}
        </Card>

        {/* Sign-ups */}
        <Card>
          <CardHeader title="New sign-ups" subtitle="Closed = nobody new can create a company. People invited by a company still can." />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm"><UserPlus size={15} /> {signups ? "Open" : "Closed"}</div>
            <Btn variant={signups ? "danger" : "primary"}
              onClick={() => setPending({ key: "signups_open", value: !signups, title: signups ? "Close new sign-ups" : "Open new sign-ups", danger: signups })}>
              {signups ? "Close sign-ups" : "Open sign-ups"}
            </Btn>
          </div>
        </Card>

        {/* Support contact */}
        <Card>
          <CardHeader title="Support contact" subtitle="Shown to companies and on the public site." />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="WhatsApp number"><Input value={wa} onChange={(e) => setWa(e.target.value)} placeholder="+1 876 ..." /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          </div>
          <div className="mt-2 flex justify-end">
            <Btn onClick={() => setPending({ key: "support_contact", value: { whatsapp: wa.trim(), email: email.trim() }, title: "Save the support contact" })}>Save</Btn>
          </div>
        </Card>
      </div>

      {/* Features */}
      <Card>
        <CardHeader title="Feature switches (whole platform)" subtitle="Off = hidden for every company. Their data is kept. Each company can also be switched off on its own (Companies tab)." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(FEATURE_NAMES) as FeatureKey[]).map((k) => {
            const on = feats[k] !== false;
            return (
              <div key={k} className={cn("flex items-center justify-between gap-2 rounded-lg border p-3", on ? "border-slate-200 dark:border-white/10" : "border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5")}>
                <div className="text-sm">{FEATURE_NAMES[k]}</div>
                <Btn size="xs" variant={on ? "secondary" : "primary"} icon={<Power size={12} />}
                  onClick={() => setPending({ key: "features", value: { [k]: !on }, title: `${on ? "Turn off" : "Turn on"} ${FEATURE_NAMES[k]}`, danger: on })}>
                  {on ? "On" : "Off"}
                </Btn>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">When Charging is on, a company only gets the features in its plan. The Free plan gets everything.</p>
      </Card>

      <Card>
        <CardHeader title="Jamaican statutory rates" subtitle="NIS, NHT, Education Tax, PAYE with effective dates" />
        <p className="text-xs text-slate-500">Arrives in the next step (8b), with the official sources for you to confirm before payroll uses them.</p>
      </Card>

      <Modal open={!!pending} onClose={() => setPending(null)} title={pending?.title ?? ""}>
        <div className="space-y-3">
          {pending?.note && <Alert type="warning">{pending.note}</Alert>}
          <Field label="Reason (saved in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setPending(null)}>Cancel</Btn>
            <Btn variant={pending?.danger ? "danger" : "primary"} disabled={busy || reason.trim().length < 3} onClick={() => { void confirm(); }}>
              {busy ? "Saving..." : "Confirm"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
