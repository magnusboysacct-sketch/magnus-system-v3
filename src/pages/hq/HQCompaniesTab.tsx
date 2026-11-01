// src/pages/hq/HQCompaniesTab.tsx — Magnus HQ Companies tab: every company using Magnus Boy's System.
// Counts and dates only; HQ never opens a company's documents, payroll or clients from here.
// Every action needs a written reason and is written to the HQ activity log.
// Closing has three safe steps (read → reason → type the exact name and tick) plus a 5-second countdown.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Pause, Play, RefreshCw, Search, Trash2, XCircle } from "lucide-react";
import {
  Alert, Badge, Btn, Card, Field, Input, Modal, Select, Spinner, Table, Td, Textarea, Th, Tr,
} from "../../components/ui";
import { cn } from "../../lib/theme";
import {
  companyAction, deleteCompanyNow, exportCompany, listCompanies,
  type CompanyAction, type CompanyState, type HQCompany,
} from "../../lib/hq/platformAdmin";

const QUIET_DAYS = 14;

type Filter = "all" | "trial" | "paid" | "past_due" | "paused" | "closed" | "quiet" | "test";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "trial", label: "Trial" },
  { key: "paid", label: "Paid" },
  { key: "past_due", label: "Past due" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" },
  { key: "quiet", label: `Quiet ${QUIET_DAYS}+ days` },
  { key: "test", label: "Test" },
];

const STATE_BADGE: Record<CompanyState, { label: string; color: "cyan" | "green" | "amber" | "red" | "slate" | "orange" }> = {
  trial: { label: "Trial", color: "cyan" },
  paid: { label: "Paid", color: "green" },
  past_due: { label: "Past due", color: "amber" },
  no_plan: { label: "No plan", color: "slate" },
  paused: { label: "Paused", color: "orange" },
  closed: { label: "Closed", color: "red" },
};

const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-JM"));
const day = (ts: string | null) => (ts ? new Date(ts).toLocaleDateString("en-JM", { dateStyle: "medium" }) : "—");

