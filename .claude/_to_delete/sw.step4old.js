/* Magnus Boy's System - service worker for phone / browser alerts (web push) ONLY.
   It does not cache pages or files, so the app always loads fresh from the server. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
