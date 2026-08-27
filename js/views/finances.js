/* Vue Finances — CA, dépenses, rentabilité, et le récap de fin de mois.
 * Le CA vient d'abord des vidéos ; les transactions couvrent le reste
 * (dépenses, revenus hors montage).
 */
var VueFinances = (function () {
  var mois = U.moisCourant();
  var ajoutOuvert = false;

  function bornes() {
    return { du: U.premierDuMois(mois), au: U.dernierDuMois(mois) };
  }

  function navMois() {
    return '<div class="mois-nav">' +
      '<button class="btn mini" data-action="fin.mois" data-delta="-1">‹</button>' +
      '<strong>' + U.esc(U.moisLisible(mois)) + '</strong>' +
      '<button class="btn mini" data-action="fin.mois" data-delta="1">›</button>' +
      (mois !== U.moisCourant() ? '<button class="btn mini" data-action="fin.mois" data-abs="' + U.moisCourant() + '">Mois courant</button>' : '') +
      '</div>';
  }

  function kpis() {
    var b = bornes();
    var ca = State.ca(b.du, b.au);
    var dep = State.depenses(b.du, b.au);
    var res = ca - dep;
    var tr = State.tauxReel(b.du, b.au);
    var tf = State.tauxFacturable(b.du, b.au);
    var h = State.totalMinutes(State.entreesPeriode(b.du, b.au));

    function bloc(label, valeur, sous, couleur) {
      return '<div class="stat">' +
        '<div class="stat-label">' + label + '</div>' +
        '<div class="stat-valeur"' + (couleur ? ' style="color:' + couleur + '"' : '') + '>' + valeur + '</div>' +
        '<div class="stat-sous">' + sous + '</div></div>';
    }

    return '<div class="stats">' +
      bloc('Chiffre d\'affaires', U.argentCourt(ca),
        U.argentCourt(State.caVideos(b.du, b.au)) + ' de vidéos') +
      bloc('Dépenses', U.argentCourt(dep),
        State.transactionsPeriode(b.du, b.au).filter(function (t) { return t.type === 'depense'; }).length + ' lignes',
        dep > 0 ? 'var(--rouge)' : null) +
      bloc('Résultat', U.argentCourt(res), 'CA moins dépenses',
        res >= 0 ? 'var(--vert)' : 'var(--rouge)') +
      bloc('Taux horaire réel', U.taux(tr),
        U.fmtHeuresDec(h) + ' travaillées · ' + U.taux(tf) + ' sur le facturable',
        'var(--accent2)') +
      '</div>';
  }

  function facturation() {
    var groupes = State.aFacturer();
    var attente = State.enAttentePaiement();

    var corps = groupes.length ? groupes.map(function (g) {
      return '<div class="fact-groupe">' +
        '<div class="fact-entete">' +
          '<strong>' + U.esc(g.clientId ? State.nomClient(g.clientId) : 'Sans client') + '</strong>' +
          '<span class="muted">' + g.videos.length + ' vidéo' + (g.videos.length > 1 ? 's' : '') +
            ' · ' + U.fmtDuree(g.minutes) + ' · ' + U.taux(g.minutes > 0 ? g.total / (g.minutes / 60) : null) + '</span>' +
          '<span class="fact-total">' + U.argent(g.total) + '</span>' +
          '<button class="btn mini" data-action="fin.copier" data-client="' + (g.clientId || '') + '">Copier le récap</button>' +
          '<button class="btn mini primaire" data-action="fin.facturer" data-client="' + (g.clientId || '') + '">Marquer facturé</button>' +
        '</div>' +
        '<div class="fact-lignes">' + g.videos.map(function (v) {
          return '<div class="fact-ligne">' +
            '<span class="muted">' + U.esc(U.dateLisible(State.dateCA(v))) + '</span>' +
            '<span>' + U.esc(v.titre) +
              // Une vidéo encore marquée « en cours » ne doit pas partir sur une
              // facture sans qu'on l'ait vue passer.
              (v.statut === 'encours' ? '<span class="tag-encours">en cours</span>' : '') +
            '</span>' +
            '<span class="muted">' + U.fmtDuree(State.minutesVideo(v.id)) + '</span>' +
            '<span class="fact-prix">' + U.argent(v.prix) + '</span>' +
            '</div>';
        }).join('') + '</div>' +
        '</div>';
    }).join('') : '<div class="vide">Rien en attente de facturation.</div>';

    // Le vrai oubli de fin de mois : du temps passé sur une vidéo jamais chiffrée.
    var sansPrix = State.videos().filter(function (v) {
      return !(v.prix > 0) && State.minutesVideo(v.id) > 0;
    });

    return '<div class="carte">' +
      '<div class="carte-titre">À facturer' +
        (attente > 0 ? ' <span class="muted">— ' + U.argent(attente) + ' déjà facturé, en attente de paiement</span>' : '') +
      '</div>' +
      (sansPrix.length
        ? '<div class="rappel">' + sansPrix.length + ' vidéo' + (sansPrix.length > 1 ? 's ont' : ' a') +
          ' du temps enregistré mais aucun prix — ' + U.fmtDuree(sansPrix.reduce(function (s, v) {
            return s + State.minutesVideo(v.id);
          }, 0)) + ' de travail non chiffré. À compléter dans l\'onglet Vidéos.</div>'
        : '') +
      corps +
      '</div>';
  }

  function parClient() {
    var l = State.clients().map(function (c) {
      return { c: c, minutes: State.minutesClient(c.id), ca: State.caClient(c.id), taux: State.tauxClient(c.id) };
    }).filter(function (x) { return x.minutes > 0 || x.ca > 0; })
      .sort(function (a, b) { return (b.taux || 0) - (a.taux || 0); });

    if (!l.length) return '';
    var maxTaux = Math.max.apply(null, l.map(function (x) { return x.taux || 0; })) || 1;

    return '<div class="carte">' +
      '<div class="carte-titre">Rentabilité par client <span class="muted">— depuis le début</span></div>' +
      '<div class="barres">' + l.map(function (x) {
        return '<div class="barre-ligne rentab" data-action="fin.versClient" data-id="' + x.c.id + '">' +
          '<div class="barre-nom">' + U.esc(x.c.nom) + '</div>' +
          '<div class="barre"><div class="barre-plein" style="width:' + ((x.taux || 0) / maxTaux * 100) + '%;background:' + x.c.couleur + '"></div></div>' +
          '<div class="barre-val"><strong>' + U.taux(x.taux) + '</strong></div>' +
          '<div class="barre-extra muted">' + U.fmtDuree(x.minutes) + ' · ' + U.argentCourt(x.ca) + '</div>' +
          '</div>';
      }).join('') + '</div>' +
      '<p class="aide">Le taux compte toutes les heures passées sur le client, aller-retours et retouches compris. C\'est ce chiffre-là qui dit si un tarif tient.</p>' +
      '</div>';
  }

  function transactions() {
    var b = bornes();
    var l = State.transactionsPeriode(b.du, b.au);

    var form = ajoutOuvert ? '<form class="form-transaction" data-submit="fin.ajouter">' +
      '<div class="grille-form">' +
        '<label class="champ c-court"><span>Date</span>' +
          '<input type="date" name="date" value="' + (mois === U.moisCourant() ? U.aujourdhui() : b.au) + '" required></label>' +
        '<label class="champ c-court"><span>Type</span>' +
          '<select name="type" data-change="fin.typeChange">' +
            '<option value="depense">Dépense</option><option value="revenu">Revenu</option>' +
          '</select></label>' +
        '<label class="champ c-court"><span>Montant</span>' +
          '<input type="number" name="montant" step="0.01" min="0" required placeholder="0,00"></label>' +
        '<label class="champ c-cat"><span>Libellé</span>' +
          '<input type="text" name="libelle" placeholder="ex. abonnement Adobe" required></label>' +
        '<label class="champ c-cli"><span>Catégorie</span>' +
          '<select name="categorieFinId">' + optionsCatFin('depense') + '</select></label>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn primaire">Ajouter</button>' +
        '<button type="button" class="btn" data-action="fin.fermerAjout">Annuler</button>' +
      '</div></form>' : '';

    return '<div class="carte">' +
      '<div class="carte-titre">Dépenses et revenus divers ' +
        '<button class="btn mini primaire" data-action="fin.ouvrirAjout">+ Ajouter</button></div>' +
      form +
      (l.length ? '<div class="lignes">' + l.map(function (t) {
        var c = State.categorieFin(t.categorieFinId);
        return '<div class="ligne">' +
          '<div class="l-heures muted">' + U.esc(U.dateLisible(t.date)) + '</div>' +
          '<div class="l-quoi">' +
            '<span class="pastille" style="background:' + (c ? c.couleur : '#8b90a0') + '"></span>' +
            U.esc(t.libelle) +
            (c ? '<span class="l-client">' + U.esc(c.nom) + '</span>' : '') +
          '</div>' +
          '<div class="l-montant ' + t.type + '">' + (t.type === 'depense' ? '−' : '+') + ' ' + U.argent(t.montant) + '</div>' +
          '<div class="l-actions"><button class="btn mini danger" data-action="fin.supprTransaction" data-id="' + t.id + '">Suppr.</button></div>' +
          '</div>';
      }).join('') + '</div>'
        : '<div class="vide">Aucun mouvement ce mois-ci.</div>') +
      '</div>';
  }

  function optionsCatFin(type) {
    return State.categoriesFin().filter(function (c) { return c.type === type; })
      .map(function (c) { return '<option value="' + c.id + '">' + U.esc(c.nom) + '</option>'; }).join('');
  }

  function render() {
    return navMois() + kpis() + facturation() + parClient() + transactions();
  }

  /* --- Actions --- */

  App.actions['fin.mois'] = function (el) {
    mois = el.dataset.abs || U.ajouterMois(mois, +el.dataset.delta);
    App.render();
  };

  App.actions['fin.ouvrirAjout'] = function () { ajoutOuvert = true; App.render(); };
  App.actions['fin.fermerAjout'] = function () { ajoutOuvert = false; App.render(); };

  App.actions['fin.typeChange'] = function (el) {
    var f = el.closest('form');
    f.categorieFinId.innerHTML = optionsCatFin(el.value);
  };

  App.actions['fin.ajouter'] = function (f) {
    State.ajouterTransaction({
      date: f.date.value,
      type: f.type.value,
      montant: Math.abs(parseFloat(f.montant.value) || 0),
      libelle: f.libelle.value.trim(),
      categorieFinId: f.categorieFinId.value || null,
      clientId: null
    });
    mois = U.mois(f.date.value);
    ajoutOuvert = false;
    App.render();
    App.message('Mouvement enregistré.', 'ok');
  };

  App.actions['fin.supprTransaction'] = function (el) {
    if (!confirm('Supprimer cette ligne ?')) return;
    State.supprimerTransaction(el.dataset.id);
    App.render();
  };

  function groupePour(clientId) {
    return State.aFacturer().find(function (g) { return (g.clientId || '') === clientId; });
  }

  App.actions['fin.copier'] = function (el) {
    var g = groupePour(el.dataset.client);
    if (!g) return;
    var nom = g.clientId ? State.nomClient(g.clientId) : 'Sans client';
    var largeur = Math.max.apply(null, g.videos.map(function (v) { return v.titre.length; }));
    // La période vient des vidéos du lot, pas du mois affiché : un lot peut
    // déborder sur deux mois.
    var dates = g.videos.map(function (v) { return State.dateCA(v); }).sort();
    var d1 = dates[0], d2 = dates[dates.length - 1];
    var periode = U.mois(d1) === U.mois(d2)
      ? U.moisLisible(U.mois(d1))
      : 'du ' + U.dateLisible(d1) + ' au ' + U.dateLisible(d2);
    var txt = nom + ' — ' + periode + '\n\n' +
      g.videos.map(function (v) {
        return '· ' + v.titre.padEnd(largeur + 2, ' ') + U.argent(v.prix).padStart(12, ' ');
      }).join('\n') +
      '\n\nTotal : ' + U.argent(g.total) + ' (' + g.videos.length + ' vidéos, ' + U.fmtDuree(g.minutes) + ')';
    App.copier(txt, 'Récap copié dans le presse-papier.');
  };

  App.actions['fin.facturer'] = function (el) {
    var g = groupePour(el.dataset.client);
    if (!g) return;
    if (!confirm('Marquer ' + g.videos.length + ' vidéo(s) comme facturées (' + U.argent(g.total) + ') ?')) return;
    var auj = U.aujourdhui();
    g.videos.forEach(function (v) {
      State.modifier(v, {
        statut: 'facturee',
        dateFacture: auj,
        dateLivraison: v.dateLivraison || State.dateCA(v)
      });
    });
    App.render();
    App.message(U.argent(g.total) + ' marqués comme facturés.', 'ok');
  };

  App.actions['fin.versClient'] = function (el) {
    VueVideos.filtrerClient(el.dataset.id);
    App.aller('videos');
  };

  return {
    titre: 'Finances',
    render: render,
    set mois(v) { mois = v; }
  };
})();
