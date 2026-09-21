// src/lib/portalSeen.ts
//
// Read-only helpers for the staff-side "Last active" and "Seen by client" markers.
// Everything here is best-effort: every function catches its own errors and returns
// null (or a neutral value) on failure, so a problem hides a marker and never breaks
// a page. Staff RLS on client_portal_activity scopes all of this to the caller's company.
import { supabase } from "./supabase";

const TZ = "America/Jamaica";
// Keep IN(...) lists short enough for a URL; a normal page needs exactly one request.
const CHUNK = 150;

export interface LastSeen {
  last_login_at: string | null;
  last_active_at: string | null;
  logins_30d: number;
  failed_24h: number;
}

export interface ItemViews {
  first_seen_at: string;
  last_seen_at: string;
  view_count: number;
}

export interface SeenInfo {
  seen: boolean;
  openedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  viewCount: number;
}

export interface ActivityRow {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// client_id -> last-seen row, from client_portal_last_seen. null = could not load.
export async function fetchLastSeen(clientIds: string[]): Promise<Record<string, LastSeen> | null> {
  try {
    const ids = Array.from(new Set(clientIds.filter(Boolean)));
    const out: Record<string, LastSeen> = {};
    if (ids.length === 0) return out;
    const results = await Promise.all(
      chunk(ids, CHUNK).map((c) =>
        supabase
          .from("client_portal_last_seen")
          .select("client_id, last_login_at, last_active_at, logins_30d, failed_24h")
          .in("client_id", c)
      )
    );
    for (const r of results) {
      if (r.error) return null;
      for (const row of (r.data || []) as any[]) {
        out[row.client_id] = {
          last_login_at: row.last_login_at ?? null,
          last_active_at: row.last_active_at ?? null,
          logins_30d: Number(row.logins_30d) || 0,
          failed_24h: Number(row.failed_24h) || 0,
        };
      }
    }
    return out;
  } catch {
    return null;
  }
}

// entity_id -> views, from client_portal_item_views. The view groups by project too, so
// rows for the same item are merged. null = could not load.
export async function fetchItemViews(entityType: string, ids: string[]): Promise<Record<string, ItemViews> | null> {
  try {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    const out: Record<string, ItemViews> = {};
    if (uniq.length === 0) return out;
    const results = await Promise.all(
      chunk(uniq, CHUNK).map((c) =>
        supabase
          .from("client_portal_item_views")
          .select("entity_id, first_seen_at, last_seen_at, view_count")
          .eq("entity_type", entityType)
          .in("entity_id", c)
      )
    );
    for (const r of results) {
      if (r.error) return null;
      for (const row of (r.data || []) as any[]) {
        const cur = out[row.entity_id];
        const count = Number(row.view_count) || 0;
        if (!cur) {
          out[row.entity_id] = { first_seen_at: row.first_seen_at, last_seen_at: row.last_seen_at, view_count: count };
        } else {
          if (new Date(row.first_seen_at).getTime() < new Date(cur.first_seen_at).getTime()) cur.first_seen_at = row.first_seen_at;
          if (new Date(row.last_seen_at).getTime() > new Date(cur.last_seen_at).getTime()) cur.last_seen_at = row.last_seen_at;
          cur.view_count += count;
        }
      }
    }
    return out;
  } catch {
    return null;
  }
}

// Counts as "seen" ONLY if the last view is at or after sharedAt, so a view from before
// a withdraw-and-resend does not count. Returns null when the item is not shared.
export function seenStatus(sharedAt: string | null | undefined, views: ItemViews | null | undefined): SeenInfo | null {
  try {
    if (!sharedAt) return null;
    const notSeen: SeenInfo = { seen: false, openedAt: null, firstSeenAt: null, lastSeenAt: null, viewCount: 0 };
    if (!views) return notSeen;
    const shared = new Date(sharedAt).getTime();
    if (!(new Date(views.last_seen_at).getTime() >= shared)) return notSeen;
    // If the first view predates this send, only the last view is known to be "since sent".
    const openedAt = new Date(views.first_seen_at).getTime() >= shared ? views.first_seen_at : views.last_seen_at;
    return {
      seen: true,
      openedAt,
      firstSeenAt: views.first_seen_at,
      lastSeenAt: views.last_seen_at,
      viewCount: views.view_count,
    };
  } catch {
    return null;
  }
}

function jamaicaYear(d: Date): string {
  return d.toLocaleDateString("en-US", { timeZone: TZ, year: "numeric" });
}

// "Sep 20, 8:07 PM" (the year is added only when it is not the current year)
export function formatJamaicaShort(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    if (jamaicaYear(d) !== jamaicaYear(new Date())) opts.year = "numeric";
    return d.toLocaleString("en-US", opts);
  } catch {
    return String(iso);
  }
}

