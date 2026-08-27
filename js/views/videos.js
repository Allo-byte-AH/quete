/* Vue Vidéos — le livrable est l'unité de travail.
 * Temps rattaché + prix = taux horaire réel, vidéo par vidéo.
 */
var VueVideos = (function () {
  var filtreClient = '';
  var filtreStatut = '';
  var recherche = '';
  var ouverts = {};
  var creation = false;

  function optionsClients(sel, avecVide) {
    return (avecVide ? '<option value="">— aucun client —</option>' : '') +
      State.clients().filter(function (c) { return !c.archive || c.id === sel; })
        .map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + U.esc(c.nom) + '</option>';
        }).join('');
  }
  function optionsStatuts(sel) {
    return State.STATUTS.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + s.nom + '</option>';
    }).join('');
  }

  function filtrees() {
    var q = recherche.trim().toLowerCase();
    return State.videos().filter(function (v) {
      if (filtreClient && v.clientId !== (filtreClient === '__sans' ? null : filtreClient)) return false;
      if (filtreStatut && v.statut !== filtreStatut) return false;
      if (q && v.titre.toLowerCase().indexOf(q) === -1 &&
          (State.nomClient(v.clientId) || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return State.dateCA(b).localeCompare(State.dateCA(a)); });
  }

  function barreFiltres(n) {
    return '<div class="filtres">' +
      '<input type="search" class="recherche" placeholder="Rechercher une vidéo…" value="' + U.esc(recherche) + '" data-change="vid.recherche">' +
      '<select data-change="vid.filtreClient">' +
        '<option value="">Tous les clients</option>' +
        '<option value="__sans"' + (filtreClient === '__sans' ? ' selected' : '') + '>Sans client</option>' +
        optionsClients(filtreClient) +
      '</select>' +
      '<select data-change="vid.filtreStatut">' +
        '<option value="">Tous les statuts</option>' +
        optionsStatuts(filtreStatut) +
      '</select>' +
      '<span class="muted">' + n + ' vidéo' + (n > 1 ? 's' : '') + '</span>' +
      '<button class="btn primaire" data-action="vid.nouvelle">+ Nouvelle vidéo</button>' +
      '</div>';
  }

  function formCreation() {
    if (!creation) return '';
    return '<form class="carte form-creation" data-submit="vid.creer">' +
      '<div class="form-titre">Nouvelle vidéo</div>' +
      '<div class="grille-form">' +
        '<label class="champ c-cat"><span>Titre</span>' +
          '<input type="text" name="titre" placeholder="ex. Reel produit #12" required autofocus></label>' +
        '<label class="champ c-cli"><span>Client</span>' +
          '<select name="clientId">' + optionsClients(filtreClient === '__sans' ? '' : filtreClient, true) + '</select></label>' +
        '<label class="champ c-court"><span>Prix</span>' +
          '<input type="number" name="prix" step="0.01" min="0" placeholder="—"></label>' +
      '</div>' +
      '<div class="form-actions">' +
        '<button type="submit" class="btn primaire">Créer</button>' +
        '<button type="button" class="btn" data-action="vid.annulerCreation">Annuler</button>' +
        '<span class="aide">Le prix peut attendre : il se remplit au moment de facturer.</span>' +
      '</div></form>';
  }

  function detail(v) {
    var e = State.entreesVideo(v.id);
    if (!e.length) return '<div class="vid-detail"><div class="vide">Aucun temps rattaché à cette vidéo.</div></div>';
    return '<div class="vid-detail">' + e.map(function (x) {
      return '<div class="ligne compacte">' +
        '<div class="l-heures muted">' + U.esc(U.dateLisible(x.date)) + ' · ' + U.esc(x.debut) + '→' + U.esc(x.fin) + '</div>' +
        '<div class="l-duree">' + U.fmtDuree(U.duree(x)) + '</div>' +
        '<div class="l-quoi">' +
          '<span class="pastille" style="background:' + State.couleurCategorie(x.categorieId) + '"></span>' +
          U.esc(State.nomCategorie(x.categorieId)) +
          (x.note ? '<span class="l-note">' + U.esc(x.note) + '</span>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }

  function ligne(v) {
    var min = State.minutesVideo(v.id);
    var t = State.tauxVideo(v);
    var st = State.statut(v.statut);
    var ouvert = !!ouverts[v.id];
    return '' +
      '<div class="vid-bloc' + (ouvert ? ' ouvert' : '') + '">' +
        '<div class="vid-ligne">' +
          '<button class="vid-chevron" data-action="vid.toggle" data-id="' + v.id + '" title="Voir le temps passé">' + (ouvert ? '▾' : '▸') + '</button>' +
          '<input type="text" class="vid-titre" value="' + U.esc(v.titre) + '" data-change="vid.titre" data-id="' + v.id + '">' +
          '<select class="vid-client" data-change="vid.client" data-id="' + v.id + '">' + optionsClients(v.clientId, true) + '</select>' +
          '<div class="vid-temps" title="Temps rattaché">' + (min ? U.fmtDuree(min) : '<span class="muted">—</span>') + '</div>' +
          '<div class="vid-prix"><input type="number" step="0.01" min="0" placeholder="prix" value="' +
            (v.prix === null || v.prix === undefined ? '' : v.prix) + '" data-change="vid.prix" data-id="' + v.id + '"></div>' +
          '<div class="vid-taux' + (t === null ? ' muted' : (t < 25 ? ' bas' : (t >= 60 ? ' haut' : ''))) + '">' + U.taux(t) + '</div>' +
          '<select class="vid-statut st-' + v.statut + '" data-change="vid.statut" data-id="' + v.id + '">' + optionsStatuts(v.statut) + '</select>' +
          '<div class="vid-actions">' +
            '<button class="relance" data-action="vid.relancer" data-id="' + v.id + '" ' +
              'title="Relancer le chrono sur cette vidéo">▶</button>' +
            '<button class="btn mini danger" data-action="vid.supprimer" data-id="' + v.id + '">×</button>' +
          '</div>' +
        '</div>' +
        (ouvert ? detail(v) : '') +
      '</div>';
  }

  function render() {
    var l = filtrees();
    var minTot = l.reduce(function (s, v) { return s + State.minutesVideo(v.id); }, 0);
    var caTot = l.reduce(function (s, v) { return s + (v.prix || 0); }, 0);
    var tauxMoyen = minTot > 0 ? caTot / (minTot / 60) : null;
    var sansPrix = l.filter(function (v) { return !(v.prix > 0); }).length;

    return '' +
      barreFiltres(l.length) +
      formCreation() +
      '<div class="carte">' +
        '<div class="vid-entete">' +
          '<span></span><span>Titre</span><span>Client</span><span>Temps</span><span>Prix</span><span>Taux</span><span>Statut</span><span></span>' +
        '</div>' +
        (l.length
          ? '<div class="vid-liste">' + l.map(ligne).join('') + '</div>'
          : '<div class="vide">Aucune vidéo. Elles se créent aussi toutes seules en tapant un titre dans la saisie du temps.</div>') +
        (l.length
          ? '<div class="vid-totaux">' +
              '<strong>' + l.length + '</strong> vidéos · <strong>' + U.fmtDuree(minTot) + '</strong> · ' +
              '<strong>' + U.argent(caTot) + '</strong> · taux moyen <strong>' + U.taux(tauxMoyen) + '</strong>' +
              (sansPrix ? ' <span class="alerte-inline">' + sansPrix + ' sans prix</span>' : '') +
            '</div>'
          : '') +
      '</div>';
  }

  /* --- Actions --- */

  App.actions['vid.recherche'] = function (el) { recherche = el.value; App.render(); };
  App.actions['vid.filtreClient'] = function (el) { filtreClient = el.value; App.render(); };
  App.actions['vid.filtreStatut'] = function (el) { filtreStatut = el.value; App.render(); };
  App.actions['vid.toggle'] = function (el) {
    ouverts[el.dataset.id] = !ouverts[el.dataset.id];
    App.render();
  };
  // Relance le chrono sur cette vidéo en reprenant la dernière tâche qui y a
  // été faite. Si la vidéo n'a encore aucun temps, on part de sa première
  // catégorie facturable — le prochain geste est presque toujours du montage.
  App.actions['vid.relancer'] = function (el) {
    var v = State.video(el.dataset.id);
    var e = State.entreesVideo(v.id);
    var derniere = e.length ? e[e.length - 1] : null;
    var defaut = State.categories().find(function (c) { return c.facturable && !c.archive; })
              || State.categories()[0];
    var modele = {
      categorieId: derniere ? derniere.categorieId : (defaut && defaut.id),
      clientId: derniere ? derniere.clientId : v.clientId,
      videoId: v.id,
      note: derniere ? derniere.note : ''
    };
    var precedent = State.demarrerChrono(modele);
    App.aller('temps');
    App.message(
      (precedent && precedent.entree
        ? '« ' + State.libelleTache(precedent.chrono) + ' » arrêté à ' + U.fmtDuree(precedent.ecoule) + ' · ' : '') +
      '▶ ' + State.libelleTache(modele), 'ok');
  };

  App.actions['vid.nouvelle'] = function () { creation = true; App.render(); };
  App.actions['vid.annulerCreation'] = function () { creation = false; App.render(); };

  App.actions['vid.creer'] = function (f) {
    var v = State.ajouterVideo(f.titre.value.trim(), f.clientId.value || null,
      f.prix.value === '' ? null : parseFloat(f.prix.value));
    creation = false;
    App.render();
    App.message('« ' + v.titre +' » créée.', 'ok');
  };

  App.actions['vid.titre'] = function (el) {
    State.modifier(State.video(el.dataset.id), { titre: el.value.trim() });
  };
  App.actions['vid.client'] = function (el) {
    State.modifier(State.video(el.dataset.id), { clientId: el.value || null });
    App.render();
  };
  App.actions['vid.prix'] = function (el) {
    State.modifier(State.video(el.dataset.id), { prix: el.value === '' ? null : parseFloat(el.value) });
    App.render();
  };
  App.actions['vid.statut'] = function (el) {
    var v = State.video(el.dataset.id);
    var patch = { statut: el.value };
    // Passer en « livrée » date la livraison si elle ne l'était pas encore :
    // c'est cette date qui rattache le CA à un mois.
    if ((el.value === 'livree' || el.value === 'facturee' || el.value === 'payee') && !v.dateLivraison) {
      var e = State.entreesVideo(v.id);
      patch.dateLivraison = e.length ? e[e.length - 1].date : U.aujourdhui();
    }
    State.modifier(v, patch);
    App.render();
  };
  App.actions['vid.supprimer'] = function (el) {
    var v = State.video(el.dataset.id);
    var liees = State.entreesVideo(v.id);
    if (!confirm('Supprimer « ' + v.titre + ' » ?' +
      (liees.length ? '\n\n' + liees.length + ' entrée(s) de temps y sont rattachées : elles seront conservées, mais détachées.' : ''))) return;
    // Détacher est une modification comme une autre : elle doit être horodatée,
    // sinon un autre appareil la réécraserait avec son ancien rattachement.
    liees.forEach(function (e) { State.modifier(e, { videoId: null }); });
    State.supprimerEnreg('videos', v.id);
    App.render();
  };

  return {
    titre: 'Vidéos',
    render: render,
    filtrerClient: function (id) { filtreClient = id; filtreStatut = ''; recherche = ''; }
  };
})();
