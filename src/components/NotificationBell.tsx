// src/components/NotificationBell.tsx — the bell: unread count, the latest notices, mark read,
// and turning phone / browser alerts on or off (with "Send me a test").

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, BellRing, CheckCheck, Smartphone } from "lucide-react";
import { Alert, Btn, Modal, Spinner } from "./ui";
import { cn } from "../lib/theme";
import {
  disablePush, enablePush, fetchNotices, fetchUnreadCount, getPushState, isIOSNotInstalled, markAllRead, markRead,
  sendTestAlert, type Notice, type PushState,
} from "../lib/notifications";

function ago(ts: string) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString("en-JM", { dateStyle: "medium" });
}

const PUSH_TEXT: Record<PushState, string> = {
  on: "Phone alerts are ON for this device.",
  off: "Phone alerts are off for this device.",
  blocked: "Alerts are blocked for this site. Allow notifications in your browser settings, then try again.",
  unsupported: "This browser can't show phone alerts.",
  "not-configured": "Phone alerts aren't set up on the server yet.",
};

export default function NotificationBell({ className, label }: { className?: string; label?: boolean }) {
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Unread count: now, every minute, and when the tab comes back.
  useEffect(() => {
    let alive = true;
    const tick = () => { void fetchUnreadCount().then((n) => { if (alive) setUnread(n); }); };
    tick();
    const t = window.setInterval(tick, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const loadPanel = useCallback(async () => {
    const [list, state] = await Promise.all([fetchNotices(), getPushState().catch(() => "unsupported" as const)]);
    setItems(list);
    setPush(state);
  }, []);

  function openPanel() {
    setOpen(true);
    setMsg(null);
    void loadPanel();
  }

  async function go(n: Notice) {
    await markRead([n.id]);
    setUnread((u) => Math.max(0, u - (n.read_at ? 0 : 1)));
    setOpen(false);
    if (n.link) {
      if (/^https?:\/\//.test(n.link)) window.open(n.link, "_blank", "noopener");
      else nav(n.link);
    }
  }

  async function allRead() {
    await markAllRead();
    setUnread(0);
    setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
  }

  async function togglePush() {
    setBusy(true); setMsg(null);
    try {
      const next = push === "on" ? await disablePush() : await enablePush();
      setPush(next);
      if (next === "on") setMsg({ type: "success", text: "Phone alerts are on. Tap “Send me a test” to check." });
      else if (next !== "off") setMsg({ type: "error", text: PUSH_TEXT[next] });
    } catch (e: unknown) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try {
      await sendTestAlert();
      setMsg({ type: "info", text: "Test sent. It should pop up within a minute, even with Magnus closed." });
      void loadPanel();
    } catch (e: unknown) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={openPanel} title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className={cn("relative inline-flex items-center gap-2", className)}>
        <Bell size={label ? 13 : 18} />
        {label && <span>Notifications</span>}
        {unread > 0 && (
          <span className={cn("min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center",
            label ? "ml-auto" : "absolute -top-1 -right-1")}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications" width="max-w-md">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Smartphone size={14} className="text-slate-500" />
              <span className="flex-1">{push ? PUSH_TEXT[push] : "Checking phone alerts..."}</span>
            </div>
            {push !== null && isIOSNotInstalled() && push !== "on" && (
              <p className="text-[11px] text-slate-500">On iPhone: tap Share → <b>Add to Home Screen</b>, open Magnus from the home screen, then turn alerts on.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(push === "on" || push === "off") && (
                <Btn size="xs" variant={push === "on" ? "secondary" : "primary"} icon={push === "on" ? <BellOff size={12} /> : <BellRing size={12} />}
                  onClick={() => { void togglePush(); }} disabled={busy}>
                  {push === "on" ? "Turn off on this device" : "Turn on phone alerts"}
                </Btn>
              )}
              <Btn size="xs" onClick={() => { void test(); }} disabled={busy}>Send me a test</Btn>
            </div>
            {msg && <Alert type={msg.type}>{msg.text}</Alert>}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{unread} unread</span>
            {unread > 0 && <button className="text-[11px] inline-flex items-center gap-1 underline" onClick={() => { void allRead(); }}><CheckCheck size={12} /> Mark all read</button>}
          </div>

          {items === null ? <div className="flex justify-center py-6"><Spinner /></div> : items.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Nothing yet.</p>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto -mx-1 divide-y divide-slate-100 dark:divide-white/[0.05]">
              {items.map((n) => (
                <button key={n.id} onClick={() => { void go(n); }}
                  className={cn("w-full text-left px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] rounded-lg", !n.read_at && "bg-sky-50/60 dark:bg-sky-400/[0.05]")}>
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", n.urgent ? "bg-red-500" : "bg-sky-500")} />}
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-xs", !n.read_at ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300")}>{n.title}</div>
                      {n.body && <div className="text-[11px] text-slate-500 mt-0.5">{n.body}</div>}
                      <div className="text-[10px] text-slate-400 mt-0.5">{ago(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
