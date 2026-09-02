/* Service worker — fonctionnement hors ligne.
 *
 * Deux règles qui évitent les deux façons classiques de tout casser :
 *
 *  1. RIEN de ce qui n'est pas sur cette origine n'est intercepté. Les appels
 *     à api.github.com passent directement au réseau. Mettre en cache une
 *     réponse de synchronisation reviendrait à resservir un état périmé, donc
 *     à écraser des données récentes avec des anciennes.
 *
 *  2. index.html est servi RÉSEAU D'ABORD. C'est le seul fichier dont l'adresse
 *     ne change pas d'une version à l'autre : le mettre en cache-d'abord
 *     figerait l'application dans sa version du jour, définitivement. Les
 *     autres fichiers portent un ?v= dans leur adresse, donc une nouvelle
 *     version est forcément une nouvelle entrée de cache.
 */

const VERSION = '14';
const CACHE = 'quete-v' + VERSION;

const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icones/icone-192.png',
  './icones/icone-512.png',
  './css/app.css?v=' + VERSION,
  './js/utils.js?v=' + VERSION,
  './js/fusion.js?v=' + VERSION,
  './js/storage.js?v=' + VERSION,
  './js/state.js?v=' + VERSION,
  './js/synthese.js?v=' + VERSION,
  './js/jeu.js?v=' + VERSION,
  './js/notif.js?v=' + VERSION,
  './js/distant.js?v=' + VERSION,
  './js/sync.js?v=' + VERSION,
  './js/app.js?v=' + VERSION,
  './js/views/dashboard.js?v=' + VERSION,
  './js/views/temps.js?v=' + VERSION,
  './js/views/quetes.js?v=' + VERSION,
  './js/views/videos.js?v=' + VERSION,
  './js/views/finances.js?v=' + VERSION,
  './js/views/synthese.js?v=' + VERSION,
  './js/views/reglages.js?v=' + VERSION
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Un fichier manquant ne doit pas faire échouer toute l'installation :
      // mieux vaut une application partiellement hors ligne que pas de service
      // worker du tout.
      .then((c) => Promise.allSettled(COQUILLE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Clic sur la notification du chrono.
 *
 * Le service worker n'a pas accès à localStorage : il ne peut pas arrêter le
 * chrono lui-même. Il réveille donc la page — ou l'ouvre si elle est fermée —
 * et lui passe la consigne. C'est la page qui possède l'état, et c'est elle
 * qui enregistre l'entrée.
 */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const arreter = e.action === 'arreter';

  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fenetres) {
      if ('focus' in c) {
        if (arreter) c.postMessage({ type: 'chrono-arreter' });
        return c.focus();
      }
    }
    // Application fermée : on l'ouvre, et le drapeau est lu au démarrage.
    return self.clients.openWindow(arreter ? './?arreter=1#/temps' : './#/temps');
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // règle 1 : jamais l'API

  const versLIndex = req.mode === 'navigate' || url.pathname.endsWith('/index.html');

  if (versLIndex) {
    // Règle 2 : réseau d'abord, cache en secours hors ligne.
    e.respondWith(
      fetch(req)
        .then((rep) => {
          const copie = rep.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copie));
          return rep;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((enCache) => enCache || fetch(req).then((rep) => {
      if (rep && rep.ok) {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
      }
      return rep;
    }))
  );
});
