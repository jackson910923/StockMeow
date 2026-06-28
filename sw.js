/* Service Worker：讓網頁能「加到主畫面」像 App，並可離線開啟。
   策略：網路優先（線上一定拿到最新版），離線時才用快取，避免更新後看到舊畫面。 */
const CACHE = "stockmeow-v3";
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./data.json",
                "./manifest.json", "./icon.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
