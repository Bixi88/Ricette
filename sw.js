// Service Worker: mette in cache l'app (guscio) per farla aprire anche senza internet.
// I dati delle ricette restano gestiti dalla cache in localStorage dentro index.html.

const CACHE_NAME = "ricettario-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Strategia: network-first per l'HTML (per avere sempre l'ultima versione quando c'è internet),
// con fallback alla cache quando la rete non è disponibile.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Le chiamate API al worker (dati ricette) non vengono gestite qui:
  // il fallback offline per quelle è già gestito lato app con localStorage.
  if (req.method !== "GET" || req.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
