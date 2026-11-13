/* Matchday Draft service worker
   - the app page opens instantly from cache, then quietly checks for a newer version
     (and tells the page when one is ready, so it can offer a refresh)
   - Firebase SDK scripts and fonts are cached so start-up doesn't wait on them
   - live data (Firestore) is never touched — it always goes straight to the network */
const CACHE = 'md-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function notifyClients(){
  self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage({ type: 'md-updated' })));
}

async function pageStrategy(e){
  const cache = await caches.open(CACHE);
  const url = new URL('index.html', self.registration.scope).href;
  const cached = await cache.match(url);
  const refresh = fetch(new Request(url, { cache: 'no-cache' })).then(async res => {
    if (res && res.ok) {
      let changed = false;
      if (cached) {
        try { changed = (await cached.clone().text()) !== (await res.clone().text()); } catch (_) {}
      }
      await cache.put(url, res.clone());
      if (changed) notifyClients();
    }
    return res;
  }).catch(() => null);
  if (cached) { e.waitUntil(refresh); return cached; }
  const res = await refresh;
  return res || new Response('You are offline and the app has not been saved on this device yet.', { status: 503, headers: { 'content-type': 'text/plain' } });
}

async function staleWhileRevalidate(req){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

async function cacheFirst(req){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (_) { return Response.error(); }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.searchParams.has('md-check')) return;   // the page's own "is there a newer version?" probe goes straight to the network
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    e.respondWith(isPage ? pageStrategy(e) : staleWhileRevalidate(req));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) { e.respondWith(cacheFirst(req)); return; }
  if (FONT_HOSTS.includes(url.hostname)) { e.respondWith(staleWhileRevalidate(req)); return; }
  // anything else (Firestore etc.) is left alone
});

// Tapping a "your turn" notification brings the app forward
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    if (list.length) return list[0].focus();
    return self.clients.openWindow('./');
  }));
});
