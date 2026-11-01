// api/_lib/push.ts — sends queued Magnus notifications to phones and browsers (web push).
// GET /api/push-dispatch: pg_cron's push_kick() calls it every minute when something is waiting; the app also calls it
// after "Send me a test". It holds no state and only sends what is already queued, so calling it needs no secret.
// Server env only: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import webpush from "web-push";

type Sub = { id: string; endpoint: string; keys: { p256dh: string; auth: string } };
type Queued = { id: number; title: string; body: string | null; link: string | null; urgent: boolean; kind: string; subscriptions: Sub[] };

/** Vercel values pasted by hand can carry a label, quotes, spaces or a line break. Keep only the key itself. */
export function cleanKey(raw: string | undefined): string {
  return String(raw ?? "")
    .replace(/^\s*(public|private)\s*key\s*:?/i, "")
    .replace(/["'\s]/g, "")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A VAPID public key is 65 bytes = 87 base64url characters, starting with "B". */
export function isPublicKey(k: string): boolean {
  return /^B[A-Za-z0-9_-]{86}$/.test(k);
}

function serverEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const pub = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const priv = cleanKey(process.env.VAPID_PRIVATE_KEY);
  const subject = process.env.VAPID_SUBJECT || "mailto:magnusboysacct@gmail.com";
  return url && key && pub && priv ? { url, key, pub, priv, subject } : null;
}

async function rpc<T>(env: { url: string; key: string }, fn: string, args: unknown): Promise<T> {
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** What the phone shows. Kept small: push services limit the size. */
export function payloadFor(n: Pick<Queued, "id" | "title" | "body" | "link" | "urgent" | "kind">): string {
  return JSON.stringify({
    title: String(n.title).slice(0, 120),
    body: String(n.body ?? "").slice(0, 300),
    link: n.link && n.link.startsWith("/") ? n.link : "/",
    urgent: !!n.urgent,
    tag: `magnus-${n.kind}-${n.id}`,
  });
}

export async function dispatchPush(send: typeof webpush.sendNotification = webpush.sendNotification.bind(webpush)) {
  const env = serverEnv();
  if (!env) return { ok: false, reason: "Push is not set up (VAPID keys or service key missing)." };
  webpush.setVapidDetails(env.subject, env.pub, env.priv);

  const queued = await rpc<Queued[]>(env, "push_claim_batch", { p_limit: 100 });
  const result = { sent: [] as string[], failed: [] as string[], ok_subs: [] as string[], gone_subs: [] as string[], bad_subs: [] as string[] };

  await Promise.all((queued ?? []).map(async (n) => {
    const outcomes = await Promise.all(n.subscriptions.map(async (s) => {
      try {
        await send({ endpoint: s.endpoint, keys: s.keys }, payloadFor(n), {
          TTL: n.urgent ? 24 * 3600 : 6 * 3600,
          urgency: n.urgent ? "high" : "normal",
          timeout: 8000,
        });
        result.ok_subs.push(s.id);
        return true;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) result.gone_subs.push(s.id); else result.bad_subs.push(s.id);
        return false;
      }
    }));
    (outcomes.some(Boolean) ? result.sent : result.failed).push(String(n.id));
  }));

  if ((queued ?? []).length > 0) await rpc(env, "push_report", { p_results: result });
  return { ok: true, notifications: (queued ?? []).length, sent: result.sent.length, removed_devices: result.gone_subs.length };
}

export async function pushDispatchHandler(): Promise<Response> {
  let body: unknown;
  try { body = await dispatchPush(); } catch (e: unknown) { body = { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** The PUBLIC VAPID key the browser needs to subscribe. Public by design (the private key never leaves the server). */
export async function pushConfigHandler(): Promise<Response> {
  const pub = cleanKey(process.env.VAPID_PUBLIC_KEY);
  const ok = isPublicKey(pub);
  return new Response(JSON.stringify({
    publicKey: ok ? pub : null,
    problem: !pub ? "VAPID_PUBLIC_KEY is not set in Vercel." : ok ? null
      : `VAPID_PUBLIC_KEY in Vercel doesn't look right (${pub.length} characters, should be 87 starting with B).`,
  }), {
    status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
