/* Couche de stockage.
 *
 * IMPORTANT : toute l'application passe par ici, en asynchrone, et ne sait jamais
 * où les données atterrissent. Aujourd'hui c'est localStorage (phase 1, zéro
 * serveur). Le jour où l'on ajoute le petit serveur local pour accéder au
 * téléphone, seules les 3 fonctions ci-dessous changent — aucune vue à réécrire.
 */
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
    var v = localStorage.getItem(CLE_APPAREIL);
    if (!v) {
      v = U.id();
      localStorage.setItem(CLE_APPAREIL, v);
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
    var brut = localStorage.getItem(CLE);
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
    localStorage.setItem(CLE, json);
    snapshotQuotidien(json);
  }

  /* --- Filet de sécurité : une copie par jour, 7 jours glissants --- */

  function snapshotQuotidien(json) {
    try {
      var cle = CLE_BACKUP + U.aujourdhui();
      if (localStorage.getItem(cle) && localStorage.getItem(cle).length > json.length * 1.5) return;
      localStorage.setItem(cle, json);
      var cles = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CLE_BACKUP) === 0) cles.push(k);
      }
      cles.sort();
      while (cles.length > MAX_BACKUPS) localStorage.removeItem(cles.shift());
    } catch (e) { /* quota plein : on n'empêche pas la sauvegarde principale */ }
  }

  function listerBackups() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(CLE_BACKUP) === 0) {
        out.push({ date: k.slice(CLE_BACKUP.length), cle: k, taille: localStorage.getItem(k).length });
      }
    }
    return out.sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  function lireBackup(cle) {
    var v = localStorage.getItem(cle);
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
    var v = localStorage.getItem(CLE);
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
