// src/pages/hq/HQBillsTab.tsx — My subscriptions & bills: every service Magnus Boy's System depends on, with a
// Pay now button to its billing page. Green = more than 14 days away, gold = due within 14 days, red = OVERDUE.
// Owner-admin only. Never store passwords, full card numbers or API keys (the database refuses them).

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, History, Pencil, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Alert, Badge, Btn, Card, Field, Input, Modal, Select, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import {
  billColor, fetchSubscriptionHistory, fetchSubscriptions, markSubscriptionPaid, money, saveSubscription,
  type Subscription, type SubscriptionPayment, type SubscriptionsData,
} from "../../lib/hq/bills";
import { fetchHealth, fetchSystem, type HQHealth, type HQSystem } from "../../lib/hq/platformAdmin";

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
const day = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-JM", { dateStyle: "medium" }) : "—");
const todayJM = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });

const BORDER = { red: "border-l-red-500", gold: "border-l-amber-400", green: "border-l-emerald-500", none: "border-l-slate-200 dark:border-l-white/10" };

function dueText(s: Subscription) {
  if (!s.active) return "Not used";
  if (s.days_left == null) return "Due date not set";
  if (s.days_left < 0) return `OVERDUE ${-s.days_left} day${s.days_left === -1 ? "" : "s"} (was ${day(s.next_due)})`;
  if (s.days_left === 0) return "Due TODAY";
  return `Due ${day(s.next_due)} (${s.days_left} days)`;
}

const EMPTY: Partial<Subscription> = { service: "", currency: "USD", cycle: "monthly", active: true, critical: false, auto_renew: false, sort: 100 };

