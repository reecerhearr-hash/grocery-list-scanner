// Grocery List Scanner service worker
// - App shell: network-first (so updates show up), falls back to cache offline
// - Large OCR files (vendor/core, vendor/lang) are cached as they're first used
// - Supabase API: never cached (the app keeps its own offline copy + change queue)
const VERSION = 'v2.2.0';
const SHELL = `grocery-shell-${VERSION}`;
const SHELL_FILES = ['./', './index.html', './config.js', './manifest.json', './icon-192.png', './icon-512.png',
  './icon-maskable-192.png', './icon-maskable-512.png', './vendor/supabase.js', './vendor/tesseract.min.js', './vendor/worker.min.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('grocery-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return; // live data only

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
        throw e;
      }
    })());
  }
});
