// src/public/InfoPages.tsx — Privacy, Terms, the public status page and the feedback page.

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { FeedbackForm } from "./Forms";
import { fetchLegal } from "./publicApi";

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const [doc, setDoc] = useState<{ version: number; body: string; published_at: string } | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchLegal(kind).then((d) => { if (alive) setDoc(d); });
    return () => { alive = false; };
  }, [kind]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">{kind === "privacy" ? "Privacy policy" : "Terms of use"}</h1>
      {doc === undefined ? <p className="mt-6 text-slate-500">Loading…</p> : !doc ? <p className="mt-6 text-slate-500">Not published yet.</p> : (
        <>
          <p className="mt-2 text-xs text-slate-500">Version {doc.version} · {new Date(doc.published_at).toLocaleDateString("en-JM", { dateStyle: "long" })}</p>
          <div className="mt-6 whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300">{doc.body}</div>
        </>
      )}
    </article>
  );
}

type Check = { key: string; label: string; level: "ok" | "warn" | "problem" };
const WORDS: Record<Check["level"], string> = { ok: "Working", warn: "Needs attention", problem: "Not working right" };

export function StatusPage() {
  const [h, setH] = useState<{ status: Check["level"]; checked_at: string; checks: Check[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (alive) { setH(j); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    const t = window.setTimeout(() => setTick((x) => x + 1), 60_000);
    return () => { alive = false; window.clearTimeout(t); };
  }, [tick]);

  const overall = failed ? "problem" : h?.status;
  const headline = !overall ? "Checking…"
    : overall === "ok" ? "Everything is working"
    : overall === "warn" ? "Magnus is working, with something we're keeping an eye on"
    : "Something isn't working right. We're on it.";
  const Icon = overall === "problem" ? CircleAlert : overall === "warn" ? TriangleAlert : CircleCheck;
  const color = overall === "problem" ? "text-red-600" : overall === "warn" ? "text-amber-500" : "text-emerald-600";

  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">System status</h1>
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <Icon size={28} className={color} />
        <div className="flex-1">
          <div className="font-semibold">{headline}</div>
          {h && <div className="text-xs text-slate-500">Checked {new Date(h.checked_at).toLocaleTimeString("en-JM", { timeStyle: "short" })}. Updates every minute.</div>}
        </div>
        <button onClick={() => setTick((x) => x + 1)} aria-label="Check again" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><RefreshCw size={16} /></button>
      </div>
      {h && (
        <ul className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.03]">
          {h.checks.map((c) => (
            <li key={c.key} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{c.label}</span>
              <span className={c.level === "ok" ? "text-emerald-600" : c.level === "warn" ? "text-amber-600" : "text-red-600"}>{WORDS[c.level]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FeedbackPage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Ideas & feedback</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">Tell us what would make Magnus better, what you like, or what isn&apos;t working. Every message is read.</p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"><FeedbackForm /></div>
    </section>
  );
}
