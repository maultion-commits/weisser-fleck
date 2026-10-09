/* Weißer Fleck – Website-Prüfung
   OSM kennt längst nicht jede Website. Deshalb sammeln wir Hinweise, dass ein Betrieb
   doch eine hat – und blenden ihn dann aus:
     1. Tags, die auf eine Website zeigen (website, url, contact:url, …)
     2. E-Mail-Adresse auf eigener Domain (info@haarscharf.de → haarscharf.de)
     3. Existiert eine aus dem Namen abgeleitete Domain? (HEAD-Anfrage, nur Erreichbarkeit)
   Lieber ein echter Treffer zu viel ausgeblendet als ein falscher Lead – Leads gibt es genug. */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});

  /* ---------- Textaufbereitung ---------- */
  const STOP = new Set(['und', 'der', 'die', 'das', 'im', 'am', 'an', 'zum', 'zur', 'bei', 'von', 'vom', 'the', 'and', 'de', 'la', 'le']);
  const LEGAL = new Set(['gmbh', 'mbh', 'ug', 'kg', 'ohg', 'gbr', 'ek', 'ev', 'ag', 'co', 'inc', 'ltd', 'kgaa']);
  /* Branchenwörter: ohne Zusatz kaum aussagekräftig („friseur.de“ gehört nicht dem Salon an der Ecke) */
  const GENERIC = new Set(['friseur', 'friseursalon', 'salon', 'restaurant', 'cafe', 'bar', 'pub', 'imbiss', 'baeckerei', 'metzgerei',
    'fleischerei', 'apotheke', 'praxis', 'dr', 'med', 'kiosk', 'shop', 'laden', 'studio', 'hotel', 'pension', 'gasthaus', 'gasthof',
    'pizzeria', 'bistro', 'eiscafe', 'eisdiele', 'kosmetik', 'nagelstudio', 'tattoo', 'boutique', 'blumen', 'floristik', 'tischlerei',
    'malerbetrieb', 'elektro', 'sanitaer', 'heizung', 'bau', 'zahnarzt', 'arzt', 'tierarzt', 'fitness', 'tanzschule', 'handel',
    'service', 'center', 'zentrum', 'haus', 'cafe', 'kneipe', 'biergarten', 'weinstube', 'taverne', 'grill', 'doener', 'doner', 'kebab',
    'kebap', 'pizza', 'bioladen', 'naturkost', 'reformhaus', 'optik', 'optiker', 'schuhe', 'mode', 'sport', 'backshop', 'konditorei',
    'lotto', 'tabak', 'spaetkauf', 'schluesseldienst', 'reinigung', 'waescherei', 'textil', 'gaertnerei', 'fahrrad', 'fahrraeder',
    'auto', 'autohaus', 'werkstatt', 'kfz', 'physiotherapie', 'ergotherapie', 'massage', 'sanitaetshaus', 'hoergeraete', 'fotostudio',
    'tattoostudio', 'barbier', 'barber', 'herrenfriseur', 'damenfriseur', 'frisoer', 'getraenke', 'getraenkemarkt', 'supermarkt',
    'drogerie', 'buchhandlung', 'blumenladen', 'geschenke', 'schmuck', 'juwelier', 'uhren', 'moebel', 'kinder', 'spielwaren',
    'tierarztpraxis', 'zahnarztpraxis', 'arztpraxis', 'gemeinschaftspraxis', 'steuerberater', 'rechtsanwalt', 'kanzlei', 'versicherung',
    'immobilien', 'bar', 'club', 'lounge', 'treff', 'stube', 'eck', 'eckkneipe', 'schenke', 'gaststaette', 'wirtshaus', 'brauhaus']);
  /* häufige Nachnamen: „mueller.de“ gehört garantiert nicht dem Bäcker Müller aus Jena */
  const SURNAMES = new Set(['mueller', 'schmidt', 'schneider', 'fischer', 'weber', 'meyer', 'wagner', 'becker', 'schulz', 'hoffmann',
    'schaefer', 'koch', 'bauer', 'richter', 'klein', 'wolf', 'schroeder', 'neumann', 'schwarz', 'zimmermann', 'braun', 'krueger',
    'hofmann', 'hartmann', 'lange', 'schmitt', 'werner', 'schmitz', 'krause', 'meier', 'lehmann', 'schmid', 'schulze', 'maier',
    'koehler', 'herrmann', 'koenig', 'walter', 'mayer', 'huber', 'kaiser', 'fuchs', 'peters', 'lang', 'scholz', 'moeller', 'weiss',
    'jung', 'hahn', 'schubert', 'vogel', 'friedrich', 'keller', 'guenther', 'frank', 'berger', 'winkler', 'roth', 'beck', 'lorenz',
    'baumann', 'franke', 'albrecht', 'schuster', 'simon', 'ludwig', 'boehm', 'winter', 'kraus', 'martin', 'schumacher', 'kraemer',
    'vogt', 'stein', 'jaeger', 'otto', 'sommer', 'gross', 'seidel', 'heinrich', 'brandt', 'haas', 'schreiber', 'graf', 'schulte',
    'dietrich', 'ziegler', 'kuhn', 'kuehn', 'pohl', 'engel', 'horn', 'busch', 'bergmann', 'thomas', 'voigt', 'sauer', 'arnold', 'wolff', 'pfeiffer']);

  const FREEMAIL = new Set(['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com', 'gmx.li', 'web.de', 't-online.de', 'gmail.com', 'googlemail.com',
    'icloud.com', 'me.com', 'mac.com', 'freenet.de', 'arcor.de', 'online.de', '1und1.de', 'aol.com', 'aol.de', 'mail.de', 'posteo.de',
    'posteo.net', 'protonmail.com', 'proton.me', 'pm.me', 'vodafone.de', 'kabelmail.de', 'msn.com', 'ymail.com', 'email.de', 'telekom.de',
    'mailbox.org', 'tutanota.com', 'tutanota.de', 'tuta.com', 'tuta.io', 'versanet.de', 'netcologne.de', 'ewetel.net', 'unitybox.de',
    'kabelbw.de', 'tele2.de', 'o2online.de', 'alice.de', 'nexgo.de', 'r-online.de', 'hotmail.de', 'hotmail.com', 'outlook.de', 'outlook.com',
    'live.de', 'live.com', 'yahoo.de', 'yahoo.com', 'yahoo.fr', 'yahoo.co.uk', 'bluewin.ch', 'a1.net', 'chello.at', 'aon.at', 'inode.at']);

  function ascii(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' und ').replace(/['’`´]/g, '');
  }
  function tokens(name) {
    return ascii(name).split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOP.has(t) && !LEGAL.has(t));
  }
  const slug = (parts, sep) => parts.join(sep).replace(/-+/g, '-');

  /* ---------- Hinweise aus den OSM-Daten ---------- */
  /* Irgendein Tag, der auf eine Website zeigt (website:menu, contact:url, url:official, homepage, …) */
  function hasSiteTag(tags) {
    return Object.keys(tags).some(k => /(^|[:_])(website|url|web|homepage|webseite)([:_]|$)/i.test(k) && !/image|wiki|photo|source|opening/i.test(k) && String(tags[k]).trim());
  }

  /* Eigene Mail-Domain → es gibt sehr wahrscheinlich eine Website */
  function emailDomain(email) {
    const list = String(email || '').toLowerCase().split(/[;,\s]+/).filter(Boolean);
    for (const addr of list) {
      const m = addr.match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
      if (m && !FREEMAIL.has(m[1])) return m[1];
    }
    return '';
  }

  /* Namensschlüssel, um Ketten (derselbe Name mehrfach) zu erkennen */
  const nameKey = name => tokens(name).join(' ');

  /* ---------- Domain-Kandidaten ----------
     Gemessen an echten Stichproben (Jena): Domains nur aus dem Namen („physiofit.de“, „mein-salon.de“)
     gehören fast nie dem Betrieb vor Ort, sondern jemandem in Frankfurt oder einer Parkseite.
     Belastbar sind nur Domains, die den ORT enthalten („vinothek-jena.de“). Nur die werden geprüft. */
  function candidates(lead) {
    const all = tokens(lead.name);
    const city = tokens(lead.city).filter(t => !GENERIC.has(t)).join('');
    if (!all.length || city.length < 3) return [];
    const distinct = all.filter(t => !GENERIC.has(t));
    if (!distinct.length) return [];   // reiner Branchenname („Der Friseur“) → „friseur-jena.de“ ist meist eine Parkseite
    const out = new Set();
    const add = s => { if (s.length >= 6 && s.length <= 45) out.add(s + '.de'); };
    const variants = [all];
    if (distinct.length && distinct.length !== all.length) variants.push(distinct);
    if (all.length >= 2) variants.push(all.slice(0, 2).reverse());
    variants.forEach(v => {
      if (!v.length || (v.length === 1 && v[0].length < 4)) return;
      if (v.includes(city)) {            // Ort steckt schon im Namen („Vinothek Jena“)
        add(slug(v, '-')); add(slug(v, ''));
        return;
      }
      add(slug(v, '-') + '-' + city);
      add(slug(v, '') + '-' + city);
      add(slug(v, '') + city);
      if (v.length <= 2) add(city + '-' + slug(v, '-'));
    });
    return Array.from(out).slice(0, 8);
  }

  /* ---------- Erreichbarkeits-Probe ---------- */
  /* no-cors: Inhalt bleibt unlesbar, aber „antwortet“ vs. „Domain gibt es nicht“ ist unterscheidbar */
  function probe(host, signal, ms) {
    return new Promise(resolve => {
      const ctrl = new AbortController();
      const done = v => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); resolve(v); };
      const onAbort = () => { ctrl.abort(); done(false); };
      const timer = setTimeout(() => { ctrl.abort(); done(false); }, ms || 4000);
      if (signal) { if (signal.aborted) return done(false); signal.addEventListener('abort', onAbort); }
      fetch('https://' + host + '/', {
        method: 'HEAD', mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal
      }).then(() => done(true), () => done(false));
    });
  }

  async function checkLead(lead, signal) {
    const cands = candidates(lead);
    if (!cands.length) return '';
    const hits = await Promise.all(cands.map(h => probe(h, signal)));
    const i = hits.indexOf(true);
    return i >= 0 ? cands[i] : '';
  }

  /* ---------- Stapel-Prüfung ---------- */
  const CONCURRENCY = 6;

  async function run(ids, opts) {
    const store = WF.store;
    opts = opts || {};
    const queue = ids.slice();
    const total = ids.length;
    let done = 0, found = 0, sinceSave = 0;

    async function worker() {
      while (queue.length && !(opts.signal && opts.signal.aborted)) {
        const id = queue.shift();
        const l = store.leads[id];
        if (l) {
          const host = await checkLead(l, opts.signal);
          if (opts.signal && opts.signal.aborted) break;
          const patch = { checked: new Date().toISOString() };
          if (host) {
            patch.siteUrl = host; patch.siteHow = 'Domain mit Ortsnamen antwortet'; patch.siteFull = 'https://' + host;
            if (l.state === 'neu' && !l.confirmed) { patch.state = 'website'; patch.stateAt = patch.checked; found++; }
          }
          store.patchLead(id, patch);
        }
        done++; sinceSave++;
        if (sinceSave >= 20) { sinceSave = 0; store.commitLeads({ emit: false }); if (opts.onTick) opts.onTick(done, total, found, true); }
        else if (opts.onTick) opts.onTick(done, total, found, false);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    store.commitLeads();
    return { done, total, found, aborted: !!(opts.signal && opts.signal.aborted) };
  }

  WF.sitecheck = { isGeneric: t => GENERIC.has(t), tokens, nameKey, hasSiteTag, emailDomain, candidates, probe, checkLead, run };
})();
