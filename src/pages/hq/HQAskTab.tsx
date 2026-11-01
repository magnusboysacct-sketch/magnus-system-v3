// src/pages/hq/HQAskTab.tsx — "Ask HQ": a chat that reads the same numbers HQ shows (overview, health, open errors,
// settings) and answers in plain words. It can only SUGGEST: each suggestion has a Confirm button, and confirming goes
// through the normal HQ checks, asks for a reason and lands in the activity log. Nothing is stored except the cost.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bot, Check, ChevronRight, Send, Sparkles, Square, Trash2, Volume2, X } from "lucide-react";
import { Alert, Btn, Card, Input, Spinner, Textarea } from "../../components/ui";
import { cn } from "../../lib/theme";
import { refreshPlatformSettings } from "../../lib/platformSettings";
import {
  askHQ, confirmSuggestion, describe, fetchAssistantStatus, usd,
  type AskMessage, type AssistantStatus, type Suggestion,
} from "../../lib/hq/ask";

type Turn = AskMessage & { suggestions?: Suggestion[]; cost?: number | null; problem?: boolean };

/** Answers are plain text: drop markdown marks (**bold**, # headings) the model sometimes adds anyway. */
function plain(t: string): string {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/`([^`]+)`/g, "$1");
}

const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

/** Words read better than symbols: "US$1.24" → "1.24 US dollars", "J$" → "Jamaican dollars", list dashes dropped. */
function forSpeech(t: string): string {
  return plain(t)
    .replace(/US\$\s?([\d,.]+)/g, "$1 US dollars")
    .replace(/J\$\s?([\d,.]+)/g, "$1 Jamaican dollars")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/(\d+)%/g, "$1 percent");
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /en[-_]JM/i.test(v.lang)) ?? voices.find((v) => /en[-_]GB/i.test(v.lang) && /natural|google|online/i.test(v.name))
    ?? voices.find((v) => /^en/i.test(v.lang) && /natural|google|online/i.test(v.name)) ?? voices.find((v) => /^en/i.test(v.lang));
}

/** Speaker button: reads one answer out loud with the device's own voice (free, nothing sent anywhere). Tap again to stop. */
function SpeakButton({ text, id, speaking, setSpeaking }: { text: string; id: number; speaking: number | null; setSpeaking: (v: number | null) => void }) {
  if (!canSpeak) return null;
  const on = speaking === id;
  function toggle() {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (on) { setSpeaking(null); return; }
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = 0.95;
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    setSpeaking(id);
    synth.speak(u);
  }
  return (
    <button type="button" onClick={toggle} aria-label={on ? "Stop reading" : "Read it out loud"}
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors",
        on ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
          : "border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.06]")}>
      {on ? <Square size={12} /> : <Volume2 size={13} />} {on ? "Stop" : "Read it to me"}
    </button>
  );
}

const STARTERS = ["Is everything OK?", "What needs my attention today?", "Explain the newest error in plain words", "How is money looking this month?"];

function SuggestionCard({ s, onOpenTab, onDone }: { s: Suggestion; onOpenTab: (tab: string) => void; onDone: (msg: string, ok: boolean) => void }) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done" | "dismissed">("idle");
  const [reason, setReason] = useState(s.input.why ?? "");

  if (state === "dismissed") return null;
  const isTab = s.type === "open_tab";

  async function run() {
    setState("busy");
    try {
      await confirmSuggestion(s, reason.trim());
      void refreshPlatformSettings();
      setState("done");
      onDone("Done. It's in the activity log.", true);
    } catch (e: unknown) {
      setState("confirm");
      onDone(e instanceof Error ? e.message : String(e), false);
    }
  }

  return (
    <div className={cn("rounded-xl border p-3 space-y-2",
      state === "done" ? "border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5"
        : "border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5")}>
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {state === "done" ? "Done" : isTab ? "Suggestion" : "Suggestion · nothing changes until you confirm"}
          </div>
          <div className="text-sm text-slate-800 dark:text-slate-200 break-words">{describe(s)}</div>
          {s.input.why && <div className="text-[11px] text-slate-500 mt-0.5">{s.input.why}</div>}
        </div>
      </div>

      {state === "confirm" || state === "busy" ? (
        <div className="space-y-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (goes in the activity log)" />
          <div className="flex gap-2 justify-end">
            <Btn onClick={() => setState("idle")} disabled={state === "busy"}>Cancel</Btn>
            <Btn variant="primary" icon={<Check size={13} />} disabled={state === "busy" || reason.trim().length < 3} onClick={() => { void run(); }}>
              {state === "busy" ? "Doing it…" : "Confirm"}
            </Btn>
          </div>
        </div>
      ) : state !== "done" && (
        <div className="flex gap-2 justify-end">
          <Btn variant="ghost" icon={<X size={13} />} onClick={() => setState("dismissed")}>No thanks</Btn>
          {isTab
            ? <Btn variant="primary" icon={<ChevronRight size={13} />} onClick={() => onOpenTab(s.input.tab)}>Open</Btn>
            : <Btn variant="primary" onClick={() => setState("confirm")}>Review and confirm</Btn>}
        </div>
      )}
    </div>
  );
}

export default function HQAskTab({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState(() => params.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ msg: string; ok: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);

  // Stop reading when leaving the tab.
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, []);

  useEffect(() => {
    fetchAssistantStatus().then(setStatus, (e: unknown) => setStatusError(e instanceof Error ? e.message : String(e)));
  }, []);

  // A question handed over from another tab (?q=...) is put in the box, then removed from the address.
  useEffect(() => {
    if (params.get("q")) { const p = new URLSearchParams(params); p.delete("q"); setParams(p, { replace: true }); }
  }, [params, setParams]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history: AskMessage[] = [...turns.filter((t) => !t.problem).map(({ role, content }) => ({ role, content })), { role: "user", content: question }];
    setTurns((t) => [...t, { role: "user", content: question }]);
    setText(""); setBusy(true);
    const r = await askHQ(history);
    setBusy(false);
    if (r.problem) {
      setTurns((t) => [...t, { role: "assistant", content: r.problem!, problem: true }]);
      return;
    }
    setTurns((t) => [...t, { role: "assistant", content: r.text ?? "", suggestions: r.suggestions ?? [], cost: r.cost_usd }]);
    if (r.spent_usd != null && status) setStatus({ ...status, spent_usd: r.spent_usd, cap_usd: r.cap_usd ?? status.cap_usd, questions_this_month: status.questions_this_month + 1 });
  }

  const off = status && !status.on;

  return (
    <div className="space-y-4 max-w-3xl">
      {statusError && <Alert type="error">{statusError}</Alert>}
      {note && <Alert type={note.ok ? "success" : "error"} onClose={() => setNote(null)}>{note.msg}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Bot size={16} className="text-cyan-600 dark:text-cyan-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">Ask HQ</span>
          <span>reads the same numbers HQ shows. It can only suggest; you confirm.</span>
          <span className="flex-1" />
          {status ? (
            <span className={cn("font-semibold", status.spent_usd >= status.cap_usd * 0.8 ? "text-amber-600" : "")}>
              This month: {usd(status.spent_usd)} of {usd(status.cap_usd)} · {status.questions_this_month} question{status.questions_this_month === 1 ? "" : "s"}
            </span>
          ) : !statusError && <Spinner size={12} />}
        </div>
        {off && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Ask HQ is switched off. The owner-admin switches it on in Settings → Ask HQ (after adding ANTHROPIC_API_KEY in Vercel).
          </p>
        )}
      </Card>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => <Btn key={s} disabled={!!off || busy} onClick={() => { void send(s); }}>{s}</Btn>)}
        </div>
      )}

      <div className="space-y-3">
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[92%] space-y-2", t.role === "user" ? "items-end" : "")}>
              <div className={cn("rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
                t.role === "user" ? "bg-cyan-600 text-white dark:bg-cyan-500/20 dark:text-cyan-100"
                  : t.problem ? "bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/20"
                    : "bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200")}>
                {t.role === "assistant" ? plain(t.content) : t.content}
              </div>
              {t.suggestions?.map((s, j) => (
                <SuggestionCard key={j} s={s} onOpenTab={onOpenTab} onDone={(msg, ok) => setNote({ msg, ok })} />
              ))}
              {t.role === "assistant" && !t.problem && t.content && (
                <div className="flex flex-wrap items-center gap-3">
                  <SpeakButton text={t.content} id={i} speaking={speaking} setSpeaking={setSpeaking} />
                  {t.cost != null && <span className="text-[10px] text-slate-500">Cost of this answer: {usd(t.cost, 3)}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><Spinner size={12} /> Looking at the numbers…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 sticky bottom-2">
        <Textarea rows={2} value={text} disabled={!!off} placeholder={off ? "Ask HQ is switched off" : "Ask anything about Magnus… (Enter to send)"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
          className="shadow-sm" />
        <div className="flex flex-col gap-2">
          <Btn variant="primary" size="md" icon={<Send size={14} />} disabled={!!off || busy || !text.trim()} onClick={() => { void send(text); }}>Ask</Btn>
          {turns.length > 0 && <Btn variant="ghost" icon={<Trash2 size={13} />} onClick={() => { if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(null); setTurns([]); }}>Clear</Btn>}
        </div>
      </div>
      <p className="text-[10px] text-slate-500">
        Each question sends HQ's counts, health checks and open errors to Anthropic. No company documents, payroll or clients are sent, and no question or answer is kept.
      </p>
    </div>
  );
}
