/* Weißer Fleck – genaue Website-Prüfung über die Google Places API (New)
   Optional: braucht einen eigenen API-Schlüssel (bleibt im Browser, geht nur an places.googleapis.com).
   Liest die im Google-Eintrag hinterlegte Website – das ist die verlässlichste Quelle für kleine Betriebe.
   Läuft nur auf Knopfdruck, weil Google die Anfragen über das Konto des Schlüssels abrechnet. */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});

  const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
  const FIELDS = 'places.displayName,places.websiteUri,places.location,places.businessStatus';
  const MAX_DIST_M = 150;
  const CONCURRENCY = 4;
  /* Social-Profile und Link-Sammlungen sind keine eigene Website */
  const NOT_A_SITE = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|linktr\.ee|linkin\.bio|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|wa\.me|business\.site|google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|pinterest\.[a-z.]+|xing\.com|linkedin\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|gelbeseiten\.de|dasoertliche\.de|11880\.com)$/i;

  class PlacesError extends Error {
    constructor(msg, fatal) { super(msg); this.fatal = !!fatal; }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  async function search(lead, key, signal) {
    const text = [lead.name, lead.addr || lead.city].filter(Boolean).join(', ');
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
        body: JSON.stringify({
          textQuery: text, languageCode: 'de', regionCode: 'DE', maxResultCount: 3,
          locationBias: { circle: { center: { latitude: lead.lat, longitude: lead.lng }, radius: 200 } }
        })
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw new PlacesError('Keine Verbindung zu Google – bist du online?', true);
    }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error.message || ''; } catch (e) { /* leer */ }
      if (res.status === 400 && /api key/i.test(msg)) throw new PlacesError('Google lehnt den API-Schlüssel ab (ungültig).', true);
      if (res.status === 403) throw new PlacesError('Zugriff verweigert: Ist „Places API (New)“ im Google-Cloud-Projekt aktiviert, Abrechnung eingerichtet und der Schlüssel für diese API (und diese Webadresse) freigegeben?' + (msg ? ' (' + msg.slice(0, 140) + ')' : ''), true);
      if (res.status === 429) throw new PlacesError('Google-Kontingent erreicht – bitte später oder mit höherem Limit erneut versuchen.', true);
      throw new PlacesError('Google-Fehler (HTTP ' + res.status + ')' + (msg ? ': ' + msg.slice(0, 140) : '') + '.', false);
    }
    const data = await res.json();
    return Array.isArray(data.places) ? data.places : [];
  }

  /* Gehört der Google-Treffer zu diesem Betrieb? Nähe + gemeinsame markante Namensteile */
  function matchPlace(lead, places) {
    const SC = WF.sitecheck;
    const sig = n => { const all = SC.tokens(n); const s = all.filter(t => !SC.isGeneric(t)); return s.length ? s : all; };
    const mine = sig(lead.name);
    let best = null, bestD = Infinity;
    places.forEach(p => {
      if (!p.location) return;
      const d = WF.ui.distance(lead.lat, lead.lng, p.location.latitude, p.location.longitude);
      if (d > MAX_DIST_M) return;
      const theirs = sig(p.displayName && p.displayName.text);
      const common = mine.filter(t => theirs.some(u => u === t || (t.length > 4 && u.length > 4 && (u.startsWith(t) || t.startsWith(u)))));
      const ok = common.length >= Math.max(1, Math.ceil(Math.min(mine.length, theirs.length) * 0.5));
      if (ok && d < bestD) { best = p; bestD = d; }
    });
    return best;
  }

  function evaluate(lead, places) {
    const p = matchPlace(lead, places);
    if (!p) return { gcheck: 'nicht gefunden' };
    if (p.businessStatus === 'CLOSED_PERMANENTLY') return { gcheck: 'geschlossen' };
    const host = p.websiteUri ? hostOf(p.websiteUri) : '';
    if (host && !NOT_A_SITE.test(host)) return { gcheck: 'website', siteUrl: host, siteHow: 'Google Maps', siteFull: p.websiteUri };
    return { gcheck: 'keine' };
  }

  async function run(ids, opts) {
    const store = WF.store;
    opts = opts || {};
    const key = store.getGoogleKey();
    if (!key) throw new PlacesError('Kein Google-API-Schlüssel eingetragen.', true);
    const queue = ids.slice();
    const total = ids.length;
    const stats = { done: 0, total, website: 0, keine: 0, nicht: 0, geschlossen: 0, aborted: false, error: '' };
    let sinceSave = 0;

    async function worker() {
      while (queue.length && !stats.error && !(opts.signal && opts.signal.aborted)) {
        const id = queue.shift();
        const l = store.leads[id];
        if (!l) { stats.done++; continue; }
        try {
          const places = await search(l, key, opts.signal);
          const r = evaluate(l, places);
          const patch = { gcheck: r.gcheck };
          const now = new Date().toISOString();
          if (r.gcheck === 'website') {
            Object.assign(patch, { siteUrl: r.siteUrl, siteHow: r.siteHow, siteFull: r.siteFull });
            if (l.state === 'neu' && !l.confirmed) { patch.state = 'website'; patch.stateAt = now; }
            stats.website++;
          } else if (r.gcheck === 'keine') stats.keine++;
          else if (r.gcheck === 'geschlossen') {
            if (l.state === 'neu') { patch.state = 'verworfen'; patch.stateAt = now; }
            stats.geschlossen++;
          } else stats.nicht++;
          store.patchLead(id, patch);
        } catch (e) {
          if (e && e.name === 'AbortError') break;
          if (e instanceof PlacesError && e.fatal) { stats.error = e.message; break; }
          // einzelner Fehler: Betrieb überspringen
        }
        stats.done++; sinceSave++;
        if (sinceSave >= 15) { sinceSave = 0; store.commitLeads({ emit: false }); if (opts.onTick) opts.onTick(stats, true); }
        else if (opts.onTick) opts.onTick(stats, false);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    stats.aborted = !!(opts.signal && opts.signal.aborted);
    store.commitLeads();
    return stats;
  }

  WF.places = { run, evaluate, matchPlace, search, hostOf };
})();
