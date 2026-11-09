// THE SPINE - offline shell (batch 7).
// The app's own files are kept on the phone so it opens instantly and opens at all with no signal.
//  - Pages: network first (so a new version always shows when online), the kept copy when offline.
//  - /assets/* (file names change with every build): kept after the first load, served from the phone.
//  - Engines and fonts (three, phaser, ffmpeg...): kept after first use.
//  - /api/* and anything from another site: never touched - always live, never cached here.
const V = "spine-shell-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(V).then((c) => c.addAll(["/", "/manifest.webmanifest"]).catch(() => {}))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("spine-shell-") && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url); if (u.origin !== self.location.origin || u.pathname.startsWith("/api/")) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then((res) => { const cp = res.clone(); if (res.ok) caches.open(V).then((c) => c.put("/", cp)); return res; })
      .catch(() => caches.match("/").then((m) => m || new Response("<h1>Offline</h1><p>The Spine needs a connection for its first visit.</p>", { headers: { "content-type": "text/html" } }))));
    return;
  }
  if (/^\/(assets\/|three|phaser|cannon|ffmpeg\/|ai\/|icon-|apple-touch|favicon|spine-mark)/.test(u.pathname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok && res.status === 200) { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); } return res; })));
  }
});

// LOCK-SCREEN ALERTS (batch 14). A scheduled job finished overnight: show it like any app would,
// and open The Spine at the result when it is tapped.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const n = d.notification || d; // also accepts the newer "declarative" shape
  const title = String(n.title || "The Spine").slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, { body: String(n.body || "").slice(0, 240), tag: n.tag || "spine", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: n.url || n.navigate || "/" } })
    .then(() => { try { if (self.navigator && self.navigator.setAppBadge) return self.navigator.setAppBadge(1); } catch (_) {} }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { try { c.navigate(url); } catch (_) {} return c.focus(); } }
    return self.clients.openWindow ? self.clients.openWindow(url) : null; }));
});
