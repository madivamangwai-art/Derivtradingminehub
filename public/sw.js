const CACHE_NAME = "minehub-app-v1";
const APP_SHELL = ["/", "/home", "/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const accept = event.request.headers.get("accept") || "";
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";
  const isStaticAsset =
    isSameOrigin &&
    (APP_SHELL.includes(url.pathname) ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".webmanifest"));

  if (
    !isSameOrigin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/_server/") ||
    event.request.headers.has("authorization") ||
    accept.includes("application/json")
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (!isNavigation && !isStaticAsset) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (isStaticAsset || response.type === "basic")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/home"))),
  );
});
