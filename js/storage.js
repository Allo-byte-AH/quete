/* Couche de stockage : persistance locale, copies de sécurité, export/import.
 *
 * Toute l'application passe par ici, en asynchrone, et ne sait jamais où les
 * données atterrissent.
 *
 * Ce fichier sondait autrefois un `/api/state` au démarrage, en prévision d'un
 * petit serveur PHP hébergé chez Infomaniak. Cette piste a été abandonnée au
 * profit du dépôt GitHub : la synchronisation vit désormais dans distant.js et
 * sync.js, par-dessus le stockage local plutôt qu'à sa place. La sonde n'a donc
 * plus d'objet — elle ne laissait qu'un 404 dans la console et un aller-retour
 * réseau avant chaque ouverture.
 */

/* Accès au stockage du navigateur, à l'épreuve des refus.
 *
 * Firefox et ses dérivés (Zen, LibreWolf) ne renvoient pas null quand le
 * stockage est refusé pour un site : ils LÈVENT UNE EXCEPTION, à la lecture
 * comme à l'écriture. Réglages de confidentialité stricts, fenêtre privée,
 * cookies bloqués — un seul accès nu suffisait alors à tuer l'application au
 * démarrage, sans message compréhensible.
 *
 * On bascule dans ce cas sur une mémoire de session : l'application reste
 * pleinement utilisable, et la synchronisation continue de porter les données
 * jusqu'au dépôt. Seul le jeton devra être ressaisi à chaque ouverture.
 */
var Local = (function () {
  var dispo = false;
  var secours = {};

  try {
    var essai = '__quete_essai__';
    window.localStorage.setItem(essai, '1');
    window.localStorage.removeItem(essai);
    dispo = true;
  } catch (e) { dispo = false; }

  function lire(k) {
    if (dispo) {
      try { return window.localStorage.getItem(k); } catch (e) { /* refus en cours de route */ }
    }
    return Object.prototype.hasOwnProperty.call(secours, k) ? secours[k] : null;
  }
  function ecrire(k, v) {
    secours[k] = v;
    if (!dispo) return false;
    // Un quota plein ne doit pas faire croire que le stockage est refusé :
    // la valeur reste en mémoire et l'application continue.
    try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function effacer(k) {
    delete secours[k];
    if (!dispo) return;
    try { window.localStorage.removeItem(k); } catch (e) { /* rien à faire */ }
  }
  function cles() {
    var out = [];
    if (dispo) {
      try {
        for (var i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i));
        return out;
      } catch (e) { /* on retombe sur la mémoire */ }
    }
    return Object.keys(secours);
  }

  return {
    get disponible() { return dispo; },
    lire: lire, ecrire: ecrire, effacer: effacer, cles: cles
  };
})();

var Storage = (function () {
  var CLE = 'quete.state.v1';
  var CLE_BACKUP = 'quete.backup.';
  var MAX_BACKUPS = 7;

  var CLE_APPAREIL = 'quete.appareil';

  // Identifiant de CET appareil. Volontairement hors de l'état synchronisé :
  // il doit rester différent sur le PC et sur le téléphone, sinon le départage
  // des égalités d'horodatage ne peut plus les distinguer.
  function appareil() {
    var v = Local.lire(CLE_APPAREIL);
    if (!v) {
      v = U.id();
      Local.ecrire(CLE_APPAREIL, v);
    }
    return v;
  }

  async function charger() {
    var brut = Local.lire(CLE);
    return brut ? JSON.parse(brut) : null;
  }

  /* Renvoie false si l'écriture n'a pas eu lieu — quota plein, stockage refusé.
   *
   * Ce retour n'est pas décoratif : sans lui, un stockage saturé faisait perdre
   * la journée en silence. L'application continuait d'afficher les saisies
   * (elles vivent en mémoire), et tout disparaissait à la fermeture.
   *
   * Les copies quotidiennes occupent sept fois l'état. Quand la place manque,
   * ce sont donc elles qu'il faut sacrifier en premier : on les purge et on
   * retente une fois avant d'abandonner. */
  async function sauver(state) {
    var json = JSON.stringify(state);
    if (Local.ecrire(CLE, json)) { snapshotQuotidien(json); return true; }

    purgerBackups(0);
    if (Local.ecrire(CLE, json)) return true;
    return false;
  }

  function purgerBackups(garder) {
    var cles = Local.cles().filter(function (k) { return k && k.indexOf(CLE_BACKUP) === 0; }).sort();
    while (cles.length > garder) Local.effacer(cles.shift());
  }

  /* --- Filet de sécurité : une copie par jour, 7 jours glissants --- */

  function snapshotQuotidien(json) {
    var cle = CLE_BACKUP + U.aujourdhui();
    var deja = Local.lire(cle);
    if (deja && deja.length > json.length * 1.5) return;
    Local.ecrire(cle, json);
    purgerBackups(MAX_BACKUPS);
  }

  function listerBackups() {
    return Local.cles()
      .filter(function (k) { return k && k.indexOf(CLE_BACKUP) === 0; })
      .map(function (k) {
        var v = Local.lire(k);
        return { date: k.slice(CLE_BACKUP.length), cle: k, taille: v ? v.length : 0 };
      })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  function lireBackup(cle) {
    var v = Local.lire(cle);
    return v ? JSON.parse(v) : null;
  }

  /* --- Export / import : les données ne sont jamais prisonnières --- */

  function exporter(state) {
    var nom = 'quete-' + U.aujourdhui() + '.json';
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return nom;
  }

  function importer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(JSON.parse(fr.result)); }
        catch (e) { reject(new Error('Fichier illisible : ' + e.message)); }
      };
      fr.onerror = function () { reject(new Error('Lecture impossible')); };
      fr.readAsText(file);
    });
  }

  function taille() {
    var v = Local.lire(CLE);
    return v ? v.length : 0;
  }

  return {
    charger: charger, sauver: sauver,
    exporter: exporter, importer: importer,
    listerBackups: listerBackups, lireBackup: lireBackup,
    taille: taille, appareil: appareil
  };
})();
