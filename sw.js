// Service Worker: mette in cache l'app (guscio) per farla aprire anche senza internet.
// I dati delle ricette restano gestiti dalla cache in localStorage dentro index.html.
const CACHE_NAME = "ricettario-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

// Tempo massimo di attesa per la rete prima di ripiegare sulla cache (evita
// che la pagina resti bianca a lungo su connessioni mobili lente/instabili)
const NETWORK_TIMEOUT_MS = 4000;

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

// Esegue il fetch di rete con un timeout: se la rete non risponde in tempo,
// il chiamante può ripiegare sulla cache invece di lasciare la pagina bianca in attesa.
function fetchWithTimeout(req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), timeoutMs);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Una risposta va messa in cache solo se è "buona": status 200 pieno (niente errori,
// niente redirect, niente 206 Partial Content che l'API Cache rifiuta comunque)
// e di tipo "basic" (cioè stesso dominio, non una risposta opaca cross-origin).
function isCacheable(res) {
  return res && res.ok && res.status === 200 && res.type === "basic";
}

// Strategia: network-first (con timeout) per l'HTML/app-shell dello stesso dominio,
// con fallback alla cache quando la rete non è disponibile o è troppo lenta.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Gestisce solo le richieste dello stesso dominio (l'app shell).
  // Tutto il resto (Tailwind CDN, Font Awesome, immagini Unsplash, ecc.)
  // viene lasciato passare al browser così com'è: niente rischio di
  // sostituirle con l'HTML della pagina se la rete va in errore.
  if (url.origin !== self.location.origin) return;

  // Le chiamate API al worker (dati ricette) non vengono gestite qui:
  // il fallback offline per quelle è già gestito lato app con localStorage.
  if (url.pathname.includes("/api/")) return;

  event.respondWith(
    fetchWithTimeout(req, NETWORK_TIMEOUT_MS)
      .then((res) => {
        if (isCacheable(res)) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
