/* Couche de calcul de la vue Synthese. Pure : ne touche ni au DOM ni à l'état.
 *
 * ─── La règle de rattachement, qui décide de tout ───
 *
 * Une vidéo entre dans la période par sa date de CA (livraison, ou dernier jour
 * travaillé). Et elle apporte alors TOUTES ses heures, y compris celles d'un
 * mois précédent.
 *
 * Sans ça, une vidéo montée en juillet et livrée en août ferait apparaître son
 * CA en août sans les heures qui l'ont produit : le taux d'août serait
 * artificiellement excellent, et celui de juillet catastrophique. La règle rend
 * chaque taux lisible comme « ce que j'ai gagné par heure de travail ayant
 * produit ce chiffre d'affaires ».
 *
 * Les entrées sans vidéo (admin, prospection) entrent, elles, par leur propre
 * date : rien ne les rattache à un livrable.
 *
 * Conséquence à préserver : la somme des lignes égale toujours le total, quel
 * que soit le regroupement. C'est ce que vérifient les tests.
 */
var Synthese = (function () {

  var HORS = '__hors';   // travail sans livrable
  var SANS = '__sans';   // sans client

  function filtresParDefaut() {
    var auj = U.aujourdhui();
    return {
      du: U.premierDuMois(U.ajouterMois(U.moisCourant(), -5)),
      au: auj,
      categories: null,   // null = toutes les heures comptent
      clients: null,      // null = tous
      statuts: null,      // null = tous
      groupement: 'client'
    };
  }

  function ensemble(l) { return l === null || l === undefined ? null : new Set(l); }
  function dans(set, id) { return !set || set.has(id === null || id === undefined ? SANS : id); }

  /* --- Périmètre --- */

  function perimetre(f) {
    var cl = ensemble(f.clients), st = ensemble(f.statuts);

    var videos = State.videos().filter(function (v) {
      var dt = State.dateCA(v);
      return dt >= f.du && dt <= f.au && dans(cl, v.clientId) && dans(st, v.statut);
    });
    var parId = Object.create(null);
    videos.forEach(function (v) { parId[v.id] = v; });

    // Une vidéo existe-t-elle encore ? Si son livrable a disparu, l'entrée
    // redevient du travail sans livrable plutôt que de s'évaporer.
    var connues = Object.create(null);
    State.videos().forEach(function (v) { connues[v.id] = true; });

    var entrees = State.entries().filter(function (e) {
      if (e.videoId && connues[e.videoId]) return !!parId[e.videoId];
      return e.date >= f.du && e.date <= f.au && dans(cl, e.clientId);
    });

    var revenus = State.transactions().filter(function (t) {
      return t.type === 'revenu' && t.date >= f.du && t.date <= f.au && dans(cl, t.clientId);
    });

    return { videos: videos, parId: parId, entrees: entrees, revenus: revenus };
  }

  /* --- Clés de regroupement --- */

  // Un regroupement temporel se lit chronologiquement et ne porte aucune
  // couleur propre : mois et semaine partagent donc plusieurs comportements.
  function temporel(f) {
    return f.groupement === 'mois' || f.groupement === 'semaine';
  }

  function clefs(f, p) {
    function videoDe(e) { return e.videoId ? p.parId[e.videoId] : null; }

    // Les deux regroupements temporels ne diffèrent que par le découpage
    // appliqué à la même date : celle du CA pour ce qui est rattaché à un
    // livrable, la date propre de l'entrée sinon.
    function tranche(dateISO) {
      return f.groupement === 'semaine' ? U.debutSemaine(dateISO) : U.mois(dateISO);
    }

    return {
      entree: function (e) {
        var v = videoDe(e);
        if (f.groupement === 'video') return v ? v.id : HORS;
        if (temporel(f)) return tranche(v ? State.dateCA(v) : e.date);
        // Par client : une entrée rattachée à une vidéo suit le client de la
        // vidéo, pour que ses heures et son CA tombent sur la même ligne.
        return (v ? (v.clientId || e.clientId) : e.clientId) || SANS;
      },
      video: function (v) {
        if (f.groupement === 'video') return v.id;
        if (temporel(f)) return tranche(State.dateCA(v));
        return v.clientId || SANS;
      },
      revenu: function (t) {
        if (f.groupement === 'video') return HORS;
        if (temporel(f)) return tranche(t.date);
        return t.clientId || SANS;
      },
      // Second niveau : toujours par vidéo.
      sousEntree: function (e) { var v = videoDe(e); return v ? v.id : HORS; },
      sousVideo: function (v) { return v.id; },
      sousRevenu: function () { return HORS; }
    };
  }

  function libelle(f, cle) {
    if (cle === HORS) return 'Hors livrable';
    if (cle === SANS) return 'Sans client';
    if (f.groupement === 'semaine') return U.semaineLisible(cle);
    if (f.groupement === 'mois') return U.moisLisible(cle);
    if (f.groupement === 'video') return State.titreVideo(cle) || '(vidéo supprimée)';
    return State.nomClient(cle);
  }

  function couleur(f, cle) {
    if (cle === HORS || cle === SANS) return '#4a4f60';
    if (f.groupement === 'client') { var c = State.client(cle); return c ? c.couleur : '#4a4f60'; }
    if (f.groupement === 'video') {
      var v = State.video(cle);
      var cl = v && v.clientId ? State.client(v.clientId) : null;
      return cl ? cl.couleur : '#7c5cff';
    }
    return '#7c5cff';
  }

  /* --- Agrégation --- */

  function seau() {
    return { heures: 0, heuresComptees: 0, heuresFacturables: 0, ca: 0, caVideos: 0, nbVideos: 0, nbEntrees: 0 };
  }

  function verser(s, e, compte) {
    var m = U.duree(e);
    s.heures += m;
    s.nbEntrees++;
    if (compte(e)) s.heuresComptees += m;
    var c = State.categorie(e.categorieId);
    if (c && c.facturable) s.heuresFacturables += m;
  }

  function finir(s) {
    s.taux = s.heuresComptees > 0 ? s.ca / (s.heuresComptees / 60) : null;
    s.tauxReference = s.heures > 0 ? s.ca / (s.heures / 60) : null;
    s.partFacturable = s.heures > 0 ? s.heuresFacturables / s.heures : null;
    return s;
  }

  function calculer(f) {
    var p = perimetre(f);
    var k = clefs(f, p);
    var cats = ensemble(f.categories);
    var compte = function (e) { return dans(cats, e.categorieId); };

    var total = seau();
    var lignes = Object.create(null);
    var ordre = [];

    function ligne(cle) {
      if (!lignes[cle]) {
        lignes[cle] = Object.assign(seau(), { id: cle, sous: Object.create(null), ordreSous: [] });
        ordre.push(cle);
      }
      return lignes[cle];
    }
    function sous(l, cle) {
      if (!l.sous[cle]) { l.sous[cle] = Object.assign(seau(), { id: cle }); l.ordreSous.push(cle); }
      return l.sous[cle];
    }

    p.entrees.forEach(function (e) {
      verser(total, e, compte);
      var l = ligne(k.entree(e));
      verser(l, e, compte);
      verser(sous(l, k.sousEntree(e)), e, compte);
    });

    p.videos.forEach(function (v) {
      var prix = v.prix || 0;
      total.ca += prix; total.caVideos += prix; total.nbVideos++;
      var l = ligne(k.video(v));
      l.ca += prix; l.caVideos += prix; l.nbVideos++;
      var sv = sous(l, k.sousVideo(v));
      sv.ca += prix; sv.caVideos += prix; sv.nbVideos++;
    });

    p.revenus.forEach(function (t) {
      total.ca += t.montant;
      var l = ligne(k.revenu(t));
      l.ca += t.montant;
      sous(l, k.sousRevenu(t)).ca += t.montant;
    });

    var resultat = ordre.map(function (cle) {
      var l = lignes[cle];
      l.libelle = libelle(f, cle);
      l.couleur = couleur(f, cle);
      l.sousLignes = l.ordreSous.map(function (sc) {
        var s = finir(l.sous[sc]);
        s.libelle = sc === HORS ? 'Hors livrable' : (State.titreVideo(sc) || '(vidéo supprimée)');
        return s;
      }).sort(function (a, b) { return b.ca - a.ca || b.heures - a.heures; });
      delete l.sous; delete l.ordreSous;
      return finir(l);
    });

    return {
      total: finir(total),
      lignes: trier(resultat, f),
      serie: serie(f, p, compte)
    };
  }

  function trier(l, f) {
    // Les identifiants temporels (« 2026-08 », « 2026-08-24 ») sont
    // chronologiques par construction, contrairement à leurs libellés.
    if (temporel(f)) return l.sort(function (a, b) { return a.id.localeCompare(b.id); });
    return l.sort(function (a, b) {
      if (a.taux === null && b.taux === null) return b.heures - a.heures;
      if (a.taux === null) return 1;
      if (b.taux === null) return -1;
      return b.taux - a.taux;
    });
  }

  /* --- Série temporelle ---
   * Deux tracés issus du même périmètre : le taux sous les cases cochées, et
   * le taux toutes heures comptées. L'écart entre les deux, c'est le coût du
   * temps non facturable, mois après mois.
   */

  function granularite(f) {
    var jours = (U.depuisISO(f.au) - U.depuisISO(f.du)) / 86400000;
    return jours <= 92 ? 'semaine' : 'mois';
  }

  function seauDe(dateISO, gran) {
    return gran === 'semaine' ? U.debutSemaine(dateISO) : U.mois(dateISO);
  }

  function serie(f, p, compte) {
    var gran = granularite(f);
    var seaux = Object.create(null);
    var ordre = [];
    function s(cle) {
      if (!seaux[cle]) { seaux[cle] = Object.assign(seau(), { id: cle }); ordre.push(cle); }
      return seaux[cle];
    }

    p.entrees.forEach(function (e) {
      var v = e.videoId ? p.parId[e.videoId] : null;
      // Même règle qu'ailleurs : les heures d'une vidéo suivent son CA.
      verser(s(seauDe(v ? State.dateCA(v) : e.date, gran)), e, compte);
    });
    p.videos.forEach(function (v) {
      var b = s(seauDe(State.dateCA(v), gran));
      b.ca += (v.prix || 0); b.nbVideos++;
    });
    p.revenus.forEach(function (t) { s(seauDe(t.date, gran)).ca += t.montant; });

    return {
      granularite: gran,
      points: ordre.sort().map(function (cle) {
        var b = finir(seaux[cle]);
        b.libelle = gran === 'semaine' ? U.dateLisible(cle) : U.moisLisible(cle);
        return b;
      })
    };
  }

  return {
    HORS: HORS, SANS: SANS,
    filtresParDefaut: filtresParDefaut,
    perimetre: perimetre,
    calculer: calculer,
    granularite: granularite,
    temporel: temporel
  };
})();
