/* Noyau : routage, rendu, délégation d'événements.
 * Les vues s'enregistrent dans App.actions au chargement de leur fichier.
 */
var App = {
  actions: {},
  vue: 'dashboard',

  // Déduite de l'adresse du script plutôt que recopiée à la main : un numéro
  // de version de plus à tenir à jour serait un numéro de plus à oublier.
  version: (function () {
    var s = document.querySelector('script[src*="app.js"]');
    var m = s && /\?v=(\d+)/.exec(s.src);
    return m ? m[1] : '?';
  })(),

  sw: { supporte: false, enregistre: false, actif: false },

  onglets: [
    { id: 'dashboard', icone: '◆', label: 'Tableau de bord', court: 'Bord', objet: 'VueDashboard' },
    { id: 'temps', icone: '⏱', label: 'Temps', objet: 'VueTemps' },
    { id: 'quetes', icone: '⚔', label: 'Quêtes', objet: 'VueQuetes' },
    { id: 'videos', icone: '▸', label: 'Vidéos', objet: 'VueVideos' },
    { id: 'finances', icone: '€', label: 'Finances', court: 'Fin.', objet: 'VueFinances' },
    { id: 'synthese', icone: '◔', label: 'Synthèse', court: 'Synth.', objet: 'VueSynthese' },
    { id: 'reglages', icone: '⚙', label: 'Réglages', court: 'Régl.', objet: 'VueReglages' }
  ],

  // Fichiers indispensables : sans eux l'application ne peut pas démarrer.
  noyau: [
    ['U', 'js/utils.js'], ['Fusion', 'js/fusion.js'], ['Storage', 'js/storage.js'],
    ['State', 'js/state.js'], ['Synthese', 'js/synthese.js'], ['Jeu', 'js/jeu.js'],
    ['Distant', 'js/distant.js'], ['Sync', 'js/sync.js']
  ],

  // Une vue absente est ignorée plutôt que fatale : un fichier oublié lors
  // d'un envoi ne doit pas rendre tout le reste inutilisable.
  vues: function () {
    var m = {};
    this.onglets.forEach(function (o) {
      if (window[o.objet]) m[o.id] = window[o.objet];
    });
    return m;
  },

  fichiersManquants: function () {
    var l = this.noyau.filter(function (p) { return !window[p[0]]; })
      .map(function (p) { return p[1]; });
    this.onglets.forEach(function (o) {
      if (!window[o.objet]) l.push('js/views/' + o.id + '.js');
    });
    return l;
  },

  async init() {
    var manquants = this.fichiersManquants();
    // Diagnostic explicite plutôt qu'un « X is not defined » incompréhensible.
    var noyauKO = this.noyau.some(function (p) { return !window[p[0]]; });
    if (noyauKO) {
      document.getElementById('vue').innerHTML =
        '<div class="carte"><h2>Fichiers manquants</h2>' +
        '<p>Ces fichiers n\'ont pas été chargés. Vérifie qu\'ils sont bien présents ' +
        'sur le serveur, au bon emplacement :</p><pre>' + manquants.join('\n') + '</pre></div>';
      return;
    }

    await State.charger();
    this.brancher();
    window.addEventListener('hashchange', function () { App.route(); });
    window.addEventListener('beforeunload', function () { State.sauverMaintenant(); });
    setInterval(function () { App.tick(); }, 1000);
    this.ecouterServiceWorker();
    this.route();
    // « Arrêter » tapé alors que l'application était fermée : le service worker
    // l'a rouverte avec ce drapeau, qu'on retire aussitôt de l'adresse pour
    // qu'un rechargement ne rejoue pas l'arrêt.
    if (/[?&]arreter=1/.test(location.search)) {
      history.replaceState(null, '', location.pathname + location.hash);
      this.arreterChronoDepuisNotif();
    }
    if (!Local.disponible) {
      this.message('Ce navigateur refuse le stockage local pour ce site. ' +
        'L\'application fonctionne, mais tout sera perdu à la fermeture si la ' +
        'synchronisation n\'est pas configurée. Autorise les cookies pour ce site.', 'erreur');
    }
    if (manquants.length) {
      console.warn('Fichiers manquants :', manquants);
      this.message('Fichier manquant sur le serveur : ' + manquants.join(', ') +
        '. Le reste fonctionne.', 'alerte');
    }
    // Après l'affichage : la synchronisation ne doit jamais retarder l'ouverture.
    Sync.demarrer();
  },

  // Le service worker n'ayant pas accès au stockage, c'est ici qu'on arrête
  // réellement le chrono quand le bouton de la notification est tapé.
  ecouterServiceWorker: function () {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.type === 'chrono-arreter') App.arreterChronoDepuisNotif();
    });
  },

  arreterChronoDepuisNotif: function () {
    if (!State.d || !State.d.chrono) return;
    var r = State.arreterChrono(0);
    if (window.Notif) Notif.effacer();
    this.aller('temps');
    this.render();
    this.message(r.tropLong
      ? 'Chrono arrêté — il tournait depuis ' + U.fmtDuree(r.ecoule) + ', vérifie l\'entrée.'
      : U.fmtDuree(r.ecoule) + ' enregistré sur « ' + State.libelleTache(r.chrono) + ' ».',
      r.tropLong ? 'alerte' : 'ok');
  },

  route: function () {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var connues = this.vues();
    this.vue = connues[h] ? h : 'dashboard';
    this.render();
  },

  aller: function (v) {
    location.hash = '#/' + v;
    if (this.vue === v) this.render();
  },

  render: function () {
    var vue = this.vues()[this.vue];
    document.getElementById('vue').innerHTML = vue.render();
    document.title = vue.titre + ' · QUÊTE';
    this.renderNav();
    this.renderHud();
    // La notification du chrono se remet d'accord avec l'état après chaque
    // rendu : peu importe par où le chrono a démarré ou s'est arrêté.
    if (window.Notif) {
      Notif.synchroniser();
      Notif.pastille(!!State.d.chrono);
    }
  },

  renderNav: function () {
    document.getElementById('nav').innerHTML = this.onglets.map(function (o) {
      var etiquette = '<i>' + o.icone + '</i><b class="long">' + o.label + '</b>' +
        '<b class="court">' + (o.court || o.label) + '</b>';
      if (!window[o.objet]) {
        return '<span class="onglet bientot" title="Fichier js/views/' + o.id +
          '.js absent du serveur">' + etiquette + '</span>';
      }
      return '<a class="onglet' + (App.vue === o.id ? ' actif' : '') + '" href="#/' + o.id + '">' + etiquette + '</a>';
    }).join('');
  },

  renderHud: function () {
    var auj = U.aujourdhui();
    // L'objectif du jour est un objectif de travail : le temps personnel n'y
    // entre pas, sinon un long déjeuner suffirait à l'atteindre.
    var m = State.totalMinutes(State.sansPerso(State.entreesDuJour(auj)));
    var cible = State.d.settings.heuresCibleJour * 60;
    var c = State.d.chrono;
    document.getElementById('hud').innerHTML =
      this.pastilleSync() +
      (c ? '<span class="hud-chrono" data-action="nav" data-vue="temps"><span class="point"></span>en cours</span>' : '') +
      '<div class="hud-jour">' +
        '<span class="hud-val">' + U.fmtDuree(m) + '</span>' +
        '<span class="muted"> / ' + U.fmtDuree(cible) + '</span>' +
        '<div class="barre fine"><div class="barre-plein" style="width:' + Math.min(100, U.pct(m, cible)) + '%"></div></div>' +
      '</div>';
  },

  // État de la synchronisation, toujours visible en en-tête : savoir si ses
  // données sont parties compte autant que de les avoir saisies.
  pastilleSync: function () {
    if (!window.Sync) return '';
    var s = Sync.statut();
    if (!s.actif) return '';
    var libelles = {
      occupe: ['sync', 'occupe', 'Synchronisation en cours'],
      ajour: ['✓', 'ok', 'À jour' + (s.derniere ? ' — ' + s.derniere.toLocaleTimeString('fr-FR').slice(0, 5) : '')],
      horsligne: ['hors ligne', 'attente', s.detail],
      erreur: ['!', 'erreur', s.detail],
      inactif: ['', '', '']
    };
    var l = libelles[s.etat] || libelles.inactif;
    if (!l[0]) return '';
    return '<button class="hud-sync ' + l[1] + '" data-action="sync.maintenant" title="' + U.esc(l[2]) + '">' +
      (s.etat === 'occupe' ? '<span class="point"></span>' : '') + l[0] + '</button>';
  },

  tick: function () {
    if (this.vue === 'temps') VueTemps.tick();
  },

  /* --- Délégation : un seul jeu d'écouteurs pour toute l'application --- */

  brancher: function () {
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-action]');
      if (!el) return;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      var nom = el.dataset.action;
      if (nom === 'nav') { App.aller(el.dataset.vue); return; }
      if (nom === 'sync.maintenant') { ev.preventDefault(); Sync.maintenant(); return; }
      var fn = App.actions[nom];
      if (fn) { ev.preventDefault(); fn(el, ev); }
    });

    document.addEventListener('submit', function (ev) {
      var f = ev.target.closest('[data-submit]');
      if (!f) return;
      ev.preventDefault();
      var fn = App.actions[f.dataset.submit];
      if (fn) fn(f, ev);
    });

    document.addEventListener('change', function (ev) {
      var el = ev.target.closest('[data-change]');
      if (!el) return;
      var fn = App.actions[el.dataset.change];
      if (fn) fn(el, ev);
    });
  },

  /* --- Retour visuel --- */

  // Copie dans le presse-papier, avec repli sur l'ancienne méthode si l'API
  // moderne est refusée (contexte non sécurisé, permission bloquée).
  copier: function (txt, succes) {
    var App_ = this;
    function ok() { App_.message(succes || 'Copié.', 'ok'); }
    function repli() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;top:-1000px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { App_.message('Copie impossible — le contenu est dans la console.', 'erreur'); console.log(txt); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, repli);
    } else { repli(); }
  },

  // Demande au navigateur de revérifier le service worker. Sans ça, il ne le
  // fait que de temps en temps, et une correction urgente pourrait attendre.
  chercherMiseAJour: async function () {
    this.message('Recherche…', 'ok');
    try {
      // Le service worker peut être absent — navigateur qui le refuse, page
      // ouverte en fichier local. La comparaison de version, elle, marche
      // partout : c'est elle qui répond à la question posée.
      if (this.reg) { try { await this.reg.update(); } catch (e) { /* sans conséquence */ } }
      // index.html est servi réseau d'abord : si le numéro de version a changé,
      // c'est qu'une nouvelle livraison est en ligne.
      var html = await fetch('index.html', { cache: 'no-store' }).then(function (r) { return r.text(); });
      var m = /js\/app\.js\?v=(\d+)/.exec(html);
      if (m && m[1] !== this.version) {
        this.message('Version ' + m[1] + ' disponible — rechargement…', 'ok');
        setTimeout(function () { location.reload(); }, 900);
      } else {
        this.message('Tu es déjà à la dernière version (' + this.version + ').', 'ok');
      }
    } catch (e) {
      this.message('Vérification impossible : ' + e.message, 'erreur');
    }
  },

  message: function (txt, type) {
    var t = document.getElementById('toast');
    t.textContent = txt;
    t.className = 'visible ' + (type || 'ok');
    clearTimeout(this._toast);
    this._toast = setTimeout(function () { t.className = ''; }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  // Enregistré indépendamment du démarrage de l'application : même si une vue
  // manque, le fonctionnement hors ligne doit rester acquis. Absent en file://,
  // ce qui est normal.
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    App.sw.supporte = true;

    // Une nouvelle version prend la main : on recharge une fois pour que la
    // page cesse d'exécuter l'ancien code avec les nouveaux fichiers.
    // La garde évite de recharger à la toute première installation, où il n'y
    // avait pas encore de contrôleur — et évite surtout la boucle infinie.
    var avaitControleur = !!navigator.serviceWorker.controller;
    var dejaRecharge = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (avaitControleur && !dejaRecharge) { dejaRecharge = true; location.reload(); }
    });

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      App.sw.enregistre = true;
      App.sw.actif = !!navigator.serviceWorker.controller;
      App.reg = reg;
    }).catch(function (e) {
      console.warn('Service worker non enregistré :', e.message);
    });
  }

  App.init().catch(function (e) {
    console.error(e);
    document.getElementById('vue').innerHTML =
      '<div class="carte"><h2>Erreur au démarrage</h2><pre>' + U.esc(e.message) + '</pre></div>';
  });
});
