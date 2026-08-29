/* Vue Tableau de bord — l'état des lieux en un coup d'œil. */
var VueDashboard = (function () {

  function stat(label, valeur, sous, couleur) {
    return '<div class="stat">' +
      '<div class="stat-label">' + label + '</div>' +
      '<div class="stat-valeur"' + (couleur ? ' style="color:' + couleur + '"' : '') + '>' + valeur + '</div>' +
      '<div class="stat-sous">' + (sous || '') + '</div>' +
      '</div>';
  }

  function barres(items, libelle, couleur, extra) {
    if (!items.length) return '<div class="vide">Rien à afficher.</div>';
    var max = items[0].minutes || 1;
    return '<div class="barres">' + items.map(function (it) {
      return '<div class="barre-ligne">' +
        '<div class="barre-nom">' + U.esc(libelle(it.id)) + '</div>' +
        '<div class="barre"><div class="barre-plein" style="width:' + (it.minutes / max * 100) + '%;' +
          'background:' + couleur(it.id) + '"></div></div>' +
        '<div class="barre-val">' + U.fmtDuree(it.minutes) + '</div>' +
        (extra ? '<div class="barre-extra">' + extra(it.id) + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function septJours() {
    var jours = [];
    var max = 1;
    for (var i = 6; i >= 0; i--) {
      var d = U.ajouterJours(U.aujourdhui(), -i);
      var m = State.totalMinutes(State.entreesDuJour(d));
      max = Math.max(max, m);
      jours.push({ date: d, minutes: m });
    }
    var cible = State.d.settings.heuresCibleJour * 60;
    max = Math.max(max, cible);
    return '<div class="semaine-graph">' + jours.map(function (j) {
      return '<div class="jour-col" data-action="dash.jour" data-date="' + j.date + '" title="' + U.dateLisible(j.date) + ' — ' + U.fmtDuree(j.minutes) + '">' +
        '<div class="jour-barre"><div class="jour-plein' + (j.minutes >= cible ? ' atteint' : '') + '" style="height:' + (j.minutes / max * 100) + '%"></div></div>' +
        '<div class="jour-lettre">' + U.initialeJour(j.date) + '</div>' +
        '<div class="jour-val">' + (j.minutes ? (j.minutes / 60).toFixed(1).replace('.0', '').replace('.', ',') : '·') + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  // Rappel de la couche jeu. Absent tant que rien n'est créé : un bandeau
  // « niveau 1, 0 XP » ne dit rien à personne. Le module est facultatif — le
  // tableau de bord doit survivre à son absence.
  function progression() {
    if (!window.Jeu || !window.VueQuetes) return '';
    if (!State.systemes().length && !State.quetes().length) return '';
    var r = Jeu.resume();
    var dus = r.reste.slice(0, 4);

    return '<div class="carte">' +
      '<div class="jeu-strip" data-action="nav" data-vue="quetes">' +
        '<div class="jeu-pastille">' + r.niveau.niveau + '</div>' +
        '<div class="jeu-corps">' +
          '<div class="niveau-ligne"><strong>' + r.xp + ' XP</strong>' +
            '<span class="muted">' +
              (r.prevus ? r.faits + ' / ' + r.prevus + ' aujourd\'hui' : 'niveau ' + r.niveau.niveau) +
            '</span></div>' +
          '<div class="barre"><div class="barre-plein" style="width:' + r.niveau.pct + '%"></div></div>' +
        '</div>' +
        (r.aReclamer.length
          ? '<div class="niveau-alerte">' + r.aReclamer.length + ' à réclamer</div>'
          : '') +
      '</div>' +
      (dus.length
        ? '<div class="jeu-reste" style="margin-top:12px">' + dus.map(function (s) {
            return '<button class="chip" data-action="dash.cocher" data-id="' + s.id + '">' +
              '<span class="pastille" style="background:' + s.couleur + '"></span>' +
              U.esc(s.nom) + ' <span class="muted">+' + (s.xp || 10) + '</span></button>';
          }).join('') + '</div>'
        : '') +
      '</div>';
  }

  function accueilVide() {
    return '<div class="carte accueil">' +
      '<h2>Bienvenue.</h2>' +
      '<p>Rien n\'est encore enregistré. La première chose à faire : reporter ta journée d\'aujourd\'hui, comme sur le carnet.</p>' +
      '<p class="muted">Le tableau de bord se remplit tout seul ensuite. Les clients et catégories se créent au fil de l\'eau, ou d\'un coup dans Réglages.</p>' +
      '<button class="btn primaire" data-action="nav" data-vue="temps">Noter ma journée →</button>' +
      '</div>';
  }

  function render() {
    if (!State.entries().length && !State.d.chrono && !State.systemes().length) return accueilVide();

    var auj = U.aujourdhui();
    var lundi = U.debutSemaine(auj);
    var eJour = State.entreesDuJour(auj);
    var eSem = State.entreesPeriode(lundi, auj);
    var eMois = State.entreesPeriode(U.debutMois(auj), auj);

    var tJour = State.totalMinutes(eJour);
    var tSem = State.totalMinutes(eSem);
    var fSem = State.totalFacturable(eSem);
    var tMois = State.totalMinutes(eMois);
    var cibleJour = State.d.settings.heuresCibleJour * 60;
    var cibleSem = State.d.settings.heuresCibleSemaine * 60;

    var dernieres = State.entries().sort(function (a, b) {
      return (b.date + b.debut).localeCompare(a.date + a.debut);
    }).slice(0, 6);

    var duMois = U.debutMois(auj), auMois = auj;
    var caMois = State.ca(duMois, auMois);
    var resMois = caMois - State.depenses(duMois, auMois);
    var tauxMois = State.tauxReel(duMois, auMois);
    var aFact = State.aFacturer().reduce(function (s, g) { return s + g.total; }, 0);
    var nbAFact = State.aFacturer().reduce(function (s, g) { return s + g.videos.length; }, 0);
    var videosMois = State.videosPeriode(duMois, auMois);

    return '' +
      progression() +
      '<div class="stats">' +
        stat("Aujourd'hui", U.fmtDuree(tJour), U.pct(tJour, cibleJour) + '% de l\'objectif') +
        stat('Cette semaine', U.fmtDuree(tSem), U.pct(tSem, cibleSem) + '% de ' + U.fmtDuree(cibleSem)) +
        stat('Facturable', U.pct(fSem, tSem) + '%', U.fmtDuree(fSem) + ' cette semaine', 'var(--vert)') +
        stat('Ce mois', U.fmtHeuresDec(tMois), eMois.length + ' entrées') +
      '</div>' +

      '<div class="stats">' +
        stat('CA du mois', U.argentCourt(caMois), videosMois.length + ' vidéos') +
        stat('Résultat', U.argentCourt(resMois), 'après dépenses', resMois >= 0 ? 'var(--vert)' : 'var(--rouge)') +
        stat('Taux horaire réel', U.taux(tauxMois), 'CA ÷ heures travaillées', 'var(--accent2)') +
        stat('À facturer', U.argentCourt(aFact), nbAFact + ' vidéo' + (nbAFact > 1 ? 's' : '') + ' en attente', aFact > 0 ? 'var(--ambre)' : null) +
      '</div>' +

      '<div class="carte">' +
        '<div class="carte-titre">7 derniers jours</div>' +
        septJours() +
      '</div>' +

      '<div class="colonnes">' +
        '<div class="carte">' +
          '<div class="carte-titre">Par catégorie <span class="muted">— cette semaine</span></div>' +
          barres(State.repartition(eSem, 'categorieId'), State.nomCategorie, State.couleurCategorie) +
        '</div>' +
        '<div class="carte">' +
          '<div class="carte-titre">Par client <span class="muted">— cette semaine</span></div>' +
          barres(State.repartition(eSem, 'clientId'),
            function (id) { return id ? State.nomClient(id) : 'Sans client'; },
            function (id) { var c = State.client(id); return c ? c.couleur : '#4a4f60'; },
            function (id) { return id ? U.taux(State.tauxClient(id)) : '—'; }) +
        '</div>' +
      '</div>' +

      '<div class="carte">' +
        '<div class="carte-titre">Dernières entrées</div>' +
        '<div class="lignes">' + dernieres.map(function (e) {
          return '<div class="ligne compacte">' +
            '<div class="l-heures muted">' + U.esc(U.dateLisible(e.date)) + '</div>' +
            '<div class="l-duree">' + U.fmtDuree(U.duree(e)) + '</div>' +
            '<div class="l-quoi">' +
              '<span class="pastille" style="background:' + State.couleurCategorie(e.categorieId) + '"></span>' +
              U.esc(State.nomCategorie(e.categorieId)) +
              (e.clientId ? '<span class="l-client">' + U.esc(State.nomClient(e.clientId)) + '</span>' : '') +
              (e.videoId ? '<span class="l-video">▸ ' + U.esc(State.titreVideo(e.videoId) || '?') + '</span>' : '') +
              (e.note ? '<span class="l-note">' + U.esc(e.note) + '</span>' : '') +
            '</div>' +
            '</div>';
        }).join('') + '</div>' +
      '</div>';
  }

  App.actions['dash.jour'] = function (el) {
    VueTemps.date = el.dataset.date;
    App.aller('temps');
  };

  // Cocher une habitude depuis le tableau de bord : le geste ne vaut que s'il
  // ne demande pas de changer d'onglet.
  App.actions['dash.cocher'] = function (el) {
    var s = State.systemes().find(function (x) { return x.id === el.dataset.id; });
    if (!s) return;
    Jeu.basculer(s, U.aujourdhui());
    App.render();
    App.message('+' + (s.xp || 10) + ' XP', 'ok');
  };

  return { titre: 'Tableau de bord', render: render };
})();
