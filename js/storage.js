/* Couche de stockage.
 *
 * IMPORTANT : toute l'application passe par ici, en asynchrone, et ne sait jamais
 * où les données atterrissent. Aujourd'hui c'est localStorage (phase 1, zéro
 * serveur). Le jour où l'on ajoute le petit serveur local pour accéder au
 * téléphone, seules les 3 fonctions ci-dessous changent — aucune vue à réécrire.
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
  var mode = 'local'; // 'local' | 'serveur'

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

  // Détecte si un serveur local expose /api/state. Si oui, il devient la source
  // de vérité (et le téléphone peut taper la même URL). Sinon : localStorage.
  // Tant qu'il n'y a pas de serveur, cette sonde laisse un 404 dans la console :
  // c'est attendu, et sans conséquence.
  async function init() {
    try {
      var r = await fetch('api/state', { method: 'GET', cache: 'no-store' });
      if (r.ok) { mode = 'serveur'; return mode; }
    } catch (e) { /* pas de serveur : normal en phase 1 */ }
    mode = 'local';
    return mode;
  }

  async function charger() {
    if (mode === 'serveur') {
      var r = await fetch('api/state', { cache: 'no-store' });
      if (!r.ok) throw new Error('Lecture serveur impossible');
      return await r.json();
    }
    var brut = Local.lire(CLE);
    return brut ? JSON.parse(brut) : null;
  }

  async function sauver(state) {
    var json = JSON.stringify(state);
    if (mode === 'serveur') {
      await fetch('api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json
      });
      return;
    }
    Local.ecrire(CLE, json);
    snapshotQuotidien(json);
  }

  /* --- Filet de sécurité : une copie par jour, 7 jours glissants --- */

  function snapshotQuotidien(json) {
    var cle = CLE_BACKUP + U.aujourdhui();
    var deja = Local.lire(cle);
    if (deja && deja.length > json.length * 1.5) return;
    Local.ecrire(cle, json);
    var cles = Local.cles().filter(function (k) { return k && k.indexOf(CLE_BACKUP) === 0; }).sort();
    while (cles.length > MAX_BACKUPS) Local.effacer(cles.shift());
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
    init: init, charger: charger, sauver: sauver,
    exporter: exporter, importer: importer,
    listerBackups: listerBackups, lireBackup: lireBackup,
    taille: taille, appareil: appareil,
    get mode() { return mode; }
  };
})();
