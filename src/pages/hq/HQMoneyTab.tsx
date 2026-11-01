// src/pages/hq/HQMoneyTab.tsx — Magnus HQ Money: the Charging switch, prices, payments to confirm, bills,
// money in by month and the daily job. Every change asks for a reason and goes in the HQ activity log.

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, PlayCircle, Plus, RefreshCw, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th, Tr,
} from "../../components/ui";
import { cn } from "../../lib/theme";
import {
  FEATURE_LABELS, PAY_METHODS, decidePayment, fetchHQBilling, jmd, recordPayment, runDailyJob, saveBillingSettings,
  savePrice, shortDate, voidBill,
  type BillingSettings, type ClaimToConfirm, type HQBilling, type OpenBill, type PayMethod, type Price,
} from "../../lib/hq/billing";

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

// A reason box + confirm button, reused by every action on this tab.
function ReasonModal({ title, subtitle, children, confirmLabel, danger, onClose, onConfirm, needReason = true }: {
  title: string; subtitle?: string; children?: React.ReactNode; confirmLabel: string; danger?: boolean;
  onClose: () => void; onConfirm: (reason: string) => Promise<void>; needReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim()); } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle}>
      <div className="space-y-3">
        {children}
        <Field label={needReason ? "Reason (saved in the activity log)" : "Note (optional)"}>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={go} disabled={busy || (needReason && reason.trim().length < 3)}>
            {busy ? "Working..." : confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function SettingsCard({ s, isOwner, onSaved }: { s: BillingSettings; isOwner: boolean; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState<BillingSettings>(s);
  const [confirm, setConfirm] = useState<Partial<BillingSettings> | null>(null);
  useEffect(() => { setDraft(s); }, [s]);

  const changed = (Object.keys(draft) as (keyof BillingSettings)[]).filter((k) => k !== "charging_on" && draft[k] !== s[k]);
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Card>
      <CardHeader title="Charging" subtitle="OFF = every company uses Magnus free. Nothing is billed and nobody is locked." />
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
        s.charging_on ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/5" : "border-slate-200 dark:border-white/10")}>
        <div>
          <div className="text-sm font-semibold">{s.charging_on ? "Charging is ON" : "Charging is OFF"}</div>
          <div className="text-[11px] text-slate-500">
            {s.charging_on ? `Bills go out 7 days before each period. Unpaid after ${s.grace_days} grace days = read-only.` : "Free during launch."}
          </div>
        </div>
        {isOwner && (
          <Btn variant={s.charging_on ? "danger" : "primary"} onClick={() => setConfirm({ charging_on: !s.charging_on })}>
            {s.charging_on ? "Turn charging OFF" : "Turn charging ON"}
          </Btn>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mt-4">
        <Field label="Free trial (days)"><Input type="number" min={0} value={draft.trial_days} disabled={!isOwner} onChange={(e) => set("trial_days", Number(e.target.value))} /></Field>
        <Field label="Grace days after due"><Input type="number" min={0} value={draft.grace_days} disabled={!isOwner} onChange={(e) => set("grace_days", Number(e.target.value))} /></Field>
        <Field label="J$ per US$ (for totals)"><Input type="number" min={1} value={draft.usd_rate} disabled={!isOwner} onChange={(e) => set("usd_rate", Number(e.target.value))} /></Field>
        <Field label="Lynk handle"><Input value={draft.lynk_handle} disabled={!isOwner} onChange={(e) => set("lynk_handle", e.target.value)} placeholder="@yourhandle" /></Field>
        <Field label="Bank details"><Textarea rows={2} value={draft.bank_details} disabled={!isOwner} onChange={(e) => set("bank_details", e.target.value)} placeholder="Bank, branch, account name and number" /></Field>
        <Field label="Note for payers"><Textarea rows={2} value={draft.payment_note} disabled={!isOwner} onChange={(e) => set("payment_note", e.target.value)} placeholder="e.g. Put your company name as the reference" /></Field>
      </div>
      <p className="text-[10px] text-slate-500 mt-2">The trial length here is used for billing. New sign-ups still get a 14-day trial from the sign-up code.</p>
      {isOwner && changed.length > 0 && (
        <div className="mt-3 flex justify-end gap-2">
          <Btn onClick={() => setDraft(s)}>Undo</Btn>
          <Btn variant="primary" onClick={() => setConfirm(Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<BillingSettings>)}>Save changes</Btn>
        </div>
      )}

      {confirm && (
        <ReasonModal
          title={"charging_on" in confirm ? (confirm.charging_on ? "Turn charging ON" : "Turn charging OFF") : "Save billing settings"}
          confirmLabel="Save"
          danger={confirm.charging_on === true}
          onClose={() => setConfirm(null)}
          onConfirm={async (reason) => {
            await saveBillingSettings(confirm, reason);
            setConfirm(null);
            onSaved("charging_on" in confirm
              ? (confirm.charging_on ? "Charging is ON. Tonight's daily job sends the first bills (or tap Run daily job now)." : "Charging is OFF. The daily job lifts any unpaid locks.")
              : "Billing settings saved.");
          }}
        >
          {confirm.charging_on === true && (
            <Alert type="warning">
              Every company that isn&apos;t on the Free plan or marked Test will get a bill. Set your own company to the <b>Free</b> plan first
              (Companies → your company → Change plan).
            </Alert>
          )}
        </ReasonModal>
      )}
    </Card>
  );
}

function PriceModal({ price, onClose, onSaved }: { price: Price | null; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<Price>(price ?? {
    key: "plan.", label: "", per: "company", amount_jmd: 0, included_seats: null, features: [], description: "", active: true, sort: 100,
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPlan = p.key.startsWith("plan.");
  const toggle = (f: string) => setP((x) => ({ ...x, features: x.features.includes(f) ? x.features.filter((y) => y !== f) : [...x.features, f] }));

  async function save() {
    setBusy(true); setError(null);
    try { await savePrice(p, reason.trim()); onSaved(); } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={price ? `Edit ${price.label}` : "New price"} width="max-w-xl">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Key (plan.name or extra.name)"><Input value={p.key} disabled={!!price} onChange={(e) => setP({ ...p, key: e.target.value.toLowerCase() })} /></Field>
          <Field label="Name"><Input value={p.label} onChange={(e) => setP({ ...p, label: e.target.value })} /></Field>
          <Field label="J$ per month (empty = custom)">
            <Input type="number" min={0} value={p.amount_jmd ?? ""} onChange={(e) => setP({ ...p, amount_jmd: e.target.value === "" ? null : Number(e.target.value) })} />
          </Field>
          <Field label="Charged per">
            <Select value={p.per} onChange={(e) => setP({ ...p, per: e.target.value as Price["per"] })}>
              <option value="company">Company</option><option value="seat">User (seat)</option><option value="worker">Worker</option>
            </Select>
          </Field>
          {isPlan && (
            <Field label="Users included"><Input type="number" min={0} value={p.included_seats ?? ""} onChange={(e) => setP({ ...p, included_seats: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
          )}
          <Field label="Order"><Input type="number" value={p.sort} onChange={(e) => setP({ ...p, sort: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={p.description ?? ""} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
        {isPlan && (
          <div>
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Features this plan opens</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(FEATURE_LABELS).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={p.features.includes(k)} onChange={() => toggle(k)} /> {label}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} /> Active</label>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. new price from January" /></Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || reason.trim().length < 3}>{busy ? "Saving..." : "Save price"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function RecordModal({ companies, onClose, onSaved }: { companies: HQBilling["companies"]; onClose: () => void; onSaved: () => void }) {
  const [companyId, setCompanyId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("bank");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" }));
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await recordPayment({ companyId, amount: Number(amount), method, reference, paidOn, months, reason: reason.trim() });
      onSaved();
    } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title="Record a payment" subtitle="Money you received outside the app">
      <div className="space-y-3">
        <Field label="Company">
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Choose...</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (J$)"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Received on"><Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Months (if no bill is open)"><Input type="number" min={1} max={24} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
        </div>
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Note (saved in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. paid cash at the office" /></Field>
        <p className="text-[11px] text-slate-500">Pays their oldest unpaid bill. If none is open, it makes a paid bill for the months above. Unlocks the company straight away.</p>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || !companyId || !(Number(amount) > 0) || reason.trim().length < 3}>{busy ? "Saving..." : "Record payment"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function HQMoneyTab({ isOwner }: { isOwner: boolean }) {
  const [data, setData] = useState<HQBilling | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decide, setDecide] = useState<{ claim: ClaimToConfirm; confirm: boolean } | null>(null);
  const [voiding, setVoiding] = useState<OpenBill | null>(null);
  const [editPrice, setEditPrice] = useState<Price | null | "new">(null);
  const [recording, setRecording] = useState(false);
  const [runJob, setRunJob] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await fetchHQBilling()); } catch (e: unknown) { setError(err(e)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const done = (msg: string) => { setNotice(msg); void load(); };

  if (!data) return error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-16"><Spinner /></div>;

  const job = data.last_job;
  const jobAgeH = job ? (Date.now() - new Date(job.started_at).getTime()) / 3_600_000 : null;
  const months = data.money_by_month.map((m) => ({
    label: new Date(`${m.month}T12:00:00`).toLocaleDateString("en-JM", { month: "short" }), amount: Number(m.amount),
  }));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="flex flex-wrap gap-2 justify-end">
        <Btn icon={<Plus size={13} />} onClick={() => setRecording(true)}>Record a payment</Btn>
        {isOwner && <Btn icon={<PlayCircle size={13} />} onClick={() => setRunJob(true)}>Run daily job now</Btn>}
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>

      {/* Payments to confirm */}
      <Card padding={false}>
        <div className="p-4 pb-2"><CardHeader title="Payments to confirm" subtitle="Companies that tapped “I've paid”. Check your Lynk / bank first." /></div>
        {data.to_confirm.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-slate-500">Nothing waiting.</div>
        ) : data.to_confirm.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-slate-100 dark:border-white/[0.04] border-l-4 border-l-red-500">
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-medium">{c.company_name} · {jmd(c.amount_jmd)}</div>
              <div className="text-[11px] text-slate-500">
                {PAY_METHODS.find((m) => m.key === c.method)?.label} · ref <b className="select-all">{c.reference}</b> · paid {shortDate(c.paid_on)}
                {c.bill_amount != null && ` · bill ${jmd(c.bill_amount)} due ${shortDate(c.bill_due)}`}{c.claimed_by_email ? ` · by ${c.claimed_by_email}` : ""}
              </div>
            </div>
            <Btn variant="primary" icon={<Check size={13} />} onClick={() => setDecide({ claim: c, confirm: true })}>Money received</Btn>
            <Btn variant="danger" icon={<X size={13} />} onClick={() => setDecide({ claim: c, confirm: false })}>Not received</Btn>
          </div>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard s={data.settings} isOwner={isOwner} onSaved={done} />

        <div className="space-y-4">
          <Card>
            <CardHeader title="Money in" subtitle={`This month: ${jmd(data.income_month)}`} />
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ left: 0, right: 4, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-white/10" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" />
                  <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} stroke="currentColor" className="text-slate-400" />
                  <Tooltip formatter={(v) => jmd(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="amount" name="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Daily job" subtitle="Runs every night at 1:10 am. Sends bills and reminders, locks unpaid companies, wipes closed ones after 90 days." />
            {!job ? (
              <Alert type="warning">It hasn&apos;t run yet. Tap <b>Run daily job now</b>, and check pg_cron is on in Supabase (Database → Extensions).</Alert>
            ) : (
              <div className={cn("text-xs", job.ok === false || (jobAgeH ?? 0) > 26 ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400")}>
                Last run {new Date(job.started_at).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                {job.ok === false ? `FAILED: ${String(job.details.error ?? "")}` : job.ok ? "OK" : "running"}
                {job.ok && ` · ${String(job.details.bills_created ?? 0)} bills, ${String(job.details.reminders ?? 0)} reminders, ${String(job.details.locked ?? 0)} locked`}
                {(jobAgeH ?? 0) > 26 && " · more than 26 hours ago!"}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Unpaid bills */}
      <Card padding={false}>
        <div className="p-4 pb-2"><CardHeader title="Unpaid bills" /></div>
        {data.open_bills.length === 0 ? <div className="px-4 pb-4 text-xs text-slate-500">None.</div> : (
          <Table minWidth={600}>
            <thead><tr><Th>Company</Th><Th>Period</Th><Th>Due</Th><Th right>Amount</Th><Th>Status</Th><Th right> </Th></tr></thead>
            <tbody>
              {data.open_bills.map((b) => (
                <Tr key={b.id}>
                  <Td>{b.company_name}</Td>
                  <Td muted>{shortDate(b.period_start)} – {shortDate(b.period_end)}</Td>
                  <Td className={cn(b.due_date < today && "text-red-600 dark:text-red-400 font-semibold")}>{shortDate(b.due_date)}</Td>
                  <Td right>{jmd(b.amount_jmd)}</Td>
                  <Td>
                    {b.locked ? <Badge color="red">Read-only</Badge> : b.status === "claimed" ? <Badge color="cyan">Says paid</Badge> : b.due_date < today ? <Badge color="amber">Overdue</Badge> : <Badge color="slate">Open</Badge>}
                  </Td>
                  <Td right>{isOwner && <Btn size="xs" icon={<Ban size={12} />} onClick={() => setVoiding(b)}>Cancel bill</Btn>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Prices */}
      <Card padding={false}>
        <div className="p-4 pb-2">
          <CardHeader title="Prices" subtitle="Every price in the app comes from here." action={isOwner ? <Btn icon={<Plus size={13} />} onClick={() => setEditPrice("new")}>New price</Btn> : undefined} />
        </div>
        <Table minWidth={600}>
          <thead><tr><Th>Name</Th><Th>Key</Th><Th right>J$ / month</Th><Th>Per</Th><Th right>Users incl.</Th><Th>Status</Th><Th right> </Th></tr></thead>
          <tbody>
            {data.prices.map((p) => (
              <Tr key={p.key}>
                <Td>{p.label}</Td>
                <Td muted className="font-mono text-[10px]">{p.key}</Td>
                <Td right>{p.amount_jmd == null ? "Custom" : jmd(p.amount_jmd)}</Td>
                <Td muted>{p.per}</Td>
                <Td right muted>{p.included_seats ?? "—"}</Td>
                <Td>{p.active ? <Badge color="green">Active</Badge> : <Badge color="slate">Off</Badge>}</Td>
                <Td right>{isOwner && <Btn size="xs" onClick={() => setEditPrice(p)}>Edit</Btn>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {/* Recent payments */}
      {data.recent_payments.length > 0 && (
        <Card padding={false}>
          <div className="p-4 pb-2"><CardHeader title="Recent payments" /></div>
          <Table minWidth={600}>
            <thead><tr><Th>Company</Th><Th>Paid on</Th><Th right>Amount</Th><Th>How</Th><Th>Result</Th></tr></thead>
            <tbody>
              {data.recent_payments.map((p) => (
                <Tr key={p.id}>
                  <Td>{p.company_name}</Td>
                  <Td muted>{shortDate(p.paid_on)}</Td>
                  <Td right>{jmd(p.amount_jmd)}</Td>
                  <Td muted>{PAY_METHODS.find((m) => m.key === p.method)?.label}{p.reference ? ` · ${p.reference}` : ""}{p.source === "hq" ? " · recorded by HQ" : ""}</Td>
                  <Td>{p.status === "confirmed" ? <Badge color="green">Received</Badge> : <span title={p.reject_reason ?? ""}><Badge color="red">Not received</Badge></span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {decide && (
        <ReasonModal
          title={decide.confirm ? "Money received" : "Not received"}
          subtitle={`${decide.claim.company_name} · ${jmd(decide.claim.amount_jmd)} · ref ${decide.claim.reference ?? "-"}`}
          confirmLabel={decide.confirm ? "Confirm payment" : "Mark not received"}
          danger={!decide.confirm}
          needReason={!decide.confirm}
          onClose={() => setDecide(null)}
          onConfirm={async (reason) => {
            await decidePayment(decide.claim.id, decide.confirm, reason);
            setDecide(null);
            done(decide.confirm ? `${decide.claim.company_name}: payment confirmed. They're unlocked and paid up.` : `${decide.claim.company_name}: told the payment was not received.`);
          }}
        >
          {decide.confirm
            ? <p className="text-xs text-slate-600 dark:text-slate-400">Only confirm once you see the money in your Lynk or bank account.</p>
            : <p className="text-xs text-slate-600 dark:text-slate-400">The company sees your reason, and the bill goes back to unpaid.</p>}
        </ReasonModal>
      )}
      {voiding && (
        <ReasonModal title="Cancel bill" subtitle={`${voiding.company_name} · ${jmd(voiding.amount_jmd)}`} confirmLabel="Cancel bill" danger
          onClose={() => setVoiding(null)}
          onConfirm={async (reason) => { await voidBill(voiding.id, reason); setVoiding(null); done("Bill cancelled."); }} />
      )}
      {runJob && (
        <ReasonModal title="Run daily job now" confirmLabel="Run now" onClose={() => setRunJob(false)}
          onConfirm={async (reason) => {
            const r = await runDailyJob(reason);
            setRunJob(false);
            done(r.error ? `Daily job failed: ${String(r.error)}` : `Daily job ran: ${String(r.bills_created ?? 0)} bills, ${String(r.reminders ?? 0)} reminders, ${String(r.locked ?? 0)} locked, ${String(r.unlocked ?? 0)} unlocked.`);
          }}>
          <p className="text-xs text-slate-600 dark:text-slate-400">Does tonight&apos;s run now: bills, reminders, read-only locks, and wiping companies closed 90+ days ago.</p>
        </ReasonModal>
      )}
      {editPrice && <PriceModal price={editPrice === "new" ? null : editPrice} onClose={() => setEditPrice(null)} onSaved={() => { setEditPrice(null); done("Price saved."); }} />}
      {recording && <RecordModal companies={data.companies} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); done("Payment recorded."); }} />}
    </div>
  );
}
