// src/lib/notifications.ts — the bell (in-app notices) and phone / browser alerts (web push) for Magnus Boy's System.
// Notices are read straight from the notifications table (each user only sees their own: RLS).
// Phone alerts: the browser subscribes with the PUBLIC VAPID key from /api/push-config; sending happens on the server.

import { supabase } from "./supabase";

export type Notice = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  urgent: boolean;
  created_at: string;
  read_at: string | null;
};

export async function fetchNotices(limit = 40): Promise<Notice[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, urgent, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Notice[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function markRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null);
}

export async function markAllRead(): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", u.user.id).is("read_at", null);
}

// ─── Phone / browser alerts ──────────────────────────────────────────────────

export type PushState = "unsupported" | "blocked" | "off" | "on" | "not-configured";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhones and iPads only get alerts after "Add to Home Screen" (iOS 16.4+). */
export function isIOSNotInstalled(): boolean {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function keyToBytes(input: string): Uint8Array<ArrayBuffer> {
  const base64url = input.replace(/["'\s]/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]+$/.test(base64url)) throw new Error("The phone-alert key on the server is not a valid key. Check VAPID_PUBLIC_KEY in Vercel.");
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const res = await fetch("/api/push-config", { cache: "no-store" });
  const { publicKey, problem } = (await res.json().catch(() => ({}))) as { publicKey?: string | null; problem?: string | null };
  if (problem) throw new Error(`Phone alerts aren't set up right: ${problem}`);
  if (!publicKey) return "not-configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth,
    p_device: navigator.userAgent.slice(0, 200),
  });
  if (error) throw new Error(error.message);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

/** Queues a test alert for yourself and asks the server to send it straight away. */
export async function sendTestAlert(): Promise<void> {
  const { error } = await supabase.rpc("send_test_notification");
  if (error) throw new Error(error.message);
  void fetch("/api/push-dispatch", { cache: "no-store" }).catch(() => undefined);
}
