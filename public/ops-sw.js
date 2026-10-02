/* Network-only worker: no authenticated pages or APIs are cached. */
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* generic notification */ }
  event.waitUntil(self.registration.showNotification("OPS LEGUTI", {
    body: typeof data.body === "string" ? data.body.slice(0, 180) : "Ada pembaruan dari admin. Buka aplikasi untuk melihatnya.",
    icon: "/branding/app-icon-192.png", badge: "/branding/favicon-48.png",
    tag: typeof data.id === "string" ? data.id : "ops-update",
    data: { url: typeof data.url === "string" ? data.url : "/pwa" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  let target = new URL("/pwa", self.location.origin);
  try { const u = new URL(event.notification.data?.url || "/pwa", self.location.origin); if (u.origin === self.location.origin && u.pathname === "/pwa") target = u; } catch {}
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const app = windows.find(client => new URL(client.url).pathname === "/pwa");
    if (app) { await app.navigate(target.href); return app.focus(); }
    return self.clients.openWindow(target.href);
  })());
});
