// src/pages/hq/HQSystemTab.tsx — the services Magnus Boy's System runs on: live status, space, the domain,
// latest deploys and commits, backups, and one-tap links to each service's dashboard, billing and status pages.
// Server checks come from /api/hq-system (admins only); tokens live in Vercel server settings, never in the app.

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Spinner } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchHealth, fetchSystem, type HQHealth, type HQSystem } from "../../lib/hq/platformAdmin";

const LINKS: { name: string; dashboard: string; billing: string; status?: string; note: string }[] = [
  { name: "Supabase", dashboard: "https://supabase.com/dashboard/project/julylfxbdwgekzqsxykb", billing: "https://supabase.com/dashboard/org/_/billing", status: "https://status.supabase.com", note: "Database, sign-in, files" },
  { name: "Vercel", dashboard: "https://vercel.com/dashboard", billing: "https://vercel.com/account/billing", status: "https://www.vercel-status.com", note: "Hosting of app.magnusboys.com" },
  { name: "GitHub", dashboard: "https://github.com/magnusboysacct-sketch/magnus-system-v3", billing: "https://github.com/settings/billing", status: "https://www.githubstatus.com", note: "The code" },
  { name: "GoDaddy", dashboard: "https://dcc.godaddy.com/control/portfolio", billing: "https://account.godaddy.com/billing", note: "magnusboys.com domain and DNS" },
  { name: "Resend", dashboard: "https://resend.com/overview", billing: "https://resend.com/settings/billing", status: "https://resend-status.com", note: "Invite and reset emails" },
  { name: "Anthropic", dashboard: "https://console.anthropic.com", billing: "https://console.anthropic.com/settings/billing", status: "https://status.anthropic.com", note: "Magnus AI" },
  { name: "UptimeRobot", dashboard: "https://dashboard.uptimerobot.com", billing: "https://dashboard.uptimerobot.com/billing", note: "Watches /api/health every 5 minutes" },
];

const IND: Record<string, { label: string; color: "green" | "amber" | "red" | "slate" }> = {
  none: { label: "All good", color: "green" },
  minor: { label: "Minor issue", color: "amber" },
  major: { label: "Major outage", color: "red" },
  critical: { label: "Critical outage", color: "red" },
  maintenance: { label: "Maintenance", color: "amber" },
  unknown: { label: "Can't check", color: "slate" },
};

const when = (v: string | number | null | undefined) => v == null ? "—" : new Date(v).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });

function Missing({ names, what }: { names: string; what: string }) {
  return (
    <p className="text-[11px] text-slate-500">
      Not set up. To show {what}, add <code className="font-mono">{names}</code> in Vercel → your project → Settings → Environment Variables
      (Production), then redeploy. These are server settings: never put them in a <code className="font-mono">VITE_</code> variable.
    </p>
  );
}

