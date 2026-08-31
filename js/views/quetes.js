/* Vue Quêtes et Systèmes — la couche jeu.
 *
 * Deux objets, deux rôles :
 *   — un SYSTÈME est une habitude qu'on coche. Il ne mesure rien, il se
 *     répète. C'est la régularité qui rapporte, d'où la série.
 *   — une QUÊTE est un objectif chiffré, mesuré sur les données déjà saisies.
 *     Rien à tenir à jour : le temps et les vidéos font le suivi tout seuls.
 *
 * L'expérience d'une quête se réclame d'un clic plutôt que de tomber toute
 * seule. Écrire pendant un rendu serait un effet de bord invisible, et surtout
 * on perdrait le seul moment satisfaisant : celui où on encaisse.
 */
var VueQuetes = (function () {
  var formSysteme = false;
  var formQuete = false;
  var formMesure = false;
  var gestion = false;

  /* --- Modèles de départ ---
   * Une page vide ne donne envie de rien. Ces propositions se créent d'un
   * clic, puis se modifient : elles ne sont qu'un point de départ.
   */
  var MODELES = {
    systemes: [
      { nom: 'Bilan de fin de journée', cadence: 'jour', jours: [1, 2, 3, 4, 5], xp: 10 },
      { nom: 'Prospection', cadence: 'semaine', cible: 3, xp: 15 },
      { nom: 'Sauvegarde des projets', cadence: 'semaine', cible: 1, xp: 20 },
      { nom: 'Veille / formation', cadence: 'semaine', cible: 2, xp: 15 },
      { nom: 'Facturation à jour', cadence: 'semaine', cible: 1, xp: 25 }
    ],
    quetes: [
      { titre: '25 h facturables cette semaine', mesure: 'heuresFact', cible: 25, periode: 'semaine', xp: 40 },
      { titre: 'Livrer 20 vidéos ce mois', mesure: 'videos', cible: 20, periode: 'mois', xp: 60 },
      { titre: 'Tenir 45 €/h ce mois', mesure: 'taux', cible: 45, periode: 'mois', xp: 80 }
    ],
    mesures: [
      { nom: 'Pompes', unite: 'reps', cumul: true },
      { nom: 'Tractions', unite: 'reps', cumul: true },
      { nom: 'Pages lues', unite: 'pages', cumul: true },
      { nom: 'Poids', unite: 'kg', cumul: false }
    ]
  };

  /* --- Bandeau de niveau --- */

  function bandeau() {
    var r = Jeu.resume();
    var n = r.niveau;
    var sous = [];
    if (r.xpSemaine) sous.push('+' + r.xpSemaine + ' XP cette semaine');
    if (r.prevus) sous.push(r.faits + ' système' + (r.prevus > 1 ? 's' : '') + ' sur ' + r.prevus + " aujourd'hui");

    return '<div class="carte niveau-bandeau">' +
      '<div class="niveau-badge"><span>' + n.niveau + '</span><small>niveau</small></div>' +
      '<div class="niveau-corps">' +
        '<div class="niveau-ligne">' +
          '<strong>' + r.xp + ' XP</strong>' +
          '<span class="muted">encore ' + (n.haut - r.xp) + ' pour le niveau ' + (n.niveau + 1) + '</span>' +
        '</div>' +
        '<div class="barre"><div class="barre-plein" style="width:' + n.pct + '%"></div></div>' +
        (sous.length ? '<div class="niveau-sous muted">' + sous.join(' · ') + '</div>' : '') +
      '</div>' +
      (r.aReclamer.length
        ? '<div class="niveau-alerte">' + r.aReclamer.length + ' quête' +
          (r.aReclamer.length > 1 ? 's atteintes' : ' atteinte') + ' à réclamer</div>'
        : '') +
      '</div>';
  }

  /* --- Systèmes --- */

  function rythme(s) {
    if (s.cadence === 'semaine') return (s.cible || 1) + '× par semaine';
    var j = s.jours && s.jours.length ? s.jours : [1, 2, 3, 4, 5, 6, 7];
    if (j.length === 7) return 'tous les jours';
    if (j.length === 5 && j.indexOf(6) < 0 && j.indexOf(7) < 0) return 'du lundi au vendredi';
    return j.slice().sort().map(Jeu.lettreJour).join(' ');
  }

  function septDerniers() {
    var l = [];
    for (var i = 6; i >= 0; i--) l.push(U.ajouterJours(U.aujourdhui(), -i));
    return l;
  }

  function grille(s, jours) {
    var auto = Jeu.lie(s);
    return '<div class="sys-grille">' + jours.map(function (d) {
      var classe = !Jeu.prevu(s, d) ? 'hors' : (Jeu.fait(s, d) ? 'plein' : 'creux');
      var style = classe === 'plein' ? 'background:' + s.couleur + ';border-color:' + s.couleur : '';
      var titre = U.esc(U.dateLisible(d));
      // Rien à rattraper à la main sur un système adossé : on corrige le relevé,
      // pas la case.
      if (auto) return '<div class="sys-pt ' + classe + ' fige" title="' + titre + '" style="' + style + '"></div>';
      return '<button class="sys-pt ' + classe + '" data-action="jeu.basculer" ' +
        'data-id="' + s.id + '" data-date="' + d + '" title="' + titre + '" style="' + style + '"></button>';
    }).join('') + '</div>';
  }

  function ligneSysteme(s, jours, auj) {
    var coche = Jeu.fait(s, auj);
    var serie = Jeu.serie(s);
    var uniteSerie = s.cadence === 'semaine' ? ' sem.' : ' j';
    var reste = s.cadence === 'semaine'
      ? Jeu.faitsSemaine(s, auj) + ' / ' + (s.cible || 1) + ' cette semaine'
      : null;

    // Un système adossé à une mesure n'a pas de case à cocher : c'est le relevé
    // du jour qui décide, et le proposer inviterait à un geste sans effet.
    var m = Jeu.lie(s) ? State.mesure(s.mesureId) : null;
    var auto = m
      ? m.nom + ' ≥ ' + Jeu.fmtMesure(m, s.seuil || 1) +
        ' · ' + Jeu.fmtMesure(m, Jeu.valeurJour(m, auj)) + " aujourd'hui"
      : null;

    return '<div class="sys-ligne' + (coche ? ' coche' : '') + '">' +
      (m
        ? '<div class="sys-case auto' + (coche ? ' ok' : '') + '" ' +
            'style="' + (coche ? 'background:' + s.couleur + ';border-color:' + s.couleur : 'border-color:' + s.couleur) + '" ' +
            'title="Validé automatiquement par la mesure « ' + U.esc(m.nom) + ' »">' + (coche ? '✓' : '◦') + '</div>'
        : '<button class="sys-case' + (coche ? ' ok' : '') + '" data-action="jeu.basculer" ' +
            'data-id="' + s.id + '" data-date="' + auj + '" ' +
            'style="' + (coche ? 'background:' + s.couleur + ';border-color:' + s.couleur : 'border-color:' + s.couleur) + '" ' +
            'title="Valider pour aujourd\'hui">' + (coche ? '✓' : '') + '</button>') +
      '<div class="sys-corps">' +
        '<div class="sys-nom">' + U.esc(s.nom) + '</div>' +
        '<div class="sys-sous muted">' + (auto || (rythme(s) + ' · +' + (s.xp || 10) + ' XP' +
          (reste ? ' · ' + reste : ''))) + '</div>' +
      '</div>' +
      (serie > 1
        ? '<div class="sys-serie" title="Série en cours">🔥 ' + serie + uniteSerie + '</div>'
        : '<div class="sys-serie vide"></div>') +
      grille(s, jours) +
      '</div>';
  }

  function carteSystemes() {
    var auj = U.aujourdhui();
    var actifs = Jeu.actifs();
    var prevus = Jeu.duJour(auj);
    var autres = actifs.filter(function (s) { return prevus.indexOf(s) < 0; });
    var jours = septDerniers();

    var corps = prevus.length
      ? prevus.map(function (s) { return ligneSysteme(s, jours, auj); }).join('')
      : '<div class="vide">Rien de prévu aujourd\'hui.</div>';

    return '<div class="carte">' +
      '<div class="carte-titre">Systèmes <span class="muted">— ' + U.libelleRelatif(auj).toLowerCase() + '</span>' +
        '<button class="btn mini" data-action="jeu.formSysteme">+ Système</button>' +
        '<span class="legende-jours">' + jours.map(function (d) {
          return '<i' + (d === auj ? ' class="auj"' : '') + '>' + U.initialeJour(d) + '</i>';
        }).join('') + '</span>' +
      '</div>' +
      (formSysteme ? formulaireSysteme() : '') +
      corps +
      (autres.length
        ? '<div class="sys-autres"><div class="sys-autres-titre muted">Pas prévus aujourd\'hui</div>' +
          autres.map(function (s) { return ligneSysteme(s, jours, auj); }).join('') + '</div>'
        : '') +
      '</div>';
  }

  function formulaireSysteme() {
    var toutes = [1, 2, 3, 4, 5, 6, 7];
    return '<form class="form-creation carte" data-submit="jeu.creerSysteme">' +
      '<div class="grille-form">' +
        '<label class="champ c-cat"><span>Nom de l\'habitude</span>' +
          '<input type="text" name="nom" required placeholder="ex. bilan de fin de journée" autofocus></label>' +
        '<label class="champ c-cli"><span>Rythme</span>' +
          '<select name="cadence" data-change="jeu.cadenceChange">' +
            '<option value="jour">Les jours choisis</option>' +
            '<option value="semaine">N fois par semaine</option>' +
          '</select></label>' +
        '<label class="champ c-court"><span>Expérience</span>' +
          '<input type="number" name="xp" value="10" min="1" max="500" step="5"></label>' +
      '</div>' +
      '<div class="grille-form" style="margin-top:10px">' +
        '<div class="champ c-cat bloc-jours"><span>Jours</span>' +
          '<div class="jours-choix">' + toutes.map(function (n) {
            return '<label class="jour-chip"><input type="checkbox" name="j' + n + '" checked>' +
              '<span>' + Jeu.lettreJour(n) + '</span></label>';
          }).join('') + '</div></div>' +
        '<label class="champ c-court bloc-cible" hidden><span>Fois par semaine</span>' +
          '<input type="number" name="cible" value="3" min="1" max="21"></label>' +
      '</div>' +
      (State.mesures().length
        ? '<div class="grille-form" style="margin-top:10px">' +
            '<label class="champ c-cli"><span>Adosser à une mesure</span>' +
              '<select name="mesureId" data-change="jeu.adosserChange">' +
                '<option value="">Non — je coche à la main</option>' + optionsMesures() +
              '</select></label>' +
            '<label class="champ c-court bloc-seuil" hidden><span>Seuil par jour</span>' +
              '<input type="number" name="seuil" value="1" min="0" step="any"></label>' +
          '</div>'
        : '') +
      '<div class="form-actions">' +
        '<button type="submit" class="btn primaire">Créer</button>' +
        '<button type="button" class="btn" data-action="jeu.fermerSysteme">Annuler</button>' +
        '<span class="aide">Adossée à une mesure, l\'habitude se valide toute seule dès que le seuil du jour est franchi.</span>' +
      '</div></form>';
  }

  /* --- Mesures ---
   * Une grandeur chiffrée notée au jour le jour. La saisie doit tenir en un
   * geste : un champ, un bouton. Tout le reste — moyennes, séries, objectifs —
   * se déduit des relevés.
   */

  function carteMesures() {
    var l = State.mesures().filter(function (m) { return !m.archive; });
    var auj = U.aujourdhui();
    var du = U.premierDuMois(U.moisCourant());
    var jours = septDerniers();

    var corps = l.length ? l.map(function (m) {
      var valeurs = jours.map(function (d) { return Jeu.valeurJour(m, d); });
      var plafond = Math.max.apply(null, valeurs.concat([1]));
      var total = Jeu.totalPeriode(m, du, auj);
      var moy = Jeu.moyenneJour(m, du, auj);
      var best = Jeu.meilleurJour(m, du, auj);
      var actifs = Jeu.joursActifs(m, du, auj);

      var stats = [];
      if (m.cumul === false) {
        stats.push('dernier relevé ' + Jeu.fmtMesure(m, total));
        stats.push(actifs + ' jour' + (actifs > 1 ? 's' : '') + ' noté' + (actifs > 1 ? 's' : '') + ' ce mois');
      } else {
        stats.push(Jeu.fmtMesure(m, total) + ' ce mois');
        stats.push(Jeu.fmtMesure(m, moy) + ' par jour');
        if (best) stats.push('record ' + Jeu.fmtMesure(m, best.valeur) + ' le ' + U.dateLisible(best.date));
      }

      return '<div class="mes-ligne">' +
        '<div class="mes-tete">' +
          '<span class="pastille" style="background:' + m.couleur + '"></span>' +
          '<span class="mes-nom">' + U.esc(m.nom) + '</span>' +
          '<span class="mes-auj">' + Jeu.fmtMesure(m, Jeu.valeurJour(m, auj)) + " aujourd'hui" + '</span>' +
          '<form class="mes-saisie" data-submit="jeu.noter" data-id="' + m.id + '">' +
            '<input type="number" name="valeur" step="any" inputmode="decimal" ' +
              'placeholder="' + (m.cumul === false ? 'valeur' : '+ combien') + '" required>' +
            '<button class="btn mini primaire" type="submit">' + (m.cumul === false ? 'Noter' : '+') + '</button>' +
          '</form>' +
        '</div>' +
        '<div class="mes-sous muted">' + U.esc(stats.join(' · ')) + '</div>' +
        '<div class="mes-grille">' + jours.map(function (d, i) {
          var v = valeurs[i];
          return '<div class="mes-col" title="' + U.esc(U.dateLisible(d)) + ' — ' + Jeu.fmtMesure(m, v) + '">' +
            '<div class="mes-barre"><div class="mes-plein" style="height:' + (v / plafond * 100) + '%;' +
              'background:' + m.couleur + '"></div></div>' +
            '<span>' + U.initialeJour(d) + '</span>' +
            '</div>';
        }).join('') + '</div>' +
        '</div>';
    }).join('') : '<div class="vide">Aucune grandeur suivie.</div>';

    return '<div class="carte">' +
      '<div class="carte-titre">Mesures <span class="muted">— sept derniers jours</span>' +
        '<button class="btn mini" data-action="jeu.formMesure">+ Mesure</button></div>' +
      (formMesure ? formulaireMesure() : '') +
      corps +
      '</div>';
  }

  function formulaireMesure() {
    return '<form class="form-creation carte" data-submit="jeu.creerMesure">' +
      '<div class="grille-form">' +
        '<label class="champ c-cat"><span>Nom</span>' +
          '<input type="text" name="nom" required placeholder="ex. pompes, tractions, poids" autofocus></label>' +
        '<label class="champ c-court"><span>Unité</span>' +
          '<input type="text" name="unite" maxlength="12" placeholder="reps, kg, pages"></label>' +
        '<label class="champ c-cli"><span>Type</span>' +
          '<select name="cumul">' +
            '<option value="1">Cumulatif — les saisies du jour s\'additionnent</option>' +
            '<option value="0">Relevé — la dernière valeur du jour fait foi</option>' +
          '</select></label>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn primaire">Créer</button>' +
        '<button type="button" class="btn" data-action="jeu.fermerMesure">Annuler</button>' +
        '<span class="aide">Cumulatif pour des pompes ou des pages lues, relevé pour un poids.</span>' +
      '</div></form>';
  }

  function optionsMesures(sel) {
    return State.mesures().filter(function (m) { return !m.archive; })
      .map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + U.esc(m.nom) + '</option>';
      }).join('');
  }

  /* --- Quêtes --- */

  function ligneQuete(q) {
    var p = Jeu.progres(q);
    var b = Jeu.bornes(q);
    var etat = p.reclamee ? ' gagnee' : (p.atteint ? ' prete' : '');

    var pied;
    if (p.reclamee) pied = '<span class="qu-gagne">+' + (q.xp || 50) + ' XP encaissés</span>';
    else if (p.atteint) pied = '<button class="btn mini vert" data-action="jeu.reclamer" data-id="' + q.id + '">Réclamer +' + (q.xp || 50) + ' XP</button>';
    else pied = '<span class="muted">' + p.pct + ' % · +' + (q.xp || 50) + ' XP à la clé</span>';

    var manuel = q.mesure === 'manuel'
      ? '<span class="qu-compteur">' +
          '<button class="btn mini" data-action="jeu.compteur" data-id="' + q.id + '" data-delta="-1">−</button>' +
          '<button class="btn mini" data-action="jeu.compteur" data-id="' + q.id + '" data-delta="1">+</button>' +
        '</span>'
      : '';

    var filtres = [];
    if (q.clientId) filtres.push(State.nomClient(q.clientId));
    if (q.categorieId) filtres.push(State.nomCategorie(q.categorieId));

    return '<div class="qu-ligne' + etat + '">' +
      '<div class="qu-tete">' +
        '<div class="qu-titre">' + U.esc(q.titre) +
          (filtres.length ? '<span class="l-client">' + U.esc(filtres.join(' · ')) + '</span>' : '') +
        '</div>' +
        '<div class="qu-val"><strong>' + Jeu.fmt(q.mesure, p.valeur, q) + '</strong>' +
          '<span class="muted"> / ' + Jeu.fmt(q.mesure, p.cible, q) + '</span></div>' +
      '</div>' +
      '<div class="barre"><div class="barre-plein' + (p.atteint ? ' atteint' : '') +
        '" style="width:' + p.pct + '%"></div></div>' +
      '<div class="qu-pied">' +
        '<span class="muted">' + U.esc(Jeu.libelleMesure(q).toLowerCase()) + ' · ' + U.esc(b.libelle) + '</span>' +
        manuel + pied +
      '</div>' +
      '</div>';
  }

  function carteQuetes() {
    var l = Jeu.enCours();
    // Les quêtes réclamables d'abord : c'est la seule ligne qui appelle un geste.
    l = l.slice().sort(function (a, b) {
      var pa = Jeu.progres(a), pb = Jeu.progres(b);
      var ra = (pa.atteint && !pa.reclamee) ? 0 : (pa.reclamee ? 2 : 1);
      var rb = (pb.atteint && !pb.reclamee) ? 0 : (pb.reclamee ? 2 : 1);
      if (ra !== rb) return ra - rb;
      return pb.pct - pa.pct;
    });

    return '<div class="carte">' +
      '<div class="carte-titre">Quêtes' +
        '<button class="btn mini" data-action="jeu.formQuete">+ Quête</button></div>' +
      (formQuete ? formulaireQuete() : '') +
      (l.length ? '<div class="qu-liste">' + l.map(ligneQuete).join('') + '</div>'
                : '<div class="vide">Aucune quête en cours.</div>') +
      '</div>';
  }

  function formulaireQuete() {
    return '<form class="form-creation carte" data-submit="jeu.creerQuete">' +
      '<div class="grille-form">' +
        '<label class="champ c-cat"><span>Intitulé</span>' +
          '<input type="text" name="titre" required placeholder="ex. 25 h facturables cette semaine" autofocus></label>' +
        '<label class="champ c-cli"><span>Ce qu\'on mesure</span>' +
          '<select name="mesure" data-change="jeu.mesureChange">' + Jeu.MESURES.map(function (m) {
            // Sans grandeur suivie, l'option correspondante n'aurait rien à viser.
            if (m.id === 'mesure' && !State.mesures().length) return '';
            return '<option value="' + m.id + '">' + U.esc(m.nom) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="champ c-court"><span>Objectif</span>' +
          '<input type="number" name="cible" required min="0" step="any" placeholder="25"></label>' +
      '</div>' +
      '<div class="grille-form bloc-mesure" hidden style="margin-top:10px">' +
        '<label class="champ c-cli"><span>Laquelle</span>' +
          '<select name="mesureId">' + optionsMesures() + '</select></label>' +
        '<label class="champ c-cli"><span>Comment la compter</span>' +
          '<select name="agregat">' +
            '<option value="total">Total sur la période</option>' +
            '<option value="moyenne">Moyenne par jour</option>' +
          '</select></label>' +
      '</div>' +
      '<div class="grille-form" style="margin-top:10px">' +
        '<label class="champ c-court"><span>Répétition</span>' +
          '<select name="periode">' + Jeu.PERIODES.map(function (p) {
            return '<option value="' + p.id + '">' + U.esc(p.nom) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="champ c-cli"><span>Client (facultatif)</span>' +
          '<select name="clientId"><option value="">Tous</option>' + State.clients().map(function (c) {
            return '<option value="' + c.id + '">' + U.esc(c.nom) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="champ c-cli"><span>Catégorie (facultatif)</span>' +
          '<select name="categorieId"><option value="">Toutes</option>' + State.categories().map(function (c) {
            return '<option value="' + c.id + '">' + U.esc(c.nom) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="champ c-court"><span>Expérience</span>' +
          '<input type="number" name="xp" value="50" min="1" max="1000" step="10"></label>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn primaire">Créer</button>' +
        '<button type="button" class="btn" data-action="jeu.fermerQuete">Annuler</button>' +
        '<span class="aide">Une quête répétée rapporte son expérience à chaque période réussie.</span>' +
      '</div></form>';
  }

  /* --- Gestion --- */

  function carteGestion() {
    if (!gestion) {
      return '<div class="carte gestion-repli">' +
        '<button class="lien" data-action="jeu.gestion">Modifier, archiver ou supprimer…</button></div>';
    }
    var sys = State.systemes(), qu = State.quetes();

    function ligne(r, type) {
      var libelle = type === 'systeme' ? r.nom : r.titre;
      return '<div class="ligne' + (r.archive ? ' archive' : '') + '">' +
        '<div class="l-quoi">' +
          (type === 'systeme' ? '<span class="pastille" style="background:' + r.couleur + '"></span>' : '') +
          U.esc(libelle) +
          (type === 'quete' ? '<span class="l-client">' + U.esc(Jeu.mesure(r.mesure).nom) + '</span>' : '') +
        '</div>' +
        (type === 'quete'
          ? '<label class="tarif case"><span class="muted">objectif</span>' +
            '<input class="tarif-input" type="number" step="any" value="' + (r.cible || 0) + '" ' +
            'data-change="jeu.champ" data-type="quetes" data-id="' + r.id + '" data-champ="cible"></label>'
          : '') +
        '<label class="tarif case"><span class="muted">XP</span>' +
          '<input class="tarif-input" type="number" min="1" value="' + (r.xp || 10) + '" ' +
          'data-change="jeu.champ" data-type="' + (type === 'systeme' ? 'systemes' : 'quetes') + '" ' +
          'data-id="' + r.id + '" data-champ="xp"></label>' +
        '<div class="l-actions">' +
          '<button class="btn mini" data-action="jeu.archiver" data-type="' + (type === 'systeme' ? 'systemes' : 'quetes') + '" data-id="' + r.id + '">' +
            (r.archive ? 'Réactiver' : 'Archiver') + '</button>' +
          '<button class="btn mini danger" data-action="jeu.supprimer" data-type="' + (type === 'systeme' ? 'systemes' : 'quetes') + '" data-id="' + r.id + '">Suppr.</button>' +
        '</div></div>';
    }

    return '<div class="carte">' +
      '<div class="carte-titre">Gestion' +
        '<button class="btn mini" data-action="jeu.gestion">Replier</button></div>' +
      '<div class="sous-titre muted">Systèmes</div>' +
      (sys.length ? '<div class="lignes">' + sys.map(function (s) { return ligne(s, 'systeme'); }).join('') + '</div>'
                  : '<div class="vide">Aucun.</div>') +
      '<div class="sous-titre muted">Quêtes</div>' +
      (qu.length ? '<div class="lignes">' + qu.map(function (q) { return ligne(q, 'quete'); }).join('') + '</div>'
                 : '<div class="vide">Aucune.</div>') +
      '<div class="sous-titre muted">Mesures</div>' +
      (State.mesures().length
        ? '<div class="lignes">' + State.mesures().map(function (m) {
            var n = State.releves().filter(function (r) { return r.mesureId === m.id; }).length;
            return '<div class="ligne' + (m.archive ? ' archive' : '') + '">' +
              '<div class="l-quoi">' +
                '<span class="pastille" style="background:' + m.couleur + '"></span>' +
                U.esc(m.nom) +
                '<span class="l-client">' + U.esc(m.unite || 'sans unité') + '</span>' +
                '<span class="muted">' + (m.cumul === false ? 'relevé' : 'cumulatif') + ' · ' + n + ' saisie' + (n > 1 ? 's' : '') + '</span>' +
              '</div>' +
              '<div class="l-actions">' +
                '<button class="btn mini" data-action="jeu.archiver" data-type="mesures" data-id="' + m.id + '">' +
                  (m.archive ? 'Réactiver' : 'Archiver') + '</button>' +
                '<button class="btn mini danger" data-action="jeu.supprimer" data-type="mesures" data-id="' + m.id + '">Suppr.</button>' +
              '</div></div>';
          }).join('') + '</div>'
        : '<div class="vide">Aucune.</div>') +
      '<p class="aide">Archiver conserve l\'expérience déjà gagnée et l\'historique ; ' +
      'supprimer retire seulement l\'objectif, jamais les points acquis.</p>' +
      '</div>';
  }

  /* --- Page vide --- */

  function accueilVide() {
    return '<div class="carte accueil">' +
      '<h2>Deux façons de marquer des points.</h2>' +
      '<p>Un <strong>système</strong> est une habitude qu\'on coche : c\'est la régularité qui compte, pas le résultat. ' +
      'Une <strong>quête</strong> est un objectif chiffré, mesuré tout seul sur ce que tu saisis déjà — heures, vidéos, chiffre d\'affaires.</p>' +
      '<p class="muted">Choisis-en quelques-uns pour démarrer, tu les ajusteras ensuite.</p>' +
      '</div>' +
      '<div class="carte">' +
        '<div class="carte-titre">Systèmes proposés</div>' +
        '<div class="chips">' + MODELES.systemes.map(function (m, i) {
          return '<button class="chip" data-action="jeu.modele" data-type="systeme" data-i="' + i + '">' +
            '+ ' + U.esc(m.nom) + ' <span class="muted">' +
            (m.cadence === 'semaine' ? m.cible + '×/sem.' : 'lun–ven') + '</span></button>';
        }).join('') + '</div>' +
        '<div class="carte-titre" style="margin-top:18px">Quêtes proposées</div>' +
        '<div class="chips">' + MODELES.quetes.map(function (m, i) {
          return '<button class="chip" data-action="jeu.modele" data-type="quete" data-i="' + i + '">' +
            '+ ' + U.esc(m.titre) + '</button>';
        }).join('') + '</div>' +
        '<div class="carte-titre" style="margin-top:18px">Mesures proposées</div>' +
        '<div class="chips">' + MODELES.mesures.map(function (m, i) {
          return '<button class="chip" data-action="jeu.modele" data-type="mesure" data-i="' + i + '">' +
            '+ ' + U.esc(m.nom) + ' <span class="muted">' + U.esc(m.unite) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="form-actions">' +
          '<button class="btn" data-action="jeu.formSysteme">Créer un système</button>' +
          '<button class="btn" data-action="jeu.formQuete">Créer une quête</button>' +
          '<button class="btn" data-action="jeu.formMesure">Créer une mesure</button>' +
        '</div>' +
      '</div>' +
      (formSysteme ? formulaireSysteme() : '') +
      (formQuete ? formulaireQuete() : '') +
      (formMesure ? formulaireMesure() : '');
  }

  function render() {
    if (!State.systemes().length && !State.quetes().length && !State.mesures().length) return accueilVide();
    return bandeau() + carteSystemes() + carteMesures() + carteQuetes() + carteGestion();
  }

  /* --- Actions --- */

  App.actions['jeu.formSysteme'] = function () { formSysteme = !formSysteme; App.render(); };
  App.actions['jeu.fermerSysteme'] = function () { formSysteme = false; App.render(); };
  App.actions['jeu.formQuete'] = function () { formQuete = !formQuete; App.render(); };
  App.actions['jeu.fermerQuete'] = function () { formQuete = false; App.render(); };
  App.actions['jeu.gestion'] = function () { gestion = !gestion; App.render(); };
  App.actions['jeu.formMesure'] = function () { formMesure = !formMesure; App.render(); };
  App.actions['jeu.fermerMesure'] = function () { formMesure = false; App.render(); };

  App.actions['jeu.creerMesure'] = function (f) {
    State.ajouterMesure({
      nom: f.nom.value.trim(),
      unite: f.unite.value.trim(),
      cumul: f.cumul.value === '1',
      couleur: U.couleurIndex(State.mesures().length + 3),
      archive: false
    });
    formMesure = false;
    App.render();
    App.message('Mesure créée.', 'ok');
  };

  App.actions['jeu.noter'] = function (f) {
    var m = State.mesure(f.dataset.id);
    var v = parseFloat(f.valeur.value);
    if (!m || isNaN(v)) { App.message('Valeur invalide.', 'erreur'); return; }
    var avant = Jeu.xpTotal();
    Jeu.noter(m, v);
    var gagne = Jeu.xpTotal() - avant;
    App.render();
    App.message(Jeu.fmtMesure(m, v) + ' noté · ' +
      Jeu.fmtMesure(m, Jeu.valeurJour(m, U.aujourdhui())) + " aujourd'hui" +
      (gagne ? ' · +' + gagne + ' XP' : ''), 'ok');
  };

  // Affiche les champs propres à une mesure sans redessiner : un re-rendu
  // effacerait l'intitulé déjà tapé.
  App.actions['jeu.mesureChange'] = function (el) {
    el.closest('form').querySelector('.bloc-mesure').hidden = (el.value !== 'mesure');
  };
  App.actions['jeu.adosserChange'] = function (el) {
    el.closest('form').querySelector('.bloc-seuil').hidden = !el.value;
  };

  // Bascule l'affichage sans redessiner : un re-rendu effacerait le nom déjà tapé.
  App.actions['jeu.cadenceChange'] = function (el) {
    var f = el.closest('form');
    var semaine = el.value === 'semaine';
    f.querySelector('.bloc-jours').hidden = semaine;
    f.querySelector('.bloc-cible').hidden = !semaine;
  };

  App.actions['jeu.creerSysteme'] = function (f) {
    var cadence = f.cadence.value;
    var jours = [];
    for (var n = 1; n <= 7; n++) if (f['j' + n].checked) jours.push(n);
    if (cadence === 'jour' && !jours.length) {
      App.message('Choisis au moins un jour.', 'erreur');
      return;
    }
    var mesureId = f.mesureId ? f.mesureId.value : '';
    var s = State.ajouterSysteme({
      nom: f.nom.value.trim(),
      cadence: cadence,
      jours: jours,
      cible: cadence === 'semaine' ? Math.max(1, parseInt(f.cible.value, 10) || 1) : null,
      xp: Math.max(1, parseInt(f.xp.value, 10) || 10),
      couleur: U.couleurIndex(State.systemes().length),
      mesureId: mesureId || null,
      seuil: mesureId ? (parseFloat(f.seuil.value) || 1) : null,
      archive: false
    });
    // Un système adossé peut déjà être satisfait par les relevés du jour.
    if (mesureId) Jeu.reconcilier(mesureId, U.aujourdhui());
    formSysteme = false;
    App.render();
    App.message('Système créé.', 'ok');
  };

  App.actions['jeu.creerQuete'] = function (f) {
    var periode = f.periode.value;
    State.ajouterQuete({
      titre: f.titre.value.trim(),
      mesure: f.mesure.value,
      mesureId: f.mesure.value === 'mesure' ? f.mesureId.value : null,
      agregat: f.mesure.value === 'mesure' ? f.agregat.value : null,
      cible: parseFloat(f.cible.value) || 0,
      periode: periode,
      clientId: f.clientId.value || null,
      categorieId: f.categorieId.value || null,
      xp: Math.max(1, parseInt(f.xp.value, 10) || 50),
      compteur: 0,
      // Un objectif unique part de sa création : sinon il naîtrait à moitié
      // rempli par de l'historique qu'on n'avait pas décidé d'y mettre.
      du: periode === 'unique' ? U.aujourdhui() : null,
      archive: false
    });
    formQuete = false;
    App.render();
    App.message('Quête créée.', 'ok');
  };

  App.actions['jeu.modele'] = function (el) {
    var i = +el.dataset.i;
    if (el.dataset.type === 'mesure') {
      var mm = MODELES.mesures[i];
      State.ajouterMesure({ nom: mm.nom, unite: mm.unite, cumul: mm.cumul,
        couleur: U.couleurIndex(State.mesures().length + 3), archive: false });
      App.render();
      return;
    }
    if (el.dataset.type === 'systeme') {
      var m = MODELES.systemes[i];
      State.ajouterSysteme({
        nom: m.nom, cadence: m.cadence, jours: m.jours || [1, 2, 3, 4, 5, 6, 7],
        cible: m.cible || null, xp: m.xp,
        couleur: U.couleurIndex(State.systemes().length), archive: false
      });
    } else {
      var q = MODELES.quetes[i];
      State.ajouterQuete({
        titre: q.titre, mesure: q.mesure, cible: q.cible, periode: q.periode,
        clientId: null, categorieId: null, xp: q.xp, compteur: 0, du: null, archive: false
      });
    }
    App.render();
  };

  App.actions['jeu.basculer'] = function (el) {
    var s = State.systemes().find(function (x) { return x.id === el.dataset.id; });
    if (!s) return;
    var actif = Jeu.basculer(s, el.dataset.date);
    App.render();
    if (actif) {
      var serie = Jeu.serie(s);
      App.message('+' + (s.xp || 10) + ' XP' + (serie > 1 ? ' — série de ' + serie + (s.cadence === 'semaine' ? ' semaines' : ' jours') : ''), 'ok');
    }
  };

  App.actions['jeu.reclamer'] = function (el) {
    var q = State.quetes().find(function (x) { return x.id === el.dataset.id; });
    if (!q) return;
    var avant = Jeu.niveau(Jeu.xpTotal());
    if (!Jeu.reclamer(q)) return;
    var apres = Jeu.niveau(Jeu.xpTotal());
    App.render();
    App.message(apres > avant ? 'Niveau ' + apres + ' atteint !' : '+' + (q.xp || 50) + ' XP', 'ok');
  };

  App.actions['jeu.compteur'] = function (el) {
    var q = State.quetes().find(function (x) { return x.id === el.dataset.id; });
    if (!q) return;
    // Le compteur est rangé sous la clé de la période en cours : une quête
    // hebdomadaire repart de zéro chaque lundi, comme les autres mesures.
    var compteurs = Object.assign({}, q.compteurs || {});
    var cle = Jeu.bornes(q).cle;
    compteurs[cle] = Math.max(0, Jeu.compteurCourant(q) + (+el.dataset.delta));
    State.modifier(q, { compteurs: compteurs });
    App.render();
  };

  App.actions['jeu.champ'] = function (el) {
    var r = collection(el.dataset.type).find(function (x) { return x.id === el.dataset.id; });
    if (!r) return;
    var patch = {};
    patch[el.dataset.champ] = parseFloat(el.value) || 0;
    State.modifier(r, patch);
    App.render();
  };

  function collection(type) {
    if (type === 'systemes') return State.systemes();
    if (type === 'mesures') return State.mesures();
    return State.quetes();
  }

  App.actions['jeu.archiver'] = function (el) {
    var r = collection(el.dataset.type).find(function (x) { return x.id === el.dataset.id; });
    if (!r) return;
    State.modifier(r, { archive: !r.archive });
    App.render();
  };

  App.actions['jeu.supprimer'] = function (el) {
    var mesure = el.dataset.type === 'mesures';
    if (!confirm(mesure
      ? 'Supprimer cette mesure ? Les relevés déjà saisis ne seront plus consultables.'
      : 'Supprimer définitivement ? L\'expérience déjà gagnée reste acquise.')) return;
    State.supprimerEnreg(el.dataset.type, el.dataset.id);
    App.render();
  };

  return { titre: 'Quêtes', render: render };
})();
