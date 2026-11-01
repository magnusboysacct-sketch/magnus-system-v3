// src/pages/hq/HQErrorsTab.tsx — app errors reported from every screen, grouped by fingerprint.
// "Copy note for developer" puts everything a developer needs on the clipboard. "Mark fixed": if it happens again it reopens.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, CheckCircle2, Copy, EyeOff, RefreshCw, RotateCcw } from "lucide-react";
import { Alert, Badge, Btn, Card, Spinner } from "../../components/ui";
import { cn } from "../../lib/theme";
import { fetchErrors, setErrorStatus, type AppErrorGroup } from "../../lib/hq/platformAdmin";

const when = (ts: string) => new Date(ts).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });

function device(ua: string | null) {
  if (!ua) return "unknown";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "browser";
  return `${os} · ${br}`;
}

function note(e: AppErrorGroup) {
  return [
    `Magnus Boy's System app error (${e.status})`,
    `Message: ${e.message}`,
    `Screen: ${e.screen ?? "-"}`,
    `Happened: ${e.total} times (${e.last_24h} in the last 24 h), ${e.users} signed-in user(s), ${e.anon} signed-out`,
    `First: ${when(e.first_seen)} · Last: ${when(e.last_seen)}`,
    `Version: ${e.version ?? "-"} · Device: ${e.device ?? "-"}`,
    e.reopened_count ? `Came back after being fixed: ${e.reopened_count} time(s)` : "",
    "",
    "Stack:",
    e.stack ?? "(none)",
  ].filter((l) => l !== null).join("\n");
}

export default function HQErrorsTab() {
  const [rows, setRows] = useState<AppErrorGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [openFp, setOpenFp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await fetchErrors()); } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setRows((r) => r ?? []); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => show === "all" || r.status === "open"), [rows, show]);
  const openCount = (rows ?? []).filter((r) => r.status === "open").length;

  async function set(e: AppErrorGroup, status: AppErrorGroup["status"]) {
    try {
      await setErrorStatus(e.fingerprint, status, "");
      setNotice(status === "fixed" ? "Marked fixed. If it happens again it reopens and you'll be told." : status === "ignored" ? "Ignored." : "Reopened.");
      await load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)); }
  }

  async function copy(e: AppErrorGroup) {
    try { await navigator.clipboard.writeText(note(e)); setNotice("Note copied. Paste it to your developer."); }
    catch { setError("Couldn't copy. Open the error and select the text by hand."); }
  }

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Btn variant={show === "open" ? "primary" : "secondary"} onClick={() => setShow("open")}>Open ({openCount})</Btn>
        <Btn variant={show === "all" ? "primary" : "secondary"} onClick={() => setShow("all")}>All ({rows?.length ?? 0})</Btn>
        <div className="flex-1" />
        <Btn icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />} onClick={() => { void load(); }} disabled={busy}>Refresh</Btn>
      </div>

      {rows === null ? <div className="flex justify-center py-12"><Spinner /></div> : shown.length === 0 ? (
        <Card><div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 size={16} /> No {show === "open" ? "open " : ""}errors.</div></Card>
      ) : shown.map((e) => (
        <Card key={e.fingerprint} padding={false}>
          <button onClick={() => setOpenFp(openFp === e.fingerprint ? null : e.fingerprint)}
            className={cn("w-full text-left p-4 border-l-4 rounded-l-xl", e.status === "open" ? (e.reopened_count ? "border-l-red-500" : "border-l-amber-400") : "border-l-slate-200 dark:border-l-white/10")}>
            <div className="flex flex-wrap items-center gap-2">
              {e.status === "open" ? <Badge color={e.reopened_count ? "red" : "amber"}>{e.reopened_count ? "Came back" : "Open"}</Badge>
                : e.status === "fixed" ? <Badge color="green">Fixed</Badge> : <Badge color="slate">Ignored</Badge>}
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 break-all">{e.message}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {e.screen ?? "-"} · {e.total}× ({e.last_24h} today) · {e.users} user{e.users === 1 ? "" : "s"}{e.anon ? ` + ${e.anon} signed-out` : ""} · {device(e.device)} · v{e.version ?? "?"} · last {when(e.last_seen)}
            </div>
          </button>
          {openFp === e.fingerprint && (
            <div className="px-4 pb-4 space-y-3">
              <pre className="text-[10px] leading-relaxed bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap break-all">{e.stack || "(no stack)"}</pre>
              <div className="flex flex-wrap gap-2">
                <Btn icon={<Copy size={13} />} onClick={() => { void copy(e); }}>Copy note for developer</Btn>
                <Btn icon={<Bot size={13} />} onClick={() => navigate(`/hq?tab=ask&q=${encodeURIComponent(`Explain this error in plain words: "${e.message.slice(0, 200)}" on ${e.screen ?? "an unknown screen"}. What broke, who does it affect, and what should I tell the developer?`)}`)}>Ask HQ about this</Btn>
                {e.status !== "fixed" && <Btn variant="primary" icon={<CheckCircle2 size={13} />} onClick={() => { void set(e, "fixed"); }}>Mark fixed</Btn>}
                {e.status === "open" && <Btn icon={<EyeOff size={13} />} onClick={() => { void set(e, "ignored"); }}>Ignore</Btn>}
                {e.status !== "open" && <Btn icon={<RotateCcw size={13} />} onClick={() => { void set(e, "open"); }}>Reopen</Btn>}
              </div>
              <p className="text-[10px] text-slate-500">First seen {when(e.first_seen)}. Device: {e.device ?? "-"}</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
