// UrbanPulse service worker: the citizen app and its last public state work without a connection.
// Bump VERSION to drop every cache written by the previous worker.
const VERSION = "v1";
const SHELL = `up-shell-${VERSION}`;
const ASSETS = `up-assets-${VERSION}`;
const DATA = `up-data-${VERSION}`;
const PUBLIC_STATE = "/api/public-state";
const CACHED_HEADER = "X-UrbanPulse-Cache";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const page = await fetch("/citizen", { headers: { Accept: "text/html" } });
    if (!page.ok) throw new Error(`citizen page returned ${page.status}`);
    const html = await page.text();
    // the page names its hashed entry script and styles, which must be cached before the app can load offline
    const assets = [...new Set(html.match(/\/assets\/[^"'\s<>]+/g) ?? [])];
    const shell = await caches.open(SHELL);
    await shell.put("/citizen", new Response(html, { headers: { "Content-Type": "text/html" } }));
    await shell.addAll(["/", "/manifest.webmanifest", "/icon.svg"]);
    await (await caches.open(ASSETS)).addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const current = new Set([SHELL, ASSETS, DATA]);
    for (const name of await caches.keys()) {
      if (name.startsWith("up-") && !current.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(pageFirst(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(assetFirst(request));
  } else if (url.pathname === PUBLIC_STATE) {
    event.respondWith(stateFirst(request));
  }
  // everything else (other /api routes, /socket.io, map tiles) is not intercepted and is never cached
});

// every route serves the same index.html, so one cached copy answers any page while offline
async function pageFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put("/citizen", res.clone()).catch(() => {});
      return res;
    }
  } catch {
    // no connection: the cached copy below
  }
  return (await cache.match("/citizen")) ?? (await cache.match("/")) ?? Response.error();
}

// build files carry content hashes, so a cached copy cannot be stale
async function assetFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

// fresh levels when online; otherwise the last copy, marked so the page knows it is old
async function stateFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const res = await fetch(request);
    if (res.ok) {
      cache.put(request, res.clone()).catch(() => {});
      return res;
    }
  } catch {
    // no connection: the cached copy below
  }
  const cached = await cache.match(request);
  if (!cached) return Response.error();
  return new Response(await cached.blob(), { status: cached.status, headers: [...cached.headers, [CACHED_HEADER, "1"]] });
}
