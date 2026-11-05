/* Magnus Boy's System - service worker.
   1. Phone / browser alerts (web push).
   2. The WORKER PORTAL (/worker...) only: its page and files are kept on the phone so the clock opens on a site with no signal.
      Network first: with signal the page always loads fresh from the server and the kept copy is replaced; the kept copy is
      used only when there is no signal. Nothing else in the app is cached, and nothing from Supabase (data) is ever cached. */

const SHELL = "magnus-worker-shell-v1";      // the /worker page (index.html)
const FILES = "magnus-worker-files-v1";      // /assets/* files the worker portal loaded (names change on every release)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keep = [SHELL, FILES];
  for (const k of await caches.keys()) if (k.startsWith("magnus-worker-") && !keep.includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

async function fromWorkerPortal(event) {
  if (!event.clientId) return false;
  try { const c = await self.clients.get(event.clientId); return !!c && new URL(c.url).pathname.startsWith("/worker"); } catch (e) { return false; }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                       // Supabase and every other server: never touched

  // the worker portal page: network first, the kept copy when there is no signal
  if (req.mode === "navigate" && url.pathname.startsWith("/worker")) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(SHELL);
          const old = await cache.match("/worker");
          const text = await res.clone().text();
          if (old && (await old.text()) !== text) await caches.delete(FILES);   // a new release: drop the old files
          await cache.put("/worker", new Response(text, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
        }
        return res;
      } catch (e) {
        const kept = await caches.match("/worker", { cacheName: SHELL });
        return kept || Response.error();
      }
    })());
    return;
  }

  // the files the worker portal page loads (same name = same content, so the kept copy is always right)
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|ico|json)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const kept = await caches.match(req, { cacheName: FILES });
      try {
        const res = await fetch(req);
        if (res.ok && (await fromWorkerPortal(event) || kept)) { const c = await caches.open(FILES); await c.put(req, res.clone()); }
        return res;
      } catch (e) {
        return kept || Response.error();
      }
    })());
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Magnus", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Magnus Boy's System";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icon-192x192.png",
    badge: "/icon-96x96.png",
    tag: data.tag || undefined,
    data: { link: typeof data.link === "string" && data.link.startsWith("/") ? data.link : "/" },
    // Urgent alerts (payments, errors, health problems, overdue bills) stay on the lock screen until tapped.
    requireInteraction: !!data.urgent,
    renotify: !!data.urgent,
    vibrate: data.urgent ? [200, 100, 200, 100, 200] : [100],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(target); } catch (e) { /* ignore */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
