// src/pages/hq/HQActivityTab.tsx — every Magnus HQ action: who did it, when, to what, and why.

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Alert, Btn, Card, Input, Select, Spinner } from "../../components/ui";
import { fetchActivity, type ActivityRow } from "../../lib/hq/platformAdmin";

const GROUPS = [
  { key: "", label: "Everything" },
  { key: "company.", label: "Companies" },
  { key: "payment.", label: "Payments" },
  { key: "billing.", label: "Prices & charging" },
  { key: "subscription.", label: "My bills" },
  { key: "setting.", label: "Settings" },
  { key: "admin.", label: "Admins" },
  { key: "error.", label: "Errors" },
  { key: "job.", label: "Daily job" },
];

export default function HQActivityTab() {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [admin, setAdmin] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (f: { action: string; admin: string; search: string }) => {
    try { setRows(await fetchActivity(f)); setError(null); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchActivity({ action: "", admin: "", search: "" }).then((r) => { if (alive) setRows(r); }, (e: unknown) => { if (alive) { setError(e instanceof Error ? e.message : String(e)); setRows([]); } });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      {error && <Alert type="error">{error}</Alert>}
      <Card>
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); setRows(null); void load({ action, admin, search }); }}>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </Select>
          <Input value={admin} onChange={(e) => setAdmin(e.target.value)} placeholder="Admin email" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reasons, names..." />
          <Btn type="submit" variant="primary" icon={<Search size={13} />}>Filter</Btn>
        </form>
      </Card>

      <Card padding={false}>
        {rows === null ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Nothing found.</p>
        ) : rows.map((r) => {
          const reason = (r.details?.reason ?? r.details?.note) as string | undefined;
          return (
            <button key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)}
              className="w-full text-left px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/[0.03]">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">{r.action}</span>
                {(r.target_name || r.target) && <span className="text-slate-600 dark:text-slate-400">{r.target_name ?? r.target}</span>}
                <span className="ml-auto text-[10px] text-slate-500">{new Date(r.at).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" })} · {r.admin}</span>
              </div>
              {reason && <div className="text-[11px] text-slate-500 mt-0.5">“{reason}”</div>}
              {open === r.id && (
                <pre className="mt-2 text-[10px] bg-slate-50 dark:bg-white/[0.03] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(r.details, null, 2)}</pre>
              )}
            </button>
          );
        })}
      </Card>
    </div>
  );
}
