/* Transport GitHub — lecture et écriture d'un fichier dans un dépôt privé.
 *
 * Pourquoi GitHub : c'est disponible en permanence, gratuit, et il n'y a aucun
 * serveur à écrire ni à entretenir. Surtout, l'API impose de fournir
 * l'identifiant de la version qu'on croit remplacer (le `sha` du fichier) :
 * si un autre appareil a écrit entre-temps, l'écriture est refusée. Le
 * contrôle de concurrence est donc offert, sans rien construire.
 *
 * Bénéfice annexe : chaque écriture étant un commit, l'historique complet des
 * données existe sans effort — les sauvegardes se font toutes seules.
 *
 * La configuration (dépôt, jeton) reste dans le stockage local de CHAQUE
 * appareil. Elle n'entre jamais dans l'état synchronisé : sans quoi le jeton
 * d'accès voyagerait dans le fichier de données.
 */
var Distant = (function () {
  var CLE = 'quete.distant';
  var conf = null;
  var lu = false;

  function charger() {
    if (!lu) {
      try { conf = JSON.parse(localStorage.getItem(CLE) || 'null'); }
      catch (e) { conf = null; }
      lu = true;
    }
    return conf;
  }
  function configurer(c) {
    conf = { depot: (c.depot || '').trim(), jeton: (c.jeton || '').trim(), chemin: (c.chemin || 'data.json').trim() };
    lu = true;
    localStorage.setItem(CLE, JSON.stringify(conf));
    return conf;
  }
  function oublier() { conf = null; lu = true; localStorage.removeItem(CLE); }
  function configure() { var c = charger(); return !!(c && c.depot && c.jeton); }
  function depot() { var c = charger(); return c ? c.depot : ''; }
  function chemin() { var c = charger(); return (c && c.chemin) || 'data.json'; }

  /* --- Base64 en UTF-8 ---
   * btoa ne sait traiter que des octets : sans cette conversion, le moindre
   * accent casse l'encodage. */
  function versB64(txt) {
    return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(txt)));
  }
  function depuisB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(octets);
  }

  function urlContenu() {
    return 'https://api.github.com/repos/' + depot() + '/contents/' + chemin();
  }
  function entetes() {
    return {
      'Authorization': 'Bearer ' + charger().jeton,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function erreur(code, detail) {
    var m = {
      401: 'Jeton refusé. Vérifie qu\'il est complet et non expiré.',
      403: 'Accès interdit. Le jeton n\'a probablement pas le droit « Contents : lecture et écriture » sur ce dépôt.',
      404: 'Dépôt ou fichier introuvable. Vérifie le nom sous la forme utilisateur/depot, et que le jeton donne accès à CE dépôt.',
      422: 'GitHub a refusé l\'écriture (version obsolète).'
    }[code];
    var e = new Error(m || ('Erreur GitHub ' + code + (detail ? ' — ' + detail : '')));
    e.code = code;
    return e;
  }

  /* --- Lecture --- */

  async function lire() {
    var r = await fetch(urlContenu(), { headers: entetes(), cache: 'no-store' });
    if (r.status === 404) return { version: null, etat: null };
    if (!r.ok) throw erreur(r.status);
    var j = await r.json();
    // Au-delà d'un mégaoctet, l'API cesse de renvoyer le contenu. On est très
    // loin du compte (quelques dizaines de kilo-octets), mais autant que le
    // jour où ça arriverait produise un message clair.
    if (!j.content && j.size > 1000000) {
      throw new Error('Fichier trop volumineux pour cette API (' + Math.round(j.size / 1024) + ' Ko).');
    }
    return { version: j.sha, etat: JSON.parse(depuisB64(j.content)) };
  }

  /* --- Écriture ---
   * `version` est le sha qu'on croit remplacer ; null pour une création.
   * Un refus pour cause de version obsolète est signalé par e.conflit, que la
   * couche de synchronisation traite en refusionnant plutôt qu'en échouant.
   */
  async function ecrire(etat, version, resume) {
    var corps = {
      message: resume || ('QUÊTE — ' + new Date().toLocaleString('fr-FR')),
      // Indenté : l'historique reste lisible dans l'interface de GitHub, pour
      // un surcoût négligeable à cette taille.
      content: versB64(JSON.stringify(etat, null, 1))
    };
    if (version) corps.sha = version;

    var r = await fetch(urlContenu(), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, entetes()),
      body: JSON.stringify(corps)
    });

    if (r.status === 409 || r.status === 422) {
      var e = new Error('Version obsolète — refusion nécessaire.');
      e.conflit = true;
      throw e;
    }
    if (!r.ok) throw erreur(r.status);
    var j = await r.json();
    return j.content.sha;
  }

  /* --- Vérification de la configuration --- */

  async function tester() {
    var c = charger();
    if (!c || !c.depot || !c.jeton) throw new Error('Dépôt et jeton requis.');
    if (!/^[\w.-]+\/[\w.-]+$/.test(c.depot)) {
      throw new Error('Le dépôt doit s\'écrire utilisateur/depot, sans adresse complète.');
    }
    var r = await fetch('https://api.github.com/repos/' + c.depot, { headers: entetes(), cache: 'no-store' });
    if (!r.ok) throw erreur(r.status);
    var j = await r.json();
    var f = await lire();
    return {
      depot: j.full_name,
      prive: j.private,
      ecriture: !!(j.permissions && j.permissions.push),
      fichier: f.version ? chemin() + ' (déjà présent)' : chemin() + ' (sera créé)',
      entrees: f.etat && f.etat.entries ? f.etat.entries.length : 0
    };
  }

  return {
    charger: charger, configurer: configurer, oublier: oublier,
    configure: configure, depot: depot, chemin: chemin,
    lire: lire, ecrire: ecrire, tester: tester
  };
})();