function fmtBytes(b: number) {
  if (!b) return "0 KB";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function isQuiet(c: HQCompany) {
  if (!c.last_activity) return true;
  return Date.now() - new Date(c.last_activity).getTime() > QUIET_DAYS * 86_400_000;
}

function ago(ts: string | null) {
  if (!ts) return "Never";
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

// ─── Simple action (reason + optional extra input) ────────────────────────────

type Pending = { action: CompanyAction; title: string; args?: Record<string, unknown>; danger?: boolean };

function ActionModal({ company, pending, onClose, onDone }: {
  company: HQCompany; pending: Pending; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState(company.plan ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true); setError(null);
    try {
      const args = pending.action === "set_plan" ? { plan } : (pending.args ?? {});
      await companyAction(company.id, pending.action, reason.trim(), args);
      onDone(`${pending.title}: done for ${company.name}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={pending.title} subtitle={company.name}>
      <div className="space-y-3">
        {pending.action === "pause" && (
          <Alert type="warning">They can still sign in, view and download everything, but can&apos;t add or change anything until you unpause.</Alert>
        )}
        {pending.action === "set_plan" && (
          <Field label="Plan">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">No plan</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </Field>
        )}
        <Field label="Reason (saved in the activity log)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you doing this?" autoFocus />
        </Field>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant={pending.danger ? "danger" : "primary"} onClick={go} disabled={busy || reason.trim().length < 3}>
            {busy ? "Working..." : pending.title}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Close / delete: read → reason → type name + tick → 5-second countdown ───

function DangerModal({ company, mode, onClose, onDone }: {
  company: HQCompany; mode: "close" | "delete"; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = typed === company.name;

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  async function confirm() {
    setBusy(true); setError(null);
    try {
      if (mode === "close") {
        await companyAction(company.id, "close", reason.trim(), { confirm_name: typed });
        onDone(`${company.name} is closed. You can reopen it within 90 days.`);
      } else {
        const r = await deleteCompanyNow(company.id, reason.trim(), typed);
        onDone(`${company.name} was deleted (${r.rows_deleted} records, ${r.logins_deleted} logins).` +
          (r.files_left ? ` ${r.files_left} stored files are left; they'll be cleared by the daily job.` : ""));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setCountdown(null);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "close" ? "Close company" : "Delete test company now";

  return (
    <Modal open onClose={onClose} title={title} subtitle={company.name}>
      <div className="space-y-4">
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full", stage >= s ? "bg-red-500" : "bg-slate-200 dark:bg-white/10")} />
          ))}
        </div>

        {stage === 1 && (
          <>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
              {mode === "close" ? (
                <>
                  <p><b>What happens:</b></p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Nobody in {company.name} can sign in or see their data.</li>
                    <li>Their data is kept for 90 days. You can reopen the company until then.</li>
                    <li>After 90 days the daily job wipes it for good.</li>
                    <li>Platform payment records are never deleted.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p><b>What happens:</b> every record of {company.name} and its logins are deleted right now. This can&apos;t be undone.</p>
                  <p>Only for test companies. Platform payment records are never deleted.</p>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Btn onClick={onClose}>Cancel</Btn>
              <Btn variant="danger" onClick={() => setStage(2)}>I&apos;ve read this</Btn>
            </div>
          </>
        )}

        {stage === 2 && (
          <>
            <Field label="Reason (saved in the activity log)">
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="Why?" />
            </Field>
            <div className="flex justify-end gap-2">
              <Btn onClick={() => setStage(1)}>Back</Btn>
              <Btn variant="danger" onClick={() => setStage(3)} disabled={reason.trim().length < 3}>Next</Btn>
            </div>
          </>
        )}

        {stage === 3 && (
          <>
            <Field label={`Type the company name exactly: ${company.name}`}>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              I understand what this does.
            </label>
            {error && <Alert type="error">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Btn onClick={() => { setStage(2); setCountdown(null); }}>Back</Btn>
              {countdown === null ? (
                <Btn variant="danger" disabled={!nameOk || !understood} onClick={() => setCountdown(5)}>{title}</Btn>
              ) : countdown > 0 ? (
                <Btn variant="danger" onClick={() => setCountdown(null)}>Wait {countdown}s · tap to stop</Btn>
              ) : (
                <Btn variant="danger" onClick={confirm} disabled={busy}>{busy ? "Working..." : `Yes, ${mode === "close" ? "close" : "delete"} it`}</Btn>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Company detail ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/[0.06] px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

function CompanyDetail({ company, isOwner, onClose, onChanged }: {
  company: HQCompany; isOwner: boolean; onClose: () => void; onChanged: (msg: string) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [danger, setDanger] = useState<"close" | "delete" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportReason, setExportReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const st = STATE_BADGE[company.state];
  const closed = company.account_status === "closed";

  async function doExport() {
    setBusy(true); setError(null);
    try {
      await exportCompany(company, exportReason.trim());
      setExportOpen(false); setExportReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const done = (msg: string) => { setPending(null); setDanger(null); onChanged(msg); };

  return (
    <>
      <Modal open onClose={onClose} title={company.name} subtitle={company.owner_email ?? "No owner email"} width="max-w-2xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={st.color}>{st.label}</Badge>
            {company.is_test && <Badge color="violet">Test</Badge>}
            {company.plan && <Badge color="blue">{company.plan}</Badge>}
            <span className="text-[11px] text-slate-500">Joined {day(company.created_at)} · last active {ago(company.last_activity)}</span>
          </div>

          {company.status_reason && (
            <Alert type={closed ? "error" : "warning"}>
              {closed ? `Closed ${day(company.closed_at)}. Wiped after ${day(company.purge_after)}.` : "Paused."} Reason: {company.status_reason}
            </Alert>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Trial ends" value={day(company.trial_expires_at)} />
            <Stat label="Paid until" value={day(company.subscription_expires_at)} />
            <Stat label="Seats used" value={`${n(company.users)} / —`} />
            <Stat label="Storage" value={`${fmtBytes(company.storage_bytes)} · ${n(company.files)} files`} />
            <Stat label="Projects" value={n(company.projects)} />
            <Stat label="Workers" value={n(company.workers)} />
            <Stat label="Clients" value={n(company.clients)} />
            <Stat label="Payroll runs" value={n(company.payroll_runs)} />
            <Stat label="Invoices" value={n(company.invoices)} />
            <Stat label="Purchase orders" value={n(company.purchase_orders)} />
            <Stat label="Receipts" value={n(company.receipts)} />
          </div>
          <p className="text-[10px] text-slate-500">Seat limits arrive with plans and prices (Step 5). Per-company feature switches arrive with Settings (Step 8).</p>

          {error && <Alert type="error">{error}</Alert>}

          <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 flex flex-wrap gap-2">
            {!closed && (
              <>
                <Btn onClick={() => setPending({ action: "extend_trial", title: "Extend trial +14 days", args: { days: 14 } })}>Trial +14 days</Btn>
                <Btn onClick={() => setPending({ action: "extend_trial", title: "Extend trial +30 days", args: { days: 30 } })}>Trial +30 days</Btn>
                <Btn onClick={() => setPending({ action: "set_plan", title: "Change plan" })}>Change plan</Btn>
                {company.account_status === "active"
                  ? <Btn icon={<Pause size={13} />} onClick={() => setPending({ action: "pause", title: "Pause (read-only)", danger: true })}>Pause</Btn>
                  : <Btn icon={<Play size={13} />} onClick={() => setPending({ action: "unpause", title: "Unpause" })}>Unpause</Btn>}
              </>
            )}
            <Btn icon={<Download size={13} />} onClick={() => setExportOpen(true)}>Export data</Btn>
            {isOwner && (
              <>
                {closed
                  ? <Btn onClick={() => setPending({ action: "reopen", title: "Reopen company" })}>Reopen</Btn>
                  : <Btn variant="danger" icon={<XCircle size={13} />} onClick={() => setDanger("close")}>Close company</Btn>}
                <Btn onClick={() => setPending({ action: "mark_test", title: company.is_test ? "Unmark as test" : "Mark as test company", args: { is_test: !company.is_test } })}>
                  {company.is_test ? "Unmark test" : "Mark as test"}
                </Btn>
                {company.is_test && <Btn variant="danger" icon={<Trash2 size={13} />} onClick={() => setDanger("delete")}>Delete now</Btn>}
              </>
            )}
          </div>
          {!isOwner && <p className="text-[10px] text-slate-500">Only the owner-admin can close, reopen, mark as test or delete.</p>}
        </div>
      </Modal>

      {pending && <ActionModal company={company} pending={pending} onClose={() => setPending(null)} onDone={done} />}
      {danger && <DangerModal company={company} mode={danger} onClose={() => setDanger(null)} onDone={done} />}

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export company data" subtitle={company.name}>
        <div className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Downloads a JSON file of the company&apos;s records, for example to hand to the owner when they leave.
            Logins, PINs, passwords, sessions and share links are left out. Photos and PDFs are not included.
            The export and your reason go in the activity log.
          </p>
          <Field label="Reason">
            <Textarea rows={2} value={exportReason} onChange={(e) => setExportReason(e.target.value)} placeholder="e.g. owner asked for their data" />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setExportOpen(false)}>Cancel</Btn>
            <Btn variant="primary" icon={<Download size={13} />} onClick={doExport} disabled={busy || exportReason.trim().length < 3}>
              {busy ? "Preparing..." : "Download"}
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── The tab ──────────────────────────────────────────────────────────────────

export default function HQCompaniesTab({ isOwner }: { isOwner: boolean }) {
  const [rows, setRows] = useState<HQCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await listCompanies());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRows((r) => r ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, trial: 0, paid: 0, past_due: 0, paused: 0, closed: 0, quiet: 0, test: 0 };
    for (const r of rows ?? []) {
      c.all++;
      if (r.state in c) c[r.state as Filter]++;
      if (isQuiet(r) && r.account_status !== "closed") c.quiet++;
      if (r.is_test) c.test++;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !(r.owner_email ?? "").toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "quiet") return isQuiet(r) && r.account_status !== "closed";
      if (filter === "test") return r.is_test;
      return r.state === filter;
    });
  }, [rows, search, filter]);

  const open = rows?.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <Card padding={false}>
        <div className="p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or owner email" className="pl-8" />
          </div>
          <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
        </div>
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] border transition-colors",
                filter === f.key
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5",
              )}
            >
              {f.label} <span className="opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-white/[0.04]">No companies match.</div>
        ) : (
          <Table minWidth={760}>
            <thead>
              <tr><Th>Company</Th><Th>Status</Th><Th>Owner</Th><Th right>Users</Th><Th right>Projects</Th><Th right>Workers</Th><Th right>Storage</Th><Th>Last active</Th></tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const st = STATE_BADGE[c.state];
                return (
                  <Tr key={c.id} onClick={() => setOpenId(c.id)}>
                    <Td>
                      <span className="font-medium">{c.name}</span>
                      {c.is_test && <span className="ml-1.5"><Badge color="violet">Test</Badge></span>}
                    </Td>
                    <Td><Badge color={st.color}>{st.label}</Badge></Td>
                    <Td muted>{c.owner_email ?? "—"}</Td>
                    <Td right>{n(c.users)}</Td>
                    <Td right>{n(c.projects)}</Td>
                    <Td right>{n(c.workers)}</Td>
                    <Td right muted>{fmtBytes(c.storage_bytes)}</Td>
                    <Td muted className={cn(isQuiet(c) && c.account_status !== "closed" && "text-amber-600 dark:text-amber-400")}>{ago(c.last_activity)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {open && (
        <CompanyDetail
          company={open}
          isOwner={isOwner}
          onClose={() => setOpenId(null)}
          onChanged={(msg) => { setNotice(msg); void load().then(() => { if (msg.includes("was deleted")) setOpenId(null); }); }}
        />
      )}
    </div>
  );
}
