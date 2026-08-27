/* Boucle de synchronisation.
 *
 * Le cycle, à chaque fois identique :
 *   1. lire le distant
 *   2. le fusionner avec le local (rien n'est écrasé : voir js/fusion.js)
 *   3. réécrire si le résultat diffère de ce qu'on vient de lire
 *
 * En cas de refus pour version obsolète, on ne renonce pas : on recommence au
 * point 1. C'est tout l'intérêt d'avoir une fusion sûre — un conflit n'est
 * qu'une formalité, jamais une perte.
 *
 * Tout est écrit en local immédiatement ; la poussée vers le distant est
 * groupée quelques secondes plus tard, pour ne pas produire un commit par
 * frappe au clavier.
 */
var Sync = (function () {
  var DELAI_POUSSEE = 4000;
  var DELAI_SONDAGE = 25000;
  var ESSAIS_MAX = 4;

  var version = null;      // sha distant connu
  var etat = 'inactif';    // inactif | occupe | ajour | horsligne | erreur
  var detail = '';
  var derniere = null;
  var minuteur = null, sondeur = null;
  var enCours = false;

  function poser(e, d) {
    etat = e; detail = d || '';
    if (window.App && App.renderHud) App.renderHud();
  }

  function statut() {
    return { etat: etat, detail: detail, derniere: derniere, actif: Distant.configure() };
  }

  async function demarrer() {
    if (!Distant.configure()) { poser('inactif', 'Synchronisation non configurée'); return; }
    poser('occupe', 'Première synchronisation…');
    await synchroniser();

    clearInterval(sondeur);
    sondeur = setInterval(function () {
      // Ne rien demander à GitHub quand l'onglet est en arrière-plan : inutile,
      // et ça consomme le quota de requêtes pour rien.
      if (document.visibilityState === 'visible') synchroniser();
    }, DELAI_SONDAGE);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') synchroniser();
    });
    window.addEventListener('online', function () { synchroniser(); });
    window.addEventListener('offline', function () { poser('horsligne', 'Hors ligne'); });
  }

  // Appelée après chaque écriture locale.
  function planifier() {
    if (!Distant.configure()) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(function () { synchroniser(); }, DELAI_POUSSEE);
  }

  async function synchroniser(essai) {
    essai = essai || 0;
    if (enCours && !essai) return;
    if (!Distant.configure()) { poser('inactif', 'Synchronisation non configurée'); return; }
    if (navigator.onLine === false) { poser('horsligne', 'Hors ligne — reprise au retour du réseau'); return; }

    enCours = true;
    clearTimeout(minuteur);
    poser('occupe', 'Synchronisation…');

    try {
      var distant = await Distant.lire();
      version = distant.version;

      var stats = null;
      if (distant.etat) stats = await State.fusionnerAvec(distant.etat);

      // Comparaison sur la forme canonique : deux états au même contenu mais
      // aux clés ordonnées différemment ne doivent pas déclencher d'écriture.
      var aChange = Fusion.empreinte(State.d) !== Fusion.empreinte(distant.etat);
      if (aChange) {
        version = await Distant.ecrire(State.d, version);
      }

      derniere = new Date();
      poser('ajour', aChange ? 'Envoyé' : 'À jour');

      var recu = stats && (stats.ajoutes || stats.majs || stats.supprimes || stats.singletons.length);
      if (recu) {
        App.render();
        App.message('Reçu de l\'autre appareil : ' + Fusion.resume(stats) + '.', 'ok');
      }
    } catch (e) {
      if (e.conflit && essai < ESSAIS_MAX) {
        // Quelqu'un a écrit pendant qu'on préparait notre envoi : on relit,
        // on refusionne, on renvoie. Aucune donnée n'est en jeu.
        enCours = false;
        return synchroniser(essai + 1);
      }
      poser('erreur', e.message);
      if (!essai) console.warn('Synchronisation :', e);
    } finally {
      if (!(etat === 'occupe')) enCours = false;
      enCours = false;
    }
  }

  async function maintenant() {
    await synchroniser();
    if (etat === 'erreur') App.message(detail, 'erreur');
    else App.message(derniere ? 'Synchronisé.' : 'Rien à synchroniser.', 'ok');
  }

  function arreter() {
    clearInterval(sondeur); clearTimeout(minuteur);
    version = null; derniere = null;
    poser('inactif', 'Synchronisation non configurée');
  }

  return {
    demarrer: demarrer, planifier: planifier, synchroniser: synchroniser,
    maintenant: maintenant, arreter: arreter, statut: statut
  };
})();