function EditModal({ sub, onClose, onSaved }: { sub: Partial<Subscription>; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<Partial<Subscription>>(sub);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Subscription>(k: K, v: Subscription[K] | null) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setError(null);
    try { await saveSubscription(s, reason.trim()); onSaved(); } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={sub.id ? `Edit ${sub.service}` : "Add a service"} width="max-w-2xl">
      <div className="space-y-3">
        <Alert type="warning">Never type passwords, full card numbers or API keys here. Card: last 4 digits only.</Alert>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service"><Input value={s.service ?? ""} onChange={(e) => set("service", e.target.value)} /></Field>
          <Field label="Plan"><Input value={s.plan ?? ""} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. Pro" /></Field>
          <Field label="What it's for"><Input value={s.purpose ?? ""} onChange={(e) => set("purpose", e.target.value)} /></Field>
          <Field label="Login email used"><Input type="email" value={s.login_email ?? ""} onChange={(e) => set("login_email", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cost"><Input type="number" min={0} step="0.01" value={s.cost ?? ""} onChange={(e) => set("cost", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            <Field label="Currency">
              <Select value={s.currency ?? "USD"} onChange={(e) => set("currency", e.target.value as Subscription["currency"])}><option value="USD">US$</option><option value="JMD">J$</option></Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Every">
              <Select value={s.cycle ?? "monthly"} onChange={(e) => set("cycle", e.target.value as Subscription["cycle"])}><option value="monthly">Month</option><option value="yearly">Year</option></Select>
            </Field>
            <Field label="Next due"><Input type="date" value={s.next_due?.slice(0, 10) ?? ""} onChange={(e) => set("next_due", e.target.value || null)} /></Field>
          </div>
          <Field label="Card (last 4 digits only)">
            <Input inputMode="numeric" maxLength={4} value={s.card_last4 ?? ""} onChange={(e) => set("card_last4", e.target.value.replace(/\D/g, "").slice(0, 4) || null)} placeholder="1234" />
          </Field>
          <div className="flex flex-col gap-2 pt-5 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.auto_renew} onChange={(e) => set("auto_renew", e.target.checked)} /> Renews by itself (auto-renew)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.critical} onChange={(e) => set("critical", e.target.checked)} /> Magnus goes down if this lapses</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.active !== false} onChange={(e) => set("active", e.target.checked)} /> In use</label>
          </div>
          <Field label="Pay now link (billing page)"><Input value={s.billing_url ?? ""} onChange={(e) => set("billing_url", e.target.value)} placeholder="https://..." /></Field>
          <Field label="Dashboard link"><Input value={s.dashboard_url ?? ""} onChange={(e) => set("dashboard_url", e.target.value)} placeholder="https://..." /></Field>
          <Field label="Status page link"><Input value={s.status_url ?? ""} onChange={(e) => set("status_url", e.target.value)} placeholder="https://..." /></Field>
          <Field label="Notes"><Textarea rows={2} value={s.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
        <Field label="Reason (saved in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. set up the due date" /></Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || !s.service?.trim() || reason.trim().length < 3}>{busy ? "Saving..." : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function PaidModal({ sub, onClose, onSaved }: { sub: Subscription; onClose: () => void; onSaved: (next: string | null) => void }) {
  const [paidOn, setPaidOn] = useState(todayJM());
  const [amount, setAmount] = useState(sub.cost == null ? "" : String(sub.cost));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`I paid ${sub.service}`} subtitle={sub.next_due ? `Moves the next due date on by one ${sub.cycle === "yearly" ? "year" : "month"}` : undefined}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
          <Field label={`Amount (${sub.currency === "USD" ? "US$" : "J$"})`}><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        </div>
        <Field label="Receipt / invoice number"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try { onSaved(await markSubscriptionPaid(sub.id, paidOn, amount === "" ? null : Number(amount), reference, note)); }
            catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
          }}>{busy ? "Saving..." : "Save payment"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function HistoryModal({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const [rows, setRows] = useState<SubscriptionPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSubscriptionHistory(sub.id).then((r) => { if (alive) setRows(r); }, (e: unknown) => { if (alive) setError(err(e)); });
    return () => { alive = false; };
  }, [sub.id]);
  return (
    <Modal open onClose={onClose} title={`${sub.service}: payments`}>
      {error ? <Alert type="error">{error}</Alert> : rows === null ? <div className="flex justify-center py-6"><Spinner /></div> : rows.length === 0 ? (
        <p className="text-xs text-slate-500">No payments recorded yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
          {rows.map((p) => (
            <div key={p.id} className="py-2 flex flex-wrap justify-between gap-2">
              <span>{day(p.paid_on)}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
              <span className="text-slate-500">{money(p.amount, p.currency ?? sub.currency)} · next due {day(p.due_after)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function HQBillsTab({ isOwner }: { isOwner: boolean }) {
  const [data, setData] = useState<SubscriptionsData | null>(null);
  const [sys, setSys] = useState<HQSystem | null>(null);
  const [health, setHealth] = useState<HQHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Partial<Subscription> | null>(null);
  const [paying, setPaying] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<Subscription | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await fetchSubscriptions()); setError(null); } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    let alive = true;
    fetchSubscriptions().then((d) => { if (alive) setData(d); }, (e: unknown) => { if (alive) setError(err(e)); });
    // Auto-checks: the domain's real expiry date and Supabase space (both optional).
    fetchSystem().then((s) => { if (alive) setSys(s); }, () => undefined);
    fetchHealth().then((h) => { if (alive) setHealth(h); }, () => undefined);
    return () => { alive = false; };
  }, [isOwner]);

  if (!isOwner) return <Alert type="info">Only the owner-admin can see and change the platform&apos;s own bills.</Alert>;
  if (!data) return error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-16"><Spinner /></div>;

  const space = Math.max(0, ...(health?.checks.filter((c) => c.pct != null).map((c) => c.pct ?? 0) ?? [0]));
  const domainExp = sys?.domain.expires_at?.slice(0, 10) ?? null;
  const pays = data.income_month_jmd >= data.cost_month_jmd;
  const overdue = data.services.filter((s) => billColor(s) === "red");

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
      {overdue.some((s) => s.critical) && (
        <Alert type="error"><span className="inline-flex items-center gap-1.5"><ShieldAlert size={14} /><b>Pay now:</b></span> a service Magnus needs is overdue. If it lapses, the whole platform goes down.</Alert>
      )}

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Magnus costs you</div>
          <div className="text-xl font-bold mt-1">{money(data.cost_month_usd, "USD")}<span className="text-xs font-normal text-slate-500"> / month</span></div>
          <div className="text-[11px] text-slate-500">{money(data.cost_month_jmd, "JMD")} / month · {money(data.cost_year_usd, "USD")} / year</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Platform income</div>
          <div className="text-xl font-bold mt-1">{money(data.income_month_jmd, "JMD")}<span className="text-xs font-normal text-slate-500"> this month</span></div>
          <div className="text-[11px] text-slate-500">Average of the last 3 months: {money(data.income_avg3_jmd, "JMD")}</div>
        </Card>
        <Card>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Does it pay for itself?</div>
          <div className={cn("text-xl font-bold mt-1", pays ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>{pays ? "Yes" : "Not yet"}</div>
          <div className="text-[11px] text-slate-500">{pays ? "Income covers this month's costs." : `Short by ${money(data.cost_month_jmd - data.income_month_jmd, "JMD")} this month.`} J${data.usd_rate} = US$1 (set on the Money tab).</div>
        </Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Btn icon={<Plus size={13} />} onClick={() => setEditing({ ...EMPTY })}>Add a service</Btn>
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>

      {data.services.map((s) => {
        const color = billColor(s);
        const isDomain = /godaddy|domain/i.test(s.service);
        const isSupabase = /supabase/i.test(s.service);
        return (
          <Card key={s.id} padding={false}>
            <div className={cn("p-4 border-l-4 rounded-l-xl", BORDER[color], !s.active && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{s.service}</span>
                    {s.plan && <Badge color="blue">{s.plan}</Badge>}
                    {s.critical && <Badge color="red">Magnus needs it</Badge>}
                    {s.auto_renew && <Badge color="slate">Auto-renews</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.purpose}</div>
                  <div className={cn("text-xs mt-1.5 font-medium",
                    color === "red" ? "text-red-600 dark:text-red-400" : color === "gold" ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300")}>
                    {dueText(s)} · {s.cost == null ? "cost not set" : `${money(s.cost, s.currency)} / ${s.cycle === "yearly" ? "year" : "month"}`}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {s.card_last4 ? `Card ending ${s.card_last4}` : "No card noted"}{s.login_email ? ` · login ${s.login_email}` : ""}{s.last_paid ? ` · last paid ${day(s.last_paid)}` : ""}
                  </div>
                  {isDomain && domainExp && domainExp !== s.next_due?.slice(0, 10) && (
                    <div className="text-[11px] mt-1 text-sky-700 dark:text-sky-400">
                      The domain registry says it expires {day(domainExp)}.{" "}
                      <button className="underline" onClick={() => setEditing({ ...s, next_due: domainExp })}>Use this date</button>
                    </div>
                  )}
                  {isSupabase && space >= 70 && (
                    <div className="text-[11px] mt-1 text-amber-700 dark:text-amber-400">
                      Upgrade soon: {space}% of the plan&apos;s space is used.{" "}
                      {s.billing_url && <a className="underline" href={s.billing_url} target="_blank" rel="noreferrer">Upgrade</a>}
                    </div>
                  )}
                  {s.notes && <div className="text-[11px] text-slate-500 mt-1 whitespace-pre-line">{s.notes}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.billing_url && (
                    <a href={s.billing_url} target="_blank" rel="noreferrer"
                      className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
                        color === "red" ? "bg-red-600 text-white" : color === "gold" ? "bg-amber-500 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900")}>
                      Pay now <ExternalLink size={11} />
                    </a>
                  )}
                  <Btn icon={<CheckCircle2 size={13} />} onClick={() => setPaying(s)} disabled={!s.active}>I paid it</Btn>
                  <Btn icon={<History size={13} />} onClick={() => setHistory(s)}>History</Btn>
                  <Btn icon={<Pencil size={13} />} onClick={() => setEditing(s)}>Edit</Btn>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
                {s.dashboard_url && <a className="underline text-slate-500" href={s.dashboard_url} target="_blank" rel="noreferrer">Dashboard</a>}
                {s.status_url && <a className="underline text-slate-500" href={s.status_url} target="_blank" rel="noreferrer">Status</a>}
              </div>
            </div>
          </Card>
        );
      })}

      <p className="text-[11px] text-slate-500">
        Reminders go to you 14, 7, 3 and 1 days before a due date, and every day while a bill is overdue (the bell now; phone push arrives in Step 7).
      </p>

      {editing && <EditModal sub={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Saved."); void load(); }} />}
      {paying && <PaidModal sub={paying} onClose={() => setPaying(null)} onSaved={(next) => { const name = paying.service; setPaying(null); setNotice(`${name}: payment saved.${next ? ` Next due ${day(next)}.` : ""}`); void load(); }} />}
      {history && <HistoryModal sub={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
