// EnJoy service worker.
// - Precache the app shell (and every vocab file listed in data/domains.json) on install.
// - Static assets: cache-first. JSON in /data: network-first with cache fallback.
// - Old caches are deleted on activate. A new version waits until the user clicks "Tải lại".
//
// RELEASING A NEW VERSION: bump VERSION below, otherwise users keep the old cached files.
// ADDING A FILE (e.g. a new game in js/games/): add it to APP_SHELL (tests/pwa.test.js checks this).

const VERSION = 'v1';
const CACHE = `enjoy-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/audio.js',
  './js/data.js',
  './js/router.js',
  './js/store.js',
  './js/sw-register.js',
  './js/ui.js',
  './js/lib/flashcard-logic.js',
  './js/views/game.js',
  './js/views/home.js',
  './js/views/settings.js',
  './js/games/index.js',
  './js/games/flashcard.js',
  './data/domains.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const scopeUrl = new URL(self.registration.scope);
const DATA_PREFIX = `${scopeUrl.pathname}data/`;
const INDEX_URL = new URL('./index.html', scopeUrl).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `reload` bypasses the HTTP cache so a new version never precaches stale files.
    await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await precacheVocab(cache);
  })());
});

/** Precache every vocab file referenced by domains.json, so new domains work offline with no code change. */
async function precacheVocab(cache) {
  try {
    const res = await cache.match('./data/domains.json');
    const domains = await res.json();
    const urls = domains.map((d) => `./data/${d.vocab || `vocab/${d.id}.json`}`);
    // One broken file must not block the whole install.
    await Promise.allSettled(urls.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
  } catch (err) {
    console.warn('[sw] could not precache vocab', err);
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('enjoy-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let the browser handle cross-origin requests

  if (request.mode === 'navigate') {
    event.respondWith(appShell(request));
  } else if (url.pathname.startsWith(DATA_PREFIX) && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/** The app uses hash routes, so every navigation is served the cached index.html. */
async function appShell(request) {
  const cached = await caches.match(INDEX_URL);
  if (cached) return cached;
  return fetch(request);
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
