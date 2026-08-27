/* Noyau : routage, rendu, délégation d'événements.
 * Les vues s'enregistrent dans App.actions au chargement de leur fichier.
 */
var App = {
  actions: {},
  vue: 'dashboard',

  onglets: [
    { id: 'dashboard', icone: '◆', label: 'Tableau de bord', court: 'Bord' },
    { id: 'temps', icone: '⏱', label: 'Temps' },
    { id: 'videos', icone: '▸', label: 'Vidéos' },
    { id: 'finances', icone: '€', label: 'Finances' },
    { id: 'analyse', icone: '◔', label: 'Analyse' },
    { id: 'reglages', icone: '⚙', label: 'Réglages' }
  ],

  vues: function () {
    return {
      dashboard: VueDashboard, temps: VueTemps, videos: VueVideos,
      finances: VueFinances, analyse: VueAnalyse, reglages: VueReglages
    };
  },

  async init() {
    var mode = await Storage.init();
    await State.charger();
    this.brancher();
    window.addEventListener('hashchange', function () { App.route(); });
    window.addEventListener('beforeunload', function () { State.sauverMaintenant(); });
    setInterval(function () { App.tick(); }, 1000);
    this.route();
    if (mode === 'serveur') this.message('Connecté au serveur local — données partagées entre appareils.', 'ok');
    // Après l'affichage : la synchronisation ne doit jamais retarder l'ouverture.
    Sync.demarrer();
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
  },

  renderNav: function () {
    document.getElementById('nav').innerHTML = this.onglets.map(function (o) {
      var etiquette = '<i>' + o.icone + '</i><b class="long">' + o.label + '</b>' +
        '<b class="court">' + (o.court || o.label) + '</b>';
      if (o.bientot) {
        return '<span class="onglet bientot" title="Module prévu — pas encore construit">' + etiquette + '</span>';
      }
      return '<a class="onglet' + (App.vue === o.id ? ' actif' : '') + '" href="#/' + o.id + '">' + etiquette + '</a>';
    }).join('');
  },

  renderHud: function () {
    var auj = U.aujourdhui();
    var m = State.totalMinutes(State.entreesDuJour(auj));
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

  message: function (txt, type) {
    var t = document.getElementById('toast');
    t.textContent = txt;
    t.className = 'visible ' + (type || 'ok');
    clearTimeout(this._toast);
    this._toast = setTimeout(function () { t.className = ''; }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  App.init().catch(function (e) {
    console.error(e);
    document.getElementById('vue').innerHTML =
      '<div class="carte"><h2>Erreur au démarrage</h2><pre>' + U.esc(e.message) + '</pre></div>';
  });
});
