// I Love You service worker — what makes the web build an installable desktop
// app (FEATURES.md -> Desktop). Deliberately small:
//   - Navigations: network first, falling back to the cached app shell, so
//     the installed window opens offline (the app's own cache then shows the
//     last-read conversations).
//   - Hashed static assets (/_expo/static/...): cache first — their names
//     change with every build, so a cached copy is never stale.
//   - Everything else, including every Supabase/LiveKit request (other
//     origins), passes straight through and is never cached here.
const SHELL = 'ily-shell-v1';
const STATIC = 'ily-static-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
  }
});

// A desktop notification click focuses the app window (the page's own
// onclick handles opening the channel; this covers a closed-then-reopened
// window).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length > 0) return wins[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
