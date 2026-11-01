// src/pages/hq/HQWebsiteTab.tsx — edit the public home page (headline, sub-line, FAQ) and publish new versions of
// the privacy policy and terms. Legal text is never overwritten: every publish is a new version (owner only).
// The support WhatsApp / email shown on the website is set in the Settings tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchRawSettings, saveSetting } from "../../lib/hq/platformAdmin";
import { fetchLegal, publishLegal, when, type FaqItem, type LegalDoc, type WebsiteText } from "../../lib/hq/website";

const EMPTY: WebsiteText = { hero_title: "", hero_sub: "", faq: [] };

function same(a: WebsiteText, b: WebsiteText) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function HomeText({ onNotice, onError }: { onNotice: (m: string) => void; onError: (m: string) => void }) {
  const [saved, setSaved] = useState<WebsiteText | null>(null);
  const [w, setW] = useState<WebsiteText>(EMPTY);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await fetchRawSettings();
    const v = (s.website ?? {}) as Partial<WebsiteText>;
    const clean: WebsiteText = { hero_title: v.hero_title ?? "", hero_sub: v.hero_sub ?? "", faq: Array.isArray(v.faq) ? v.faq : [] };
    setSaved(clean); setW(clean);
  }, []);
  useEffect(() => { load().catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); }, [load, onError]);

  const dirty = saved !== null && !same(saved, w);

  function setFaq(i: number, patch: Partial<FaqItem>) {
    setW((x) => ({ ...x, faq: x.faq.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  }
  function move(i: number, d: -1 | 1) {
    setW((x) => {
      const faq = [...x.faq]; const j = i + d;
      if (j < 0 || j >= faq.length) return x;
      [faq[i], faq[j]] = [faq[j], faq[i]];
      return { ...x, faq };
    });
  }

  async function save() {
    setBusy(true);
    try {
      await saveSetting("website", w, reason.trim());
      setAsking(false); setReason("");
      await load();
      onNotice("Home page text saved. Visitors see it the next time they open the page.");
    } catch (e: unknown) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!saved) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <Card>
      <CardHeader title="Home page" subtitle="The big headline, the line under it, and the questions people ask."
        action={<a href="/home" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:underline">Open the home page <ExternalLink size={12} /></a>} />
      <div className="space-y-4">
        <Field label={`Headline (${w.hero_title.trim().length}/120)`}>
          <Input value={w.hero_title} maxLength={120} onChange={(e) => setW({ ...w, hero_title: e.target.value })} />
        </Field>
        <Field label={`Line under the headline (${w.hero_sub.trim().length}/300)`}>
          <Textarea rows={2} value={w.hero_sub} maxLength={300} onChange={(e) => setW({ ...w, hero_sub: e.target.value })} />
        </Field>

        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Questions and answers ({w.faq.length}/20)</div>
          {w.faq.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">Question {i + 1}</span>
                <span className="flex-1" />
                <button type="button" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button type="button" title="Move down" aria-label="Move down" disabled={i === w.faq.length - 1} onClick={() => move(i, 1)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-30"><ArrowDown size={14} /></button>
                <button type="button" title="Remove" aria-label="Remove" onClick={() => setW({ ...w, faq: w.faq.filter((_, j) => j !== i) })}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>
              <Input value={f.q} maxLength={200} placeholder="Question" onChange={(e) => setFaq(i, { q: e.target.value })} />
              <Textarea rows={2} value={f.a} maxLength={1500} placeholder="Answer" onChange={(e) => setFaq(i, { a: e.target.value })} />
            </div>
          ))}
          {w.faq.length < 20 && (
            <Btn icon={<Plus size={13} />} onClick={() => setW({ ...w, faq: [...w.faq, { q: "", a: "" }] })}>Add a question</Btn>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
          {dirty && <Btn onClick={() => setW(saved)}>Undo changes</Btn>}
          <Btn variant="primary" disabled={!dirty} onClick={() => setAsking(true)}>Save home page</Btn>
        </div>
        <p className="text-[11px] text-slate-500">The support WhatsApp and email on the website are in the Settings tab. Prices come from the Money tab.</p>
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title="Save the home page text" subtitle="Goes in the HQ activity log.">
        <div className="space-y-3">
          <Field label="What changed?"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. new headline for the launch" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAsking(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={busy || reason.trim().length < 3} onClick={() => { void save(); }}>Save</Btn>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function Legal({ isOwner, onNotice, onError }: { isOwner: boolean; onNotice: (m: string) => void; onError: (m: string) => void }) {
  const [docs, setDocs] = useState<LegalDoc[] | null>(null);
  const [kind, setKind] = useState<LegalDoc["kind"]>("privacy");
  const [body, setBody] = useState("");
  const [viewing, setViewing] = useState<LegalDoc | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setDocs(await fetchLegal()); }, []);
  useEffect(() => { load().catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); }, [load, onError]);

  const versions = useMemo(() => (docs ?? []).filter((d) => d.kind === kind).sort((a, b) => b.version - a.version), [docs, kind]);
  const latest = versions[0];
  useEffect(() => { setBody(latest?.body ?? ""); }, [latest]);

  const dirty = body.trim() !== (latest?.body ?? "").trim();
  const isDraft = /^\s*DRAFT\b/i.test(latest?.body ?? "");

  async function publish() {
    setBusy(true);
    try {
      const v = await publishLegal(kind, body, reason.trim());
      setAsking(false); setReason("");
      await load();
      onNotice(`${kind === "privacy" ? "Privacy policy" : "Terms"} version ${v} is now live.`);
    } catch (e: unknown) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!docs) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <Card>
      <CardHeader title="Privacy policy and terms"
        subtitle={isOwner ? "Each publish makes a new version. Old versions are kept." : "Only the owner-admin can publish changes."}
        action={<a href={`/${kind}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:underline">Open the page <ExternalLink size={12} /></a>} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["privacy", "terms"] as const).map((k) => (
            <Btn key={k} variant={kind === k ? "primary" : "secondary"} disabled={dirty && kind !== k} onClick={() => setKind(k)}>
              {k === "privacy" ? "Privacy policy" : "Terms"}
            </Btn>
          ))}
          {latest && <Badge color="slate">Live: version {latest.version}</Badge>}
          {isDraft && <Badge color="amber">Still a draft</Badge>}
        </div>
        {isDraft && (
          <Alert type="warning">This text starts with "DRAFT". Have it checked, then remove the DRAFT line and publish.</Alert>
        )}
        <Textarea rows={16} value={body} readOnly={!isOwner} onChange={(e) => setBody(e.target.value)}
          className={cn("font-mono text-xs leading-relaxed", !isOwner && "opacity-80")} />
        <p className="text-[11px] text-slate-500">Plain text. It shows on the website exactly as typed, with the same line breaks.</p>
        {isOwner && (
          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Btn onClick={() => setBody(latest?.body ?? "")}>Undo changes</Btn>}
            <Btn variant="primary" disabled={!dirty || body.trim().length < 50} onClick={() => setAsking(true)}>Publish as version {(latest?.version ?? 0) + 1}</Btn>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">History</div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200 dark:border-white/[0.08]">
            {versions.map((d) => (
              <button key={d.version} type="button" onClick={() => setViewing(d)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                <FileText size={13} className="text-slate-400" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Version {d.version}</span>
                {d === latest && <Badge color="green">Live</Badge>}
                <span className="flex-1" />
                <span className="text-slate-500">{when(d.published_at)}{d.published_by ? ` · ${d.published_by}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title={`Publish ${kind === "privacy" ? "privacy policy" : "terms"} version ${(latest?.version ?? 0) + 1}`}
        subtitle="Goes live on the website straight away and in the HQ activity log.">
        <div className="space-y-3">
          <Field label="What changed?"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. checked by lawyer, removed DRAFT" /></Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setAsking(false)}>Cancel</Btn>
            <Btn variant="primary" disabled={busy || reason.trim().length < 3} onClick={() => { void publish(); }}>Publish</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} width="max-w-2xl"
        title={`${viewing?.kind === "privacy" ? "Privacy policy" : "Terms"} version ${viewing?.version ?? ""}`}
        subtitle={viewing ? `Published ${when(viewing.published_at)}` : undefined}>
        <pre className="text-xs whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{viewing?.body}</pre>
      </Modal>
    </Card>
  );
}

export default function HQWebsiteTab({ isOwner }: { isOwner: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}
      <HomeText onNotice={setNotice} onError={setError} />
      <Legal isOwner={isOwner} onNotice={setNotice} onError={setError} />
    </div>
  );
}
