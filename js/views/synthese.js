/* Vue Analyse — tableaux de suivi et taux horaire sous conditions.
 *
 * Le principe : tu coches et décoches, tout se recalcule, et le taux de
 * référence (toutes heures comptées) reste affiché à côté. Un outil qui ne
 * montrerait que le chiffre filtré aiderait surtout à se mentir.
 */
var VueSynthese = (function () {
  var CLE = 'quete.analyse';

  var COLONNES = [
    { id: 'heures', nom: 'Heures', val: function (l) { return U.fmtDuree(l.heures); }, tri: function (l) { return l.heures; } },
    { id: 'heuresComptees', nom: 'Comptées', val: function (l) { return U.fmtDuree(l.heuresComptees); }, tri: function (l) { return l.heuresComptees; } },
    { id: 'ca', nom: 'CA', val: function (l) { return U.argentCourt(l.ca); }, tri: function (l) { return l.ca; } },
    { id: 'taux', nom: 'Taux', fort: true, val: function (l) { return U.taux(l.taux); }, tri: function (l) { return l.taux === null ? -1 : l.taux; } },
    { id: 'partFacturable', nom: '% fact.', val: function (l) { return l.partFacturable === null ? '—' : Math.round(l.partFacturable * 100) + ' %'; }, tri: function (l) { return l.partFacturable || 0; } },
    { id: 'nbVideos', nom: 'Vidéos', val: function (l) { return l.nbVideos || '—'; }, tri: function (l) { return l.nbVideos; } }
  ];

  var f = null;
  var colonnes = null;
  var tri = { id: 'taux', sens: -1 };
  var ouverts = {};
  var panneau = false;

  /* --- Préférences : par appareil, hors de l'état synchronisé.
     C'est un réglage d'affichage, pas une donnée. --- */

  function init() {
    if (f) return;
    f = Synthese.filtresParDefaut();
    colonnes = { heures: true, heuresComptees: false, ca: true, taux: true, partFacturable: false, nbVideos: true };
    tri = triParDefaut(f.groupement);
    try {
      var brut = JSON.parse(Local.lire(CLE) || 'null');
      if (brut) {
        Object.assign(f, brut.f || {});
        Object.assign(colonnes, brut.colonnes || {});
        tri = brut.tri || tri;
      }
    } catch (e) { /* préférences illisibles : on garde les valeurs par défaut */ }
  }
  function persister() {
    try { Local.ecrire(CLE, JSON.stringify({ f: f, colonnes: colonnes, tri: tri })); } catch (e) {}
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
      '</div>' +
      '<div class="an-outils">' +
        '<div class="segmente">' + [
          { id: 'client', nom: 'Par client' },
          { id: 'video', nom: 'Par vidéo' },
          { id: 'mois', nom: 'Par mois' }
        ].map(function (g) {
          return '<button class="seg' + (f.groupement === g.id ? ' actif' : '') +
            '" data-action="an.groupement" data-id="' + g.id + '">' + g.nom + '</button>';
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
        cases('colonnes', COLONNES, Object.keys(colonnes).filter(function (k) { return colonnes[k]; }), 'Colonnes affichées') +
      '</div>' +
      '<p class="aide">Décocher une catégorie la retire du <strong>dénominateur</strong> : ' +
      'ses heures restent visibles dans la colonne Heures, mais ne divisent plus le CA.</p>' +
      '</div>';
  }

  function bandeau(r) {
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

    var L = 1000, H = 250, gx = 52, gd = 14, gh = 18, gb = 34;
    var max = 0;
    pts.forEach(function (p) {
      max = Math.max(max, p.taux || 0, p.tauxReference || 0);
    });
    if (max <= 0) return '<div class="carte"><div class="carte-titre">Évolution du taux</div>' +
      '<div class="vide">Aucun chiffre d\'affaires sur la période.</div></div>';
    max = Math.ceil(max / 20) * 20;

    var x = function (i) { return pts.length === 1 ? (gx + (L - gx - gd) / 2) : gx + i * (L - gx - gd) / (pts.length - 1); };
    var y = function (v) { return gh + (1 - (v || 0) / max) * (H - gh - gb); };

    function trace(champ) {
      return pts.map(function (p, i) { return x(i) + ',' + y(p[champ] || 0); }).join(' ');
    }
    function points(champ, cls) {
      return pts.map(function (p, i) {
        return '<circle class="' + cls + '" cx="' + x(i) + '" cy="' + y(p[champ] || 0) + '" r="4">' +
          '<title>' + U.esc(p.libelle) + ' — ' + U.taux(p[champ]) + '</title></circle>';
      }).join('');
    }

    var grilles = [0, 0.5, 1].map(function (t) {
      var v = max * t;
      return '<line class="grille" x1="' + gx + '" y1="' + y(v) + '" x2="' + (L - gd) + '" y2="' + y(v) + '"></line>' +
        '<text class="axe" x="' + (gx - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v) + '</text>';
    }).join('');

    // Un libellé sur deux quand les points se serrent.
    var pas = Math.ceil(pts.length / 12);
    var etiquettes = pts.map(function (p, i) {
      if (i % pas !== 0 && i !== pts.length - 1) return '';
      return '<text class="axe" x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle">' +
        U.esc(p.libelle.replace(/ \d{4}$/, '')) + '</text>';
    }).join('');

    return '<div class="carte">' +
      '<div class="carte-titre">Évolution du taux ' +
        '<span class="muted">— par ' + r.serie.granularite + '</span>' +
        '<span class="legende">' +
          '<span class="lg lg-filtre"></span> sous filtres' +
          '<span class="lg lg-ref"></span> tout compté' +
        '</span></div>' +
      '<svg class="graphe" viewBox="0 0 ' + L + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
        grilles +
        '<polyline class="ligne-ref" points="' + trace('tauxReference') + '"></polyline>' +
        '<polyline class="ligne-filtre" points="' + trace('taux') + '"></polyline>' +
        points('tauxReference', 'pt-ref') + points('taux', 'pt-filtre') +
        etiquettes +
      '</svg></div>';
  }

  /* --- Tableau --- */

  function visibles() {
    return COLONNES.filter(function (c) { return colonnes[c.id]; });
  }

  function trierLignes(l) {
    if (tri.id === 'libelle') {
      // Par mois, l'identifiant (2026-07) est chronologique là où le libellé
      // (« juillet 2026 ») ne l'est pas.
      var cle = f.groupement === 'mois'
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
    return groupement === 'mois' ? { id: 'libelle', sens: 1 } : { id: 'taux', sens: -1 };
  }

  function tableau(r) {
    var cols = visibles();
    var lignes = trierLignes(r.lignes);
    var pliable = f.groupement !== 'video';

    var entete = '<div class="an-ligne an-entete" style="' + gabarit(cols) + '">' +
      '<button class="an-th gauche' + (tri.id === 'libelle' ? ' actif' : '') + '" data-action="an.tri" data-id="libelle">' +
        (f.groupement === 'mois' ? 'Période' : f.groupement === 'video' ? 'Vidéo' : 'Client') +
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
    if (groupe === 'colonnes') return Object.keys(colonnes).filter(function (k) { return colonnes[k]; });
    if (f[groupe] !== null) return f[groupe].slice();
    return tousLesIds(groupe);
  }
  function tousLesIds(groupe) {
    if (groupe === 'categories') return State.categories().filter(function (c) { return !c.archive; }).map(function (c) { return c.id; });
    if (groupe === 'clients') return State.clients().filter(function (c) { return !c.archive; }).map(function (c) { return c.id; }).concat([Synthese.SANS]);
    if (groupe === 'statuts') return State.STATUTS.map(function (s) { return s.id; });
    return COLONNES.map(function (c) { return c.id; });
  }
  function appliquer(groupe, liste) {
    if (groupe === 'colonnes') {
      COLONNES.forEach(function (c) { colonnes[c.id] = liste.indexOf(c.id) !== -1; });
      if (!visibles().length) colonnes.taux = true;   // jamais un tableau sans colonne
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
    render: render
  };
})();
