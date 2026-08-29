/* État de l'application : un seul objet JSON, sauvegardé automatiquement.
 * Les champs transactions/quetes/systemes/xpLog sont déjà là mais vides —
 * ils accueilleront les phases finances et « couche jeu » sans migration.
 */
var State = (function () {
  var d = null;
  var timer = null;

  function defaut() {
    var cat = function (id, nom, couleur, facturable) {
      return { id: id, nom: nom, couleur: couleur, facturable: facturable, archive: false };
    };
    return {
      version: 2,
      creeLe: new Date().toISOString(),
      // Horodatages des singletons, qui n'ont pas d'identifiant propre.
      horodatages: { settings: Fusion.EPOQUE, chrono: Fusion.EPOQUE },
      settings: {
        devise: '€',
        heuresCibleJour: 6,
        heuresCibleSemaine: 30
      },
      // Valeurs de départ à ajuster dans Réglages — rien n'est en dur dans le code.
      categories: [
        cat('cat-montage', 'Montage', '#7c5cff', true),
        cat('cat-tournage', 'Tournage', '#2ecc8f', true),
        cat('cat-autre-fact', 'Client — autre', '#38bdf8', true),
        cat('cat-prospection', 'Prospection', '#ffb648', false),
        cat('cat-admin', 'Admin / Gestion', '#8b90a0', false),
        cat('cat-formation', 'Formation', '#ff8ac2', false)
      ],
      // Catégories de dépenses / revenus divers (le CA des vidéos ne passe pas par là).
      categoriesFin: [
        { id: 'fin-materiel', nom: 'Matériel', type: 'depense', couleur: '#ff5c72' },
        { id: 'fin-logiciel', nom: 'Logiciels / abonnements', type: 'depense', couleur: '#ffb648' },
        { id: 'fin-deplacement', nom: 'Déplacements', type: 'depense', couleur: '#38bdf8' },
        { id: 'fin-charges', nom: 'Charges / cotisations', type: 'depense', couleur: '#8b90a0' },
        { id: 'fin-autre-dep', nom: 'Autre dépense', type: 'depense', couleur: '#6b7280' },
        { id: 'fin-autre-rev', nom: 'Autre revenu', type: 'revenu', couleur: '#2ecc8f' }
      ],
      clients: [],
      videos: [],
      entries: [],
      transactions: [],
      chrono: null,
      // Réservé aux phases suivantes
      quetes: [],
      systemes: [],
      xpLog: []
    };
  }

  /* Assainissement des données venues d'ailleurs.
   *
   * Toute donnée étrangère — fichier importé, contenu du dépôt — passe par
   * migrer(). C'est donc le seul endroit où la vérifier, et il faut le faire :
   * les couleurs et les identifiants sont interpolés tels quels dans des
   * attributs HTML par les vues. Une couleur valant `#fff" onmouseover="…`
   * exécute du code sur cette origine — celle-là même où le jeton GitHub est
   * stocké. Le fichier hostile est peu probable ; la conséquence ne l'est pas.
   *
   * Les identifiants légitimes sont en base 36, plus « : » pour les clés
   * déterministes du journal d'expérience : ce jeu de caractères suffit, et
   * les données saines en ressortent inchangées.
   */
  var CHAMPS_ID = ['id', 'refId', 'clientId', 'categorieId', 'videoId', 'categorieFinId'];

  function assainir(x) {
    Fusion.COLLECTIONS.forEach(function (nom) {
      (x[nom] || []).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        if ('couleur' in r) r.couleur = U.couleur(r.couleur);
        CHAMPS_ID.forEach(function (c) { r[c] = U.identifiant(r[c]); });
      });
    });
    return x;
  }

  // Complète les clés manquantes : un export ancien reste lisible.
  function migrer(x) {
    var base = defaut();
    Object.keys(base).forEach(function (k) {
      if (x[k] === undefined) x[k] = base[k];
    });
    Object.keys(base.settings).forEach(function (k) {
      if (x.settings[k] === undefined) x.settings[k] = base.settings[k];
    });

    // v1 -> v2 : la fusion exige un horodatage sur chaque enregistrement.
    // Les données antérieures reçoivent leur date de création, à défaut une
    // date très ancienne — de sorte que toute modification future l'emporte.
    if (!x.version || x.version < 2) {
      Fusion.COLLECTIONS.forEach(function (nom) {
        (x[nom] || []).forEach(function (r) {
          if (!r.modifieLe) r.modifieLe = r.creeLe || x.creeLe || Fusion.EPOQUE;
          if (!r.modifiePar) r.modifiePar = 'v1';
        });
      });
      x.version = 2;
    }
    return assainir(x);
  }

  /* --- Horodatage des écritures --- */

  // Toute modification passe par ici. Sans `modifieLe`, la fusion ne peut pas
  // départager deux versions et perdrait silencieusement l'une des deux.
  function marquer(r) {
    r.modifieLe = new Date().toISOString();
    r.modifiePar = Storage.appareil();
    return r;
  }

  // Applique un correctif à un enregistrement, l'horodate et sauvegarde.
  function modifier(r, patch) {
    if (!r) return null;
    if (patch) Object.assign(r, patch);
    marquer(r);
    sauver();
    return r;
  }

  function toucherSingleton(cle) {
    d.horodatages[cle] = new Date().toISOString();
  }

  // Supprimer, c'est marquer — pas retirer. Un retrait pur reviendrait à la
  // première fusion avec un appareil qui a encore l'enregistrement.
  function supprimerEnreg(collection, id) {
    var r = (d[collection] || []).find(function (x) { return x.id === id; });
    if (!r) return null;
    r.supprime = true;
    marquer(r);
    sauver();
    return r;
  }

  /* --- Lecture : les pierres tombales n'existent pas pour l'application --- */

  function vivants(l) {
    return (l || []).filter(function (r) { return !r.supprime; });
  }
  function entries() { return vivants(d.entries); }
  function videos() { return vivants(d.videos); }
  function clients() { return vivants(d.clients); }
  function categories() { return vivants(d.categories); }
  function transactions() { return vivants(d.transactions); }
  function categoriesFin() { return vivants(d.categoriesFin); }
  function systemes() { return vivants(d.systemes); }
  function quetes() { return vivants(d.quetes); }
  function xpLog() { return vivants(d.xpLog); }

  async function charger() {
    var brut = null;
    try { brut = await Storage.charger(); } catch (e) { console.warn(e); }
    d = brut ? migrer(brut) : defaut();
    U.setDevise(d.settings.devise);
    Fusion.purger(d, 90);
    if (!brut) await Storage.sauver(d);
    return d;
  }

  // Réconcilie l'état courant avec une autre copie (import, ou plus tard
  // synchronisation). Rien n'est écrasé : c'est le plus récent qui gagne,
  // enregistrement par enregistrement.
  async function fusionnerAvec(autre) {
    var r = Fusion.fusionner(d, migrer(autre));
    d = r.etat;
    U.setDevise(d.settings.devise);
    await sauverMaintenant();
    return r.stats;
  }

  // Sauvegarde groupée : on peut appeler sauver() après chaque frappe sans souci.
  // L'écriture locale est immédiate ; la poussée vers le distant est planifiée
  // par Sync, qui la regroupe à son tour.
  // Une écriture refusée ne doit pas passer inaperçue : l'application
  // continuerait d'afficher des saisies qui ne survivraient pas à la
  // fermeture. Un seul message tant que la situation dure — la sauvegarde est
  // appelée à chaque frappe.
  var ecritureKO = false;
  function verifierEcriture(ok) {
    if (ok) { ecritureKO = false; return ok; }
    if (ecritureKO) return ok;
    ecritureKO = true;
    if (window.App && App.message) {
      App.message('Le navigateur refuse d\'enregistrer — stockage plein ou bloqué. ' +
        'Tes dernières saisies ne survivront pas à la fermeture : exporte-les, ' +
        'ou configure la synchronisation.', 'erreur');
    }
    return ok;
  }

  function sauver() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      Storage.sauver(d).then(verifierEcriture);
      if (window.Sync) Sync.planifier();
    }, 250);
  }
  function sauverMaintenant() {
    clearTimeout(timer);
    return Storage.sauver(d).then(verifierEcriture);
  }

  function remplacer(nouveau) {
    d = migrer(nouveau);
    return sauverMaintenant();
  }

  /* --- Accès --- */

  function client(id) {
    if (!id) return null;
    var l = clients();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function categorie(id) {
    if (!id) return null;
    var l = categories();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function nomClient(id) { var c = client(id); return c ? c.nom : '—'; }
  function nomCategorie(id) { var c = categorie(id); return c ? c.nom : 'Sans catégorie'; }
  function couleurCategorie(id) { var c = categorie(id); return c ? c.couleur : '#8b90a0'; }

  function entreesDuJour(date) {
    return entries().filter(function (e) { return e.date === date; })
      .sort(function (a, b) { return (U.parseHM(a.debut) || 0) - (U.parseHM(b.debut) || 0); });
  }
  function entreesPeriode(du, au) {
    return entries().filter(function (e) { return e.date >= du && e.date <= au; });
  }
  function totalMinutes(entrees) {
    return entrees.reduce(function (s, e) { return s + U.duree(e); }, 0);
  }
  function totalFacturable(entrees) {
    return entrees.reduce(function (s, e) {
      var c = categorie(e.categorieId);
      return s + (c && c.facturable ? U.duree(e) : 0);
    }, 0);
  }

  // Regroupe des entrées par clé, trié du plus long au plus court.
  function repartition(entrees, cle) {
    var map = {};
    entrees.forEach(function (e) {
      var k = e[cle] || '__aucun';
      map[k] = (map[k] || 0) + U.duree(e);
    });
    return Object.keys(map).map(function (k) {
      return { id: k === '__aucun' ? null : k, minutes: map[k] };
    }).sort(function (a, b) { return b.minutes - a.minutes; });
  }

  /* --- Écriture --- */

  function ajouterEntree(e) {
    e.id = U.id();
    e.creeLe = new Date().toISOString();
    marquer(e);
    d.entries.push(e);
    sauver();
    return e;
  }
  function majEntree(id, champs) {
    return modifier(d.entries.find(function (x) { return x.id === id; }), champs);
  }
  function supprimerEntree(id) {
    supprimerEnreg('entries', id);
  }

  function ajouterClient(nom) {
    var c = marquer({ id: U.id(), nom: nom, couleur: U.couleurIndex(clients().length),
                      tarifDefaut: null, archive: false, creeLe: new Date().toISOString() });
    d.clients.push(c);
    sauver();
    return c;
  }
  function ajouterCategorie(nom) {
    var c = marquer({ id: U.id(), nom: nom, couleur: U.couleurIndex(categories().length),
                      facturable: false, archive: false, creeLe: new Date().toISOString() });
    d.categories.push(c);
    sauver();
    return c;
  }

  /* --- Chrono ---
   * Vit dans l'état sauvegardé, pas dans une variable de vue : il survit à la
   * fermeture de l'onglet, et le jour où la synchronisation existera il pourra
   * être lancé sur un appareil et arrêté sur l'autre.
   */

  // Démarre sur le modèle donné (catégorie, client, vidéo, note). Si un chrono
  // tourne déjà, il est arrêté et enregistré — comme un enchaînement de tâches.
  function demarrerChrono(modele) {
    var precedent = d.chrono ? arreterChrono(1) : null;
    d.chrono = {
      ts: Date.now(),
      date: U.aujourdhui(),
      debut: U.maintenantHM(),
      categorieId: modele.categorieId,
      clientId: modele.clientId || null,
      videoId: modele.videoId || null,
      note: modele.note || ''
    };
    toucherSingleton('chrono');
    sauver();
    return precedent;
  }

  // `seuil` en minutes : en deçà, la session est jetée au lieu de créer une
  // entrée de zéro minute (cas du chrono lancé par erreur puis relancé).
  function arreterChrono(seuil) {
    var c = d.chrono;
    if (!c) return null;
    var ecoule = Math.round((Date.now() - c.ts) / 60000);
    var e = null;
    if (ecoule >= (seuil || 0)) {
      e = ajouterEntree({
        date: c.date, debut: c.debut, fin: U.maintenantHM(),
        categorieId: c.categorieId, clientId: c.clientId,
        videoId: c.videoId || null, note: c.note
      });
    }
    d.chrono = null;
    toucherSingleton('chrono');
    sauver();
    // Une entrée ne sait exprimer qu'un début et une fin dans la même journée :
    // au-delà de 24 h, la durée enregistrée est amputée d'un tour d'horloge.
    // On le signale plutôt que de laisser passer un chiffre faux — un chrono
    // oublié une nuit est le cas le plus courant, pas le plus rare.
    return { entree: e, ecoule: ecoule, chrono: c, tropLong: ecoule >= 1440 };
  }

  // Jette la session en cours sans rien enregistrer.
  function annulerChrono() {
    d.chrono = null;
    toucherSingleton('chrono');
    sauver();
  }

  function chronoEcoule() {
    return d.chrono ? Math.floor((Date.now() - d.chrono.ts) / 60000) : 0;
  }

  // Décrit une tâche en une ligne, pour les messages de relance.
  function libelleTache(t) {
    var bouts = [nomCategorie(t.categorieId)];
    if (t.videoId) bouts.push(titreVideo(t.videoId) || '?');
    else if (t.clientId) bouts.push(nomClient(t.clientId));
    else if (t.note) bouts.push(t.note);
    return bouts.join(' · ');
  }

  // Chevauchement d'horaires sur la même date — signalé, jamais bloquant.
  function chevauchements(entree, ignorerId) {
    var a1 = U.parseHM(entree.debut);
    var a2 = a1 + U.duree(entree);
    return entreesDuJour(entree.date).filter(function (e) {
      if (e.id === ignorerId) return false;
      var b1 = U.parseHM(e.debut);
      var b2 = b1 + U.duree(e);
      return a1 < b2 && b1 < a2;
    });
  }

  // Les paires (catégorie, client) les plus utilisées sur 30 jours -> raccourcis.
  function combosFrequents(n) {
    var depuis = U.ajouterJours(U.aujourdhui(), -30);
    var map = {};
    entries().forEach(function (e) {
      if (e.date < depuis || !e.categorieId) return;
      var k = e.categorieId + '|' + (e.clientId || '');
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map)
      .sort(function (a, b) { return map[b] - map[a]; })
      .slice(0, n || 5)
      .map(function (k) {
        var p = k.split('|');
        return { categorieId: p[0], clientId: p[1] || null, n: map[k] };
      });
  }

  /* ------------------------------------------------------------------
   * Vidéos (livrables)
   * L'unité de travail réelle : on y rattache du temps et un prix, donc
   * un taux horaire dès la première vidéo terminée.
   * ------------------------------------------------------------------ */

  var STATUTS = [
    { id: 'encours', nom: 'En cours', couleur: '#8b90a0' },
    { id: 'livree', nom: 'Livrée', couleur: '#38bdf8' },
    { id: 'facturee', nom: 'Facturée', couleur: '#ffb648' },
    { id: 'payee', nom: 'Payée', couleur: '#2ecc8f' }
  ];
  function statut(id) {
    return STATUTS.find(function (s) { return s.id === id; }) || STATUTS[0];
  }

  function video(id) {
    if (!id) return null;
    var l = videos();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function titreVideo(id) { var v = video(id); return v ? v.titre : null; }
  function entreesVideo(id) {
    return entries().filter(function (e) { return e.videoId === id; })
      .sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
  }
  function minutesVideo(id) { return totalMinutes(entreesVideo(id)); }
  function tauxVideo(v) {
    var m = minutesVideo(v.id);
    return (v.prix > 0 && m > 0) ? v.prix / (m / 60) : null;
  }

  // Date à laquelle on rattache le chiffre d'affaires d'une vidéo :
  // sa livraison si elle est connue, sinon le dernier jour travaillé dessus.
  function dateCA(v) {
    if (v.dateLivraison) return v.dateLivraison;
    var e = entreesVideo(v.id);
    if (e.length) return e[e.length - 1].date;
    return v.creeLe ? v.creeLe.slice(0, 10) : U.aujourdhui();
  }

  function ajouterVideo(titre, clientId, prix) {
    var c = client(clientId);
    var v = {
      id: U.id(),
      titre: titre,
      clientId: clientId || null,
      prix: (prix === null || prix === undefined || prix === '') ? (c && c.tarifDefaut ? c.tarifDefaut : null) : Number(prix),
      statut: 'encours',
      dateLivraison: null,
      note: '',
      creeLe: new Date().toISOString()
    };
    marquer(v);
    d.videos.push(v);
    sauver();
    return v;
  }

  // Résolution par titre saisi : on privilégie une vidéo du même client.
  function trouverVideo(titre, clientId) {
    var t = titre.trim().toLowerCase();
    var l = videos();
    var memeClient = l.filter(function (v) {
      return v.titre.toLowerCase() === t && v.clientId === (clientId || null);
    });
    if (memeClient.length) return memeClient[0];
    return l.find(function (v) { return v.titre.toLowerCase() === t; }) || null;
  }

  function videosRecentes(n) {
    return videos().slice()
      .map(function (v) {
        var e = entreesVideo(v.id);
        return { v: v, quand: e.length ? e[e.length - 1].date : v.creeLe.slice(0, 10) };
      })
      .sort(function (a, b) { return b.quand.localeCompare(a.quand); })
      .slice(0, n || 6)
      .map(function (x) { return x.v; });
  }

  /* ------------------------------------------------------------------
   * Finances
   * CA = prix des vidéos (rattachées par dateCA) + revenus divers.
   * Le statut sert au suivi de facturation, pas au calcul du CA.
   * ------------------------------------------------------------------ */

  function videosPeriode(du, au) {
    return videos().filter(function (v) {
      var dt = dateCA(v);
      return dt >= du && dt <= au;
    });
  }
  function caVideos(du, au) {
    return videosPeriode(du, au).reduce(function (s, v) { return s + (v.prix || 0); }, 0);
  }
  function transactionsPeriode(du, au) {
    return transactions().filter(function (t) { return t.date >= du && t.date <= au; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
  }
  function revenusDivers(du, au) {
    return transactionsPeriode(du, au).filter(function (t) { return t.type === 'revenu'; })
      .reduce(function (s, t) { return s + t.montant; }, 0);
  }
  function depenses(du, au) {
    return transactionsPeriode(du, au).filter(function (t) { return t.type === 'depense'; })
      .reduce(function (s, t) { return s + t.montant; }, 0);
  }
  function ca(du, au) { return caVideos(du, au) + revenusDivers(du, au); }

  // Le chiffre honnête : CA divisé par TOUTES les heures travaillées,
  // administratif et prospection compris.
  function tauxReel(du, au) {
    var m = totalMinutes(entreesPeriode(du, au));
    return m > 0 ? ca(du, au) / (m / 60) : null;
  }
  function tauxFacturable(du, au) {
    var m = totalFacturable(entreesPeriode(du, au));
    return m > 0 ? ca(du, au) / (m / 60) : null;
  }

  function minutesClient(id) {
    return totalMinutes(entries().filter(function (e) { return e.clientId === id; }));
  }
  function caClient(id) {
    return videos().filter(function (v) { return v.clientId === id; })
      .reduce(function (s, v) { return s + (v.prix || 0); }, 0) +
      transactions().filter(function (t) { return t.clientId === id && t.type === 'revenu'; })
        .reduce(function (s, t) { return s + t.montant; }, 0);
  }
  function tauxClient(id) {
    var m = minutesClient(id);
    return m > 0 ? caClient(id) / (m / 60) : null;
  }

  // Vidéos prêtes à partir sur une facture, groupées par client.
  function aFacturer() {
    var enAttente = videos().filter(function (v) {
      return (v.prix || 0) > 0 && v.statut !== 'facturee' && v.statut !== 'payee';
    });
    var groupes = {};
    enAttente.forEach(function (v) {
      var k = v.clientId || '__sans';
      (groupes[k] = groupes[k] || []).push(v);
    });
    return Object.keys(groupes).map(function (k) {
      var l = groupes[k].sort(function (a, b) { return dateCA(a).localeCompare(dateCA(b)); });
      return {
        clientId: k === '__sans' ? null : k,
        videos: l,
        total: l.reduce(function (s, v) { return s + v.prix; }, 0),
        minutes: l.reduce(function (s, v) { return s + minutesVideo(v.id); }, 0)
      };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function enAttentePaiement() {
    return videos().filter(function (v) { return v.statut === 'facturee'; })
      .reduce(function (s, v) { return s + (v.prix || 0); }, 0);
  }

  function categorieFin(id) {
    return categoriesFin().find(function (c) { return c.id === id; }) || null;
  }
  function ajouterTransaction(t) {
    t.id = U.id();
    t.creeLe = new Date().toISOString();
    marquer(t);
    d.transactions.push(t);
    sauver();
    return t;
  }
  function supprimerTransaction(id) {
    supprimerEnreg('transactions', id);
  }

  /* ------------------------------------------------------------------
   * Couche jeu — systèmes, quêtes, journal d'expérience
   * Les règles vivent dans js/jeu.js ; ici, seulement l'écriture.
   * ------------------------------------------------------------------ */

  function ajouterSysteme(s) {
    s.id = U.id();
    s.creeLe = new Date().toISOString();
    marquer(s);
    d.systemes.push(s);
    sauver();
    return s;
  }
  function ajouterQuete(q) {
    q.id = U.id();
    q.creeLe = new Date().toISOString();
    marquer(q);
    d.quetes.push(q);
    sauver();
    return q;
  }

  // L'identifiant est fourni par l'appelant, et il est déterministe (voir
  // js/jeu.js). Une ligne déjà présente est donc réécrite, jamais dupliquée —
  // y compris une ligne annulée puis recochée, qu'on relève au lieu d'en
  // empiler une seconde.
  function logXP(id, champs) {
    var r = d.xpLog.find(function (x) { return x.id === id; });
    if (r) {
      Object.assign(r, champs);
      r.supprime = false;
      marquer(r);
    } else {
      r = marquer(Object.assign({ id: id, creeLe: new Date().toISOString() }, champs));
      d.xpLog.push(r);
    }
    sauver();
    return r;
  }
  function annulerXP(id) { return supprimerEnreg('xpLog', id); }

  return {
    get d() { return d; },
    STATUTS: STATUTS, statut: statut,

    // Lectures filtrées : jamais de pierre tombale au-delà de cette frontière.
    entries: entries, videos: videos, clients: clients,
    categories: categories, transactions: transactions, categoriesFin: categoriesFin,
    systemes: systemes, quetes: quetes, xpLog: xpLog,
    // Écritures horodatées.
    marquer: marquer, modifier: modifier, supprimerEnreg: supprimerEnreg,
    toucherSingleton: toucherSingleton, fusionnerAvec: fusionnerAvec,
    charger: charger, sauver: sauver, sauverMaintenant: sauverMaintenant,
    remplacer: remplacer, defaut: defaut,
    client: client, categorie: categorie,
    nomClient: nomClient, nomCategorie: nomCategorie, couleurCategorie: couleurCategorie,
    entreesDuJour: entreesDuJour, entreesPeriode: entreesPeriode,
    totalMinutes: totalMinutes, totalFacturable: totalFacturable,
    repartition: repartition,
    ajouterEntree: ajouterEntree, majEntree: majEntree, supprimerEntree: supprimerEntree,
    ajouterClient: ajouterClient, ajouterCategorie: ajouterCategorie,
    chevauchements: chevauchements, combosFrequents: combosFrequents,
    demarrerChrono: demarrerChrono, arreterChrono: arreterChrono,
    annulerChrono: annulerChrono, chronoEcoule: chronoEcoule, libelleTache: libelleTache,

    video: video, titreVideo: titreVideo, entreesVideo: entreesVideo,
    minutesVideo: minutesVideo, tauxVideo: tauxVideo, dateCA: dateCA,
    ajouterVideo: ajouterVideo, trouverVideo: trouverVideo, videosRecentes: videosRecentes,

    videosPeriode: videosPeriode, caVideos: caVideos,
    transactionsPeriode: transactionsPeriode, revenusDivers: revenusDivers,
    depenses: depenses, ca: ca, tauxReel: tauxReel, tauxFacturable: tauxFacturable,
    minutesClient: minutesClient, caClient: caClient, tauxClient: tauxClient,
    aFacturer: aFacturer, enAttentePaiement: enAttentePaiement,
    categorieFin: categorieFin,
    ajouterTransaction: ajouterTransaction, supprimerTransaction: supprimerTransaction,

    ajouterSysteme: ajouterSysteme, ajouterQuete: ajouterQuete,
    logXP: logXP, annulerXP: annulerXP
  };
})();
