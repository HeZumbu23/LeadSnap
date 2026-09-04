const CACHE_NAME = "leadsnap-shell-v8";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=8",
  "./db.js?v=8",
  "./i18n.js?v=8",
  "./app.js?v=8",
  "./manifest.json?v=8",
  "./icons/favicon.svg?v=8",
  "./icons/icon-192.png?v=8",
  "./icons/icon-512.png?v=8",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API/CGI calls - contacts and extracted data must always be live.
  if (url.pathname.includes("/cgi-bin/") || url.pathname.includes("/_manager/")) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
