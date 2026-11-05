// src/lib/nativeApp.ts — extra powers when the worker portal runs inside the "Magnus Workers" Android app (folder mobile/).
// The app is the same /worker website shown inside the phone app; the app adds:
//   * the site check keeps running with the phone LOCKED (background location, with a "Clocked in" notification), so leaving
//     the site clocks the worker out even with the phone in a pocket;
//   * "Are you still on site?" comes as a phone notification at the right time;
//   * the site checks are sent through the phone's own HTTP (Android slows down web requests from a locked phone).
// In a normal browser none of this exists and every function here does nothing.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

type Plugin = Record<string, (...a: unknown[]) => Promise<unknown>>;
interface Cap { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, Plugin>; registerPlugin?: (name: string) => Plugin }
const cap = (): Cap | null => (typeof window !== "undefined" ? ((window as unknown as { Capacitor?: Cap }).Capacitor ?? null) : null);
function plugin(name: string): Plugin | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  try { return c.registerPlugin ? c.registerPlugin(name) : (c.Plugins?.[name] ?? null); } catch { return c.Plugins?.[name] ?? null; }
}

export function isNativeApp(): boolean { try { return !!cap()?.isNativePlatform?.() && cap()?.getPlatform?.() === "android"; } catch { return false; } }

export interface NativeFix { lat: number; lng: number; accuracy: number; time: number | null }

// Start watching where the phone is, also while locked. Returns a stop function (or null in a browser / when refused).
export async function startSiteWatch(title: string, message: string, onFix: (f: NativeFix) => void, onError: (code: string) => void): Promise<(() => void) | null> {
  const bg = plugin("BackgroundGeolocation");
  if (!bg) return null;
  try { await plugin("LocalNotifications")?.requestPermissions(); } catch { /* the notification may not show, the watch still runs */ }
  try {
    const id = await (bg.addWatcher as (o: unknown, cb: (loc: { latitude: number; longitude: number; accuracy: number; time?: number } | undefined, err?: { code?: string }) => void) => Promise<string>)(
      { backgroundTitle: title, backgroundMessage: message, requestPermissions: true, stale: false, distanceFilter: 20 },
      (loc, err) => {
        if (err) { onError(err.code || "ERROR"); return; }
        if (loc) onFix({ lat: loc.latitude, lng: loc.longitude, accuracy: Math.round(loc.accuracy || 0), time: loc.time ?? null });
      },
    );
    return () => { void bg.removeWatcher({ id }).catch(() => { /* gone */ }); };
  } catch { return null; }
}
export function openAppSettings(): void { void plugin("BackgroundGeolocation")?.openSettings().catch(() => { /* fine */ }); }

// A database function called through the phone's own HTTP (keeps working with the phone locked). Throws "offline" when there is no signal.
export async function nativeRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const http = plugin("CapacitorHttp");
  if (!http) throw new Error("not the app");
  let res: { status: number; data: unknown };
  try {
    res = await http.post({
      url: `${SUPABASE_URL}/rest/v1/rpc/${fn}`,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      data: args,
    }) as { status: number; data: unknown };
  } catch { throw new Error("offline"); }
  if (res.status >= 400) {
    const d = res.data as { message?: string } | string | null;
    throw new Error(typeof d === "object" && d?.message ? d.message : "Something went wrong.");
  }
  return res.data as T;
}

// "Are you still on site?" as a phone notification at a set time (the page shows the yellow button when opened).
const ASK_ID = 7001;
export async function scheduleAsk(at: number): Promise<void> {
  const ln = plugin("LocalNotifications");
  if (!ln) return;
  try {
    await ln.cancel({ notifications: [{ id: ASK_ID }] });
    await ln.schedule({ notifications: [{ id: ASK_ID, title: "Are you still on the site?", body: "Open the app and tap the yellow button ✋", schedule: { at: new Date(at), allowWhileIdle: true } }] });
  } catch { /* the in-page question still works */ }
}
export async function cancelAsk(): Promise<void> {
  try { await plugin("LocalNotifications")?.cancel({ notifications: [{ id: ASK_ID }] }); } catch { /* fine */ }
}
