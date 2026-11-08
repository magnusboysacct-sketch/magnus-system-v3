// src/pages/BankReviewPage.tsx — Banking Step 5: go through the lines of an uploaded bank statement.
// Each line is MATCHED to what is already in the books (a payment, a bill paid, a transfer...), ADDED (bank fees,
// interest, anything only the bank knows about yet) or EXCLUDED (a duplicate). Nothing is posted twice.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ClipboardCheck, Link2, Plus, RefreshCw, Undo2, Upload, Wand2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { PageHeader, Card, Btn, Input, Select, Alert, Tabs, Empty, Spinner, cn } from "../components/ui";
import {
  addLine, autoMatch, excludeLine, fetchBankLines, fetchPostAccounts, fetchReviewBanks, fetchSuggestions, matchLine, undoLine,
  type BankLine, type PostAccount, type ReviewBank, type Suggestion,
} from "../lib/bankReview";

type Tab = "review" | "done" | "excluded";

const jmd = (n: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const TYPE_LABEL: Record<string, string> = { expense: "Costs and expenses", revenue: "Income", asset: "Assets", liability: "Liabilities", equity: "Equity" };

function LineEditor({ line, isCard, accounts, projects, onDone, onError }: {
  line: BankLine;
  isCard: boolean;
  accounts: PostAccount[];
  projects: { id: string; name: string }[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [mode, setMode] = useState<"add" | "exclude" | null>(null);
  const [form, setForm] = useState({ accountId: "", projectId: "", note: "", reason: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSuggestions(line.id).then((s) => { if (alive) setSuggestions(s); }).catch(() => { if (alive) setSuggestions([]); });
    return () => { alive = false; };
  }, [line.id]);

  // Money out usually goes to a cost; money in to income. Both lists are shown, the likely one first.
  const order = line.moneyIn ? ["revenue", "liability", "equity", "asset", "expense"] : ["expense", "asset", "liability", "equity", "revenue"];

  async function run(f: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await f(); onDone(done); } catch (e: unknown) { onError(msg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-white/[0.02] p-3">
      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Already in your books?</div>
      {suggestions === null ? <div className="text-xs text-slate-500"><Spinner size={12} /> Looking...</div>
        : suggestions.length === 0 ? <div className="text-xs text-slate-500">
            {isCard && line.moneyIn
              ? "Nothing in the books with this amount within 10 days. A payment to the card is a transfer: record it with Transfer money (Bank Accounts page, from your bank to this card), then Match it here."
              : "Nothing in the books with this amount within 10 days. Add it below, or record it first (Record Payment, Pay bill, Transfer money) and come back."}
          </div>
        : suggestions.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex-1 min-w-0 text-slate-700 dark:text-slate-300">
              <b>{s.transaction_number}</b> · {day(s.transaction_date)} · {s.description}
              {s.days_apart > 0 && <span className="text-slate-500"> ({s.days_apart} day{s.days_apart === 1 ? "" : "s"} apart)</span>}
            </span>
            <Btn variant="primary" size="sm" icon={<Link2 size={12} />} disabled={busy}
              onClick={() => { void run(() => matchLine(line.id, s.id), `Matched to ${s.transaction_number}.`); }}>Match</Btn>
          </div>
        ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Btn variant={mode === "add" ? "primary" : "ghost"} size="sm" icon={<Plus size={12} />} onClick={() => setMode(mode === "add" ? null : "add")}>
          Add to the books
        </Btn>
        <Btn variant={mode === "exclude" ? "primary" : "ghost"} size="sm" icon={<X size={12} />} onClick={() => setMode(mode === "exclude" ? null : "exclude")}>
          Exclude
        </Btn>
      </div>

      {mode === "add" && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-2">
          <Select value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
            <option value="">{isCard
              ? (line.moneyIn ? "What was this credit? (e.g. a refund: the cost account it came back to)" : "What was this charge for? (e.g. Materials, Fuel, Interest)")
              : (line.moneyIn ? "What was this money? (e.g. Interest Income)" : "What was this for? (e.g. Bank Charges)")}</option>
            {order.map((t) => {
              const list = accounts.filter((a) => a.type === t);
              return list.length ? (
                <optgroup key={t} label={TYPE_LABEL[t] || t}>
                  {list.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </Select>
          <Select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          <Btn variant="primary" size="sm" icon={<Check size={12} />} disabled={busy || !form.accountId}
            onClick={() => { void run(() => addLine(line.id, form.accountId, form.projectId || null, form.note), "Added to the books."); }}>
            {busy ? "Saving..." : "Add"}
          </Btn>
        </div>
      )}
      {mode === "exclude" && (
        <div className="flex flex-wrap gap-2">
          <Input className="flex-1 min-w-[12rem]" placeholder="Why? e.g. duplicate line" value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          <Btn variant="primary" size="sm" disabled={busy}
            onClick={() => { void run(() => excludeLine(line.id, form.reason), "Line excluded."); }}>Exclude</Btn>
        </div>
      )}
    </div>
  );
}

export default function BankReviewPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [banks, setBanks] = useState<ReviewBank[]>([]);
  const [bankId, setBankId] = useState(params.get("account") || "");
  const [lines, setLines] = useState<BankLine[]>([]);
  const [accounts, setAccounts] = useState<PostAccount[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<Tab>("review");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canReview = ["director", "admin", "office_user"].includes(role);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from("user_profiles").select("company_id, role").eq("id", user.id).single();
      if (!p?.company_id) return;
      setCompanyId(p.company_id);
      setRole(p.role || "");
      const [b, a, pr] = await Promise.all([
        fetchReviewBanks(p.company_id), fetchPostAccounts(p.company_id),
        supabase.from("projects").select("id, name, status").eq("company_id", p.company_id).order("name"),
      ]);
      setBanks(b);
      setAccounts(a);
      setProjects(((pr.data || []) as { id: string; name: string; status: string }[]).filter((x) => x.status !== "cancelled"));
      setBankId((cur) => cur || b[0]?.id || "");
    })().catch((e: unknown) => setError(msg(e)));
  }, []);

  const load = useCallback(async () => {
    if (!bankId) { setLines([]); return; }
    setLoading(true);
    try { setLines(await fetchBankLines(bankId)); } catch (e: unknown) { setError(msg(e)); } finally { setLoading(false); }
  }, [bankId]);
  useEffect(() => { void load(); }, [load]);

  function chooseBank(id: string) {
    setBankId(id);
    setOpen(null);
    const next = new URLSearchParams(params);
    next.set("account", id);
    setParams(next, { replace: true });
  }

  async function refreshBanks() {
    if (companyId) setBanks(await fetchReviewBanks(companyId).catch(() => banks));
  }

  async function afterAction(message: string) {
    setNotice(message);
    setError(null);
    setOpen(null);
    await Promise.all([load(), refreshBanks()]);
  }

  async function handleAuto() {
    if (!bankId || busy) return;
    setBusy(true); setError(null);
    try {
      const n = await autoMatch(bankId);
      await afterAction(n === 0 ? "No lines with one clear match. Go through the rest one by one." : `${n} line${n === 1 ? "" : "s"} matched.`);
    } catch (e: unknown) { setError(msg(e)); } finally { setBusy(false); }
  }

  async function handleUndo(l: BankLine) {
    if (busy) return;
    const what = l.review_action === "added" ? "The entry it added comes out of the books." : "";
    if (!window.confirm(`Put this line back to review? ${what}`)) return;
    setBusy(true);
    try { await undoLine(l.id); await afterAction("Line put back to review."); } catch (e: unknown) { setError(msg(e)); } finally { setBusy(false); }
  }

  const bank = banks.find((b) => b.id === bankId);
  const toReview = lines.filter((l) => !l.review_action);
  const done = lines.filter((l) => l.review_action === "matched" || l.review_action === "added");
  const excluded = lines.filter((l) => l.review_action === "excluded");
  const shown = tab === "review" ? toReview : tab === "done" ? done : excluded;
  const latestStatement = useMemo(() => {
    const withBal = lines.filter((l) => l.balance_after !== null).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
    return withBal[0] ?? null;
  }, [lines]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader title="Bank review" subtitle="Match each line of your bank statement to the books, or add it."
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" icon={<RefreshCw size={13} className={loading ? "animate-spin" : ""} />} onClick={() => { void load(); }} />
            <Btn variant="ghost" size="sm" icon={<Upload size={13} />} onClick={() => navigate("/finance/upload-statement")}>Upload statement</Btn>
            <Btn variant="ghost" size="sm" icon={<ClipboardCheck size={13} />} onClick={() => navigate(bankId ? `/finance/reconcile?account=${bankId}` : "/finance/reconcile")}>Reconcile</Btn>
          </div>
        } />

      <div className="p-6 space-y-5 max-w-5xl">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
        {!canReview && role && <Alert type="info">Only a director, admin or office user can review bank lines. You can look.</Alert>}

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
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{bank?.isCard ? "Owed in your books" : "In your books"}</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{bank?.books_balance == null ? "Not linked" : jmd(bank.books_balance)}</div>
            </div>
            {latestStatement && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{bank?.isCard ? "Card says you owe" : "Bank says"} ({day(latestStatement.transaction_date)})</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{jmd(latestStatement.balance_after ?? 0)}</div>
              </div>
            )}
            {canReview && toReview.length > 0 && (
              <Btn variant="primary" size="sm" icon={<Wand2 size={13} />} disabled={busy} onClick={() => { void handleAuto(); }}>
                {busy ? "Matching..." : "Match the obvious ones"}
              </Btn>
            )}
          </div>
          {bank && !bank.chart_account_id && (
            <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">This bank account is not linked to your chart of accounts. Link it on the Bank Accounts page first.</p>
          )}
        </Card>

        <Tabs
          tabs={[
            { key: "review" as Tab, label: "To review", count: toReview.length },
            { key: "done" as Tab, label: "Done", count: done.length },
            { key: "excluded" as Tab, label: "Excluded", count: excluded.length },
          ]}
          active={tab}
          onChange={(t) => { setTab(t); setOpen(null); }}
        />

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : shown.length === 0 ? (
          <Empty icon={<Check size={20} />}
            title={tab === "review" ? (lines.length === 0 ? "No statement lines yet" : "All lines are done") : "Nothing here"}
            body={tab === "review" && lines.length === 0 ? "Upload a bank statement and its lines show up here to match." : ""}
            action={tab === "review" && lines.length === 0
              ? <Btn variant="primary" size="sm" icon={<Upload size={13} />} onClick={() => navigate("/finance/upload-statement")}>Upload statement</Btn>
              : undefined} />
        ) : (
          <Card padding={false}>
            <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {shown.map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <div className={cn("flex flex-wrap items-center gap-3", tab === "review" && canReview && "cursor-pointer")}
                    onClick={() => { if (tab === "review" && canReview) setOpen(open === l.id ? null : l.id); }}>
                    <div className="w-24 text-xs text-slate-500">{day(l.transaction_date)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 dark:text-slate-200 truncate">{l.description}</div>
                      {l.review_action === "matched" && l.entry && <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Matched: {l.entry.number} · {l.entry.description}</div>}
                      {l.review_action === "added" && l.entry && <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Added: {l.entry.number} · {l.entry.description}</div>}
                      {l.review_action === "excluded" && <div className="text-[11px] text-slate-500">Excluded{l.notes ? `: ${l.notes}` : ""}</div>}
                    </div>
                    <div className={cn("text-sm font-semibold w-32 text-right", l.moneyIn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-800 dark:text-slate-200")}>
                      {bank?.isCard
                        ? <><span className="block text-[9px] font-bold uppercase tracking-wide text-slate-500">{l.moneyIn ? "Payment" : "Charge"}</span>{jmd(l.amount)}</>
                        : <>{l.moneyIn ? "+" : "-"}{jmd(l.amount)}</>}
                    </div>
                    {tab !== "review" && canReview && (
                      <Btn variant="ghost" size="sm" icon={<Undo2 size={12} />} disabled={busy} onClick={() => { void handleUndo(l); }}>Undo</Btn>
                    )}
                  </div>
                  {open === l.id && (
                    <LineEditor line={l} isCard={!!bank?.isCard} accounts={accounts.filter((a) => a.id !== bank?.chart_account_id)} projects={projects}
                      onDone={(m) => { void afterAction(m); }} onError={setError} />
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
