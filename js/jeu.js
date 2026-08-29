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

  function fait(s, date) {
    var id = clefSysteme(s, date);
    return State.xpLog().some(function (l) { return l.id === id; });
  }

  // Renvoie le nouvel état de la case.
  function basculer(s, date) {
    var id = clefSysteme(s, date);
    if (fait(s, date)) { State.annulerXP(id); return false; }
    State.logXP(id, { type: 'systeme', refId: s.id, date: date, xp: s.xp || 10 });
    return true;
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
    { id: 'manuel', nom: 'Compteur à la main', unite: '' }
  ];
  function mesure(id) {
    return MESURES.find(function (m) { return m.id === id; }) || MESURES[0];
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

  function valeur(q) {
    if (q.mesure === 'manuel') return q.compteur || 0;
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
  function fmt(mes, v) {
    if (mes === 'ca') return U.argentCourt(v);
    if (mes === 'taux') return U.taux(v);
    if (mes === 'heures' || mes === 'heuresFact') {
      return (Math.round(v * 10) / 10).toString().replace('.', ',') + ' h';
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
    clefSysteme: clefSysteme,

    enCours: enCours, bornes: bornes, valeur: valeur, progres: progres,
    reclamer: reclamer, clefQuete: clefQuete, fmt: fmt,

    resume: resume
  };
})();
