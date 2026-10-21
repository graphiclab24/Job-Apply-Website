// সার্ভিস ওয়ার্কার: অ্যাপ ফাইল ক্যাশ, অফলাইন সাপোর্ট, নীরব আপডেট
// নতুন ডিপ্লয়ে VERSION বদলান (যেমন v2) — পুরনো ক্যাশ নিজে মুছে যাবে।
const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

const DATA_HOST = 'files.bdjobapply.site';

// এই ডোমেইনগুলোর অনুরোধ কখনো ক্যাশ হবে না (লগইন, ডেটা সেভ)
const NEVER_CACHE_HOSTS = [
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
  'bdjob-worker.masterboom2040.workers.dev',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (!key.endsWith(VERSION)) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return; // সরাসরি নেটওয়ার্কে যাবে

  // পেজ খোলা (SPA): নেটওয়ার্ক আগে, অফলাইনে ক্যাশের index.html
  if (req.mode === 'navigate') {
    event.respondWith(navigation(req));
    return;
  }

  // Vite-এর হ্যাশ করা ফাইল: একবার ক্যাশ হলে আর বদলায় না
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // প্রস্তুতির ডেটা: ক্যাশ দেখায়, পিছনে নতুন সংস্করণ নামায় (নীরব আপডেট)
  if (url.hostname === DATA_HOST && url.pathname.endsWith('prep-data.json')) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // জব তালিকা ও অন্যান্য R2 ফাইল: নেটওয়ার্ক আগে, অফলাইনে শেষ কপি
  if (url.hostname === DATA_HOST) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
    return;
  }

  // অন্যান্য স্থির ফাইল (আইকন ইত্যাদি)
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
  }
});

async function navigation(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('/index.html', res.clone());
    return res;
  } catch {
    const shell = await cache.match('/index.html');
    return shell || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) return cached;
  return (await network) || Response.error();
}
