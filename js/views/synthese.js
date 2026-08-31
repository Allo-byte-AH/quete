/* Vue Analyse — tableaux de suivi et taux horaire sous conditions.
 *
 * Le principe : tu coches et décoches, tout se recalcule, et le taux de
 * référence (toutes heures comptées) reste affiché à côté. Un outil qui ne
 * montrerait que le chiffre filtré aiderait surtout à se mentir.
 */
var VueSynthese = (function () {
  var CLE = 'quete.analyse';

  // `argent: true` marque les colonnes qui n'ont aucun sens hors d'une analyse
  // de revenu — le prix d'une vidéo n'est imputable ni au derush ni au montage,
  // et encore moins au temps passé à déjeuner.
  var COLONNES = [
    { id: 'heures', nom: 'Heures', val: function (l) { return U.fmtDuree(l.heures); }, tri: function (l) { return l.heures; } },
    { id: 'part', nom: '% du temps', val: function (l) { return l.part === null ? '—' : Math.round(l.part * 100) + ' %'; }, tri: function (l) { return l.part || 0; } },
    { id: 'moyJour', nom: 'Moy./jour', val: function (l) { return l.moyJour === null ? '—' : U.fmtDuree(l.moyJour); }, tri: function (l) { return l.moyJour || 0; } },
    { id: 'moySeance', nom: 'Moy./séance', val: function (l) { return l.moySeance === null ? '—' : U.fmtDuree(l.moySeance); }, tri: function (l) { return l.moySeance || 0; } },
    { id: 'nbEntrees', nom: 'Séances', val: function (l) { return l.nbEntrees || '—'; }, tri: function (l) { return l.nbEntrees; } },
    { id: 'heuresComptees', nom: 'Comptées', val: function (l) { return U.fmtDuree(l.heuresComptees); }, tri: function (l) { return l.heuresComptees; } },
    { id: 'ca', nom: 'CA', argent: true, val: function (l) { return U.argentCourt(l.ca); }, tri: function (l) { return l.ca; } },
    { id: 'taux', nom: 'Taux', argent: true, fort: true, val: function (l) { return U.taux(l.taux); }, tri: function (l) { return l.taux === null ? -1 : l.taux; } },
    { id: 'partFacturable', nom: '% fact.', val: function (l) { return l.partFacturable === null ? '—' : Math.round(l.partFacturable * 100) + ' %'; }, tri: function (l) { return l.partFacturable || 0; } },
    { id: 'nbVideos', nom: 'Vidéos', argent: true, val: function (l) { return l.nbVideos || '—'; }, tri: function (l) { return l.nbVideos; } }
  ];

  var PORTEES = [
    { id: 'pro', nom: 'Pro', aide: 'le travail seul — comme avant' },
    { id: 'perso', nom: 'Perso', aide: 'le temps personnel seul' },
    { id: 'tout', nom: 'Tout', aide: 'la journée entière' }
  ];

  var f = null;
  // Deux jeux de colonnes : les mêmes cases ne conviennent pas à une analyse de
  // revenu et à une analyse de temps. Chacun garde sa mémoire.
  var colonnes = null;
  var colonnesTemps = null;
  var tri = { id: 'taux', sens: -1 };
  var ouverts = {};
  var panneau = false;

  function modeTemps() { return f.groupement === 'categorie'; }
  function jeuColonnes() { return modeTemps() ? colonnesTemps : colonnes; }

  /* --- Préférences : par appareil, hors de l'état synchronisé.
     C'est un réglage d'affichage, pas une donnée. --- */

  function init() {
    if (f) return;
    f = Synthese.filtresParDefaut();
    colonnes = { heures: true, part: false, moyJour: false, moySeance: false, nbEntrees: false,
                 heuresComptees: false, ca: true, taux: true, partFacturable: false, nbVideos: true };
    colonnesTemps = { heures: true, part: true, moyJour: true, moySeance: true, nbEntrees: true,
                      heuresComptees: false, ca: false, taux: false, partFacturable: false, nbVideos: false };
    tri = triParDefaut(f.groupement);
    try {
      var brut = JSON.parse(Local.lire(CLE) || 'null');
      if (brut) {
        Object.assign(f, brut.f || {});
        Object.assign(colonnes, brut.colonnes || {});
        Object.assign(colonnesTemps, brut.colonnesTemps || {});
        tri = brut.tri || tri;
      }
    } catch (e) { /* préférences illisibles : on garde les valeurs par défaut */ }
    if (!f.portee) f.portee = 'pro';
  }
  function persister() {
    try {
      Local.ecrire(CLE, JSON.stringify({ f: f, colonnes: colonnes, colonnesTemps: colonnesTemps, tri: tri }));
    } catch (e) {}
  }

  /* --- Fragments --- */

  function cases(groupe, items, selection, toutLabel) {
    var actives = selection === null ? null : new Set(selection);
    return '<div class="grp">' +
      '<div class="grp-titre">' + toutLabel +
        '<span class="grp-liens">' +
          '<button class="lien" data-action="an.tout" data-groupe="' + groupe + '">tout</button>' +
          '<button class="lien" data-action="an.rien" data-groupe="' + groupe + '">rien</button>' +
        '</span>' +
      '</div>' +
      '<div class="grp-cases">' + items.map(function (it) {
        var coche = !actives || actives.has(it.id);
        return '<label class="case-item' + (coche ? '' : ' off') + '">' +
          '<input type="checkbox"' + (coche ? ' checked' : '') +
            ' data-change="an.basculer" data-groupe="' + groupe + '" data-id="' + it.id + '">' +
          (it.couleur ? '<span class="pastille" style="background:' + it.couleur + '"></span>' : '') +
          U.esc(it.nom) + '</label>';
      }).join('') + '</div></div>';
  }

  function barre() {
    var raccourcis = [
      { id: 'mois', nom: 'Ce mois' },
      { id: '3mois', nom: '3 mois' },
      { id: '6mois', nom: '6 mois' },
      { id: 'annee', nom: 'Année' },
      { id: 'tout', nom: 'Tout' }
    ];
    return '<div class="carte an-barre">' +
      '<div class="an-periode">' +
        '<label class="champ-inline"><span>Du</span><input type="date" value="' + f.du + '" data-change="an.du"></label>' +
        '<label class="champ-inline"><span>au</span><input type="date" value="' + f.au + '" data-change="an.au"></label>' +
        '<div class="chips">' + raccourcis.map(function (r) {
          return '<button class="chip" data-action="an.periode" data-id="' + r.id + '">' + r.nom + '</button>';
        }).join('') + '</div>' +
        // La portée décide de ce qu'on regarde : le travail, la vie, ou les deux.
        // « Pro » par défaut, pour que noter ses repas ne change aucun chiffre.
        '<div class="segmente portee">' + PORTEES.map(function (p) {
          return '<button class="seg' + (f.portee === p.id ? ' actif' : '') +
            '" data-action="an.portee" data-id="' + p.id + '" title="' + U.esc(p.aide) + '">' +
            p.nom + '</button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="an-outils">' +
        // Les libellés ne tiennent pas côte à côte sur un téléphone : la forme
        // courte prend le relais, comme dans la navigation.
        '<div class="segmente">' + [
          { id: 'client', nom: 'client' },
          { id: 'video', nom: 'vidéo' },
          { id: 'categorie', nom: 'tâche' },
          { id: 'semaine', nom: 'semaine' },
          { id: 'mois', nom: 'mois' }
        ].map(function (g) {
          return '<button class="seg' + (f.groupement === g.id ? ' actif' : '') +
            '" data-action="an.groupement" data-id="' + g.id + '">' +
            '<span class="long">Par ' + g.nom + '</span>' +
            '<span class="court">' + g.nom.charAt(0).toUpperCase() + g.nom.slice(1) + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<button class="btn' + (panneau ? ' primaire' : '') + '" data-action="an.panneau">' +
          (panneau ? '▾' : '▸') + ' Filtres' + (resume() ? ' · ' + resume() : '') + '</button>' +
        '<button class="btn mini" data-action="an.copier" title="Copier le tableau au format tableur">⧉ Copier</button>' +
      '</div>' +
      (panneau ? panneauFiltres() : '') +
      '</div>';
  }

  function resume() {
    var bouts = [];
    if (f.categories) bouts.push(f.categories.length + ' cat.');
    if (f.clients) bouts.push(f.clients.length + ' client(s)');
    if (f.statuts) bouts.push(f.statuts.length + ' statut(s)');
    return bouts.join(', ');
  }

  function panneauFiltres() {
    var cats = State.categories().filter(function (c) { return !c.archive; });
    var cls = State.clients().filter(function (c) { return !c.archive; })
      .concat([{ id: Synthese.SANS, nom: 'Sans client', couleur: '#4a4f60' }]);

    return '<div class="an-panneau">' +
      '<div class="an-prereglages">' +
        '<span class="muted">Préréglages :</span>' +
        '<button class="chip" data-action="an.preset" data-id="tout">Tout compté</button>' +
        '<button class="chip" data-action="an.preset" data-id="facturable">Heures facturables seulement</button>' +
      '</div>' +
      '<div class="an-groupes">' +
        cases('categories', cats, f.categories, 'Heures comptées dans le taux') +
        cases('clients', cls, f.clients, 'Périmètre — clients') +
        cases('statuts', State.STATUTS, f.statuts, 'Périmètre — statuts de vidéo') +
        cases('colonnes', colonnesPossibles(),
              Object.keys(jeuColonnes()).filter(function (k) { return jeuColonnes()[k]; }),
              'Colonnes affichées') +
      '</div>' +
      '<p class="aide">Décocher une catégorie la retire du <strong>dénominateur</strong> : ' +
      'ses heures restent visibles dans la colonne Heures, mais ne divisent plus le CA.</p>' +
      '</div>';
  }

  // En portée personnelle il n'y a ni chiffre d'affaires ni taux horaire :
  // afficher « — » quatre fois ne renseignerait personne. Le bandeau parle
  // alors de temps, ce qui est précisément ce qu'on est venu voir.
  function bandeauTemps(r) {
    var t = r.total;
    function bloc(label, valeur, sous, couleur) {
      return '<div class="stat"><div class="stat-label">' + label + '</div>' +
        '<div class="stat-valeur"' + (couleur ? ' style="color:' + couleur + '"' : '') + '>' + valeur + '</div>' +
        '<div class="stat-sous">' + sous + '</div></div>';
    }
    return '<div class="stats">' +
      '<div class="stat grand">' +
        '<div class="stat-label">Temps total</div>' +
        '<div class="stat-valeur" style="color:var(--accent2)">' + U.fmtDuree(t.heures) + '</div>' +
        '<div class="stat-sous">sur ' + r.jours + ' jour' + (r.jours > 1 ? 's' : '') + '</div>' +
      '</div>' +
      bloc('Moyenne par jour', t.moyJour === null ? '—' : U.fmtDuree(t.moyJour), 'jours vides compris') +
      bloc('Séances', t.nbEntrees || '—', 'entrées notées') +
      bloc('Moyenne par séance', t.moySeance === null ? '—' : U.fmtDuree(t.moySeance), 'durée typique') +
      '</div>';
  }

  function bandeau(r) {
    if (f.portee === 'perso') return bandeauTemps(r);
    var t = r.total;
    var ecart = (t.taux !== null && t.tauxReference !== null) ? t.taux - t.tauxReference : null;
    var filtre = !!f.categories;

    return '<div class="stats">' +
      '<div class="stat grand">' +
        '<div class="stat-label">Taux horaire' + (filtre ? ' — sous tes filtres' : '') + '</div>' +
        '<div class="stat-valeur" style="color:var(--accent2)">' + U.taux(t.taux) + '</div>' +
        '<div class="stat-sous">' + U.fmtDuree(t.heuresComptees) + ' comptées sur ' + U.fmtDuree(t.heures) + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="stat-label">Tout compté</div>' +
        '<div class="stat-valeur">' + U.taux(t.tauxReference) + '</div>' +
        '<div class="stat-sous">' +
          (ecart === null || Math.abs(ecart) < 0.5
            ? 'référence honnête'
            : '<span class="ecart">' + (ecart > 0 ? '+' : '−') + U.taux(Math.abs(ecart)) + '</span> d\'écart') +
        '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="stat-label">Chiffre d\'affaires</div>' +
        '<div class="stat-valeur">' + U.argentCourt(t.ca) + '</div>' +
        '<div class="stat-sous">' + t.nbVideos + ' vidéo' + (t.nbVideos > 1 ? 's' : '') + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="stat-label">Part facturable</div>' +
        '<div class="stat-valeur">' + (t.partFacturable === null ? '—' : Math.round(t.partFacturable * 100) + ' %') + '</div>' +
        '<div class="stat-sous">' + t.nbEntrees + ' entrées</div>' +
      '</div>' +
      '</div>';
  }

  /* --- Courbe ---
   * Deux tracés : le taux sous filtres en plein, le taux toutes heures comptées
   * en pointillé. L'écart entre les deux, c'est le coût du temps non facturable.
   */

  function courbe(r) {
    var pts = r.serie.points;
    if (!pts.length) return '';

    // En portée personnelle, la courbe suit le temps et non le taux : un seul
    // tracé, et pas de référence à laquelle se comparer.
    var enTemps = f.portee === 'perso';
    var L = 1000, H = 250, gx = 52, gd = 14, gh = 18, gb = 34;
    var max = 0;
    pts.forEach(function (p) {
      max = enTemps ? Math.max(max, p.heures || 0)
                    : Math.max(max, p.taux || 0, p.tauxReference || 0);
    });
    if (max <= 0) return '<div class="carte"><div class="carte-titre">' +
      (enTemps ? 'Évolution du temps' : 'Évolution du taux') + '</div>' +
      '<div class="vide">' + (enTemps ? 'Aucun temps noté sur la période.' : 'Aucun chiffre d\'affaires sur la période.') + '</div></div>';
    max = enTemps ? Math.ceil(max / 60) * 60 : Math.ceil(max / 20) * 20;

    var fmtAxe = enTemps
      ? function (v) { return Math.round(v / 60) + ' h'; }
      : function (v) { return Math.round(v); };
    var fmtPoint = enTemps ? U.fmtDuree : U.taux;

    var x = function (i) { return pts.length === 1 ? (gx + (L - gx - gd) / 2) : gx + i * (L - gx - gd) / (pts.length - 1); };
    var y = function (v) { return gh + (1 - (v || 0) / max) * (H - gh - gb); };

    function trace(champ) {
      return pts.map(function (p, i) { return x(i) + ',' + y(p[champ] || 0); }).join(' ');
    }
    function points(champ, cls) {
      return pts.map(function (p, i) {
        return '<circle class="' + cls + '" cx="' + x(i) + '" cy="' + y(p[champ] || 0) + '" r="4">' +
          '<title>' + U.esc(p.libelle) + ' — ' + fmtPoint(p[champ]) + '</title></circle>';
      }).join('');
    }

    var grilles = [0, 0.5, 1].map(function (t) {
      var v = max * t;
      return '<line class="grille" x1="' + gx + '" y1="' + y(v) + '" x2="' + (L - gd) + '" y2="' + y(v) + '"></line>' +
        '<text class="axe" x="' + (gx - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmtAxe(v) + '</text>';
    }).join('');

    // Un libellé sur deux quand les points se serrent.
    var pas = Math.ceil(pts.length / 12);
    var etiquettes = pts.map(function (p, i) {
      if (i % pas !== 0 && i !== pts.length - 1) return '';
      return '<text class="axe" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' +
        U.esc(p.libelle.replace(/ \d{4}$/, '')) + '</text>';
    }).join('');

    return '<div class="carte">' +
      '<div class="carte-titre">' + (enTemps ? 'Évolution du temps' : 'Évolution du taux') + ' ' +
        '<span class="muted">— par ' + r.serie.granularite + '</span>' +
        (enTemps ? '' :
          '<span class="legende">' +
            '<span class="lg lg-filtre"></span> sous filtres' +
            '<span class="lg lg-ref"></span> tout compté' +
          '</span>') +
      '</div>' +
      '<svg class="graphe" viewBox="0 0 ' + L + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
        grilles +
        (enTemps
          ? '<polyline class="ligne-filtre" points="' + trace('heures') + '"></polyline>' +
            points('heures', 'pt-filtre')
          : '<polyline class="ligne-ref" points="' + trace('tauxReference') + '"></polyline>' +
            '<polyline class="ligne-filtre" points="' + trace('taux') + '"></polyline>' +
            points('tauxReference', 'pt-ref') + points('taux', 'pt-filtre')) +
        etiquettes +
      '</svg></div>';
  }

  /* --- Tableau --- */

  // Les colonnes d'argent disparaissent du regroupement par tâche : elles n'y
  // ont pas de sens, et les proposer inviterait à lire un chiffre faux.
  function colonnesPossibles() {
    return COLONNES.filter(function (c) { return !(c.argent && modeTemps()); });
  }
  function visibles() {
    var jeu = jeuColonnes();
    var l = colonnesPossibles().filter(function (c) { return jeu[c.id]; });
    return l.length ? l : colonnesPossibles().slice(0, 1);
  }

  function trierLignes(l) {
    if (tri.id === 'libelle') {
      // Par mois ou par semaine, l'identifiant (2026-07, 2026-08-24) est
      // chronologique là où le libellé (« juillet 2026 », « S35 · 24–30 août »)
      // ne l'est pas.
      var cle = Synthese.temporel(f)
        ? function (x) { return x.id; }
        : function (x) { return x.libelle.toLowerCase(); };
      return l.slice().sort(function (a, b) { return cle(a).localeCompare(cle(b)) * tri.sens; });
    }
    var c = COLONNES.find(function (x) { return x.id === tri.id; });
    if (!c) return l;
    return l.slice().sort(function (a, b) { return (c.tri(a) - c.tri(b)) * tri.sens; });
  }

  // Chaque regroupement a son ordre naturel : chronologique pour les mois,
  // du plus rentable au moins rentable pour les clients et les vidéos.
  function triParDefaut(groupement) {
    if (Synthese.temporel({ groupement: groupement })) return { id: 'libelle', sens: 1 };
    // Par tâche, le taux ne veut rien dire : c'est le temps qui classe.
    if (groupement === 'categorie') return { id: 'heures', sens: -1 };
    return { id: 'taux', sens: -1 };
  }

  function tableau(r) {
    var cols = visibles();
    var lignes = trierLignes(r.lignes);
    // Par tâche, la ligne qui ne porte que le chiffre d'affaires n'a plus de
    // colonne pour s'exprimer : elle n'afficherait qu'une rangée de zéros.
    // Elle existe pour que le total du CA reste juste, pas pour être lue.
    if (modeTemps()) {
      lignes = lignes.filter(function (l) { return l.heures > 0 || l.nbEntrees > 0; });
    }
    var pliable = f.groupement !== 'video';

    var entete = '<div class="an-ligne an-entete" style="' + gabarit(cols) + '">' +
      '<button class="an-th gauche' + (tri.id === 'libelle' ? ' actif' : '') + '" data-action="an.tri" data-id="libelle">' +
        (Synthese.temporel(f) ? 'Période'
          : f.groupement === 'video' ? 'Vidéo'
          : f.groupement === 'categorie' ? 'Tâche' : 'Client') +
        (tri.id === 'libelle' ? (tri.sens < 0 ? ' ▾' : ' ▴') : '') + '</button>' +
      cols.map(function (c) {
        return '<button class="an-th' + (tri.id === c.id ? ' actif' : '') + '" data-action="an.tri" data-id="' + c.id + '">' +
          c.nom + (tri.id === c.id ? (tri.sens < 0 ? ' ▾' : ' ▴') : '') + '</button>';
      }).join('') + '</div>';

    var corps = lignes.map(function (l) {
      var ouvert = !!ouverts[l.id];
      return '<div class="an-bloc">' +
        '<div class="an-ligne' + (pliable ? ' cliquable' : '') + '" style="' + gabarit(cols) + '"' +
          (pliable ? ' data-action="an.plier" data-id="' + l.id + '"' : '') + '>' +
          '<span class="an-nom">' +
            (pliable ? '<i class="chev">' + (ouvert ? '▾' : '▸') + '</i>' : '') +
            '<span class="pastille" style="background:' + l.couleur + '"></span>' +
            U.esc(l.libelle) + '</span>' +
          cols.map(function (c) {
            return '<span class="an-td' + (c.fort ? ' fort' : '') + '">' + c.val(l) + '</span>';
          }).join('') +
        '</div>' +
        (ouvert && pliable ? '<div class="an-sous">' + l.sousLignes.map(function (s) {
          return '<div class="an-ligne petite" style="' + gabarit(cols) + '">' +
            '<span class="an-nom">' + U.esc(s.libelle) + '</span>' +
            cols.map(function (c) {
              return '<span class="an-td' + (c.fort ? ' fort' : '') + '">' + c.val(s) + '</span>';
            }).join('') + '</div>';
        }).join('') + '</div>' : '') +
        '</div>';
    }).join('');

    var total = '<div class="an-ligne an-total" style="' + gabarit(cols) + '">' +
      '<span class="an-nom">Total</span>' +
      cols.map(function (c) {
        return '<span class="an-td' + (c.fort ? ' fort' : '') + '">' + c.val(r.total) + '</span>';
      }).join('') + '</div>';

    return '<div class="carte">' +
      '<div class="carte-titre">Tableau <span class="muted">— ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') +
        (pliable ? ', cliquer pour déplier par vidéo' : '') + '</span></div>' +
      '<div class="an-table">' + entete + (lignes.length ? corps : '<div class="vide">Rien dans ce périmètre.</div>') + total + '</div>' +
      '</div>';
  }

  function gabarit(cols) {
    return 'grid-template-columns: minmax(0,1fr) repeat(' + cols.length + ', 92px)';
  }

  /* --- Rendu --- */

  function render() {
    init();
    var r = Synthese.calculer(f);
    dernier = r;
    return barre() + bandeau(r) + courbe(r) + tableau(r);
  }

  var dernier = null;

  /* --- Actions --- */

  function maj() { persister(); App.render(); }

  App.actions['an.panneau'] = function () { panneau = !panneau; App.render(); };
  App.actions['an.groupement'] = function (el) {
    f.groupement = el.dataset.id;
    tri = triParDefaut(f.groupement);
    ouverts = {};
    maj();
  };
  App.actions['an.portee'] = function (el) {
    f.portee = el.dataset.id;
    // Le tri par taux n'a plus de sens sans chiffre d'affaires.
    if (f.portee === 'perso' && (tri.id === 'taux' || tri.id === 'ca')) tri = { id: 'heures', sens: -1 };
    ouverts = {};
    maj();
  };
  App.actions['an.du'] = function (el) { f.du = el.value; maj(); };
  App.actions['an.au'] = function (el) { f.au = el.value; maj(); };

  App.actions['an.periode'] = function (el) {
    var auj = U.aujourdhui(), m = U.moisCourant();
    if (el.dataset.id === 'mois') { f.du = U.premierDuMois(m); f.au = auj; }
    else if (el.dataset.id === '3mois') { f.du = U.premierDuMois(U.ajouterMois(m, -2)); f.au = auj; }
    else if (el.dataset.id === '6mois') { f.du = U.premierDuMois(U.ajouterMois(m, -5)); f.au = auj; }
    else if (el.dataset.id === 'annee') { f.du = auj.slice(0, 4) + '-01-01'; f.au = auj; }
    else {
      var dates = State.entries().map(function (e) { return e.date; })
        .concat(State.videos().map(function (v) { return State.dateCA(v); })).sort();
      f.du = dates[0] || U.premierDuMois(m);
      f.au = auj;
    }
    maj();
  };

  // null signifie « tout coché ». On ne matérialise la liste qu'au premier
  // décochage, pour qu'une catégorie créée plus tard soit comptée d'office.
  function listeDe(groupe) {
    if (groupe === 'colonnes') {
      var jeu = jeuColonnes();
      return colonnesPossibles().filter(function (c) { return jeu[c.id]; })
        .map(function (c) { return c.id; });
    }
    if (f[groupe] !== null) return f[groupe].slice();
    return tousLesIds(groupe);
  }
  function tousLesIds(groupe) {
    if (groupe === 'categories') return State.categories().filter(function (c) { return !c.archive; }).map(function (c) { return c.id; });
    if (groupe === 'clients') return State.clients().filter(function (c) { return !c.archive; }).map(function (c) { return c.id; }).concat([Synthese.SANS]);
    if (groupe === 'statuts') return State.STATUTS.map(function (s) { return s.id; });
    return colonnesPossibles().map(function (c) { return c.id; });
  }
  function appliquer(groupe, liste) {
    if (groupe === 'colonnes') {
      var jeu = jeuColonnes();
      colonnesPossibles().forEach(function (c) { jeu[c.id] = liste.indexOf(c.id) !== -1; });
      // Jamais un tableau sans colonne.
      if (!liste.length) jeu.heures = true;
      return;
    }
    f[groupe] = liste.length === tousLesIds(groupe).length ? null : liste;
  }

  App.actions['an.basculer'] = function (el) {
    var g = el.dataset.groupe, id = el.dataset.id;
    var l = listeDe(g);
    var i = l.indexOf(id);
    if (i === -1) l.push(id); else l.splice(i, 1);
    appliquer(g, l);
    maj();
  };
  App.actions['an.tout'] = function (el) { appliquer(el.dataset.groupe, tousLesIds(el.dataset.groupe)); maj(); };
  App.actions['an.rien'] = function (el) { appliquer(el.dataset.groupe, []); maj(); };

  App.actions['an.preset'] = function (el) {
    if (el.dataset.id === 'tout') f.categories = null;
    else f.categories = State.categories().filter(function (c) { return c.facturable && !c.archive; })
      .map(function (c) { return c.id; });
    maj();
  };

  App.actions['an.tri'] = function (el) {
    if (tri.id === el.dataset.id) tri.sens = -tri.sens;
    else {
      // Premier clic sur une colonne : le sens utile. Croissant pour un libellé
      // (chronologique, alphabétique), décroissant pour un chiffre.
      tri = { id: el.dataset.id, sens: el.dataset.id === 'libelle' ? 1 : -1 };
    }
    maj();
  };

  App.actions['an.plier'] = function (el) {
    ouverts[el.dataset.id] = !ouverts[el.dataset.id];
    App.render();
  };

  App.actions['an.copier'] = function () {
    if (!dernier) return;
    var cols = visibles();
    var lignes = [['Libellé'].concat(cols.map(function (c) { return c.nom; })).join('\t')];
    trierLignes(dernier.lignes).forEach(function (l) {
      lignes.push([l.libelle].concat(cols.map(function (c) { return c.val(l); })).join('\t'));
    });
    lignes.push(['Total'].concat(cols.map(function (c) { return c.val(dernier.total); })).join('\t'));
    App.copier(lignes.join('\n'), 'Tableau copié — collable dans un tableur.');
  };

  return {
    titre: 'Synthèse',
    render: render,
    // Point d'entrée depuis le tableau de bord : ouvrir directement sur le
    // temps personnel, groupé par tâche, sur le mois en cours.
    portee: function (p) {
      init();
      f.portee = p;
      if (p === 'perso') {
        f.groupement = 'categorie';
        tri = triParDefaut('categorie');
      }
      persister();
    }
  };
})();
