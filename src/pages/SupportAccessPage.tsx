// src/pages/SupportAccessPage.tsx — "Let Magnus support see my company for 24 hours".
// Directors and admins only. Support can only READ, only until the time runs out (or "End now"),
// and every screen they open is listed here.

import { useCallback, useEffect, useState } from "react";
import { Eye, LifeBuoy, ShieldCheck, ShieldOff } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Field, Page, PageHeader, Spinner, Textarea } from "../components/ui";
import { endSupport, fetchMySupport, grantSupport, timeLeft, type MySupportStatus } from "../lib/support";

const when = (ts: string) => new Date(ts).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });

export default function SupportAccessPage() {
  const [data, setData] = useState<MySupportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await fetchMySupport()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMySupport().then((d) => { if (alive) setData(d); }, (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    const t = window.setInterval(() => { void fetchMySupport().then((d) => { if (alive) setData(d); }, () => undefined); }, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  async function give() {
    setBusy(true); setError(null);
    try {
      await grantSupport(reason.trim(), 24);
      setReason("");
      setNotice("Magnus support can now look at your company (read-only) for 24 hours. You'll see everything they open below.");
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function end() {
    setBusy(true); setError(null);
    try { await endSupport(); setNotice("Support access has ended."); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <Page>
      <PageHeader title="Support access" subtitle="Let Magnus support look at your company to help you" />
      <div className="p-4 sm:p-6 max-w-3xl space-y-4">
        {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

        {!data ? <div className="flex justify-center py-10"><Spinner /></div> : !data.can_manage ? (
          <Alert type="info">Only your company&apos;s director or admin can give Magnus support access.</Alert>
        ) : (
          <>
            {data.active ? (
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <ShieldCheck size={20} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-semibold">Magnus support can see your company now</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Read-only · until {when(data.active.expires_at)} ({timeLeft(data.active.expires_at)}) · given by {data.active.granted_by_email ?? "you"}
                    </div>
                    <div className="text-xs mt-2">“{data.active.reason}”</div>
                  </div>
                  <Btn variant="danger" icon={<ShieldOff size={13} />} onClick={() => { void end(); }} disabled={busy}>End now</Btn>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Let Magnus support see my company for 24 hours" />
                <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-4 mb-3">
                  <li>Support can only <b>look</b>. They can&apos;t add, change or delete anything.</li>
                  <li>Passwords, PINs, bank account numbers and TRNs are never shown to them.</li>
                  <li>Every screen they open is listed on this page.</li>
                  <li>Access ends by itself after 24 hours, or when you tap <b>End now</b>.</li>
                </ul>
                <Field label="What do you need help with?">
                  <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. October payroll totals don't match the bank" />
                </Field>
                <div className="mt-3 flex justify-end">
                  <Btn variant="primary" icon={<LifeBuoy size={13} />} onClick={() => { void give(); }} disabled={busy || reason.trim().length < 5}>
                    {busy ? "Saving..." : "Give access for 24 hours"}
                  </Btn>
                </div>
              </Card>
            )}

            <Card padding={false}>
              <div className="p-4 pb-2"><CardHeader title="What Magnus support looked at" subtitle="Every screen, with who and when." /></div>
              {(data.log ?? []).length === 0 ? <p className="px-4 pb-4 text-xs text-slate-500">Nothing yet.</p> : (data.log ?? []).map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-100 dark:border-white/[0.04] text-xs">
                  <Eye size={12} className="text-slate-400" />
                  <span className="flex-1">{l.what}</span>
                  <span className="text-[11px] text-slate-500">{l.who ?? "support"} · {when(l.at)}</span>
                </div>
              ))}
            </Card>

            {(data.grants ?? []).length > 0 && (
              <Card>
                <CardHeader title="Past access" />
                <div className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                  {(data.grants ?? []).map((g) => (
                    <div key={g.id} className="py-2 flex flex-wrap gap-2 justify-between">
                      <span>“{g.reason}”</span>
                      <span className="text-slate-500">
                        {when(g.granted_at)} · {g.ended_at ? <Badge color="slate">ended early</Badge> : new Date(g.expires_at) > new Date() ? <Badge color="amber">open</Badge> : <Badge color="slate">expired</Badge>}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
