/* Notification pendant qu'un chrono tourne.
 *
 * Le problème qu'elle résout : un chrono lancé sur le téléphone se laisse
 * oublier, et on s'en aperçoit le lendemain — d'où la correction sur les
 * chronos de plus de 24 h. Une notification épinglée dans le volet le rappelle
 * sans avoir à rouvrir l'application.
 *
 * ─── Trois contraintes qui expliquent la forme retenue ───
 *
 * 1. LA NOTIFICATION AFFICHE L'HEURE DE DÉBUT, PAS LE TEMPS ÉCOULÉ.
 *    Rafraîchir un compteur demanderait de réveiller le service worker toutes
 *    les minutes, ce qu'aucun navigateur ne permet sans serveur de push. Une
 *    heure de début, elle, ne se périme jamais : « depuis 14:32 » reste vrai
 *    trois heures plus tard.
 *
 * 2. LE SERVICE WORKER NE PEUT PAS ARRÊTER LE CHRONO LUI-MÊME.
 *    Il n'a pas accès à localStorage, où vit l'état. Le bouton « Arrêter »
 *    réveille donc la page — ou l'ouvre si elle est fermée — et c'est elle qui
 *    enregistre l'entrée. Le décalage se compte en secondes.
 *
 * 3. LA NOTIFICATION EST LOCALE À L'APPAREIL QUI A LANCÉ LE CHRONO.
 *    Faire apparaître une notification sur le téléphone depuis le PC
 *    demanderait un service de push, donc un serveur. À défaut, elle
 *    réapparaît sur le téléphone dès qu'on y ouvre l'application, puisque la
 *    synchronisation lui a appris qu'un chrono tourne.
 */
var Notif = (function () {
  var CLE = 'quete.notif';
  var derniereMontree = null;   // horodatage du chrono déjà affiché

  function supporte() {
    return typeof Notification !== 'undefined' &&
      'serviceWorker' in navigator &&
      location.protocol.indexOf('http') === 0;
  }
  function permission() {
    return supporte() ? Notification.permission : 'unsupported';
  }
  function active() {
    return supporte() && Local.lire(CLE) === '1' && Notification.permission === 'granted';
  }

  // La permission ne peut être demandée que depuis un geste de l'utilisateur.
  async function activer() {
    if (!supporte()) throw new Error('Ce navigateur ne sait pas afficher de notification.');
    var p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    if (p !== 'granted') {
      throw new Error(p === 'denied'
        ? 'Les notifications sont bloquées pour ce site. Réautorise-les dans les réglages du navigateur.'
        : 'Autorisation refusée.');
    }
    Local.ecrire(CLE, '1');
    synchroniser();
    return true;
  }

  function desactiver() {
    Local.ecrire(CLE, '0');
    effacer();
  }

  async function registration() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.ready; } catch (e) { return null; }
  }

  async function montrer(c) {
    var reg = await registration();
    if (!reg) return false;
    var titre = State.libelleTache(c);
    try {
      await reg.showNotification('Chrono en cours', {
        tag: 'quete-chrono',            // remplace au lieu d'empiler
        body: 'Depuis ' + c.debut + ' · ' + titre,
        icon: 'icones/icone-192.png',
        badge: 'icones/icone-192.png',
        silent: true,                   // un rappel, pas une alerte
        requireInteraction: true,       // reste épinglée
        renotify: false,
        // Ignoré par Safari : sur iPhone la notification s'affiche sans bouton,
        // et l'ouvrir mène à l'onglet Temps où « Arrêter » est à portée.
        actions: [{ action: 'arreter', title: 'Arrêter' }],
        data: { debut: c.debut, ts: c.ts }
      });
      return true;
    } catch (e) { return false; }
  }

  async function effacer() {
    var reg = await registration();
    if (!reg) return;
    try {
      var l = await reg.getNotifications({ tag: 'quete-chrono' });
      l.forEach(function (n) { n.close(); });
    } catch (e) { /* sans conséquence */ }
  }

  /* Remet la notification d'accord avec l'état, quel que soit le chemin par
   * lequel le chrono a démarré ou s'est arrêté : bouton, relance, arrêt sur
   * l'autre appareil. Appelée après chaque rendu, elle n'agit que lorsque
   * quelque chose a réellement changé. */
  function synchroniser() {
    if (!active()) return;
    var c = State.d && State.d.chrono;
    if (!c) {
      if (derniereMontree !== null) { derniereMontree = null; effacer(); }
      return;
    }
    if (derniereMontree === c.ts) return;
    derniereMontree = c.ts;
    montrer(c);
  }

  // Pastille sur l'icône de l'application. Discrète, sans permission propre,
  // et ignorée en silence là où elle n'existe pas.
  function pastille(actif) {
    try {
      if (actif && navigator.setAppBadge) navigator.setAppBadge();
      else if (!actif && navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e) { /* sans conséquence */ }
  }

  return {
    supporte: supporte, permission: permission, active: active,
    activer: activer, desactiver: desactiver,
    synchroniser: synchroniser, effacer: effacer, pastille: pastille
  };
})();
