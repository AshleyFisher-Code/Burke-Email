// Lets the app open fast and show its screens with weak signal. The coach itself always needs the internet.
const CACHE = 'email-1.0.0';
const SHELL = ['./', 'index.html', 'css/app.css?v=1.0.0', 'js/app.js?v=1.0.0', 'js/firebase.js', 'js/config.js', 'js/coach.js', 'js/rules.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const own = u.origin === location.origin;
  const lib = u.host === 'www.gstatic.com' || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if (!own && !lib) return; // sign-in and the coach go straight through
  if (lib) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; }))); return; }
  e.respondWith(fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
