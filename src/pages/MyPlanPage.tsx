// src/pages/MyPlanPage.tsx — "My plan": the company owner's view of their Magnus Boy's System subscription.
// Shows the plan, the current bill, where to pay (Lynk / bank, set in Magnus HQ) and an "I've paid" button.
// Replaces the old BillingPage (plan kept in the browser) and UpgradePage (hard-coded prices).
// Every price comes from the database (platform_prices); nothing is hard-coded here.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, CreditCard, Lock } from "lucide-react";
import {
  Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Page, PageHeader, Select, Spinner,
} from "../components/ui";
import {
  FEATURE_LABELS, PAY_METHODS, claimPayment, fetchMyPlan, jmd, shortDate,
  type Bill, type MyPlan, type PayMethod,
} from "../lib/hq/billing";

const BILL_BADGE: Record<Bill["status"], { label: string; color: "amber" | "cyan" | "green" | "slate" }> = {
  open: { label: "Unpaid", color: "amber" },
  claimed: { label: "Waiting for confirmation", color: "cyan" },
  paid: { label: "Paid", color: "green" },
  void: { label: "Cancelled", color: "slate" },
};

function todayJM() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Jamaica" });
}

function PaidModal({ bill, onClose, onDone }: { bill: Bill; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(bill.amount_jmd));
  const [method, setMethod] = useState<PayMethod>("lynk");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayJM());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      await claimPayment(bill.id, Number(amount), method, reference.trim(), paidOn);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="I've paid" subtitle={`Bill due ${shortDate(bill.due_date)} · ${jmd(bill.amount_jmd)}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount paid (J$)">
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Paid on">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label="How did you pay?">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Payment reference">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Lynk or bank reference number" />
        </Field>
        <p className="text-[11px] text-slate-500">Magnus support checks the payment and confirms it. You&apos;ll get a notice when it&apos;s confirmed.</p>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={send} disabled={busy || reference.trim().length < 2 || !(Number(amount) > 0)}>
            {busy ? "Sending..." : "Send"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function MyPlanPage() {
  const [data, setData] = useState<MyPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchMyPlan());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMyPlan()
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  if (!data) {
    return (
      <Page>
        <PageHeader title="My plan" />
        <div className="p-6">{error ? <Alert type="error">{error}</Alert> : <div className="flex justify-center py-10"><Spinner /></div>}</div>
      </Page>
    );
  }

  if (!data.can_manage) {
    return (
      <Page>
        <PageHeader title="My plan" />
        <div className="p-4 sm:p-6 max-w-2xl space-y-3">
          {data.billing_locked && <Alert type="warning">Your company account is read-only until its Magnus bill is paid.</Alert>}
          <Alert type="info">Only your company&apos;s director or admin can see the plan and pay the bill.</Alert>
        </div>
      </Page>
    );
  }

  const plan = data.plans?.find((p) => p.key === data.plan_key) ?? null;
  const unpaid = (data.bills ?? []).filter((b) => b.status === "open" || b.status === "claimed");
  const history = (data.bills ?? []).filter((b) => b.status === "paid");
  const payTo = data.pay_to;
  const isFree = data.plan_key === "free";

  return (
    <Page>
      <PageHeader title="My plan" subtitle={data.company_name} />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

        {data.billing_locked && (
          <Alert type="warning">
            <span className="inline-flex items-center gap-1.5"><Lock size={13} /> <b>Read-only:</b></span> your bill is overdue, so you can view and download
            everything but can&apos;t add or change anything. It unlocks as soon as your payment is confirmed.
          </Alert>
        )}

        {/* Plan */}
        <Card>
          <CardHeader title="Your plan" />
          {!data.charging_on || isFree ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{isFree ? "Free" : "Free during launch"}</div>
                <p className="text-xs text-slate-500 mt-0.5">There is nothing to pay right now. You&apos;ll be told well before that changes.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">{plan?.label ?? data.plan_key}</span>
                <span className="text-sm text-slate-500">{plan ? `${jmd(plan.amount_jmd)} / month` : ""}</span>
              </div>
              {plan?.description && <p className="text-xs text-slate-500">{plan.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                <span>Users: <b>{data.users}</b>{plan?.included_seats != null ? ` of ${plan.included_seats} included` : ""}</span>
                {data.paid_until && <span>Paid until <b>{shortDate(data.paid_until)}</b></span>}
                {!data.paid_until && data.trial_expires_at && <span>Free trial ends <b>{shortDate(data.trial_expires_at)}</b></span>}
              </div>
              {plan && plan.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {plan.features.map((f) => <Badge key={f} color="blue">{FEATURE_LABELS[f] ?? f}</Badge>)}
                </div>
              )}
              <p className="text-[11px] text-slate-500 pt-1">To change plan, contact Magnus support.</p>
            </div>
          )}
        </Card>

        {/* Bills to pay */}
        {unpaid.map((b) => (
          <Card key={b.id}>
            <CardHeader
              title={`Bill for ${shortDate(b.period_start)} – ${shortDate(b.period_end)}`}
              subtitle={`Due ${shortDate(b.due_date)}`}
              action={<Badge color={BILL_BADGE[b.status].color}>{BILL_BADGE[b.status].label}</Badge>}
            />
            <div className="space-y-1 text-xs">
              {b.lines.map((l, i) => (
                <div key={i} className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>{l.label}{l.qty > 1 ? ` × ${l.qty}` : ""}</span><span>{jmd(l.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-white/[0.06] font-semibold text-slate-800 dark:text-slate-200">
                <span>Total</span><span>{jmd(b.amount_jmd)}</span>
              </div>
            </div>

            {b.status === "open" && (
              <div className="mt-4 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-slate-700 dark:text-slate-300">How to pay</div>
                {payTo?.lynk_handle && <div>Lynk: <b className="select-all">{payTo.lynk_handle}</b></div>}
                {payTo?.bank_details && <div className="whitespace-pre-line">Bank: <span className="select-all">{payTo.bank_details}</span></div>}
                {payTo?.payment_note && <div className="text-slate-500 whitespace-pre-line">{payTo.payment_note}</div>}
                {!payTo?.lynk_handle && !payTo?.bank_details && <div className="text-slate-500">Contact Magnus support for payment details.</div>}
                <div className="pt-2">
                  <Btn variant="primary" icon={<CreditCard size={13} />} onClick={() => setPaying(b)}>I&apos;ve paid</Btn>
                </div>
              </div>
            )}
            {b.status === "claimed" && (
              <p className="mt-3 text-xs text-slate-500 inline-flex items-center gap-1.5"><Clock size={12} /> Thanks! Magnus support is checking your payment.</p>
            )}
          </Card>
        ))}

        {/* History */}
        {(history.length > 0 || (data.payments ?? []).length > 0) && (
          <Card>
            <CardHeader title="Payments" />
            <div className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
              {(data.payments ?? []).map((p) => (
                <div key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-600 dark:text-slate-400">{shortDate(p.paid_on)} · {PAY_METHODS.find((m) => m.key === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="flex items-center gap-2">
                    <b>{jmd(p.amount_jmd)}</b>
                    {p.status === "confirmed" && <Badge color="green">Received</Badge>}
                    {p.status === "claimed" && <Badge color="cyan">Checking</Badge>}
                    {p.status === "rejected" && <Badge color="red">Not received</Badge>}
                  </span>
                  {p.status === "rejected" && p.reject_reason && <span className="w-full text-[11px] text-red-600 dark:text-red-400">{p.reject_reason}</span>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {paying && (
        <PaidModal
          bill={paying}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); setNotice("Thanks! We'll confirm your payment shortly."); void load(); }}
        />
      )}
    </Page>
  );
}
