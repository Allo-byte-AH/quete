/* Vue Réglages — objectifs, clients, catégories, et gestion des données. */
var VueReglages = (function () {

  function objectifs() {
    var s = State.d.settings;
    return '<div class="carte">' +
      '<div class="carte-titre">Objectifs</div>' +
      '<div class="grille-form">' +
        '<label class="champ c-court"><span>Heures / jour</span>' +
          '<input type="number" min="0" max="24" step="0.5" value="' + s.heuresCibleJour + '" data-change="reg.setting" data-cle="heuresCibleJour"></label>' +
        '<label class="champ c-court"><span>Heures / semaine</span>' +
          '<input type="number" min="0" max="120" step="1" value="' + s.heuresCibleSemaine + '" data-change="reg.setting" data-cle="heuresCibleSemaine"></label>' +
        '<label class="champ c-court"><span>Devise</span>' +
          '<input type="text" maxlength="4" value="' + U.esc(s.devise) + '" data-change="reg.devise"></label>' +
      '</div></div>';
  }

  function categoriesFin() {
    return '<div class="carte">' +
      '<div class="carte-titre">Catégories de dépenses et revenus divers ' +
        '<span class="muted">— le CA des vidéos ne passe pas par ici</span></div>' +
      '<div class="lignes">' + State.categoriesFin().map(function (c) {
        return '<div class="ligne">' +
          '<input type="color" value="' + c.couleur + '" data-change="reg.catFinCouleur" data-id="' + c.id + '" class="pick">' +
          '<input type="text" value="' + U.esc(c.nom) + '" data-change="reg.catFinNom" data-id="' + c.id + '" class="inline-txt">' +
          '<span class="tag-type ' + c.type + '">' + (c.type === 'depense' ? 'dépense' : 'revenu') + '</span>' +
          '<div class="l-actions">' +
            '<button class="btn mini danger" data-action="reg.catFinSuppr" data-id="' + c.id + '">Suppr.</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<form class="ajout" data-submit="reg.ajoutCatFin">' +
        '<input type="text" name="nom" placeholder="Nouvelle catégorie" required>' +
        '<select name="type"><option value="depense">Dépense</option><option value="revenu">Revenu</option></select>' +
        '<button class="btn primaire" type="submit">Ajouter</button>' +
      '</form></div>';
  }

  function clients() {
    var l = State.clients();
    return '<div class="carte">' +
      '<div class="carte-titre">Clients</div>' +
      (l.length ? '<div class="lignes">' + l.map(function (c) {
        return '<div class="ligne' + (c.archive ? ' archive' : '') + '">' +
          '<input type="color" value="' + c.couleur + '" data-change="reg.clientCouleur" data-id="' + c.id + '" class="pick">' +
          '<input type="text" value="' + U.esc(c.nom) + '" data-change="reg.clientNom" data-id="' + c.id + '" class="inline-txt">' +
          '<label class="case tarif">tarif vidéo' +
            '<input type="number" step="0.01" min="0" class="tarif-input" placeholder="—" ' +
            'value="' + (c.tarifDefaut || '') + '" data-change="reg.clientTarif" data-id="' + c.id + '"></label>' +
          '<div class="muted mini-info">' + heuresClient(c.id) + '</div>' +
          '<div class="l-actions">' +
            '<button class="btn mini" data-action="reg.clientArchive" data-id="' + c.id + '">' + (c.archive ? 'Réactiver' : 'Archiver') + '</button>' +
            '<button class="btn mini danger" data-action="reg.clientSuppr" data-id="' + c.id + '">Suppr.</button>' +
          '</div></div>';
      }).join('') + '</div>' : '<div class="vide">Aucun client. Ils peuvent aussi se créer depuis la saisie.</div>') +
      '<form class="ajout" data-submit="reg.ajoutClient">' +
        '<input type="text" name="nom" placeholder="Nouveau client" required>' +
        '<button class="btn primaire" type="submit">Ajouter</button>' +
      '</form></div>';
  }

  function heuresClient(id) {
    var m = State.totalMinutes(State.entries().filter(function (e) { return e.clientId === id; }));
    return m ? U.fmtHeuresDec(m) + ' au total' : '—';
  }

  function categories() {
    return '<div class="carte">' +
      '<div class="carte-titre">Catégories <span class="muted">— « facturable » = temps refacturé à un client</span></div>' +
      '<div class="lignes">' + State.categories().map(function (c) {
        return '<div class="ligne' + (c.archive ? ' archive' : '') + '">' +
          '<input type="color" value="' + c.couleur + '" data-change="reg.catCouleur" data-id="' + c.id + '" class="pick">' +
          '<input type="text" value="' + U.esc(c.nom) + '" data-change="reg.catNom" data-id="' + c.id + '" class="inline-txt">' +
          '<label class="case"><input type="checkbox"' + (c.facturable ? ' checked' : '') +
            ' data-change="reg.catFact" data-id="' + c.id + '"> facturable</label>' +
          '<div class="l-actions">' +
            '<button class="btn mini" data-action="reg.catArchive" data-id="' + c.id + '">' + (c.archive ? 'Réactiver' : 'Archiver') + '</button>' +
          '</div></div>';
      }).join('') + '</div>' +
      '<form class="ajout" data-submit="reg.ajoutCat">' +
        '<input type="text" name="nom" placeholder="Nouvelle catégorie" required>' +
        '<button class="btn primaire" type="submit">Ajouter</button>' +
      '</form></div>';
  }

  function donnees() {
    var b = Storage.listerBackups();
    var ko = (Storage.taille() / 1024).toFixed(1).replace('.', ',');
    return '<div class="carte">' +
      '<div class="carte-titre">Données</div>' +
      '<p class="muted">Stockage : <strong>' +
        (Storage.mode === 'serveur' ? 'serveur local (partagé entre appareils)' : 'ce navigateur, sur cet appareil') +
      '</strong> · ' + ko + ' Ko · ' + State.entries().length + ' entrées.</p>' +
      '<div class="form-actions">' +
        '<button class="btn primaire" data-action="reg.exporter">↓ Exporter en JSON</button>' +
        '<button class="btn vert" data-action="reg.importerOuvrir" data-mode="fusion">↑ Importer et fusionner</button>' +
        '<button class="btn" data-action="reg.importerOuvrir" data-mode="remplacer">↑ Importer et remplacer</button>' +
        '<input type="file" id="fichier-import" accept="application/json,.json" hidden data-change="reg.importer">' +
        '<button class="btn danger" data-action="reg.effacer">Tout effacer</button>' +
      '</div>' +
      '<p class="aide"><strong>Fusionner</strong> réunit les deux copies sans rien perdre : à chaque conflit, ' +
      'c\'est la version la plus récemment modifiée qui gagne, enregistrement par enregistrement. ' +
      '<strong>Remplacer</strong> écrase tout par le fichier. Dans le doute, fusionne.</p>' +
      '<p class="aide">Exporte régulièrement : vider les données du navigateur effacerait tout. Une copie automatique est gardée chaque jour, 7 jours glissants.</p>' +
      (b.length ? '<div class="backups">' + b.map(function (x) {
        return '<button class="btn mini" data-action="reg.restaurer" data-cle="' + x.cle + '">↺ ' + U.dateLisible(x.date) + '</button>';
      }).join('') + '</div>' : '') +
      '</div>';
  }

  function synchronisation() {
    var c = Distant.charger() || {};
    var s = Sync.statut();
    var etats = {
      ajour: ['ok', 'À jour' + (s.derniere ? ' — dernière synchro à ' + s.derniere.toLocaleTimeString('fr-FR').slice(0, 5) : '')],
      occupe: ['attente', 'Synchronisation en cours…'],
      horsligne: ['attente', s.detail],
      erreur: ['erreur', s.detail],
      inactif: ['', 'Non configurée — les données restent sur cet appareil']
    };
    var e = etats[s.etat] || etats.inactif;

    return '<div class="carte">' +
      '<div class="carte-titre">Synchronisation <span class="muted">— dépôt GitHub privé</span></div>' +
      '<div class="sync-etat ' + e[0] + '">' + U.esc(e[1]) + '</div>' +
      '<form class="grille-form" data-submit="reg.syncEnregistrer">' +
        '<label class="champ c-cat"><span>Dépôt</span>' +
          '<input type="text" name="depot" value="' + U.esc(c.depot || '') + '" ' +
            'placeholder="utilisateur/quete-donnees" autocomplete="off" spellcheck="false"></label>' +
        '<label class="champ c-court"><span>Fichier</span>' +
          '<input type="text" name="chemin" value="' + U.esc(c.chemin || 'data.json') + '" autocomplete="off"></label>' +
        '<label class="champ c-note"><span>Jeton d\'accès</span>' +
          '<input type="password" name="jeton" value="' + U.esc(c.jeton || '') + '" ' +
            'placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>' +
        '<div class="champ c-note form-actions">' +
          '<button type="submit" class="btn primaire">Enregistrer et tester</button>' +
          (Distant.configure() ? '<button type="button" class="btn vert" data-action="reg.syncMaintenant">↻ Synchroniser</button>' +
            '<button type="button" class="btn danger" data-action="reg.syncOublier">Déconnecter</button>' : '') +
        '</div>' +
      '</form>' +
      '<p class="aide">Le jeton reste sur cet appareil et n\'entre jamais dans le fichier de données. ' +
      'Il faut le saisir une fois sur le PC et une fois sur le téléphone. ' +
      'En cas de perte d\'un appareil, révoque-le sur GitHub : les autres continueront avec un jeton neuf.</p>' +
      '</div>';
  }

  function application() {
    var sw = App.sw;
    var etat = !sw.supporte ? ['', 'Mode hors ligne indisponible (page ouverte en fichier local)']
      : !sw.enregistre ? ['attente', 'Mode hors ligne non installé']
      : sw.actif ? ['ok', 'Mode hors ligne actif — l\'application fonctionne sans réseau']
      : ['attente', 'Mode hors ligne installé, actif à la prochaine ouverture'];

    return '<div class="carte">' +
      '<div class="carte-titre">Application</div>' +
      '<div class="sync-etat ' + etat[0] + '">' + U.esc(etat[1]) + '</div>' +
      '<div class="form-actions">' +
        '<span class="version">Version <strong>' + U.esc(App.version) + '</strong></span>' +
        '<button class="btn" data-action="reg.majApp">↻ Rechercher une mise à jour</button>' +
      '</div>' +
      '<p class="aide">Les mises à jour arrivent d\'elles-mêmes à l\'ouverture. ' +
      'Ce bouton sert à ne pas attendre, ou à vérifier après une livraison. ' +
      'Réinstaller l\'application sur le téléphone n\'est jamais nécessaire.</p>' +
      '</div>';
  }

  function render() {
    return synchronisation() + application() + objectifs() + clients() + categories() + categoriesFin() + donnees();
  }

  /* --- Actions --- */

  App.actions['reg.setting'] = function (el) {
    State.d.settings[el.dataset.cle] = parseFloat(el.value) || 0;
    State.toucherSingleton('settings');
    State.sauver();
  };

  App.actions['reg.ajoutClient'] = function (f) {
    State.ajouterClient(f.nom.value.trim());
    App.render();
    App.message('Client ajouté.', 'ok');
  };
  App.actions['reg.clientNom'] = function (el) {
    State.modifier(State.client(el.dataset.id), { nom: el.value.trim() });
  };
  App.actions['reg.clientCouleur'] = function (el) {
    State.modifier(State.client(el.dataset.id), { couleur: el.value });
    App.render();
  };
  App.actions['reg.clientArchive'] = function (el) {
    var c = State.client(el.dataset.id);
    State.modifier(c, { archive: !c.archive });
    App.render();
  };
  App.actions['reg.clientSuppr'] = function (el) {
    var id = el.dataset.id;
    var liees = State.entries().filter(function (e) { return e.clientId === id; });
    if (liees.length && !confirm(liees.length + ' entrée(s) sont rattachées à ce client. Elles seront conservées mais sans client. Continuer ?')) return;
    if (!liees.length && !confirm('Supprimer ce client ?')) return;
    liees.forEach(function (e) { State.modifier(e, { clientId: null }); });
    State.supprimerEnreg('clients', id);
    App.render();
  };

  App.actions['reg.syncEnregistrer'] = async function (f) {
    Distant.configurer({ depot: f.depot.value, jeton: f.jeton.value, chemin: f.chemin.value });
    if (!Distant.configure()) {
      Sync.arreter(); App.render();
      App.message('Dépôt et jeton sont tous deux nécessaires.', 'erreur');
      return;
    }
    App.message('Vérification…', 'ok');
    try {
      var info = await Distant.tester();
      App.render();
      App.message('Connecté à ' + info.depot + (info.prive ? ' (privé)' : ' — attention, ce dépôt est PUBLIC') +
        ' · ' + info.fichier, info.prive ? 'ok' : 'alerte');
      Sync.demarrer();
    } catch (e) {
      App.render();
      App.message(e.message, 'erreur');
    }
  };
  App.actions['reg.majApp'] = function () { App.chercherMiseAJour(); };

  App.actions['reg.syncMaintenant'] = function () { Sync.maintenant().then(function () { App.render(); }); };
  App.actions['reg.syncOublier'] = function () {
    if (!confirm('Déconnecter la synchronisation ?\n\nTes données restent sur cet appareil et dans le dépôt, rien n\'est supprimé.')) return;
    Distant.oublier();
    Sync.arreter();
    App.render();
    App.message('Synchronisation déconnectée.', 'ok');
  };

  App.actions['reg.devise'] = function (el) {
    State.d.settings.devise = el.value.trim() || '€';
    U.setDevise(State.d.settings.devise);
    State.toucherSingleton('settings');
    State.sauver(); App.render();
  };
  App.actions['reg.clientTarif'] = function (el) {
    State.modifier(State.client(el.dataset.id),
      { tarifDefaut: el.value === '' ? null : parseFloat(el.value) });
  };

  App.actions['reg.ajoutCatFin'] = function (f) {
    State.d.categoriesFin.push(State.marquer({
      id: U.id(), nom: f.nom.value.trim(), type: f.type.value,
      couleur: U.couleurIndex(State.categoriesFin().length)
    }));
    State.sauver(); App.render();
  };
  App.actions['reg.catFinNom'] = function (el) {
    State.modifier(State.categorieFin(el.dataset.id), { nom: el.value.trim() });
  };
  App.actions['reg.catFinCouleur'] = function (el) {
    State.modifier(State.categorieFin(el.dataset.id), { couleur: el.value });
    App.render();
  };
  App.actions['reg.catFinSuppr'] = function (el) {
    var id = el.dataset.id;
    var liees = State.transactions().filter(function (t) { return t.categorieFinId === id; });
    if (!confirm('Supprimer cette catégorie ?' + (liees.length ? '\n\n' + liees.length + ' mouvement(s) resteront sans catégorie.' : ''))) return;
    liees.forEach(function (t) { State.modifier(t, { categorieFinId: null }); });
    State.supprimerEnreg('categoriesFin', id);
    App.render();
  };

  App.actions['reg.ajoutCat'] = function (f) {
    State.ajouterCategorie(f.nom.value.trim());
    App.render();
  };
  App.actions['reg.catNom'] = function (el) {
    State.modifier(State.categorie(el.dataset.id), { nom: el.value.trim() });
  };
  App.actions['reg.catCouleur'] = function (el) {
    State.modifier(State.categorie(el.dataset.id), { couleur: el.value });
    App.render();
  };
  App.actions['reg.catFact'] = function (el) {
    State.modifier(State.categorie(el.dataset.id), { facturable: el.checked });
  };
  App.actions['reg.catArchive'] = function (el) {
    var c = State.categorie(el.dataset.id);
    State.modifier(c, { archive: !c.archive });
    App.render();
  };

  App.actions['reg.exporter'] = function () {
    App.message('Fichier ' + Storage.exporter(State.d) + ' téléchargé.', 'ok');
  };
  var modeImport = 'fusion';

  App.actions['reg.importerOuvrir'] = function (el) {
    modeImport = el.dataset.mode;
    var input = document.getElementById('fichier-import');
    input.value = ''; // sinon réimporter le même fichier ne déclenche rien
    input.click();
  };
  App.actions['reg.importer'] = async function (el) {
    if (!el.files || !el.files[0]) return;
    try {
      var obj = await Storage.importer(el.files[0]);
      if (!obj || !Array.isArray(obj.entries)) throw new Error('Ce fichier ne ressemble pas à une sauvegarde QUÊTE.');

      if (modeImport === 'remplacer') {
        if (!confirm('Remplacer TOUTES les données actuelles par ce fichier (' + obj.entries.length +
                     ' entrées) ?\n\nCe qui n\'est pas dans le fichier sera perdu.')) return;
        await State.remplacer(obj);
        App.render();
        App.message('Données remplacées.', 'ok');
        return;
      }

      var stats = await State.fusionnerAvec(obj);
      App.render();
      App.message('Fusion : ' + Fusion.resume(stats) + '.', 'ok');
    } catch (e) {
      App.message(e.message, 'erreur');
    }
  };
  App.actions['reg.restaurer'] = async function (el) {
    var obj = Storage.lireBackup(el.dataset.cle);
    if (!obj) return App.message('Copie introuvable.', 'erreur');
    if (!confirm('Restaurer cette copie (' + obj.entries.length + ' entrées) ? Les données actuelles seront remplacées.')) return;
    await State.remplacer(obj);
    App.render();
    App.message('Copie restaurée.', 'ok');
  };
  App.actions['reg.effacer'] = async function () {
    if (!confirm('Tout effacer définitivement ? Exporte d\'abord si tu as un doute.')) return;
    if (!confirm('Vraiment sûr ? Cette action est irréversible.')) return;
    await State.remplacer(State.defaut());
    App.render();
    App.message('Données réinitialisées.', 'ok');
  };

  return { titre: 'Réglages', render: render };
})();
