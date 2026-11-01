// src/pages/hq/HQStatutoryRates.tsx — Jamaican statutory rates (NIS, NHT, Education Tax, HEART, PAYE) with effective dates.
// A set is only used by payroll once the owner-admin taps Confirm after checking its sources.
// Editing a set's numbers takes its confirmation away again.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Plus, ShieldCheck } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import { confirmStatutoryRateSet, fetchStatutoryRateSets, saveStatutoryRateSet, type StatutoryRateSet } from "../../lib/hq/platformAdmin";

const pct = (n: number) => `${(Number(n) * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
const jmd = (n: number | null) => (n == null ? "no ceiling" : `J$${Number(n).toLocaleString("en-JM")}`);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-JM", { dateStyle: "medium" });

const PERCENT_FIELDS: [keyof StatutoryRateSet, string][] = [
  ["nis_employee_rate", "NIS employee"], ["nis_employer_rate", "NIS employer"],
  ["nht_employee_rate", "NHT employee"], ["nht_employer_rate", "NHT employer"],
  ["edu_employee_rate", "Education Tax employee"], ["edu_employer_rate", "Education Tax employer"],
  ["heart_rate", "HEART (employer)"], ["paye_rate_band1", "PAYE band 1"], ["paye_rate_band2", "PAYE band 2"],
];
const MONEY_FIELDS: [keyof StatutoryRateSet, string][] = [
  ["paye_threshold_annual", "Tax-free threshold (J$ a year)"], ["paye_band1_ceiling", "Band 2 starts above (J$ a year)"],
  ["nis_annual_ceiling", "NIS ceiling (J$ a year, empty = none)"],
];

function EditModal({ set, onClose, onSaved }: { set: Partial<StatutoryRateSet>; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { effective_from: set.effective_from?.slice(0, 10) ?? "", source_note: set.source_note ?? "" };
    for (const [k] of PERCENT_FIELDS) o[k] = set[k] == null ? "" : String(+(Number(set[k]) * 100).toFixed(4));
    for (const [k] of MONEY_FIELDS) o[k] = set[k] == null ? "" : String(set[k]);
    return o;
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const out: Record<string, unknown> = { id: set.id, effective_from: s.effective_from, source_note: s.source_note, sources: set.sources ?? [] };
      for (const [k] of PERCENT_FIELDS) out[k] = Number(s[k]) / 100;
      for (const [k] of MONEY_FIELDS) out[k] = s[k] === "" ? null : Number(s[k]);
      await saveStatutoryRateSet(out as Partial<StatutoryRateSet>, reason.trim());
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={set.id ? `Edit rates from ${day(set.effective_from ?? "")}` : "New set of rates"} width="max-w-2xl">
      <div className="space-y-3">
        {set.id && <Alert type="warning">Saving changes takes away this set&apos;s confirmation. Payroll stops using it until you confirm it again.</Alert>}
        <Field label="These rates start on"><Input type="date" value={s.effective_from} onChange={(e) => setS({ ...s, effective_from: e.target.value })} /></Field>
        <div className="grid gap-2 sm:grid-cols-3">
          {PERCENT_FIELDS.map(([k, label]) => (
            <Field key={k} label={`${label} (%)`}><Input type="number" step="0.01" min={0} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {MONEY_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}><Input type="number" min={0} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></Field>
          ))}
        </div>
        <Field label="Where these come from"><Textarea rows={2} value={s.source_note} onChange={(e) => setS({ ...s, source_note: e.target.value })} placeholder="e.g. TAJ advisory, March 2027" /></Field>
        <Field label="Reason (saved in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy || !s.effective_from || reason.trim().length < 3}>{busy ? "Saving..." : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function HQStatutoryRates({ isOwner }: { isOwner: boolean }) {
  const [sets, setSets] = useState<StatutoryRateSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<StatutoryRateSet> | null>(null);
  const [confirming, setConfirming] = useState<{ set: StatutoryRateSet; confirm: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSets(await fetchStatutoryRateSets()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setSets([]); }
  }, []);
  useEffect(() => {
    let alive = true;
    fetchStatutoryRateSets().then((r) => { if (alive) setSets(r); }, (e: unknown) => { if (alive) { setError(e instanceof Error ? e.message : String(e)); setSets([]); } });
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardHeader title="Jamaican statutory rates" subtitle="Payroll uses the confirmed set for each pay date. A set nobody has confirmed is never used."
        action={isOwner ? <Btn icon={<Plus size={13} />} onClick={() => setEditing({ ...(sets?.[0] ?? {}), id: undefined, effective_from: "", source_note: "", sources: [] })}>New set</Btn> : undefined} />
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
      {sets === null ? <div className="flex justify-center py-6"><Spinner /></div> : (
        <div className="space-y-3">
          {sets.map((r) => (
            <div key={r.id} className={cn("rounded-lg border p-3", r.confirmed_at ? "border-emerald-200 dark:border-emerald-400/20" : "border-amber-300 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-400/5")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">From {day(r.effective_from)}</span>
                {r.in_use_now && <Badge color="green">In use now</Badge>}
                {r.confirmed_at
                  ? <Badge color="slate">Confirmed {day(r.confirmed_at)}{r.confirmed_by_email ? ` by ${r.confirmed_by_email}` : ""}</Badge>
                  : <Badge color="amber">Not confirmed: payroll doesn&apos;t use it</Badge>}
                <div className="flex-1" />
                {isOwner && (
                  <>
                    <Btn size="xs" onClick={() => setEditing(r)}>Edit</Btn>
                    {r.confirmed_at
                      ? <Btn size="xs" onClick={() => setConfirming({ set: r, confirm: false })}>Unconfirm</Btn>
                      : <Btn size="xs" variant="primary" icon={<ShieldCheck size={12} />} onClick={() => setConfirming({ set: r, confirm: true })}>Confirm</Btn>}
                  </>
                )}
              </div>
              <div className="grid gap-x-4 gap-y-1 mt-2 text-xs sm:grid-cols-2">
                <div>NIS: <b>{pct(r.nis_employee_rate)}</b> employee + <b>{pct(r.nis_employer_rate)}</b> employer, up to <b>{jmd(r.nis_annual_ceiling)}</b> a year</div>
                <div>NHT: <b>{pct(r.nht_employee_rate)}</b> employee + <b>{pct(r.nht_employer_rate)}</b> employer</div>
                <div>Education Tax: <b>{pct(r.edu_employee_rate)}</b> + <b>{pct(r.edu_employer_rate)}</b> (on pay after NIS)</div>
                <div>HEART: <b>{pct(r.heart_rate)}</b> (employer)</div>
                <div className="sm:col-span-2">PAYE: tax-free <b>{jmd(r.paye_threshold_annual)}</b> a year (J${Math.round(r.paye_threshold_annual / 12).toLocaleString("en-JM")} a month), <b>{pct(r.paye_rate_band1)}</b> up to {jmd(r.paye_band1_ceiling)}, <b>{pct(r.paye_rate_band2)}</b> above</div>
              </div>
              {r.source_note && <p className="text-[11px] text-slate-500 mt-2">{r.source_note}</p>}
              {r.sources?.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {r.sources.map((src) => (
                    <a key={src.url + src.label} href={src.url} target="_blank" rel="noreferrer" className="text-[11px] underline inline-flex items-center gap-1 text-sky-700 dark:text-sky-400">
                      {src.label} <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <EditModal set={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice("Saved. Check it, then tap Confirm."); void load(); }} />}

      <Modal open={!!confirming} onClose={() => setConfirming(null)} title={confirming?.confirm ? "Confirm these rates" : "Stop using these rates"}
        subtitle={confirming ? `From ${day(confirming.set.effective_from)}` : undefined}>
        <div className="space-y-3">
          {confirming?.confirm ? (
            <Alert type="warning">
              Only confirm after checking each figure against the sources. From then on, every company&apos;s payroll for pay dates
              from {day(confirming.set.effective_from)} uses these rates.
            </Alert>
          ) : <p className="text-xs text-slate-600 dark:text-slate-400">Payroll goes back to the previous confirmed set (or each company&apos;s own rates).</p>}
          <Field label="Reason (saved in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. checked against TAJ and PwC" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setConfirming(null)}>Cancel</Btn>
            <Btn variant={confirming?.confirm ? "primary" : "danger"} icon={<CheckCircle2 size={13} />} disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                if (!confirming) return;
                setBusy(true); setError(null);
                try {
                  await confirmStatutoryRateSet(confirming.set.id, confirming.confirm, reason.trim());
                  setNotice(confirming.confirm ? "Confirmed. Payroll uses these rates now." : "Unconfirmed.");
                  setConfirming(null); setReason(""); await load();
                } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
              }}>
              {confirming?.confirm ? "Confirm" : "Unconfirm"}
            </Btn>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
