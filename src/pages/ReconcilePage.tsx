// src/pages/ReconcilePage.tsx — Banking Step 6: reconcile a bank / card account to its statement, and account history.
// Reconcile: type the statement end date and ending balance, tick the entries that are on the statement (lines matched on
// Bank review are ticked already) until the difference is 0.00, then Finish. History: every entry with a running balance.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck, History, RefreshCw, Undo2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PageHeader, Card, Btn, Input, Select, Alert, Tabs, Empty, Spinner, Badge, cn } from "../components/ui";
import { fetchReviewBanks, type ReviewBank } from "../lib/bankReview";
import {
  cancelReconcile, fetchAccountHistory, fetchReconciliations, fetchRecState, finishReconcile, startReconcile, tickEntries, undoReconcile,
  type AccountHistory, type RecState, type RecSummary,
} from "../lib/reconcile";

type Tab = "reconcile" | "history";
const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const lastMonthEnd = () => { const d = new Date(); d.setDate(0); return iso(d); };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className={cn("text-sm font-semibold", tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-500" : "text-slate-800 dark:text-slate-200")}>{value}</div>
    </div>
  );
}

function ReconcileTab({ banks, canReconcile, onError, onNotice }: {
  banks: ReviewBank[]; canReconcile: boolean; onError: (m: string | null) => void; onNotice: (m: string | null) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [bankId, setBankId] = useState(params.get("account") || "");
  const [history, setHistory] = useState<RecSummary[]>([]);
  const [rec, setRec] = useState<RecState | null>(null);
  const [form, setForm] = useState({ date: lastMonthEnd(), balance: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!bankId && banks[0]) setBankId(banks[0].id); }, [banks, bankId]);

  const load = useCallback(async () => {
    if (!bankId) return;
    setLoading(true);
    try {
      const list = await fetchReconciliations(bankId);
      setHistory(list);
      const open = list.find((r) => r.status === "open");
      setRec(open ? await fetchRecState(open.id) : null);
      if (open) setForm({ date: open.statement_date, balance: String(open.statement_balance) });
    } catch (e: unknown) { onError(msg(e)); } finally { setLoading(false); }
  }, [bankId, onError]);
  useEffect(() => { void load(); }, [load]);

  function chooseBank(id: string) {
    setBankId(id);
    setRec(null);
    const next = new URLSearchParams(params);
    next.set("account", id);
    setParams(next, { replace: true });
  }

  async function run(f: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(true); onError(null);
    try { await f(); if (done) onNotice(done); await load(); } catch (e: unknown) { onError(msg(e)); } finally { setBusy(false); }
  }

  async function toggle(ids: string[], on: boolean) {
    if (!rec || busy) return;
    setBusy(true); onError(null);
    try { await tickEntries(rec.id, ids, on); setRec(await fetchRecState(rec.id)); } catch (e: unknown) { onError(msg(e)); } finally { setBusy(false); }
  }

  const bank = banks.find((b) => b.id === bankId);
  const latestDone = history.find((r) => r.status === "done");
  const moneyIn = useMemo(() => rec?.items.filter((i) => i.amount > 0) ?? [], [rec]);
  const moneyOut = useMemo(() => rec?.items.filter((i) => i.amount < 0) ?? [], [rec]);
  const balanced = rec ? Math.abs(rec.difference) < 0.005 : false;

  const list = (title: string, items: RecState["items"]) => (
    <div>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/[0.06]">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title} ({items.filter((i) => i.ticked).length} of {items.length} ticked)</div>
        {canReconcile && rec?.status === "open" && items.length > 0 && (
          <div className="flex gap-1">
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => { void toggle(items.filter((i) => !i.ticked).map((i) => i.entry_id), true); }}>Tick all</Btn>
            <Btn variant="ghost" size="sm" disabled={busy} onClick={() => { void toggle(items.filter((i) => i.ticked).map((i) => i.entry_id), false); }}>Untick all</Btn>
          </div>
        )}
      </div>
      {items.length === 0 ? <div className="px-4 py-3 text-xs text-slate-500">None.</div> : items.map((i) => (
        <label key={i.entry_id} className={cn("flex items-center gap-3 px-4 py-2 text-xs border-b border-slate-100 dark:border-white/[0.04]",
          canReconcile && rec?.status === "open" ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]" : "")}>
          <input type="checkbox" checked={i.ticked} disabled={!canReconcile || rec?.status !== "open" || busy}
            onChange={(e) => { void toggle([i.entry_id], e.target.checked); }} />
          <span className="w-24 text-slate-500">{day(i.transaction_date)}</span>
          <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{i.description} <span className="text-slate-400">· {i.transaction_number}</span></span>
          {i.on_statement && <Badge color="cyan">on statement</Badge>}
          <span className={cn("w-28 text-right font-semibold", i.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200")}>
            {i.amount > 0 ? "+" : "-"}{jmd(Math.abs(i.amount))}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[16rem] flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Bank or card account</div>
            <Select value={bankId} onChange={(e) => chooseBank(e.target.value)}>
              {banks.length === 0 && <option value="">No bank accounts yet</option>}
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Last reconciled</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {latestDone ? `${day(latestDone.statement_date)} · ${jmd(latestDone.statement_balance)}` : "Never"}
            </div>
          </div>
        </div>
        {bank && !bank.chart_account_id && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">This bank account is not linked to your chart of accounts. Link it on the Bank Accounts page first.</p>
        )}
      </Card>

      {loading ? <div className="flex justify-center py-10"><Spinner /></div> : !rec ? (
        <Card>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Reconcile a statement</div>
          <p className="text-xs text-slate-500 mb-3">Take the bank statement. Type its end date and the ending balance printed on it.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Statement end date</div>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Ending balance (J$)</div>
              <Input type="number" inputMode="decimal" step="0.01" placeholder="e.g. 125000.00" value={form.balance}
                onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} />
            </div>
            <Btn variant="primary" size="sm" icon={<ClipboardCheck size={13} />} disabled={!canReconcile || busy || !bankId || form.balance === "" || !bank?.chart_account_id}
              onClick={() => { void run(() => startReconcile(bankId, form.date, Number(form.balance))); }}>
              {busy ? "Starting..." : "Start"}
            </Btn>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Statement end" value={day(rec.statement_date)} />
            <Stat label="Starting balance" value={jmd(rec.opening_balance)} />
            <Stat label="Ticked balance" value={jmd(rec.cleared_balance)} />
            <Stat label="Statement says" value={jmd(rec.statement_balance)} />
            <Stat label="Difference" value={jmd(rec.difference)} tone={balanced ? "good" : "bad"} />
          </div>
          {rec.lines_to_review > 0 && (
            <Alert type="warning">
              {rec.lines_to_review} statement line{rec.lines_to_review === 1 ? " is" : "s are"} still waiting on Bank review up to this date.{" "}
              <button type="button" className="underline" onClick={() => navigate(`/finance/bank-review?account=${bankId}`)}>Review them</button> first: matching or adding them ticks them here.
            </Alert>
          )}
          <Card padding={false}>
            {list("Money in", moneyIn)}
            {list("Money out", moneyOut)}
          </Card>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-slate-500 mr-auto">
              {balanced ? "The difference is 0.00. You can finish." : "Tick the entries that are on the statement until the difference is 0.00. Your ticks are saved as you go."}
            </span>
            <Btn variant="ghost" size="sm" disabled={busy || !canReconcile}
              onClick={() => { if (window.confirm("Cancel this statement? Your ticks are cleared.")) void run(() => cancelReconcile(rec.id), "Statement cancelled."); }}>
              Cancel
            </Btn>
            <Btn variant="primary" size="sm" icon={<CheckCircle2 size={13} />} disabled={busy || !balanced || !canReconcile}
              onClick={() => { void run(() => finishReconcile(rec.id), `Reconciled to ${day(rec.statement_date)}.`); }}>
              Finish
            </Btn>
          </div>
        </>
      )}

      {history.filter((r) => r.status === "done").length > 0 && (
        <Card padding={false}>
          <div className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/[0.06]">Statements reconciled</div>
          {history.filter((r) => r.status === "done").map((r, idx) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-xs border-b border-slate-100 dark:border-white/[0.04]">
              <span className="flex-1 text-slate-800 dark:text-slate-200">{day(r.statement_date)} · {jmd(r.statement_balance)}</span>
              {r.finished_at && <span className="text-slate-500">finished {day(r.finished_at)}</span>}
              {idx === 0 && canReconcile && !rec && (
                <Btn variant="ghost" size="sm" icon={<Undo2 size={12} />} disabled={busy}
                  onClick={() => { if (window.confirm("Undo this reconciliation? Its entries become un-ticked and it opens again.")) void run(() => undoReconcile(r.id), "Reconciliation opened again."); }}>
                  Undo
                </Btn>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function HistoryTab({ companyId, onError }: { companyId: string | null; onError: (m: string | null) => void }) {
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [range, setRange] = useState({ from: `${new Date().getFullYear()}-01-01`, to: iso(new Date()) });
  const [data, setData] = useState<AccountHistory | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    supabase.from("chart_of_accounts").select("id, code, name, is_active").eq("company_id", companyId).order("code")
      .then(({ data: rows }) => {
        const list = ((rows || []) as { id: string; code: string; name: string; is_active: boolean | null }[]).filter((r) => r.is_active !== false);
        setAccounts(list);
        setAccountId((cur) => cur || list.find((a) => /bank/i.test(a.name))?.id || list[0]?.id || "");
      });
  }, [companyId]);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try { setData(await fetchAccountHistory(accountId, range.from, range.to)); } catch (e: unknown) { onError(msg(e)); } finally { setLoading(false); }
  }, [accountId, range.from, range.to, onError]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Account</div>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </Select>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">From</div>
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">To</div>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""} />} onClick={() => { void load(); }} />
        </div>
      </Card>
      {loading ? <div className="flex justify-center py-10"><Spinner /></div> : !data ? null : (
        <Card padding={false}>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 text-xs border-b border-slate-200 dark:border-white/[0.06]">
            <span>Opening <b>{jmd(data.opening)}</b></span>
            <span>Closing <b>{jmd(data.closing)}</b></span>
            {data.account.current_balance != null && range.to >= iso(new Date()) && Math.abs(Number(data.account.current_balance) - data.closing) > 0.005 && (
              <span className="text-amber-600 dark:text-amber-400">The chart shows {jmd(Number(data.account.current_balance))}: the difference was entered before Magnus kept entries (e.g. imported balances).</span>
            )}
          </div>
          {data.rows.length === 0 ? <Empty icon={<History size={18} />} title="No entries in these dates" body="" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="p-2 text-left">Date</th><th className="p-2 text-left">Entry</th><th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right">In / Debit</th><th className="p-2 text-right">Out / Credit</th><th className="p-2 text-right">Balance</th><th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className={cn("border-b border-slate-100 dark:border-white/[0.04]", r.status === "voided" && "opacity-50")}>
                      <td className="p-2 whitespace-nowrap text-slate-500">{day(r.transaction_date)}</td>
                      <td className="p-2 whitespace-nowrap">{r.transaction_number}</td>
                      <td className="p-2 text-slate-800 dark:text-slate-200">
                        {r.description}{r.project ? <span className="text-slate-400"> · {r.project}</span> : null}
                        {r.status === "voided" && <span className="ml-1 text-[10px] text-slate-500">(undone)</span>}
                      </td>
                      <td className="p-2 text-right">{r.debit ? jmd(r.debit) : ""}</td>
                      <td className="p-2 text-right">{r.credit ? jmd(r.credit) : ""}</td>
                      <td className="p-2 text-right font-semibold">{jmd(r.balance)}</td>
                      <td className="p-2">{r.reconciled && <span title="Reconciled"><CheckCircle2 size={12} className="text-emerald-500" /></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export default function ReconcilePage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "history" ? "history" : "reconcile");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [banks, setBanks] = useState<ReviewBank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("user_profiles").select("company_id, role").eq("id", user.id).single();
      if (!p?.company_id) return;
      setCompanyId(p.company_id);
      setRole(p.role || "");
      setBanks(await fetchReviewBanks(p.company_id));
    })().catch((e: unknown) => setError(msg(e)));
  }, []);

  const canReconcile = ["director", "admin", "office_user"].includes(role);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader title="Reconcile" subtitle="Check your books agree with the bank statement, and see an account's history." />
      <div className="p-6 space-y-5 max-w-5xl">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
        {!canReconcile && role && tab === "reconcile" && <Alert type="info">Only a director, admin or office user can reconcile. You can look.</Alert>}
        <Tabs tabs={[{ key: "reconcile" as Tab, label: "Reconcile" }, { key: "history" as Tab, label: "Account history" }]} active={tab} onChange={setTab} />
        {tab === "reconcile"
          ? <ReconcileTab banks={banks} canReconcile={canReconcile} onError={setError} onNotice={setNotice} />
          : <HistoryTab companyId={companyId} onError={setError} />}
      </div>
    </div>
  );
}
