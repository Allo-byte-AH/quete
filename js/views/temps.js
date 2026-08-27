/* Vue Temps — saisie et journal des heures.
 * Objectif de design : reproduire le carnet papier, en plus rapide.
 * Une entrée doit se saisir en moins de 5 secondes, sinon l'outil est inutile.
 */
var VueTemps = (function () {
  var date = U.aujourdhui();
  var editId = null;
  var nouveauClient = false;

  /* --- Fragments réutilisables --- */

  function optionsCategories(sel) {
    return State.categories().filter(function (c) { return !c.archive || c.id === sel; })
      .map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + U.esc(c.nom) + '</option>';
      }).join('');
  }
  function optionsClients(sel) {
    return '<option value="">— aucun client —</option>' +
      State.clients().filter(function (c) { return !c.archive || c.id === sel; })
        .map(function (c) {
          return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + U.esc(c.nom) + '</option>';
        }).join('');
  }

  // Chaînage : par défaut, on reprend là où la dernière entrée du jour s'est arrêtée.
  function debutSuggere() {
    var l = State.entreesDuJour(date);
    if (!l.length) return '';
    return l[l.length - 1].fin || '';
  }

  function chronoEnCours() {
    var c = State.d.chrono;
    if (!c) return '';
    var ecoule = Math.floor((Date.now() - c.ts) / 60000);
    return '' +
      '<div class="chrono actif">' +
        '<div class="chrono-pulse"></div>' +
        '<div class="chrono-info">' +
          '<div class="chrono-temps" id="chrono-temps">' + U.fmtDuree(ecoule) + '</div>' +
          '<div class="chrono-quoi">' +
            '<span class="pastille" style="background:' + State.couleurCategorie(c.categorieId) + '"></span>' +
            U.esc(State.nomCategorie(c.categorieId)) +
            (c.clientId ? ' · ' + U.esc(State.nomClient(c.clientId)) : '') +
            (c.videoId ? '<span class="l-video">▸ ' + U.esc(State.titreVideo(c.videoId) || '?') + '</span>' : '') +
            ' <span class="muted">depuis ' + c.debut + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="btn danger" data-action="temps.arreter">■ Arrêter</button>' +
      '</div>';
  }

  function formulaire() {
    var e = editId ? State.entries().find(function (x) { return x.id === editId; }) : null;
    var combos = State.combosFrequents(5);

    var chips = combos.length ? '<div class="chips">' + combos.map(function (c) {
      return '<button type="button" class="chip" data-action="temps.combo" ' +
        'data-cat="' + c.categorieId + '" data-cli="' + (c.clientId || '') + '">' +
        '<span class="pastille" style="background:' + State.couleurCategorie(c.categorieId) + '"></span>' +
        U.esc(State.nomCategorie(c.categorieId)) +
        (c.clientId ? ' · ' + U.esc(State.nomClient(c.clientId)) : '') +
        '</button>';
    }).join('') + '</div>' : '';

    // Reprendre une vidéo en un clic : plusieurs passes (derush, montage,
    // retouches) atterrissent sur le même livrable.
    var recentes = State.videosRecentes(5);
    var chipsVideo = recentes.length ? '<div class="chips chips-video">' +
      '<span class="chips-label">Vidéos&nbsp;:</span>' + recentes.map(function (v) {
        return '<button type="button" class="chip chip-v" data-action="temps.chipVideo" ' +
          'data-titre="' + U.esc(v.titre) + '" data-cli="' + (v.clientId || '') + '">' +
          '▸ ' + U.esc(v.titre) +
          (v.clientId ? ' <span class="muted">· ' + U.esc(State.nomClient(v.clientId)) + '</span>' : '') +
          '</button>';
      }).join('') + '</div>' : '';

    var datalist = '<datalist id="liste-videos">' +
      State.videosRecentes(200).map(function (v) {
        return '<option value="' + U.esc(v.titre) + '">' +
          (v.clientId ? U.esc(State.nomClient(v.clientId)) : 'sans client') + '</option>';
      }).join('') + '</datalist>';

    return '' +
      '<form class="carte form-entree" data-submit="temps.enregistrer">' +
        '<div class="form-titre">' + (e ? 'Modifier l\'entrée' : 'Nouvelle entrée') + '</div>' +
        chips + chipsVideo + datalist +
        '<div class="grille-form">' +
          '<label class="champ c-date"><span>Date</span>' +
            '<input type="date" name="date" value="' + (e ? e.date : date) + '" required></label>' +
          '<label class="champ c-h"><span>Début</span>' +
            '<input type="time" name="debut" value="' + (e ? e.debut : debutSuggere()) + '" required></label>' +
          '<label class="champ c-h"><span>Fin</span>' +
            '<input type="time" name="fin" value="' + (e ? e.fin : '') + '"></label>' +
          '<label class="champ c-cat"><span>Catégorie</span>' +
            '<select name="categorieId" required>' + optionsCategories(e ? e.categorieId : null) + '</select></label>' +
          '<label class="champ c-cli"><span>Client</span>' +
            '<div class="avec-bouton">' +
              (nouveauClient
                ? '<input type="text" name="nouveauClient" placeholder="Nom du client" autofocus>'
                : '<select name="clientId">' + optionsClients(e ? e.clientId : null) + '</select>') +
              '<button type="button" class="btn mini" data-action="temps.toggleClient" title="Nouveau client">' +
                (nouveauClient ? '×' : '+') + '</button>' +
            '</div></label>' +
          '<label class="champ c-video"><span>Vidéo / livrable</span>' +
            '<input type="text" name="video" list="liste-videos" autocomplete="off" ' +
              'value="' + (e && e.videoId ? U.esc(State.titreVideo(e.videoId) || '') : '') + '" ' +
              'placeholder="ex. Reel produit #12"></label>' +
          '<label class="champ c-note"><span>Note</span>' +
            '<input type="text" name="note" value="' + (e ? U.esc(e.note) : '') + '" placeholder="ex. rushs, sous-titres…"></label>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button type="submit" class="btn primaire">' + (e ? 'Enregistrer' : 'Ajouter') + '</button>' +
          (e
            ? '<button type="button" class="btn" data-action="temps.annulerEdit">Annuler</button>'
            : (State.d.chrono ? '' : '<button type="button" class="btn vert" data-action="temps.demarrer">▶ Démarrer maintenant</button>')) +
          '<span class="aide">Le début se remplit tout seul à la fin de l\'entrée précédente.</span>' +
        '</div>' +
      '</form>';
  }

  // Ruban visuel de la journée : chaque bloc positionné sur l'amplitude travaillée.
  function ruban(entrees) {
    if (!entrees.length) return '';
    var min = 1440, max = 0;
    entrees.forEach(function (e) {
      var a = U.parseHM(e.debut);
      if (a === null) return;
      min = Math.min(min, a);
      max = Math.max(max, a + U.duree(e));
    });
    if (max <= min) return '';
    var span = max - min;
    var blocs = entrees.map(function (e) {
      var a = U.parseHM(e.debut);
      if (a === null) return '';
      var d = U.duree(e);
      return '<div class="ruban-bloc" title="' + U.esc(State.nomCategorie(e.categorieId)) + ' — ' + U.fmtDuree(d) + '" ' +
        'style="left:' + ((a - min) / span * 100) + '%;width:' + (d / span * 100) + '%;' +
        'background:' + State.couleurCategorie(e.categorieId) + '"></div>';
    }).join('');
    return '<div class="ruban"><div class="ruban-piste">' + blocs + '</div>' +
      '<div class="ruban-legende"><span>' + U.versHM(min) + '</span><span>' + U.versHM(max) + '</span></div></div>';
  }

  function liste() {
    var entrees = State.entreesDuJour(date);
    var total = State.totalMinutes(entrees);
    var fact = State.totalFacturable(entrees);
    var cible = State.d.settings.heuresCibleJour * 60;

    var lignes = entrees.length
      ? entrees.map(function (e) {
          var c = State.categorie(e.categorieId);
          return '' +
            '<div class="ligne' + (e.id === editId ? ' en-edition' : '') + '">' +
              '<div class="l-heures">' + U.esc(e.debut) + '<span class="muted"> → </span>' + U.esc(e.fin || '…') + '</div>' +
              '<div class="l-duree">' + U.fmtDuree(U.duree(e)) + '</div>' +
              '<div class="l-quoi">' +
                '<span class="pastille" style="background:' + State.couleurCategorie(e.categorieId) + '"></span>' +
                U.esc(State.nomCategorie(e.categorieId)) +
                (c && c.facturable ? '<span class="tag-fact">€</span>' : '') +
                (e.clientId ? '<span class="l-client">' + U.esc(State.nomClient(e.clientId)) + '</span>' : '') +
                (e.videoId ? '<span class="l-video">▸ ' + U.esc(State.titreVideo(e.videoId) || '?') + '</span>' : '') +
                (e.note ? '<span class="l-note">' + U.esc(e.note) + '</span>' : '') +
              '</div>' +
              // Toujours visible, contrairement aux actions au survol : c'est
              // le geste le plus fréquent de la journée.
              '<button class="relance" data-action="temps.relancer" data-id="' + e.id + '" ' +
                'title="Relancer le chrono sur cette tâche">▶</button>' +
              '<div class="l-actions">' +
                '<button class="btn mini" data-action="temps.editer" data-id="' + e.id + '">Modifier</button>' +
                '<button class="btn mini danger" data-action="temps.supprimer" data-id="' + e.id + '">Suppr.</button>' +
              '</div>' +
            '</div>';
        }).join('')
      : '<div class="vide">Rien de noté pour ce jour.</div>';

    return '' +
      '<div class="carte">' +
        '<div class="jour-entete">' +
          '<button class="btn mini" data-action="temps.jour" data-delta="-1">‹</button>' +
          '<div class="jour-titre">' +
            '<strong>' + U.esc(U.libelleRelatif(date)) + '</strong>' +
            '<span class="muted">' + U.esc(U.dateLongue(date)) + '</span>' +
          '</div>' +
          '<button class="btn mini" data-action="temps.jour" data-delta="1">›</button>' +
          (date !== U.aujourdhui() ? '<button class="btn mini" data-action="temps.jour" data-abs="' + U.aujourdhui() + '">Aujourd\'hui</button>' : '') +
        '</div>' +
        '<div class="jour-total">' +
          '<div class="gros">' + U.fmtDuree(total) + '</div>' +
          '<div class="barre"><div class="barre-plein" style="width:' + Math.min(100, U.pct(total, cible)) + '%"></div></div>' +
          '<div class="muted">objectif ' + U.fmtDuree(cible) + ' · ' +
            '<strong style="color:var(--vert)">' + U.fmtDuree(fact) + '</strong> facturable (' + U.pct(fact, total) + '%)</div>' +
        '</div>' +
        ruban(entrees) +
        '<div class="lignes">' + lignes + '</div>' +
      '</div>';
  }

  function render() {
    return chronoEnCours() + formulaire() + liste();
  }

  /* --- Actions --- */

  // Le client saisi peut être nouveau ; on le crée à la volée.
  function resoudreClient(f) {
    if (f.nouveauClient && f.nouveauClient.value.trim()) {
      nouveauClient = false;
      return State.ajouterClient(f.nouveauClient.value.trim()).id;
    }
    return (f.clientId ? f.clientId.value : '') || null;
  }

  // Idem pour la vidéo : un titre inconnu crée le livrable, sans prix.
  // Le prix se met plus tard, au moment de facturer.
  var videoCreee = null;
  function resoudreVideo(f, clientId) {
    videoCreee = null;
    var titre = f.video ? f.video.value.trim() : '';
    if (!titre) return null;
    var v = State.trouverVideo(titre, clientId);
    if (!v) {
      v = State.ajouterVideo(titre, clientId, null);
      videoCreee = v.titre;
    } else if (!v.clientId && clientId) {
      State.modifier(v, { clientId: clientId });
    }
    return v.id;
  }

  App.actions['temps.chipVideo'] = function (el) {
    var f = document.querySelector('.form-entree');
    f.video.value = el.dataset.titre;
    if (f.clientId && el.dataset.cli) f.clientId.value = el.dataset.cli;
    (f.fin.value ? f.note : f.fin).focus();
  };

  App.actions['temps.jour'] = function (el) {
    date = el.dataset.abs || U.ajouterJours(date, +el.dataset.delta);
    editId = null;
    App.render();
  };

  // Échange le select et le champ texte sur place : un re-rendu complet
  // effacerait les heures déjà tapées.
  App.actions['temps.toggleClient'] = function (el) {
    var boite = el.parentElement;
    var ancien = boite.querySelector('select, input[name="nouveauClient"]');
    nouveauClient = !nouveauClient;
    var neuf;
    if (nouveauClient) {
      neuf = document.createElement('input');
      neuf.type = 'text';
      neuf.name = 'nouveauClient';
      neuf.placeholder = 'Nom du client';
    } else {
      neuf = document.createElement('select');
      neuf.name = 'clientId';
      neuf.innerHTML = optionsClients(null);
    }
    boite.replaceChild(neuf, ancien);
    el.textContent = nouveauClient ? '×' : '+';
    el.title = nouveauClient ? 'Choisir un client existant' : 'Nouveau client';
    neuf.focus();
  };

  App.actions['temps.combo'] = function (el) {
    var f = document.querySelector('.form-entree');
    f.categorieId.value = el.dataset.cat;
    if (f.clientId) f.clientId.value = el.dataset.cli || '';
    (f.fin.value ? f.note : f.fin).focus();
  };

  App.actions['temps.demarrer'] = function () {
    var f = document.querySelector('.form-entree');
    var clientId = resoudreClient(f);
    lancer({
      categorieId: f.categorieId.value,
      clientId: clientId,
      videoId: resoudreVideo(f, clientId),
      note: f.note.value.trim()
    });
  };

  // Relance à l'heure actuelle exactement la même tâche : même catégorie, même
  // client, même vidéo, même note.
  App.actions['temps.relancer'] = function (el) {
    var e = State.entries().find(function (x) { return x.id === el.dataset.id; });
    if (!e) return;
    lancer(e);
  };

  function lancer(modele) {
    var precedent = State.demarrerChrono(modele);
    date = U.aujourdhui();
    App.render();
    var msg = '▶ ' + State.libelleTache(modele);
    if (precedent) {
      msg = precedent.entree
        ? '« ' + State.libelleTache(precedent.chrono) + ' » arrêté à ' + U.fmtDuree(precedent.ecoule) + ' · ' + msg
        : 'Chrono précédent abandonné (moins d\'une minute) · ' + msg;
    }
    App.message(msg, 'ok');
  }

  App.actions['temps.arreter'] = function () {
    if (!State.d.chrono) return;
    if (State.chronoEcoule() < 1 && !confirm('Moins d\'une minute écoulée. Enregistrer quand même ?')) {
      State.annulerChrono();
      App.render();
      App.message('Chrono abandonné.', 'alerte');
      return;
    }
    var r = State.arreterChrono(0);
    date = r.chrono.date;
    App.render();
    App.message(U.fmtDuree(r.ecoule) + ' enregistré sur « ' + State.libelleTache(r.chrono) + ' ».', 'ok');
  };

  App.actions['temps.editer'] = function (el) {
    editId = el.dataset.id;
    App.render();
    var f = document.querySelector('.form-entree');
    if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  App.actions['temps.annulerEdit'] = function () { editId = null; App.render(); };

  App.actions['temps.supprimer'] = function (el) {
    if (!confirm('Supprimer cette entrée ?')) return;
    State.supprimerEntree(el.dataset.id);
    if (editId === el.dataset.id) editId = null;
    App.render();
  };

  App.actions['temps.enregistrer'] = function (f) {
    var clientId = resoudreClient(f);
    var brut = {
      date: f.date.value,
      debut: f.debut.value,
      fin: f.fin.value,
      categorieId: f.categorieId.value,
      clientId: clientId,
      videoId: resoudreVideo(f, clientId),
      note: f.note.value.trim()
    };
    if (!brut.fin) { App.message('Indique une heure de fin (ou utilise « Démarrer maintenant »).', 'erreur'); return; }
    if (U.parseHM(brut.debut) === null || U.parseHM(brut.fin) === null) {
      App.message('Heures invalides.', 'erreur'); return;
    }
    if (U.duree(brut) === 0) { App.message('Début et fin identiques.', 'erreur'); return; }

    var conflits = State.chevauchements(brut, editId);

    if (editId) { State.majEntree(editId, brut); editId = null; }
    else { State.ajouterEntree(brut); }

    date = brut.date;
    App.render();
    App.message(
      U.fmtDuree(U.duree(brut)) + ' enregistré' +
      (videoCreee ? ' · vidéo « ' + videoCreee + ' » créée' : '') +
      (conflits.length ? ' — attention, chevauche ' + conflits.length + ' entrée(s) existante(s)' : ''),
      conflits.length ? 'alerte' : 'ok'
    );
    var nf = document.querySelector('.form-entree');
    if (nf) nf.debut.focus();
  };

  return {
    titre: 'Temps',
    render: render,
    // Rafraîchit le chrono chaque seconde sans re-rendre toute la page.
    tick: function () {
      var c = State.d && State.d.chrono;
      var el = document.getElementById('chrono-temps');
      if (c && el) el.textContent = U.fmtDuree(Math.floor((Date.now() - c.ts) / 60000));
    },
    get date() { return date; },
    set date(v) { date = v; }
  };
})();