// "Sep 20"
export function formatJamaicaDay(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = { timeZone: TZ, month: "short", day: "numeric" };
    if (jamaicaYear(d) !== jamaicaYear(new Date())) opts.year = "numeric";
    return d.toLocaleDateString("en-US", opts);
  } catch {
    return String(iso);
  }
}

// "just now", "5 minutes ago", "2 hours ago", "3 days ago"; older than 30 days falls back to a date.
export function timeAgoLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
    if (s < 3600) return plural(Math.floor(s / 60), "minute");
    if (s < 86400) return plural(Math.floor(s / 3600), "hour");
    if (s < 30 * 86400) return plural(Math.floor(s / 86400), "day");
    return formatJamaicaDay(iso);
  } catch {
    return "";
  }
}

// Simple user-agent parse: "Chrome on Windows", "Safari on iPhone", ...
export function deviceLabel(ua: string | null | undefined): string {
  try {
    const s = String(ua || "");
    if (!s) return "Unknown device";
    let browser = "";
    if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
    else if (/OPR\/|Opera/.test(s)) browser = "Opera";
    else if (/FxiOS|Firefox\//.test(s)) browser = "Firefox";
    else if (/CriOS|Chrome\//.test(s)) browser = "Chrome";
    else if (/Safari\//.test(s)) browser = "Safari";
    let os = "";
    if (/iPhone/.test(s)) os = "iPhone";
    else if (/iPad/.test(s)) os = "iPad";
    else if (/Android/.test(s)) os = "Android";
    else if (/Windows/.test(s)) os = "Windows";
    else if (/Mac OS X|Macintosh/.test(s)) os = "Mac";
    else if (/CrOS/.test(s)) os = "ChromeOS";
    else if (/Linux/.test(s)) os = "Linux";
    if (browser && os) return `${browser} on ${os}`;
    if (browser) return browser;
    if (os) return os;
    return "Unknown device";
  } catch {
    return "Unknown device";
  }
}

const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  estimates: "Estimates",
  contracts: "Contracts",
  photos: "Photos",
  invoices: "Invoices",
  changes: "Changes",
  feedback: "Feedback",
};

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

// Plain-language label for one activity row.
export function activityLabel(row: Pick<ActivityRow, "event_type" | "entity_type" | "entity_id">): string {
  const noun = row.entity_type || "item";
  switch (row.event_type) {
    case "login": return "Logged in";
    case "login_failed": return "Wrong password";
    case "session_resume": return "Returned to the portal";
    case "tab_view": return `Opened ${TAB_LABELS[String(row.entity_id || "")] || String(row.entity_id || "a")} tab`;
    case "photo_view": return "Viewed a photo";
    case "photo_download": return "Downloaded a photo";
    case "contract_view": return "Viewed contract";
    case "contract_sign": return "Signed contract";
    case "invoice_view": return "Viewed invoice";
    case "estimate_view": return "Viewed estimate";
    case "change_view": return "Viewed change order";
    case "change_approve": return "Approved a change order";
    case "change_reject": return "Rejected a change order";
    case "comment_sent": return "Sent a message";
    case "review_sent": return "Left a review";
    case "logout": return "Logged out";
    case "item_shared": return `You sent ${withArticle(noun)}`;
    case "item_withdrawn": return `You withdrew ${withArticle(noun)}`;
    default: {
      const t = String(row.event_type || "activity").replace(/_/g, " ");
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
}

// The client's most recent activity, newest first. null = could not load.
export async function fetchClientActivity(clientId: string, limit = 50): Promise<ActivityRow[] | null> {
  try {
    const { data, error } = await supabase
      .from("client_portal_activity")
      .select("id, event_type, entity_type, entity_id, ip_address, user_agent, metadata, occurred_at")
      .eq("client_id", clientId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) return null;
    return (data || []) as ActivityRow[];
  } catch {
    return null;
  }
}

// The client's own signature event for a contract (IP + device), if one was logged.
export async function fetchContractSignRecord(
  contractId: string
): Promise<{ occurred_at: string; ip_address: string | null; user_agent: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from("client_portal_activity")
      .select("occurred_at, ip_address, user_agent")
      .eq("entity_type", "contract")
      .eq("entity_id", contractId)
      .eq("event_type", "contract_sign")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data as any;
  } catch {
    return null;
  }
}
