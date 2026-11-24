/* Emly – Service Worker (Mira / Dev C)
 * Cache-first, versionierter Cache, Precache aller App-Dateien, alte Caches löschen.
 * Alle Pfade relativ → läuft auch in einem Unterordner (z. B. GitHub Pages).
 * Bei neuer Version: CACHE-Version erhöhen.
 */
'use strict';
const CACHE = 'emly-v1.0.4';   // gleich halten mit Emly.VERSION in js/core.js
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './vendor/jspdf.umd.min.js',
  './js/core.js',
  './js/store.js',
  './js/ui.js',
  './js/game.js',
  './js/today.js',
  './js/reports.js',
  './js/pdf.js',
  './js/settings.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Einzeln laden: eine fehlende Datei soll nicht den ganzen Precache verhindern (wird geloggt).
    // App-Code ist Pflicht (sonst wäre die App offline unvollständig → Installation abbrechen, Browser versucht es erneut).
    // Icons sind optional: fehlt eines, wird nur geloggt.
    await Promise.all(PRECACHE.map(async (url) => {
      const optional = url.startsWith('./icons/');
      try {
        // Ein Wiederholungsversuch: der erste Besuch kommt oft über wackliges Mobilnetz (Link aus WhatsApp)
        let res;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { res = await fetch(new Request(url, { cache: 'reload' })); if (res.ok) break; }
          catch (err) { if (attempt === 1) throw err; }
        }
        if (!res || !res.ok) throw new Error(res ? res.status : 'network');
        await cache.put(url, res);
      } catch (e) {
        console.warn('[sw] Precache fehlgeschlagen:', url, e && e.message);
        if (!optional) throw e;
      }
    }));
    // Erste Installation: sofort aktiv. Updates warten, bis die App „Aktualisieren“ sendet.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('emly-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigation → App-Shell (index.html), Hash wird vom Browser ohnehin nicht gesendet
    const scopePath = new URL(self.registration.scope).pathname;
    if (req.mode === 'navigate' && (url.pathname === scopePath || url.pathname === scopePath + 'index.html')) {
      const shell = (await cache.match('./index.html')) || (await cache.match('./'));
      if (shell) return shell;
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') { const shell = await cache.match('./index.html'); if (shell) return shell; }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
