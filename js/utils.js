/* Utilitaires — dates, durées, formatage. Aucune dépendance. */
var U = (function () {
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* --- Dates (toujours en heure locale, jamais UTC) --- */

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function aujourdhui() { return iso(new Date()); }
  function depuisISO(s) {
    var p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function ajouterJours(s, n) {
    var d = depuisISO(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function debutSemaine(s) {
    var d = depuisISO(s);
    var j = (d.getDay() + 6) % 7; // lundi = 0
    d.setDate(d.getDate() - j);
    return iso(d);
  }
  function debutMois(s) { return s.slice(0, 7) + '-01'; }

  // Numéro de semaine ISO 8601 : la semaine 1 est celle qui contient le premier
  // jeudi de l'année. C'est la convention française, et celle qu'on retrouve sur
  // les factures et les plannings clients.
  function numeroSemaine(dateISO) {
    var d = depuisISO(dateISO);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));      // le jeudi de la semaine
    var jeudi1 = new Date(d.getFullYear(), 0, 4);
    jeudi1.setDate(jeudi1.getDate() + 3 - ((jeudi1.getDay() + 6) % 7));
    return 1 + Math.round((d - jeudi1) / (7 * 86400000));
  }

  var fmtJour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  var fmtJourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var fmtJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' });

  function dateLisible(s) { return fmtJour.format(depuisISO(s)); }
  function dateLongue(s) { return fmtJourLong.format(depuisISO(s)); }
  function initialeJour(s) { return fmtJourCourt.format(depuisISO(s)).toUpperCase(); }

  function libelleRelatif(s) {
    var t = aujourdhui();
    if (s === t) return "Aujourd'hui";
    if (s === ajouterJours(t, -1)) return 'Hier';
    if (s === ajouterJours(t, 1)) return 'Demain';
    return dateLisible(s);
  }

  /* --- Heures et durées --- */

  // "15:30" -> 930 minutes. Renvoie null si invalide.
  function parseHM(v) {
    if (!v) return null;
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function versHM(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }
  function maintenantHM() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // Durée d'une entrée en minutes. Gère le passage de minuit (22:00 -> 01:00).
  function duree(e) {
    var a = parseHM(e.debut), b = parseHM(e.fin);
    if (a === null || b === null) return 0;
    var d = b - a;
    if (d < 0) d += 1440;
    return d;
  }

  function fmtDuree(min) {
    min = Math.round(min);
    if (min <= 0) return '0';
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60), m = min % 60;
    return m === 0 ? h + ' h' : h + ' h ' + pad(m);
  }
  function fmtHeuresDec(min) {
    return (min / 60).toFixed(1).replace('.', ',') + ' h';
  }

  /* --- Mois --- */

  var fmtMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

  function mois(dateISO) { return dateISO.slice(0, 7); }
  function moisCourant() { return aujourdhui().slice(0, 7); }
  function ajouterMois(ym, n) {
    var p = ym.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function premierDuMois(ym) { return ym + '-01'; }
  function dernierDuMois(ym) {
    var p = ym.split('-').map(Number);
    return iso(new Date(p[0], p[1], 0));
  }
  function moisLisible(ym) { return fmtMois.format(depuisISO(ym + '-01')); }

  var fmtJourMois = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

  // « S35 · 24–30 août ». Le numéro donne un repère stable d'une année sur
  // l'autre, la plage de dates évite d'avoir à le décoder de tête. Le mois n'est
  // répété que si la semaine est à cheval sur deux.
  function semaineLisible(lundi) {
    var a = depuisISO(lundi), b = depuisISO(ajouterJours(lundi, 6));
    var debut = a.getMonth() === b.getMonth() ? String(a.getDate()) : fmtJourMois.format(a);
    return 'S' + numeroSemaine(lundi) + ' · ' + debut + '–' + fmtJourMois.format(b);
  }

  /* --- Argent --- */

  var nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var devise = '€';

  function setDevise(v) { devise = v || '€'; }
  function argent(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return nf2.format(n) + ' ' + devise;
  }
  function argentCourt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return nf0.format(n) + ' ' + devise;
  }
  function taux(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return nf0.format(n) + ' ' + devise + '/h';
  }

  /* --- Divers --- */

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }

  var PALETTE = ['#7c5cff', '#2ecc8f', '#38bdf8', '#ffb648', '#ff8ac2', '#ff5c72', '#a3e635', '#22d3ee'];

  // Attribution cyclique plutôt que par hachage : deux éléments créés à la
  // suite ne peuvent pas tomber sur la même teinte.
  function couleurIndex(i) { return PALETTE[i % PALETTE.length]; }

  // Les couleurs finissent dans des attributs `style="background:…"` sans être
  // échappées. Celles saisies via <input type=color> sont sûres, mais celles
  // qui arrivent d'un fichier importé ou du dépôt ne le sont pas : on n'accepte
  // qu'une notation hexadécimale, tout le reste retombe sur le gris neutre.
  function couleur(v) {
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v) ? v : '#8b90a0';
  }

  // Même raison pour les identifiants, eux aussi interpolés tels quels dans des
  // attributs (`data-id="…"`). Les identifiants légitimes sont en base 36, plus
  // « : » pour les clés déterministes du journal d'expérience : les données
  // saines ressortent inchangées, une chaîne piégée ressort inoffensive.
  function identifiant(v) {
    return typeof v === 'string' ? v.replace(/[^A-Za-z0-9_:.-]/g, '') : v;
  }

  function couleurAuto(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  return {
    pad: pad, iso: iso, aujourdhui: aujourdhui, depuisISO: depuisISO,
    ajouterJours: ajouterJours, debutSemaine: debutSemaine, debutMois: debutMois,
    dateLisible: dateLisible, dateLongue: dateLongue, initialeJour: initialeJour,
    libelleRelatif: libelleRelatif,
    parseHM: parseHM, versHM: versHM, maintenantHM: maintenantHM,
    duree: duree, fmtDuree: fmtDuree, fmtHeuresDec: fmtHeuresDec,
    mois: mois, moisCourant: moisCourant, ajouterMois: ajouterMois,
    premierDuMois: premierDuMois, dernierDuMois: dernierDuMois, moisLisible: moisLisible,
    numeroSemaine: numeroSemaine, semaineLisible: semaineLisible,
    setDevise: setDevise, argent: argent, argentCourt: argentCourt, taux: taux,
    id: id, esc: esc, pct: pct, couleurAuto: couleurAuto, couleurIndex: couleurIndex,
    couleur: couleur, identifiant: identifiant
  };
})();
