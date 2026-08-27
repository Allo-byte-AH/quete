/* Fusion par enregistrement.
 *
 * Le cœur de la synchronisation. Deux copies de l'état, modifiées chacune de
 * leur côté, sont réconciliées sans perte : réunion par identifiant, et en cas
 * de collision on garde la version au `modifieLe` le plus récent.
 *
 * Trois propriétés à préserver, sous peine de perdre des données :
 *
 *  1. COMMUTATIVE — fusionner(a, b) et fusionner(b, a) donnent le même contenu.
 *     Sans ça, deux appareils divergent définitivement.
 *  2. IDEMPOTENTE — refusionner un résultat déjà fusionné ne change rien.
 *  3. DÉPARTAGE STABLE — à horodatage identique, le gagnant est déterminé par
 *     l'identifiant de l'appareil, jamais par l'ordre des arguments.
 *
 * Les suppressions sont des pierres tombales (`supprime: true`) et non des
 * retraits : sans ça, un enregistrement supprimé sur le téléphone ressusciterait
 * à la première fusion avec le PC, qui l'a encore.
 */
var Fusion = (function () {

  // Toute collection d'enregistrements à identifiant doit figurer ici. En
  // oublier une ne provoque aucune erreur : elle disparaît simplement à la
  // première fusion. Un test vérifie que cette liste couvre bien l'état.
  var COLLECTIONS = ['entries', 'videos', 'clients', 'categories',
                     'transactions', 'categoriesFin', 'quetes', 'systemes', 'xpLog'];

  var EPOQUE = '2000-01-01T00:00:00.000Z';

  /* --- Départage --- */

  // Renvoie l'enregistrement qui doit l'emporter. Déterministe : à horodatage
  // égal on compare l'appareil, puis on garde `a` — les deux appareils font le
  // même calcul et arrivent donc au même résultat.
  function gagnant(a, b) {
    var ta = a.modifieLe || EPOQUE, tb = b.modifieLe || EPOQUE;
    if (ta !== tb) return ta > tb ? a : b;
    var pa = a.modifiePar || '', pb = b.modifiePar || '';
    if (pa !== pb) return pa > pb ? a : b;
    return a;
  }

  function fusionnerCollection(locale, distante, stats) {
    var index = Object.create(null);
    var ordre = [];

    (locale || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (!(r.id in index)) ordre.push(r.id);
      index[r.id] = r;
    });

    (distante || []).forEach(function (r) {
      if (!r || !r.id) return;
      if (!(r.id in index)) {
        index[r.id] = r;
        ordre.push(r.id);
        stats.ajoutes++;
        return;
      }
      var avant = index[r.id];
      var apres = gagnant(avant, r);
      if (apres !== avant) {
        index[r.id] = apres;
        if (apres.supprime && !avant.supprime) stats.supprimes++;
        else stats.majs++;
      }
    });

    return ordre.map(function (id) { return index[id]; });
  }

  /* --- Fusion complète --- */

  // `locale` est l'état de cet appareil, `distante` celui qu'on vient de lire.
  // Ni l'un ni l'autre n'est modifié : un nouvel objet est renvoyé.
  function fusionner(locale, distante) {
    if (!distante) return { etat: locale, stats: vide() };
    if (!locale) return { etat: distante, stats: vide() };

    var stats = vide();
    var out = { version: Math.max(locale.version || 1, distante.version || 1) };

    // La date de création la plus ancienne fait foi.
    out.creeLe = (locale.creeLe || '') < (distante.creeLe || '')
      ? (locale.creeLe || distante.creeLe) : (distante.creeLe || locale.creeLe);

    COLLECTIONS.forEach(function (nom) {
      var s = { ajoutes: 0, majs: 0, supprimes: 0 };
      out[nom] = fusionnerCollection(locale[nom], distante[nom], s);
      if (s.ajoutes || s.majs || s.supprimes) stats.detail[nom] = s;
      stats.ajoutes += s.ajoutes;
      stats.majs += s.majs;
      stats.supprimes += s.supprimes;
    });

    // Les singletons (réglages, chrono) n'ont pas d'identifiant : on les
    // départage sur un horodatage tenu à part.
    var hl = locale.horodatages || {}, hd = distante.horodatages || {};
    out.horodatages = {};

    ['settings', 'chrono'].forEach(function (cle) {
      var tl = hl[cle] || EPOQUE, td = hd[cle] || EPOQUE;
      var prendDistant = td > tl;
      out[cle] = prendDistant ? distante[cle] : locale[cle];
      out.horodatages[cle] = prendDistant ? td : tl;
      if (prendDistant) stats.singletons.push(cle);
    });

    // Un chrono lancé sur un appareil et arrêté sur l'autre : c'est l'arrêt
    // (chrono null) le plus récent qui gagne, la règle ci-dessus suffit.

    // Filet de sécurité : toute clé de l'état que ce moteur ne connaît pas est
    // reportée telle quelle plutôt que perdue. Ajouter demain une section à
    // l'état sans penser à ce fichier ne doit pas effacer des données.
    [locale, distante].forEach(function (source) {
      Object.keys(source).forEach(function (k) {
        if (!(k in out)) out[k] = source[k];
      });
    });

    return { etat: out, stats: stats };
  }

  function vide() {
    return { ajoutes: 0, majs: 0, supprimes: 0, singletons: [], detail: {} };
  }

  function resume(stats) {
    var bouts = [];
    if (stats.ajoutes) bouts.push(stats.ajoutes + ' ajout' + (stats.ajoutes > 1 ? 's' : ''));
    if (stats.majs) bouts.push(stats.majs + ' mise' + (stats.majs > 1 ? 's' : '') + ' à jour');
    if (stats.supprimes) bouts.push(stats.supprimes + ' suppression' + (stats.supprimes > 1 ? 's' : ''));
    if (stats.singletons.length) bouts.push('réglages');
    return bouts.length ? bouts.join(', ') : 'rien de nouveau';
  }

  /* --- Empreinte ---
   * Forme canonique d'un état : clés triées récursivement. Deux états au même
   * contenu donnent la même empreinte même si leurs clés sont ordonnées
   * différemment — ce qui arrive dès qu'un état a fait l'aller-retour par JSON.
   *
   * Sans ça, la synchronisation croirait voir une différence à chaque cycle et
   * enverrait sans fin des versions identiques.
   */
  function canonique(x) {
    if (Array.isArray(x)) return x.map(canonique);
    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).sort().forEach(function (k) { o[k] = canonique(x[k]); });
      return o;
    }
    return x;
  }
  function empreinte(etat) {
    return etat ? JSON.stringify(canonique(etat)) : '';
  }

  /* --- Purge des pierres tombales --- */

  // Une pierre tombale ne peut être effacée pour de bon qu'une fois certain que
  // tous les appareils l'ont vue. D'où le délai : un appareil resté hors ligne
  // plus longtemps que ça ferait ressusciter ce qu'il a supprimé.
  function purger(etat, jours) {
    var limite = new Date(Date.now() - (jours || 90) * 86400000).toISOString();
    var n = 0;
    COLLECTIONS.forEach(function (nom) {
      if (!etat[nom]) return;
      var avant = etat[nom].length;
      etat[nom] = etat[nom].filter(function (r) {
        return !(r.supprime && (r.modifieLe || EPOQUE) < limite);
      });
      n += avant - etat[nom].length;
    });
    return n;
  }

  return {
    COLLECTIONS: COLLECTIONS,
    EPOQUE: EPOQUE,
    fusionner: fusionner,
    fusionnerCollection: fusionnerCollection,
    gagnant: gagnant,
    empreinte: empreinte,
    purger: purger,
    resume: resume
  };
})();
