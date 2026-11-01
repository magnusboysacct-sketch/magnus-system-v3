// src/pages/hq/HQSupportTab.tsx — Magnus HQ Support: companies that have let support look at their records.
// READ ONLY. Only while the company's grant is active. Every list and every page of rows you open is logged and the
// company sees it. Secret columns and login / session tables are never shown.

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, RefreshCw } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Spinner, Table, Td, Th, Tr } from "../../components/ui";
import {
  fetchSupportGrants, fetchSupportRows, fetchSupportTables, tableLabel, timeLeft,
  type HQSupportGrant, type SupportRows, type SupportTables,
} from "../../lib/support";

const when = (ts: string) => new Date(ts).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });
const PAGE = 50;

function cell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function Rows({ companyId, table, onBack }: { companyId: string; table: string; onBack: () => void }) {
  const [data, setData] = useState<SupportRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSupportRows(companyId, table, offset, PAGE)
      .then((r) => { if (alive) { setData(r); setError(null); } }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [companyId, table, offset]);

  const cols = data?.rows[0] ? Object.keys(data.rows[0]).filter((c) => c !== "company_id") : [];

  return (
    <Card padding={false}>
      <div className="p-4 flex flex-wrap items-center gap-2">
        <Btn icon={<ArrowLeft size={13} />} onClick={onBack}>Back</Btn>
        <span className="text-sm font-semibold">{tableLabel(table)}</span>
        {data && <span className="text-[11px] text-slate-500">rows {data.total ? offset + 1 : 0}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>}
        <div className="flex-1" />
        <Btn size="xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Btn>
        <Btn size="xs" disabled={!data || offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Next</Btn>
      </div>
      {error && <div className="px-4 pb-4"><Alert type="error">{error}</Alert></div>}
      {!data ? <div className="flex justify-center py-8"><Spinner /></div> : data.rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-slate-500">No rows.</p>
      ) : (
        <Table minWidth={Math.max(600, cols.length * 140)}>
          <thead><tr>{cols.map((c) => <Th key={c}>{c.replace(/_/g, " ")}</Th>)}</tr></thead>
          <tbody>
            {data.rows.map((r, i) => (
              <Tr key={i}>{cols.map((c) => <Td key={c} className="whitespace-nowrap max-w-[260px] truncate">{cell(r[c])}</Td>)}</Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function CompanyView({ grant, onBack }: { grant: HQSupportGrant; onBack: () => void }) {
  const [tables, setTables] = useState<SupportTables | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSupportTables(grant.company_id).then((t) => { if (alive) setTables(t); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [grant.company_id]);

  if (open) return <Rows companyId={grant.company_id} table={open} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <Btn icon={<ArrowLeft size={13} />} onClick={onBack}>All companies</Btn>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-semibold">{grant.company_name}</div>
            <div className="text-xs mt-0.5">“{grant.reason}”</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Read-only · {timeLeft(grant.expires_at)} · given by {grant.granted_by_email ?? "the company"}</div>
          </div>
        </div>
        <Alert type="info" className="mt-3">Everything you open here is logged and the company sees the list.</Alert>
      </Card>
      {error && <Alert type="error">{error}</Alert>}
      <Card padding={false}>
        <div className="p-4 pb-2"><CardHeader title="Records" subtitle="Tap one to look at it." /></div>
        {!tables ? <div className="flex justify-center py-8"><Spinner /></div> : tables.tables.map((t) => (
          <button key={t.table} onClick={() => setOpen(t.table)}
            className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.04] text-sm text-left hover:bg-slate-50 dark:hover:bg-white/[0.03]">
            <Eye size={13} className="text-slate-400" /><span className="flex-1">{tableLabel(t.table)}</span>
            <span className="text-[11px] text-slate-500">{t.rows.toLocaleString("en-JM")}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

export default function HQSupportTab() {
  const [grants, setGrants] = useState<HQSupportGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<HQSupportGrant | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setGrants(await fetchSupportGrants()); setError(null); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    fetchSupportGrants().then((g) => { if (alive) setGrants(g); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  if (open) return <CompanyView grant={open} onBack={() => { setOpen(null); void load(); }} />;

  return (
    <div className="space-y-4">
      <Alert type="info">
        HQ can only see a company&apos;s records after its director or admin taps “Let Magnus support see my company” (in their app under Support access).
        It&apos;s read-only, it ends by itself after 24 hours, and the company sees everything you open.
      </Alert>
      {error && <Alert type="error">{error}</Alert>}
      <div className="flex justify-end"><Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }}>Refresh</Btn></div>
      <Card padding={false}>
        {grants === null ? <div className="flex justify-center py-10"><Spinner /></div> : grants.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">No company has asked for support yet.</p>
        ) : grants.map((g) => (
          <div key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/[0.04]">
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 text-sm font-medium">{g.company_name}
                {g.active ? <Badge color="amber">Open · {timeLeft(g.expires_at)}</Badge> : <Badge color="slate">{g.ended_at ? "Ended by company" : "Expired"}</Badge>}
              </div>
              <div className="text-xs mt-0.5">“{g.reason}”</div>
              <div className="text-[11px] text-slate-500">{when(g.granted_at)} · {g.granted_by_email ?? ""} · {g.views} screen{g.views === 1 ? "" : "s"} viewed</div>
            </div>
            {g.active && <Btn variant="primary" icon={<Eye size={13} />} onClick={() => setOpen(g)}>Open read-only</Btn>}
          </div>
        ))}
      </Card>
    </div>
  );
}
