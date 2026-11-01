// src/pages/hq/HQFeedbackTab.tsx — ideas and problem reports from the website and from inside the app.
// New → Read / Planned / Done / Spam, with a note. Problems come first.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Lightbulb, MessageSquare, RefreshCw } from "lucide-react";
import { Alert, Badge, Btn, Card, Select, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import {
  ago, fetchFeedback, FEEDBACK_KIND, FEEDBACK_LABEL, FEEDBACK_STATUSES, saveFeedback, when,
  type Feedback, type FeedbackStatus,
} from "../../lib/hq/website";

const KIND_COLOR = { problem: "red", idea: "violet", like: "green", other: "slate" } as const;
const STATUS_COLOR: Record<FeedbackStatus, "amber" | "slate" | "blue" | "green"> = {
  new: "amber", read: "slate", planned: "blue", done: "green", spam: "slate",
};

type Filter = FeedbackStatus | "open" | "all";

function FeedbackCard({ f, onSaved, onError }: { f: Feedback; onSaved: (m: string) => void; onError: (m: string) => void }) {
  const [status, setStatus] = useState<FeedbackStatus>(f.status);
  const [note, setNote] = useState(f.note ?? "");
  const [busy, setBusy] = useState(false);
  const changed = status !== f.status || note.trim() !== (f.note ?? "");

  async function save(next = status) {
    setBusy(true);
    try { await saveFeedback(f.id, next, note); onSaved(`Marked ${FEEDBACK_LABEL[next].toLowerCase()}.`); }
    catch (e: unknown) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const from = [f.user_email, f.company_name, f.contact && f.contact !== f.user_email ? f.contact : null].filter(Boolean).join(" · ");

  return (
    <Card padding={false}>
      <div className={cn("p-4 border-l-4 rounded-l-xl space-y-3",
        f.status === "new" ? (f.kind === "problem" ? "border-l-red-500" : "border-l-amber-400") : "border-l-slate-200 dark:border-l-white/10")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={KIND_COLOR[f.kind]}>{FEEDBACK_KIND[f.kind]}</Badge>
          <Badge color={STATUS_COLOR[f.status]}>{FEEDBACK_LABEL[f.status]}</Badge>
          <span className="flex-1" />
          <span className="text-[11px] text-slate-500" title={when(f.created_at)}>{ago(f.created_at)}</span>
        </div>
        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{f.message}</p>
        <div className="text-[11px] text-slate-500 break-words">
          {from || "Anonymous visitor"}{f.page ? ` · sent from ${f.page}` : ""}
        </div>
        <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto] items-start">
          <Select value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} aria-label="Status">
            {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{FEEDBACK_LABEL[s]}</option>)}
          </Select>
          <Textarea rows={1} value={note} placeholder="Note (only HQ sees this)" onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            {f.status === "new" && !changed && <Btn disabled={busy} onClick={() => { setStatus("read"); void save("read"); }}>Mark read</Btn>}
            <Btn variant="primary" disabled={!changed || busy} onClick={() => { void save(); }}>Save</Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function HQFeedbackTab() {
  const [rows, setRows] = useState<Feedback[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [kind, setKind] = useState<"all" | Feedback["kind"]>("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await fetchFeedback()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setRows((r) => r ?? []); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const count = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0, open: 0 };
    for (const r of rows ?? []) { c[r.status] = (c[r.status] ?? 0) + 1; if (r.status === "new" || r.status === "planned") c.open++; }
    return c;
  }, [rows]);

  const shown = (rows ?? []).filter((r) =>
    (kind === "all" || r.kind === kind) &&
    (filter === "all" ? true : filter === "open" ? r.status === "new" || r.status === "planned" : r.status === filter));

  const chips: { key: Filter; label: string }[] = [
    { key: "open", label: "To do" },
    ...FEEDBACK_STATUSES.map((s) => ({ key: s as Filter, label: FEEDBACK_LABEL[s] })),
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Btn key={c.key} variant={filter === c.key ? "primary" : "secondary"} onClick={() => setFilter(c.key)}>
            {c.label} ({count[c.key] ?? 0})
          </Btn>
        ))}
        <div className="flex-1" />
        <div className="w-36">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
            <option value="all">Every kind</option>
            {Object.entries(FEEDBACK_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Lightbulb size={12} /> "To do" = New and Planned. Problems with a red edge haven't been read yet.</p>

      {rows === null ? <div className="flex justify-center py-12"><Spinner /></div> : shown.length === 0 ? (
        <Card><div className="flex items-center gap-2 text-sm text-slate-500"><MessageSquare size={16} />
          {rows.length === 0 ? "No feedback yet. It comes from /feedback and the \"Ideas & feedback\" link in the app." : "Nothing here."}
        </div></Card>
      ) : shown.map((f) => (
        <FeedbackCard key={`${f.id}:${f.status}:${f.note ?? ""}`} f={f} onSaved={(m) => { setNotice(m); void load(); }} onError={setError} />
      ))}
    </div>
  );
}