export default function HQSystemTab() {
  const [sys, setSys] = useState<HQSystem | null>(null);
  const [health, setHealth] = useState<HQHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const apply = useCallback((s: PromiseSettledResult<HQSystem>, h: PromiseSettledResult<HQHealth>) => {
    if (s.status === "fulfilled") setSys(s.value); else setError(s.reason instanceof Error ? s.reason.message : String(s.reason));
    if (h.status === "fulfilled") setHealth(h.value);
    setBusy(false);
  }, []);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    const [s, h] = await Promise.allSettled([fetchSystem(), fetchHealth()]);
    apply(s, h);
  }, [apply]);

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([fetchSystem(), fetchHealth()]).then(([s, h]) => { if (alive) apply(s, h); });
    return () => { alive = false; };
  }, [apply]);

  const space = health?.checks.filter((c) => c.pct != null) ?? [];
  // Counted from when the server checked, so the page stays the same between refreshes.
  const daysLeft = sys?.domain.expires_at ? Math.floor((new Date(sys.domain.expires_at).getTime() - new Date(sys.checked_at).getTime()) / 86_400_000) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">{sys ? `Checked ${when(sys.checked_at)}${sys.version ? ` · live version ${sys.version}` : ""}` : ""}</span>
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>
      {error && <Alert type="warning">{error}</Alert>}
      {busy && !sys && !error && <div className="flex justify-center py-10"><Spinner /></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Services right now" />
          {(sys?.services ?? []).map((s) => {
            const i = IND[s.indicator] ?? IND.unknown;
            return (
              <a key={s.name} href={s.page} target="_blank" rel="noreferrer" className="flex items-center justify-between py-2 border-b last:border-0 border-slate-100 dark:border-white/[0.05] text-sm">
                <span>{s.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-slate-500">{s.description} <Badge color={i.color}>{i.label}</Badge></span>
              </a>
            );
          })}
          {!sys && <p className="text-xs text-slate-500">Live service status shows on the live site.</p>}
        </Card>

        <Card>
          <CardHeader title="Space used" subtitle="Gold at 70%, red at 90%" />
          {space.map((c) => (
            <div key={c.key} className="py-2">
              <div className="flex justify-between text-xs"><span>{c.label}</span><span className="tabular-nums">{c.pct}%</span></div>
              <div className="h-2 mt-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div className={cn("h-full", (c.pct ?? 0) >= 90 ? "bg-red-500" : (c.pct ?? 0) >= 70 ? "bg-amber-400" : "bg-emerald-500")} style={{ width: `${Math.min(100, c.pct ?? 0)}%` }} />
              </div>
            </div>
          ))}
          {(space.some((c) => (c.pct ?? 0) >= 70)) && (
            <a className="text-[11px] underline text-amber-700 dark:text-amber-400" href="https://supabase.com/dashboard/org/_/billing" target="_blank" rel="noreferrer">Upgrade soon: open Supabase billing</a>
          )}
        </Card>

        <Card>
          <CardHeader title="Domain" subtitle={sys?.domain.domain ?? "magnusboys.com"} />
          {sys?.domain.expires_at ? (
            <div className={cn("text-sm", daysLeft != null && daysLeft < 30 ? "text-red-600 dark:text-red-400 font-semibold" : daysLeft != null && daysLeft < 60 ? "text-amber-600 dark:text-amber-400" : "")}>
              Expires {when(sys.domain.expires_at)} ({daysLeft} days)
              <div className="mt-2"><a className="text-[11px] underline" href="https://account.godaddy.com/products" target="_blank" rel="noreferrer">Renew at GoDaddy</a></div>
            </div>
          ) : <p className="text-xs text-slate-500">Couldn&apos;t read the expiry date right now.</p>}
        </Card>

        <Card>
          <CardHeader title="Backups" subtitle="Supabase" />
          {sys?.backups.configured ? (
            sys.backups.error ? <p className="text-xs text-red-600">{sys.backups.error}</p> : (
              <div className="text-xs space-y-1">
                <div>Latest backup: <b>{when(sys.backups.latest?.inserted_at ?? null)}</b> {sys.backups.latest?.status ? `(${sys.backups.latest.status})` : ""}</div>
                <div>{sys.backups.count ?? 0} backups kept · point-in-time recovery {sys.backups.pitr_enabled ? "ON" : "off"}</div>
                {(sys.backups.count ?? 0) === 0 && <Alert type="warning">No backups listed. The Supabase Free plan has no daily backups: export your data or upgrade.</Alert>}
              </div>
            )
          ) : (
            <>
              <Alert type="info">Reminder: check your Supabase backups once a month (Database → Backups). The Free plan has no daily backups.</Alert>
              <div className="mt-2"><Missing names="SUPABASE_ACCESS_TOKEN" what="the latest backup here" /></div>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Latest deploys" subtitle="Vercel" />
          {sys?.deploys.configured ? (
            sys.deploys.error ? <p className="text-xs text-red-600">{sys.deploys.error}</p> : (sys.deploys.deployments ?? []).map((d, i) => (
              <div key={i} className="py-1.5 border-b last:border-0 border-slate-100 dark:border-white/[0.05] text-xs">
                <div className="flex justify-between gap-2"><span className="truncate">{d.message ?? d.url}</span>
                  <Badge color={d.state === "READY" ? "green" : d.state === "ERROR" ? "red" : "amber"}>{d.state ?? "?"}</Badge></div>
                <div className="text-[10px] text-slate-500">{d.target} · {d.branch ?? ""} · {when(d.created)}</div>
              </div>
            ))
          ) : <Missing names="VERCEL_TOKEN (+ VERCEL_PROJECT_ID)" what="deploys" />}
        </Card>

        <Card>
          <CardHeader title="Latest commits" subtitle={sys?.commits.repo ?? "GitHub"} />
          {sys?.commits.configured ? (
            sys.commits.error ? <p className="text-xs text-red-600">{sys.commits.error}</p> : (sys.commits.commits ?? []).map((c) => (
              <a key={c.sha} href={c.url ?? "#"} target="_blank" rel="noreferrer" className="block py-1.5 border-b last:border-0 border-slate-100 dark:border-white/[0.05] text-xs">
                <span className="font-mono text-[10px] text-slate-500 mr-1.5">{c.sha}</span>{c.message}
                <div className="text-[10px] text-slate-500">{c.author ?? ""} · {when(c.date)}</div>
              </a>
            ))
          ) : <Missing names="GITHUB_TOKEN" what="commits" />}
        </Card>
      </div>

      <Card padding={false}>
        <div className="p-4 pb-2"><CardHeader title="Services and links" subtitle="Bills, due dates and Pay now buttons arrive with the Bills tab." /></div>
        {LINKS.map((l) => (
          <div key={l.name} className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-white/[0.04] text-xs">
            <div className="flex-1 min-w-[160px]"><div className="text-sm font-medium">{l.name}</div><div className="text-[11px] text-slate-500">{l.note}</div></div>
            <a className="inline-flex items-center gap-1 underline" href={l.dashboard} target="_blank" rel="noreferrer">Dashboard <ExternalLink size={10} /></a>
            <a className="inline-flex items-center gap-1 underline" href={l.billing} target="_blank" rel="noreferrer">Billing <ExternalLink size={10} /></a>
            {l.status && <a className="inline-flex items-center gap-1 underline" href={l.status} target="_blank" rel="noreferrer">Status <ExternalLink size={10} /></a>}
          </div>
        ))}
      </Card>
    </div>
  );
}
