
const CACHE_NAME = "breath-practice-ms09q2xo";
const CACHE_PREFIX = 'breath-practice-';
const PRECACHE_FILES = [
  "",
  "index.html",
  "manifest.webmanifest",
  "apple-touch-icon-v3.png",
  "icons/icon-192-v3.png",
  "icons/icon-512-v3.png",
  "icons/icon-512-maskable-v3.png",
  "assets/index-DiqeRCgU.css",
  "assets/index-BpjIWPw6.js",
  "assets/three.module-BTt32e3U.js"
];
const AUDIO_FILES = [
  "audio/practice-01.m4a",
  "audio/practice-02.m4a"
];
const scopedUrl = (path) => new URL(path, self.registration.scope).href;

const notify = async (message) => {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of PRECACHE_FILES) {
      await cache.add(new Request(scopedUrl(path), { cache: 'reload' }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
    await notify({ type: 'BREATH_SHELL_READY', audioCount: AUDIO_FILES.length });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_BREATH_AUDIO') return;
  event.waitUntil((async () => {
    if (AUDIO_FILES.length !== 2) {
      await notify({ type: 'BREATH_AUDIO_ERROR', reason: 'missing-audio' });
      return;
    }
    try {
      const cache = await caches.open(CACHE_NAME);
      for (let index = 0; index < AUDIO_FILES.length; index += 1) {
        const url = scopedUrl(AUDIO_FILES[index]);
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (!response.ok) throw new Error('audio-fetch');
        await cache.put(url, response);
        await notify({
          type: 'BREATH_AUDIO_PROGRESS',
          complete: index + 1,
          total: AUDIO_FILES.length,
        });
      }
      await notify({ type: 'BREATH_AUDIO_READY' });
    } catch {
      await notify({ type: 'BREATH_AUDIO_ERROR', reason: 'download-failed' });
    }
  })());
});

const rangeResponse = async (request, cached) => {
  const range = request.headers.get('range');
  if (!range) return cached;
  const bytes = await cached.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416 });
  const size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': 'bytes */' + size },
    });
  }
  const headers = new Headers(cached.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers,
  });
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(requestUrl.href, { ignoreVary: true });
    if (cached) return rangeResponse(event.request, cached);

    try {
      const response = await fetch(event.request);
      if (
        response.ok
        && !event.request.headers.has('range')
        && !requestUrl.pathname.includes('/audio/')
      ) {
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      if (event.request.mode === 'navigate') {
        return (await cache.match(scopedUrl('index.html'))) || (await cache.match(scopedUrl('')));
      }
      throw error;
    }
  })());
});
