/* Weißer Fleck – Karte, Overpass-Suche und Fundstellen */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});
  const { $, $$, esc, toast, debounce, distance } = WF.ui;
  const store = WF.store;

  /* ---------- Branchen → OSM-Filter ---------- */
  const CATS = [
    { key: 'gastro',      label: 'Gastronomie',   filters: [['amenity', 'restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream']] },
    { key: 'handel',      label: 'Einzelhandel',  filters: [['shop', null]] },
    { key: 'handwerk',    label: 'Handwerk',      filters: [['craft', null]] },
    { key: 'gesundheit',  label: 'Gesundheit',    filters: [['amenity', 'dentist|doctors|pharmacy|veterinary|clinic'], ['healthcare', null]] },
    { key: 'dienst',      label: 'Dienstleister', filters: [['office', null]] },
    { key: 'unterkunft',  label: 'Unterkunft',    filters: [['tourism', 'hotel|guest_house|hostel|apartment|motel|camp_site']] },
    { key: 'freizeit',    label: 'Freizeit',      filters: [['leisure', 'fitness_centre|sports_centre|dance|bowling_alley|miniature_golf|escape_game']] }
  ];
  const CAT_LABEL = Object.fromEntries(CATS.map(c => [c.key, c.label]));
  CAT_LABEL.manuell = 'Eigener Eintrag';

  const SUB_LABEL = {
    restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Imbiss', bar: 'Bar', pub: 'Kneipe', biergarten: 'Biergarten', ice_cream: 'Eisdiele',
    dentist: 'Zahnarzt', doctors: 'Arztpraxis', pharmacy: 'Apotheke', veterinary: 'Tierarzt', clinic: 'Klinik',
    hairdresser: 'Friseur', beauty: 'Kosmetik', bakery: 'Bäckerei', butcher: 'Metzgerei', florist: 'Blumenladen', clothes: 'Mode',
    shoes: 'Schuhe', kiosk: 'Kiosk', convenience: 'Kleinmarkt', jewelry: 'Juwelier', books: 'Buchhandlung', gift: 'Geschenke',
    bicycle: 'Fahrradladen', tattoo: 'Tattoo-Studio', car_repair: 'Autowerkstatt', car: 'Autohaus', furniture: 'Möbel',
    hardware: 'Baumarkt', electronics: 'Elektronik', mobile_phone: 'Handyshop', optician: 'Optiker', pet: 'Zoohandlung',
    greengrocer: 'Obst & Gemüse', supermarket: 'Supermarkt', massage: 'Massage', laundry: 'Wäscherei', tailor: 'Schneiderei',
    carpenter: 'Tischler', electrician: 'Elektriker', plumber: 'Installateur', painter: 'Maler', gardener: 'Gärtner', roofer: 'Dachdecker',
    locksmith: 'Schlüsseldienst', hvac: 'Heizung & Klima', builder: 'Bauunternehmen', metal_construction: 'Metallbau', shoemaker: 'Schuhmacher',
    photographer: 'Fotograf', handicraft: 'Kunsthandwerk', bakery_craft: 'Bäcker', sawmill: 'Sägewerk', stonemason: 'Steinmetz', glaziery: 'Glaserei',
    lawyer: 'Anwalt', accountant: 'Steuerberater', estate_agent: 'Immobilienmakler', insurance: 'Versicherung', architect: 'Architekt',
    therapist: 'Therapeut', tax_advisor: 'Steuerberater', financial: 'Finanzberatung', coworking: 'Coworking', company: 'Unternehmen',
    hotel: 'Hotel', guest_house: 'Pension', hostel: 'Hostel', apartment: 'Ferienwohnung', motel: 'Motel', camp_site: 'Campingplatz',
    fitness_centre: 'Fitnessstudio', sports_centre: 'Sportzentrum', dance: 'Tanzschule', bowling_alley: 'Kegelbahn',
    miniature_golf: 'Minigolf', escape_game: 'Escape Room'
  };
  const subLabel = s => SUB_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Betrieb');

  function classify(t) {
    if (/^(restaurant|cafe|fast_food|bar|pub|biergarten|ice_cream)$/.test(t.amenity || '')) return ['gastro', t.amenity];
    if (/^(dentist|doctors|pharmacy|veterinary|clinic)$/.test(t.amenity || '')) return ['gesundheit', t.amenity];
    if (t.healthcare) return ['gesundheit', t.healthcare === 'yes' ? 'clinic' : t.healthcare];
    if (t.shop) return ['handel', t.shop === 'yes' ? 'sonstiges' : t.shop];
    if (t.craft) return ['handwerk', t.craft];
    if (t.office) return ['dienst', t.office === 'yes' ? 'company' : t.office];
    if (t.tourism) return ['unterkunft', t.tourism];
    if (t.leisure) return ['freizeit', t.leisure];
    return ['handel', 'sonstiges'];
  }

  /* ---------- Konfiguration ---------- */
  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const RESULT_LIMIT = 500;
  const MAX_AREA_KM2 = 80;
  const LIST_PAGE = 100;

  const STATE_FILTERS = [
    { key: 'aktiv', label: 'Aktiv', states: ['neu', 'vorgemerkt', 'kontaktiert'] },
    { key: 'vorgemerkt', label: 'Vorgemerkt', states: ['vorgemerkt'] },
    { key: 'kontaktiert', label: 'Kontaktiert', states: ['kontaktiert'] },
    { key: 'verworfen', label: 'Verworfen', states: ['verworfen'] }
  ];
  const STATE_STYLE = {
    neu:         { fillColor: '#d9482b', color: '#fff', weight: 1.5, radius: 6.5, fillOpacity: 0.95 },
    vorgemerkt:  { fillColor: '#e3a31b', color: '#16272c', weight: 2, radius: 8, fillOpacity: 1 },
    kontaktiert: { fillColor: '#2f6f8f', color: '#fff', weight: 1.5, radius: 7, fillOpacity: 0.95 },
    verworfen:   { fillColor: '#a3a39b', color: '#fff', weight: 1, radius: 5, fillOpacity: 0.8 },
    auftrag:     { fillColor: '#2f7d5b', color: '#fff', weight: 1.5, radius: 6.5, fillOpacity: 0.9 }
  };
  const STATE_LABEL = { neu: 'Neu', vorgemerkt: 'Vorgemerkt', kontaktiert: 'Kontaktiert', verworfen: 'Verworfen', auftrag: 'Auftrag' };

  const prefs = store.getPrefs(WF.KEY.mapPrefs, {
    cats: CATS.map(c => c.key),
    noChains: true,
    stateFilter: 'aktiv',
    showOrders: true
  });
  if (!Array.isArray(prefs.cats)) prefs.cats = CATS.map(c => c.key);
  const savePrefs = () => store.setPrefs(WF.KEY.mapPrefs, prefs);

  /* ---------- Zustand ---------- */
  let map = null, canvas = null, leadLayer = null, orderLayer = null, ring = null;
  const markers = new Map();
  const orderMarkers = new Map();
  let selectedId = null;
  let lastPlace = '';
  let scanning = false;
  let tooBig = false;
  let addMode = false;
  let pendingLatLng = null;
  let listLimit = LIST_PAGE;

  /* ---------- Hilfsfunktionen ---------- */
  function areaKm2(b) {
    const h = (b.getNorth() - b.getSouth()) * 111.32;
    const w = (b.getEast() - b.getWest()) * 111.32 * Math.cos(b.getCenter().lat * Math.PI / 180);
    return Math.abs(h * w);
  }
  const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
  const checkUrl = l => 'https://www.google.com/search?q=' + encodeURIComponent((l.name + ' ' + (l.city || '')).trim());
  const osmUrl = l => (l.osm ? 'https://www.openstreetmap.org/' + l.osm : '');

  function passesCat(l) { return l.cat === 'manuell' || prefs.cats.includes(l.cat); }
  function passesState(l) {
    const f = STATE_FILTERS.find(s => s.key === prefs.stateFilter) || STATE_FILTERS[0];
    return f.states.includes(l.state);
  }
  const passes = l => passesCat(l) && passesState(l);

  function setStatus(text, kind) {
    const el = $('#scanStatus');
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' status-' + kind : '');
  }

  /* ---------- Overpass ---------- */
  function buildQuery(bounds, cats, noChains) {
    const bb = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map(n => n.toFixed(5)).join(',');
    const base = '["name"][!"website"][!"contact:website"][!"url"][!"contact:url"][!"operator:website"]' +
      (noChains ? '[!"brand"][!"brand:wikidata"]' : '');
    const parts = [];
    cats.forEach(c => c.filters.forEach(([k, v]) => {
      let f = v ? `["${k}"~"^(${v})$"]` : `["${k}"]`;
      if (k === 'shop') f += '["shop"!~"^(vacant|no)$"]';
      parts.push(`nwr${f}${base}(${bb});`);
    }));
    return `[out:json][timeout:30];(${parts.join('')});out tags center ${RESULT_LIMIT};`;
  }

  async function queryOverpass(q) {
    let lastErr = null;
    for (const url of OVERPASS) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 40000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: 'data=' + encodeURIComponent(q),
          signal: ctrl.signal
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const els = Array.isArray(json.elements) ? json.elements : [];
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark) && !els.length) throw new Error(json.remark);
        return els;
      } catch (e) {
        lastErr = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('Overpass-Server nicht erreichbar oder überlastet – bitte gleich noch einmal versuchen (' + (lastErr && lastErr.message ? lastErr.message : 'unbekannt') + ').');
  }

  function toLead(el) {
    const t = el.tags || {};
    if (!t.name) return null;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lng == null) return null;
    const [cat, sub] = classify(t);
    const street = t['addr:street'] ? t['addr:street'] + (t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : '') : '';
    const place = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
    const social = [];
    if (t['contact:facebook'] || t.facebook) social.push('Facebook');
    if (t['contact:instagram'] || t.instagram) social.push('Instagram');
    return {
      id: el.type[0] + el.id,
      lat, lng,
      name: t.name,
      cat, sub,
      addr: [street, place].filter(Boolean).join(', '),
      city: t['addr:city'] || lastPlace,
      phone: t.phone || t['contact:phone'] || t['contact:mobile'] || '',
      email: t.email || t['contact:email'] || '',
      social: social.join(', '),
      osm: el.type + '/' + el.id,
      src: 'osm'
    };
  }

  async function scan() {
    if (scanning || !map) return;
    if (areaKm2(map.getBounds()) > MAX_AREA_KM2) {
      setStatus('Der Ausschnitt ist zu groß – bitte weiter hineinzoomen.', 'warn');
      return;
    }
    const cats = CATS.filter(c => prefs.cats.includes(c.key));
    if (!cats.length) { setStatus('Wähle mindestens eine Branche aus.', 'warn'); return; }

    setScanning(true);
    setStatus('Suche läuft … das dauert meist 3–10 Sekunden.');
    try {
      const els = await queryOverpass(buildQuery(map.getBounds(), cats, prefs.noChains));
      const leads = els.map(toLead).filter(Boolean);
      const before = Object.keys(store.leads).length;
      store.upsertLeads(leads);
      const added = Object.keys(store.leads).length - before;
      if (!leads.length) {
        setStatus('Hier keine Treffer – in diesem Ausschnitt haben alle erfassten Betriebe eine Website (oder sind Ketten).', 'warn');
      } else if (els.length >= RESULT_LIMIT) {
        setStatus(`${leads.length} Treffer, davon ${added} neu. Limit erreicht – zoom näher heran, um nichts zu verpassen.`, 'warn');
      } else {
        setStatus(`${leads.length} Betriebe ohne Website gefunden, davon ${added} neu.`, 'ok');
      }
    } catch (e) {
      setStatus(e.message, 'bad');
    } finally {
      setScanning(false);
    }
  }

  function setScanning(on) {
    scanning = on;
    updateScanBtn();
  }
  function updateScanBtn() {
    const btn = $('#scanBtn'), label = $('#scanLabel');
    btn.disabled = scanning || tooBig;
    btn.classList.toggle('busy', scanning);
    label.textContent = scanning ? 'Suche läuft …' : tooBig ? 'Näher heranzoomen, um zu suchen' : 'Diesen Kartenausschnitt durchsuchen';
  }

  /* ---------- Geocoding (Nominatim) ---------- */
  async function geocode(q) {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('Ortssuche nicht erreichbar (HTTP ' + res.status + ').');
    const arr = await res.json();
    if (!arr.length) throw new Error('Diesen Ort kenne ich nicht – probier eine genauere Schreibweise.');
    return arr[0];
  }

  async function onGeoSubmit(e) {
    e.preventDefault();
    const q = $('#geoInput').value.trim();
    if (!q) return;
    const btn = $('#geoForm button');
    btn.disabled = true;
    setStatus('Suche Ort …');
    try {
      const r = await geocode(q);
      lastPlace = (r.name || String(r.display_name).split(',')[0] || '').trim();
      const [s, n, w, o] = r.boundingbox.map(Number);
      if (n - s < 0.03 && o - w < 0.05) map.fitBounds([[s, w], [n, o]], { maxZoom: 17, padding: [24, 24], animate: false });
      else map.setView([Number(r.lat), Number(r.lon)], 14, { animate: false });
      updateTooBig();
      await scan();
    } catch (err) {
      setStatus(err.message, 'bad');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Marker ---------- */
  function markerStyle(l) { return STATE_STYLE[l.state] || STATE_STYLE.neu; }

  function refreshMarkers() {
    if (!map) return;
    const leads = store.leads;
    markers.forEach((m, id) => {
      const l = leads[id];
      if (!l || !passes(l)) { leadLayer.removeLayer(m); markers.delete(id); }
    });
    Object.values(leads).forEach(l => {
      if (!passes(l)) return;
      let m = markers.get(l.id);
      if (!m) {
        m = L.circleMarker([l.lat, l.lng], Object.assign({ renderer: canvas, bubblingMouseEvents: false }, markerStyle(l)));
        m.bindPopup(() => leadPopupHtml(store.leads[l.id] || l), { className: 'wf-popup', maxWidth: 300, minWidth: 240, autoPanPadding: [30, 30] });
        m.on('click', () => select(l.id, { popup: true, scroll: true }));
        markers.set(l.id, m);
        leadLayer.addLayer(m);
      } else {
        m.setStyle(markerStyle(l));
        m.setRadius(markerStyle(l).radius);
      }
    });
    $('#mapEmpty').hidden = Object.keys(leads).length > 0;
    if (selectedId && !markers.has(selectedId)) clearRing();
  }

  function refreshOrders() {
    if (!map) return;
    orderLayer.clearLayers();
    orderMarkers.clear();
    if (!prefs.showOrders) return;
    store.orders.filter(o => o.lat != null && o.lng != null && o.status !== 'abgesagt').forEach(o => {
      const st = WF.statusOf(o.status);
      const icon = L.divIcon({
        className: 'omark-wrap',
        html: `<span class="omark" style="--c:${st.color}"></span>`,
        iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12]
      });
      const m = L.marker([o.lat, o.lng], { icon, title: o.company, riseOnHover: true });
      m.bindPopup(orderPopupHtml(o), { className: 'wf-popup', maxWidth: 280, minWidth: 220 });
      orderMarkers.set(o.id, m);
      orderLayer.addLayer(m);
    });
  }

  function orderPopupHtml(o) {
    const st = WF.statusOf(o.status);
    return `<div class="pop">
      <p class="pop-kicker"><span class="dot" style="background:${st.color}"></span>${esc(st.label)}${o.service ? ' · ' + esc(o.service) : ''}</p>
      <h3 class="pop-title">${esc(o.company)}</h3>
      ${o.address ? `<p class="pop-line">${esc(o.address)}</p>` : ''}
      ${o.price ? `<p class="pop-line"><strong>${esc(WF.ui.fmtEUR(o.price))}</strong></p>` : ''}
      <div class="pop-actions"><button type="button" class="mini primary" data-act="order-open" data-id="${esc(o.id)}">Auftrag öffnen</button></div>
    </div>`;
  }

  /* ---------- Auswahl ---------- */
  function clearRing() {
    if (ring) { map.removeLayer(ring); ring = null; }
    selectedId = null;
  }
  function select(id, opts) {
    opts = opts || {};
    const l = store.leads[id];
    if (!l) return;
    selectedId = id;
    if (ring) map.removeLayer(ring);
    ring = L.circleMarker([l.lat, l.lng], { radius: 14, color: '#16272c', weight: 2, dashArray: '3 4', fill: false, interactive: false, renderer: canvas }).addTo(map);

    if (opts.fly) map.setView([l.lat, l.lng], Math.max(map.getZoom(), 17), { animate: true });
    const m = markers.get(id);
    if (m && opts.popup !== false) m.openPopup();
    $$('#leadList .lead').forEach(li => li.classList.toggle('sel', li.dataset.id === id));
    if (opts.scroll) {
      const li = $(`#leadList .lead[data-id="${CSS.escape(id)}"]`);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /* ---------- Rendering: Liste & Popup ---------- */
  function contactHtml(l) {
    const bits = [];
    if (l.phone) bits.push(`<a href="${esc(telHref(l.phone))}"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg>${esc(l.phone)}</a>`);
    if (l.email) bits.push(`<a href="mailto:${esc(l.email)}"><svg class="ic" aria-hidden="true"><use href="#i-mail"/></svg>${esc(l.email)}</a>`);
    if (l.social) bits.push(`<span class="tag tag-hot" title="Hat Social-Media-Profil, aber keine Website">${esc(l.social)}</span>`);
    return bits.join('');
  }

  function actionsHtml(l) {
    const btn = (st, label, icon) =>
      `<button type="button" class="mini${l.state === st ? ' on' : ''}" data-act="lead-state" data-id="${esc(l.id)}" data-state="${st}" aria-pressed="${l.state === st}">${icon ? `<svg class="ic" aria-hidden="true"><use href="#${icon}"/></svg>` : ''}${label}</button>`;
    return `<a class="mini" href="${esc(checkUrl(l))}" target="_blank" rel="noopener noreferrer" title="Per Websuche prüfen, ob es doch eine Seite gibt"><svg class="ic" aria-hidden="true"><use href="#i-ext"/></svg>Prüfen</a>
      ${btn('vorgemerkt', 'Vormerken', 'i-star')}
      ${btn('kontaktiert', 'Kontaktiert', 'i-check')}
      ${btn('verworfen', 'Verwerfen', 'i-x')}
      ${l.state === 'auftrag'
        ? `<span class="mini ghost-ok"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>Auftrag angelegt</span>`
        : `<button type="button" class="mini primary" data-act="lead-order" data-id="${esc(l.id)}"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg>Auftrag</button>`}`;
  }

  function metaLine(l) {
    return [subLabel(l.sub), CAT_LABEL[l.cat]].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
  }

  function leadPopupHtml(l) {
    return `<div class="pop">
      <p class="pop-kicker"><span class="dot dot-${l.state}"></span>${STATE_LABEL[l.state]} · ${esc(metaLine(l))}</p>
      <h3 class="pop-title">${esc(l.name)}</h3>
      ${l.addr ? `<p class="pop-line">${esc(l.addr)}</p>` : ''}
      <div class="lead-contact">${contactHtml(l)}</div>
      <div class="pop-actions">${actionsHtml(l)}</div>
      ${osmUrl(l) ? `<p class="pop-foot"><a href="${esc(osmUrl(l))}" target="_blank" rel="noopener noreferrer">In OpenStreetMap ansehen ↗</a></p>` : '<p class="pop-foot">Eigener Eintrag</p>'}
    </div>`;
  }

  function leadItemHtml(l) {
    return `<li class="lead${l.id === selectedId ? ' sel' : ''}" data-id="${esc(l.id)}" data-state="${l.state}">
      <div class="lead-main" data-act="lead-focus" data-id="${esc(l.id)}" tabindex="0" role="button" aria-label="${esc(l.name)} auf der Karte zeigen">
        <div class="lead-title"><span class="dot dot-${l.state}" title="${STATE_LABEL[l.state]}"></span><strong>${esc(l.name)}</strong></div>
        <div class="lead-sub">${esc(metaLine(l))}${l.state !== 'neu' ? ` <span class="tag">${STATE_LABEL[l.state]}</span>` : ''}</div>
        ${l.addr ? `<div class="lead-addr">${esc(l.addr)}</div>` : ''}
      </div>
      <div class="lead-contact">${contactHtml(l)}</div>
      <div class="lead-actions">${actionsHtml(l)}</div>
    </li>`;
  }

  function renderList() {
    if (!map) return;
    const b = map.getBounds(), c = map.getCenter();
    const inView = Object.values(store.leads).filter(l => passesCat(l) && b.contains([l.lat, l.lng]));
    const counts = {};
    STATE_FILTERS.forEach(f => { counts[f.key] = inView.filter(l => f.states.includes(l.state)).length; });

    $('#stateSeg').innerHTML = STATE_FILTERS.map(f =>
      `<button type="button" data-filter="${f.key}" aria-pressed="${prefs.stateFilter === f.key}">${f.label} <span class="n">${counts[f.key]}</span></button>`
    ).join('');

    const items = inView.filter(passesState)
      .map(l => ({ l, d: distance(c.lat, c.lng, l.lat, l.lng) }))
      .sort((a, b2) => a.d - b2.d)
      .map(x => x.l);

    $('#listCount').textContent = items.length ? `${items.length} im Ausschnitt` : '';
    const list = $('#leadList');
    if (!items.length) {
      const total = Object.keys(store.leads).length;
      list.innerHTML = `<li class="list-empty">${total
        ? 'Im sichtbaren Ausschnitt gibt es nichts zu diesem Filter. Verschieb die Karte oder wechsle den Status-Filter.'
        : 'Noch nichts gefunden. Such oben einen Ort – oder zoom auf deine Stadt und starte den Scan.'}</li>`;
      return;
    }
    const shown = items.slice(0, listLimit);
    list.innerHTML = shown.map(leadItemHtml).join('') +
      (items.length > shown.length
        ? `<li class="list-more"><button type="button" class="btn" data-act="lead-more">Weitere ${items.length - shown.length} anzeigen</button></li>` : '');
  }

  /* ---------- Manuell eintragen ---------- */
  function setAddMode(on) {
    addMode = on;
    $('#addPlaceBtn').setAttribute('aria-pressed', String(on));
    $('#addPlaceBtn').classList.toggle('active', on);
    map.getContainer().classList.toggle('adding', on);
    if (on) toast('Klick auf die Karte, wo der Betrieb liegt.');
  }

  function onPlaceSubmit(e) {
    e.preventDefault();
    const f = e.target.elements;
    const name = f.name.value.trim();
    $('#placeErr').hidden = !!name;
    if (!name || !pendingLatLng) { if (!name) f.name.focus(); return; }
    const id = 'm' + Date.now().toString(36);
    store.upsertLeads([{
      id, lat: pendingLatLng.lat, lng: pendingLatLng.lng, name,
      cat: 'manuell', sub: f.sub.value.trim() || 'Betrieb',
      addr: f.addr.value.trim(), city: lastPlace, phone: f.phone.value.trim(), src: 'manuell'
    }]);
    store.setLeadState(id, 'vorgemerkt');
    WF.ui.closeDialog($('#placeDlg'));
    e.target.reset();
    prefs.stateFilter = 'aktiv'; savePrefs();
    renderList();
    select(id, { popup: true, scroll: true });
    toast('Betrieb eingetragen und vorgemerkt.', 'ok');
  }

  /* ---------- Aktionen ---------- */
  function onAction(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === 'lead-focus') {
      select(id, { fly: true, popup: true });
      if (window.matchMedia('(max-width: 860px)').matches) $('#map').scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (act === 'lead-state') {
      const l = store.leads[id];
      if (!l) return;
      const next = l.state === el.dataset.state ? 'neu' : el.dataset.state;
      store.setLeadState(id, next);
      const pm = markers.get(id), pop = pm && pm.getPopup();
      if (pop && pop.isOpen()) pop.update();
    } else if (act === 'lead-order') {
      const l = store.leads[id];
      if (!l) return;
      map.closePopup();
      WF.orders.openNew({
        company: l.name, phone: l.phone, email: l.email,
        address: l.addr || l.city, lat: l.lat, lng: l.lng, leadId: l.id,
        notes: l.social ? 'Hat ' + l.social + ', aber keine Website.' : ''
      });
    } else if (act === 'lead-more') {
      listLimit += LIST_PAGE;
      renderList();
    } else if (act === 'order-open') {
      map.closePopup();
      WF.orders.openEdit(id);
    }
  }

  function onKeyAction(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.lead-main')) {
      e.preventDefault();
      onAction({ target: e.target });
    }
  }

  /* ---------- Initialisierung ---------- */
  function updateTooBig() {
    if (!map) return;
    tooBig = areaKm2(map.getBounds()) > MAX_AREA_KM2;
    updateScanBtn();
  }

  function init() {
    if (map) return;
    // Branchen-Chips
    $('#catChips').innerHTML = CATS.map(c =>
      `<button type="button" class="chip" data-cat="${c.key}" aria-pressed="${prefs.cats.includes(c.key)}">${c.label}</button>`).join('');
    $('#catChips').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      const k = b.dataset.cat, on = !prefs.cats.includes(k);
      prefs.cats = on ? prefs.cats.concat(k) : prefs.cats.filter(x => x !== k);
      b.setAttribute('aria-pressed', String(on));
      savePrefs();
      refreshMarkers(); renderList();
    });

    const noChains = $('#noChains');
    noChains.checked = !!prefs.noChains;
    noChains.addEventListener('change', () => { prefs.noChains = noChains.checked; savePrefs(); });

    const showOrders = $('#showOrders');
    showOrders.checked = !!prefs.showOrders;
    showOrders.addEventListener('change', () => { prefs.showOrders = showOrders.checked; savePrefs(); refreshOrders(); });

    $('#stateSeg').addEventListener('click', e => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      prefs.stateFilter = b.dataset.filter; listLimit = LIST_PAGE; savePrefs();
      refreshMarkers(); renderList();
    });

    // Karte
    const saved = store.readJSON(WF.KEY.mapView, null);
    map = L.map('map', { zoomControl: true, preferCanvas: true, worldCopyJump: true })
      .setView(saved ? [saved.lat, saved.lng] : [51.1657, 10.4515], saved ? saved.zoom : 6);
    canvas = L.canvas({ padding: 0.4, tolerance: 6 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>-Mitwirkende'
    }).addTo(map);
    orderLayer = L.layerGroup().addTo(map);
    leadLayer = L.layerGroup().addTo(map);

    const persistView = debounce(() => {
      const c = map.getCenter();
      store.writeJSON(WF.KEY.mapView, { lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    }, 400);
    const onMove = debounce(() => { listLimit = LIST_PAGE; renderList(); }, 120);
    map.on('moveend', () => { updateTooBig(); onMove(); persistView(); });
    map.on('click', e => {
      if (addMode) {
        pendingLatLng = e.latlng;
        $('#placeLoc').textContent = `Position: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
        setAddMode(false);
        WF.ui.openDialog($('#placeDlg'));
        setTimeout(() => $('#placeForm').elements.name.focus(), 30);
      } else {
        clearRing();
        $$('#leadList .lead.sel').forEach(li => li.classList.remove('sel'));
      }
    });

    $('#geoForm').addEventListener('submit', onGeoSubmit);
    $('#scanBtn').addEventListener('click', scan);
    $('#addPlaceBtn').addEventListener('click', () => setAddMode(!addMode));
    $('#placeForm').addEventListener('submit', onPlaceSubmit);
    document.addEventListener('click', onAction);
    $('#leadList').addEventListener('keydown', onKeyAction);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && addMode) setAddMode(false); });

    store.on('leads', () => { refreshMarkers(); renderList(); });
    store.on('orders', refreshOrders);

    refreshMarkers();
    refreshOrders();
    renderList();
    updateTooBig();
  }

  function onShow() {
    if (!map) return;
    map.invalidateSize();
    updateTooBig();
    renderList();
  }

  function focusOrder(id) {
    const o = store.getOrder(id);
    if (!o || o.lat == null) return;
    location.hash = '#karte';
    setTimeout(() => {
      map.invalidateSize();
      map.setView([o.lat, o.lng], Math.max(map.getZoom(), 16), { animate: false });
      const m = orderMarkers.get(id);
      if (m) m.openPopup();
    }, 80);
  }

  WF.map = { init, onShow, focusOrder, scan, get instance() { return map; } };
})();
