/* Couche jeu : expérience, niveaux, systèmes (habitudes) et quêtes (objectifs).
 *
 * Deux décisions portent tout le module.
 *
 * 1. UNE VALIDATION EST UN ENREGISTREMENT, pas une case cochée dans l'objet
 *    système. Cocher écrit une ligne dans xpLog ; décocher la marque supprimée.
 *    Si les validations vivaient dans le système lui-même, deux appareils qui
 *    cochent le même jour s'écraseraient l'un l'autre : la fusion départage
 *    enregistrement par enregistrement, et le système ne serait qu'un seul
 *    enregistrement.
 *
 * 2. CES LIGNES ONT UN IDENTIFIANT DÉTERMINISTE — « s:<systeme>:<date> ».
 *    Le même geste sur deux appareils produit le même identifiant, et la
 *    fusion les réduit à une ligne unique. Sans ça, cocher hors ligne des deux
 *    côtés donnerait deux fois l'expérience, sans moyen de s'en apercevoir.
 *
 * Rien n'est calculé d'avance et stocké : séries, progressions et totaux se
 * déduisent du journal. Un total stocké finit toujours par mentir.
 */
var Jeu = (function () {

  /* --- Niveaux ---------------------------------------------------------
   * Seuil(n) = PAS × n × (n−1) : chaque niveau demande 50 XP de plus que le
   * précédent. Niveau 2 à 50, niveau 3 à 150, niveau 5 à 500. Progression
   * rapide au début, jamais bloquante ensuite.
   */
  var PAS = 25;

  function seuil(n) { return PAS * n * (n - 1); }

  function niveau(xp) {
    var n = 1;
    while (seuil(n + 1) <= xp) n++;
    return n;
  }

  function progresNiveau(xp) {
    var n = niveau(xp);
    var bas = seuil(n), haut = seuil(n + 1);
    return {
      niveau: n, bas: bas, haut: haut,
      dans: xp - bas, requis: haut - bas,
      pct: Math.round((xp - bas) / (haut - bas) * 100)
    };
  }

  function xpTotal() {
    return State.xpLog().reduce(function (s, l) { return s + (l.xp || 0); }, 0);
  }
  function xpPeriode(du, au) {
    return State.xpLog().reduce(function (s, l) {
      return (l.date >= du && l.date <= au) ? s + (l.xp || 0) : s;
    }, 0);
  }

  /* --- Systèmes -------------------------------------------------------- */

  // 1 = lundi … 7 = dimanche. getDay() rend 0 le dimanche : on le ramène à 7
  // pour que l'ordre des jours suive la semaine telle qu'on la lit.
  function jourSemaine(date) {
    var j = U.depuisISO(date).getDay();
    return j === 0 ? 7 : j;
  }
  var LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  function lettreJour(n) { return LETTRES[n - 1]; }

  function actifs() {
    return State.systemes().filter(function (s) { return !s.archive; });
  }

  // Un système à cadence hebdomadaire n'est prévu aucun jour en particulier :
  // il l'est tous les jours, jusqu'à ce que le compte de la semaine soit fait.
  function prevu(s, date) {
    if (s.cadence === 'semaine') return true;
    if (!s.jours || !s.jours.length) return true;
    return s.jours.indexOf(jourSemaine(date)) >= 0;
  }

  function duJour(date) {
    return actifs().filter(function (s) { return prevu(s, date); });
  }

  function clefSysteme(s, date) { return 's:' + s.id + ':' + date; }

  // Un système peut être adossé à une mesure : « Pompes ≥ 50 » se valide alors
  // tout seul dès que le relevé du jour passe le seuil. Rien à cocher, et la
  // série se tient d'elle-même.
  function lie(s) { return !!(s && s.mesureId); }

  function fait(s, date) {
    if (lie(s)) {
      var m = State.mesure(s.mesureId);
      return !!m && valeurJour(m, date) >= (s.seuil || 1);
    }
    var id = clefSysteme(s, date);
    return State.xpLog().some(function (l) { return l.id === id; });
  }

  // Renvoie le nouvel état de la case. Sans effet sur un système adossé à une
  // mesure : c'est le relevé qui décide, pas la case.
  function basculer(s, date) {
    if (lie(s)) return fait(s, date);
    var id = clefSysteme(s, date);
    if (fait(s, date)) { State.annulerXP(id); return false; }
    State.logXP(id, { type: 'systeme', refId: s.id, date: date, xp: s.xp || 10 });
    return true;
  }

  /* --- Mesures ---------------------------------------------------------
   * Une mesure cumulative additionne les relevés du jour (trois séries de
   * pompes) ; une mesure de relevé garde le dernier (un poids se constate, il
   * ne s'additionne pas).
   */

  function valeurJour(m, date) {
    var l = State.relevesJour(m.id, date);
    if (!l.length) return 0;
    if (m.cumul === false) return l[l.length - 1].valeur;
    return l.reduce(function (s, r) { return s + (r.valeur || 0); }, 0);
  }

  function joursEntre(du, au) {
    return Math.max(1, Math.round((U.depuisISO(au) - U.depuisISO(du)) / 86400000) + 1);
  }

  function totalPeriode(m, du, au) {
    if (m.cumul === false) {
      // Additionner des poids n'aurait aucun sens : on rend la dernière valeur
      // connue de la période.
      var l = State.relevesPeriode(m.id, du, au)
        .sort(function (a, b) { return (a.date + (a.creeLe || '')).localeCompare(b.date + (b.creeLe || '')); });
      return l.length ? l[l.length - 1].valeur : 0;
    }
    return State.relevesPeriode(m.id, du, au)
      .reduce(function (s, r) { return s + (r.valeur || 0); }, 0);
  }

  // Moyenne sur TOUS les jours de la période, jours vides compris — la même
  // convention que la Synthèse, pour qu'un chiffre ne veuille pas dire deux
  // choses selon l'écran où on le lit.
  function moyenneJour(m, du, au) {
    if (m.cumul === false) return totalPeriode(m, du, au);
    return totalPeriode(m, du, au) / joursEntre(du, au);
  }

  function joursActifs(m, du, au) {
    var vus = {};
    State.relevesPeriode(m.id, du, au).forEach(function (r) { vus[r.date] = true; });
    return Object.keys(vus).length;
  }

  function meilleurJour(m, du, au) {
    var parJour = {};
    State.relevesPeriode(m.id, du, au).forEach(function (r) {
      parJour[r.date] = m.cumul === false ? r.valeur : (parJour[r.date] || 0) + (r.valeur || 0);
    });
    var best = null;
    Object.keys(parJour).forEach(function (d) {
      if (!best || parJour[d] > best.valeur) best = { date: d, valeur: parJour[d] };
    });
    return best;
  }

  function serieMesure(m, du, au) {
    var pts = [], d = du, garde = 0;
    while (d <= au && garde++ < 400) {
      pts.push({ date: d, valeur: valeurJour(m, d) });
      d = U.ajouterJours(d, 1);
    }
    return pts;
  }

  function fmtMesure(m, v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var arrondi = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
    return String(arrondi).replace('.', ',') + (m.unite ? ' ' + m.unite : '');
  }

  /* Noter une valeur, puis remettre d'accord l'expérience des systèmes adossés
   * à cette mesure. L'écriture du journal se fait ici, au moment du geste, et
   * non pendant un rendu : un effet de bord invisible serait ingérable. */
  function noter(m, valeur, date) {
    date = date || U.aujourdhui();
    var r = State.ajouterReleve(m.id, date, valeur);
    reconcilier(m.id, date);
    return r;
  }

  function retirerReleve(id, mesureId, date) {
    State.supprimerReleve(id);
    reconcilier(mesureId, date);
  }

  function reconcilier(mesureId, date) {
    actifs().forEach(function (s) {
      if (s.mesureId !== mesureId) return;
      var id = clefSysteme(s, date);
      var atteint = fait(s, date);
      var deja = State.xpLog().some(function (l) { return l.id === id; });
      if (atteint && !deja) {
        State.logXP(id, { type: 'systeme', refId: s.id, date: date, xp: s.xp || 10 });
      } else if (!atteint && deja) {
        State.annulerXP(id);
      }
    });
  }

  function faitsSemaine(s, date) {
    var lundi = U.debutSemaine(date), dimanche = U.ajouterJours(lundi, 6);
    return State.xpLog().filter(function (l) {
      return l.type === 'systeme' && l.refId === s.id &&
             l.date >= lundi && l.date <= dimanche;
    }).length;
  }

  function dateCreation(r) {
    return (r.creeLe || '2020-01-01').slice(0, 10);
  }

  // Borne du parcours d'une série. La date de création ne suffit pas : la
  // grille des sept derniers jours permet de rattraper des jours oubliés, y
  // compris antérieurs à la création du système. Un système créé ce matin puis
  // rempli sur la semaine écoulée doit afficher sa série, pas zéro.
  function premierJour(s) {
    var mini = dateCreation(s);
    State.xpLog().forEach(function (l) {
      if (l.type === 'systeme' && l.refId === s.id && l.date < mini) mini = l.date;
    });
    return mini;
  }

  /* Série : jours prévus consécutifs validés, en remontant depuis aujourd'hui.
   *
   * Deux ménagements, sans lesquels un compteur de série devient un objet de
   * culpabilité qu'on finit par ignorer :
   *   — la journée en cours ne compte jamais comme manquée, elle n'est pas
   *     finie ;
   *   — un jour manqué est pardonné une fois (le joker). Deux d'affilée
   *     cassent la série : au-delà, ce n'est plus un accident.
   * Les jours non prévus sont traversés sans rien compter ni rien casser :
   * c'est ce qui rend crédible une habitude du lundi au vendredi.
   */
  function serie(s) {
    if (s.cadence === 'semaine') return serieSemaine(s);
    var auj = U.aujourdhui();
    var debut = premierJour(s);
    var d = auj, n = 0, joker = true, garde = 0;
    while (d >= debut && garde++ < 800) {
      if (prevu(s, d)) {
        if (fait(s, d)) n++;
        else if (d === auj) { /* journée en cours : ni compte ni casse */ }
        else if (joker) joker = false;
        else break;
      }
      d = U.ajouterJours(d, -1);
    }
    return n;
  }

  function serieSemaine(s) {
    var courante = U.debutSemaine(U.aujourdhui());
    var debut = U.debutSemaine(premierJour(s));
    var sem = courante, n = 0, joker = true, garde = 0;
    while (sem >= debut && garde++ < 400) {
      if (faitsSemaine(s, sem) >= (s.cible || 1)) n++;
      else if (sem === courante) { /* semaine en cours */ }
      else if (joker) joker = false;
      else break;
      sem = U.ajouterJours(sem, -7);
    }
    return n;
  }

  // Ce qu'il reste à faire aujourd'hui : le seul chiffre qui appelle une action.
  function resteAujourdhui() {
    var auj = U.aujourdhui();
    return duJour(auj).filter(function (s) {
      if (s.cadence === 'semaine') {
        return !fait(s, auj) && faitsSemaine(s, auj) < (s.cible || 1);
      }
      return !fait(s, auj);
    });
  }

  /* --- Quêtes ----------------------------------------------------------
   * Une quête se mesure sur les données déjà saisies plutôt que sur un
   * compteur à tenir à la main. C'est la seule façon qu'elle survive à
   * quinze jours : le suivi ne demande aucun geste supplémentaire.
   */

  var MESURES = [
    { id: 'heuresFact', nom: 'Heures facturables', unite: 'h' },
    { id: 'heures', nom: 'Heures travaillées', unite: 'h' },
    { id: 'ca', nom: "Chiffre d'affaires", unite: '€' },
    { id: 'videos', nom: 'Vidéos livrées', unite: '' },
    { id: 'entrees', nom: 'Séances enregistrées', unite: '' },
    { id: 'taux', nom: 'Taux horaire réel', unite: '€/h' },
    { id: 'mesure', nom: 'Une grandeur suivie', unite: '' },
    { id: 'manuel', nom: 'Compteur à la main', unite: '' }
  ];
  function mesure(id) {
    return MESURES.find(function (m) { return m.id === id; }) || MESURES[0];
  }

  /* Traduit le choix du formulaire en champs de la quête. Une grandeur suivie
   * s'écrit « m:<mesure>:<agrégat> » ; les identifiants étant en base 36, le
   * deux-points ne peut pas s'y trouver et la découpe est sans ambiguïté.
   *
   * Cette conversion vit ici plutôt que dans la vue parce que c'est une règle,
   * pas un affichage — et parce qu'un défaut dans la vue échappe aux tests,
   * ce qui s'est déjà vérifié.
   */
  function choixQuete(valeur) {
    if (String(valeur).indexOf('m:') !== 0) {
      return { mesure: valeur, mesureId: null, agregat: null };
    }
    var p = String(valeur).split(':');
    return { mesure: 'mesure', mesureId: p[1] || null, agregat: p[2] === 'moyenne' ? 'moyenne' : 'total' };
  }

  // Intitulé lisible de ce qu'une quête mesure, grandeurs suivies comprises.
  function libelleMesure(q) {
    if (q.mesure !== 'mesure') return mesure(q.mesure).nom;
    var m = State.mesure(q.mesureId);
    if (!m) return 'grandeur supprimée';
    return m.nom + (q.agregat === 'moyenne' ? ' — moyenne par jour' : ' — total');
  }

  var PERIODES = [
    { id: 'semaine', nom: 'Chaque semaine' },
    { id: 'mois', nom: 'Chaque mois' },
    { id: 'unique', nom: 'Objectif unique' }
  ];

  // La clé de période sert d'identifiant de réclamation : une quête
  // hebdomadaire se rejoue chaque semaine, et rapporte son XP chaque semaine.
  function bornes(q, date) {
    date = date || U.aujourdhui();
    if (q.periode === 'semaine') {
      var lundi = U.debutSemaine(date);
      return { du: lundi, au: U.ajouterJours(lundi, 6), cle: 'S' + lundi,
               libelle: 'semaine du ' + U.dateLisible(lundi) };
    }
    if (q.periode === 'mois') {
      var m = U.mois(date);
      return { du: U.premierDuMois(m), au: U.dernierDuMois(m), cle: m,
               libelle: U.moisLisible(m) };
    }
    var d = q.du || dateCreation(q);
    return { du: d, au: '9999-12-31', cle: 'U', libelle: 'depuis le ' + U.dateLisible(d) };
  }

  function retient(q, e) {
    if (q.clientId && e.clientId !== q.clientId) return false;
    if (q.categorieId && e.categorieId !== q.categorieId) return false;
    return true;
  }

  /* Compteur manuel : une valeur PAR PÉRIODE, pas un total qui court.
   *
   * Un compteur unique ignorait la période : une quête hebdomadaire une fois
   * dépassée restait dépassée pour toujours, et rapportait son expérience
   * chaque semaine sans qu'on ait rien fait. `compteurs` est indexé par la clé
   * de période, la même qui sert à la réclamation.
   */
  function compteurCourant(q) {
    var c = q.compteurs || {};
    var v = c[bornes(q).cle];
    if (v !== undefined) return v;
    // Ancien champ unique : il n'a de sens que pour un objectif non répété.
    return q.periode === 'unique' ? (q.compteur || 0) : 0;
  }

  function valeur(q) {
    if (q.mesure === 'manuel') return compteurCourant(q);
    var b = bornes(q);
    var entrees = State.entreesPeriode(b.du, b.au).filter(function (e) { return retient(q, e); });

    switch (q.mesure) {
      case 'heures': return State.totalMinutes(entrees) / 60;
      case 'heuresFact': return State.totalFacturable(entrees) / 60;
      case 'entrees': return entrees.length;
      case 'videos':
        return State.videosPeriode(b.du, b.au).filter(function (v) {
          return !q.clientId || v.clientId === q.clientId;
        }).length;
      case 'ca': return caPeriode(q, b);
      case 'mesure': {
        var m = State.mesure(q.mesureId);
        if (!m) return 0;
        // Un objectif unique n'a pas de fin : la moyenne se calcule jusqu'à
        // aujourd'hui, sinon on diviserait par des milliers de jours à venir.
        var fin = b.au > U.aujourdhui() ? U.aujourdhui() : b.au;
        return q.agregat === 'moyenne' ? moyenneJour(m, b.du, fin) : totalPeriode(m, b.du, fin);
      }
      case 'taux': {
        // Le taux se mesure sur toutes les heures de la période, filtre client
        // compris : un taux calculé sur une sélection d'heures se flatte.
        var toutes = State.entreesPeriode(b.du, b.au).filter(function (e) {
          return !q.clientId || e.clientId === q.clientId;
        });
        var min = State.totalMinutes(toutes);
        return min > 0 ? caPeriode(q, b) / (min / 60) : 0;
      }
    }
    return 0;
  }

  function caPeriode(q, b) {
    if (!q.clientId) return State.ca(b.du, b.au);
    var vid = State.videosPeriode(b.du, b.au)
      .filter(function (v) { return v.clientId === q.clientId; })
      .reduce(function (s, v) { return s + (v.prix || 0); }, 0);
    var div = State.transactionsPeriode(b.du, b.au)
      .filter(function (t) { return t.type === 'revenu' && t.clientId === q.clientId; })
      .reduce(function (s, t) { return s + t.montant; }, 0);
    return vid + div;
  }

  function clefQuete(q) { return 'q:' + q.id + ':' + bornes(q).cle; }

  function reclamee(q) {
    var id = clefQuete(q);
    return State.xpLog().some(function (l) { return l.id === id; });
  }

  function progres(q) {
    var v = valeur(q);
    var c = q.cible || 1;
    return {
      valeur: v, cible: c,
      pct: Math.max(0, Math.min(100, Math.round(v / c * 100))),
      atteint: v >= c,
      reclamee: reclamee(q)
    };
  }

  // La réclamation est un geste, pas un effet de bord du rendu : l'XP tombe
  // quand on la prend. L'identifiant déterministe rend l'opération sans risque
  // même réclamée deux fois, sur deux appareils, hors ligne.
  function reclamer(q) {
    var p = progres(q);
    if (!p.atteint || p.reclamee) return null;
    return State.logXP(clefQuete(q), {
      type: 'quete', refId: q.id, date: U.aujourdhui(), xp: q.xp || 50
    });
  }

  function enCours() {
    return State.quetes().filter(function (q) { return !q.archive; });
  }

  // Formate une valeur mesurée dans l'unité de sa mesure.
  function fmt(mes, v, q) {
    if (mes === 'ca') return U.argentCourt(v);
    if (mes === 'taux') return U.taux(v);
    if (mes === 'heures' || mes === 'heuresFact') {
      return (Math.round(v * 10) / 10).toString().replace('.', ',') + ' h';
    }
    if (mes === 'mesure' && q) {
      var m = State.mesure(q.mesureId);
      if (m) return fmtMesure(m, v);
    }
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }

  /* --- Vue d'ensemble, pour le tableau de bord --- */

  function resume() {
    var xp = xpTotal();
    var auj = U.aujourdhui();
    var prevus = duJour(auj);
    var reste = resteAujourdhui();
    var pretes = enCours().filter(function (q) {
      var p = progres(q);
      return p.atteint && !p.reclamee;
    });
    return {
      xp: xp,
      niveau: progresNiveau(xp),
      xpSemaine: xpPeriode(U.debutSemaine(auj), auj),
      prevus: prevus.length,
      faits: prevus.length - reste.length,
      reste: reste,
      aReclamer: pretes
    };
  }

  return {
    PAS: PAS, seuil: seuil, niveau: niveau, progresNiveau: progresNiveau,
    xpTotal: xpTotal, xpPeriode: xpPeriode,

    MESURES: MESURES, PERIODES: PERIODES, mesure: mesure,
    lettreJour: lettreJour, jourSemaine: jourSemaine,

    actifs: actifs, prevu: prevu, duJour: duJour, fait: fait, basculer: basculer,
    faitsSemaine: faitsSemaine, serie: serie, resteAujourdhui: resteAujourdhui,
    clefSysteme: clefSysteme, lie: lie,

    valeurJour: valeurJour, totalPeriode: totalPeriode, moyenneJour: moyenneJour,
    joursActifs: joursActifs, meilleurJour: meilleurJour, serieMesure: serieMesure,
    joursEntre: joursEntre, fmtMesure: fmtMesure, libelleMesure: libelleMesure,
    choixQuete: choixQuete,
    noter: noter, retirerReleve: retirerReleve, reconcilier: reconcilier,

    enCours: enCours, bornes: bornes, valeur: valeur, progres: progres,
    reclamer: reclamer, clefQuete: clefQuete, fmt: fmt,
    compteurCourant: compteurCourant,

    resume: resume
  };
})();
