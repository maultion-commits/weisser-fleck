/* Weißer Fleck – Zustand & Persistenz (localStorage) */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});

  /* ---------- Konstanten ---------- */
  const STATUSES = [
    { key: 'anfrage',    label: 'Anfrage',       color: '#8c8470', hint: 'Erster Kontakt, noch kein Preis' },
    { key: 'angebot',    label: 'Angebot raus',  color: '#b97b0d', hint: 'Angebot gesendet, Antwort offen' },
    { key: 'beauftragt', label: 'Beauftragt',    color: '#2f6f8f', hint: 'Zusage da, Start geplant' },
    { key: 'arbeit',     label: 'In Arbeit',     color: '#4a4fa3', hint: 'Design & Umsetzung laufen' },
    { key: 'abnahme',    label: 'Abnahme',       color: '#9a3f6b', hint: 'Kunde prüft die Seite' },
    { key: 'fertig',     label: 'Abgeschlossen', color: '#2f7d5b', hint: 'Live gegangen' },
    { key: 'abgesagt',   label: 'Abgesagt',      color: '#8d8f8a', hint: 'Kein Auftrag zustande gekommen' }
  ];
  const STATUS_KEYS = STATUSES.map(s => s.key);
  const SERVICES = [
    'Onepager (Landingpage)',
    'Mehrseitige Website',
    'Online-Shop',
    'Relaunch',
    'Google-Profil + Mini-Seite',
    'Wartung & Hosting',
    'Sonstiges'
  ];
  const LEAD_STATES = ['neu', 'vorgemerkt', 'kontaktiert', 'verworfen', 'auftrag', 'website'];
  /* „neu“ und „website“ sind automatisch entstanden und werden nicht gesichert/veröffentlicht */
  const isAuto = st => st === 'neu' || st === 'website';
  const LEAD_CAP = 3000;

  const KEY = {
    orders: 'wf.orders.v1',
    leads: 'wf.leads.v1',
    gh: 'wf.gh.v1',
    token: 'wf.gh.token',
    pub: 'wf.gh.published.v1',
    mapView: 'wf.map.view.v1',
    mapPrefs: 'wf.map.prefs.v1',
    ordersPrefs: 'wf.orders.prefs.v1',
    gkey: 'wf.google.key'
  };

  /* ---------- Storage-Helfer (können im Privatmodus werfen) ---------- */
  function store(kind) {
    return {
      get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
      set(k, v) { try { window[kind].setItem(k, v); return true; } catch (e) { return false; } },
      del(k) { try { window[kind].removeItem(k); } catch (e) { /* egal */ } }
    };
  }
  const ls = store('localStorage');
  const ss = store('sessionStorage');

  function readJSON(k, fallback) {
    const raw = ls.get(k);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function writeJSON(k, v) { return ls.set(k, JSON.stringify(v)); }

  /* ---------- Event-Bus ---------- */
  const handlers = {};
  function on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); }
  function emit(evt, data) {
    (handlers[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
  }

  /* ---------- Normalisierung ---------- */
  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const iso = v => {
    const d = v ? new Date(v) : new Date();
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
  };
  function uid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* weiter */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normOrder(o) {
    const status = STATUS_KEYS.includes(o.status) ? o.status : 'anfrage';
    return {
      id: str(o.id) || uid(),
      company: str(o.company),
      contact: str(o.contact),
      email: str(o.email),
      phone: str(o.phone),
      address: str(o.address),
      lat: num(o.lat),
      lng: num(o.lng),
      service: str(o.service),
      price: Math.max(0, num(o.price) || 0),
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(str(o.deadline)) ? str(o.deadline) : '',
      status,
      paid: status === 'fertig' && !!o.paid,
      notes: String(o.notes == null ? '' : o.notes).trim(),
      leadId: str(o.leadId),
      createdAt: iso(o.createdAt),
      updatedAt: iso(o.updatedAt),
      history: (Array.isArray(o.history) ? o.history : [])
        .filter(h => h && STATUS_KEYS.includes(h.status))
        .map(h => ({ status: h.status, at: iso(h.at) }))
    };
  }

  function normLead(l) {
    return {
      id: str(l.id),
      lat: Number(l.lat),
      lng: Number(l.lng),
      name: str(l.name),
      cat: str(l.cat) || 'handel',
      sub: str(l.sub),
      addr: str(l.addr),
      city: str(l.city),
      phone: str(l.phone),
      email: str(l.email),
      social: str(l.social),
      osm: str(l.osm),
      src: l.src === 'manuell' ? 'manuell' : 'osm',
      seen: iso(l.seen),
      state: LEAD_STATES.includes(l.state) ? l.state : 'neu',
      stateAt: l.stateAt ? iso(l.stateAt) : '',
      siteUrl: str(l.siteUrl),
      siteHow: str(l.siteHow),
      siteFull: str(l.siteFull),
      checked: l.checked ? iso(l.checked) : '',
      gcheck: ['website', 'keine', 'nicht gefunden', 'geschlossen'].includes(l.gcheck) ? l.gcheck : '',
      confirmed: !!l.confirmed
    };
  }

  /* ---------- Zustand laden ---------- */
  const state = {
    orders: (readJSON(KEY.orders, []) || []).map(normOrder),
    leads: {}
  };
  (readJSON(KEY.leads, []) || []).forEach(l => {
    const n = normLead(l);
    if (n.id && Number.isFinite(n.lat) && Number.isFinite(n.lng)) state.leads[n.id] = n;
  });

  /* ---------- Speichern ---------- */
  let warnedQuota = false;
  function quotaWarn() {
    if (warnedQuota) return;
    warnedQuota = true;
    if (WF.ui) WF.ui.toast('Speicher des Browsers ist voll – bitte Daten auf GitHub sichern.', 'bad');
  }
  function saveOrders() {
    if (!writeJSON(KEY.orders, state.orders)) quotaWarn();
  }
  function saveLeads() {
    let arr = Object.values(state.leads);
    if (arr.length > LEAD_CAP) {
      // erst unbearbeitete, älteste Fundstellen verwerfen
      arr.sort((a, b) => isAuto(a.state) - isAuto(b.state) || (a.seen < b.seen ? 1 : -1));
      arr = arr.slice(0, LEAD_CAP);
      state.leads = {};
      arr.forEach(l => { state.leads[l.id] = l; });
    }
    if (!writeJSON(KEY.leads, arr)) {
      const keep = arr.filter(l => !isAuto(l.state));
      if (!writeJSON(KEY.leads, keep)) quotaWarn();
    }
  }

  /* ---------- Aufträge ---------- */
  function getOrder(id) { return state.orders.find(o => o.id === id) || null; }

  function addOrder(partial) {
    const now = new Date().toISOString();
    const status = STATUS_KEYS.includes(partial.status) ? partial.status : 'anfrage';
    const o = normOrder(Object.assign({}, partial, {
      id: uid(), status, createdAt: now, updatedAt: now, history: [{ status, at: now }]
    }));
    state.orders.push(o);
    saveOrders();
    if (o.leadId && state.leads[o.leadId]) setLeadState(o.leadId, 'auftrag', true);
    emit('orders');
    return o;
  }

  function updateOrder(id, patch) {
    const i = state.orders.findIndex(o => o.id === id);
    if (i < 0) return null;
    const prev = state.orders[i];
    const now = new Date().toISOString();
    const merged = Object.assign({}, prev, patch, { id: prev.id, createdAt: prev.createdAt, updatedAt: now });
    const next = normOrder(merged);
    if (next.status !== prev.status) next.history = prev.history.concat({ status: next.status, at: now });
    else next.history = prev.history;
    state.orders[i] = next;
    saveOrders();
    emit('orders');
    return next;
  }

  function removeOrder(id) {
    const o = getOrder(id);
    if (!o) return;
    state.orders = state.orders.filter(x => x.id !== id);
    saveOrders();
    if (o.leadId && state.leads[o.leadId] && state.leads[o.leadId].state === 'auftrag') {
      setLeadState(o.leadId, 'vorgemerkt', true);
    }
    emit('orders');
  }

  /* ---------- Fundstellen (Leads) ---------- */
  function upsertLeads(list) {
    let added = 0;
    const now = new Date().toISOString();
    list.forEach(raw => {
      const l = normLead(Object.assign({}, raw, { seen: now }));
      if (!l.id || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return;
      const old = state.leads[l.id];
      if (old) {
        l.state = old.state;
        l.stateAt = old.stateAt;
        l.checked = old.checked;
        l.gcheck = old.gcheck;
        l.confirmed = old.confirmed;
        if (old.siteUrl) { l.siteUrl = old.siteUrl; l.siteHow = old.siteHow; l.siteFull = old.siteFull; }
      } else {
        added++;
      }
      state.leads[l.id] = l;
    });
    saveLeads();
    emit('leads', { added });
    return added;
  }

  /* Stapel-Änderungen (z. B. Website-Prüfung): erst patchen, dann einmal speichern */
  function patchLead(id, patch) {
    const l = state.leads[id];
    if (!l) return;
    Object.assign(l, patch);
  }
  function commitLeads(opts) {
    saveLeads();
    if (!opts || opts.emit !== false) emit('leads', { checked: true });
  }

  function setLeadState(id, newState, silent) {
    const l = state.leads[id];
    if (!l || !LEAD_STATES.includes(newState)) return;
    l.state = newState;
    l.stateAt = newState === 'neu' ? '' : new Date().toISOString();
    saveLeads();
    if (!silent) emit('leads', { changed: id });
  }

  /* ---------- Export / Publish-Snapshot ---------- */
  function snapshot() {
    const orders = state.orders.map(normOrder).sort((a, b) => (a.id < b.id ? -1 : 1));
    const leads = Object.values(state.leads)
      .filter(l => !isAuto(l.state))
      .map(normLead)
      .map(slimLead)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return { orders, leads };
  }

  /* Prüfdaten gehören nicht in die Sicherung – nur das, was der Nutzer entschieden hat */
  function slimLead(l) {
    const c = Object.assign({}, l);
    delete c.siteUrl; delete c.siteHow; delete c.siteFull; delete c.checked; delete c.gcheck; delete c.confirmed;
    return c;
  }

  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }
  /* Hash über den fachlichen Inhalt (ohne Zeitstempel wie „seen“ oder „exportedAt“) */
  function payloadHash(p) {
    const orders = (Array.isArray(p.orders) ? p.orders : []).map(normOrder).sort((a, b) => (a.id < b.id ? -1 : 1));
    const leads = (Array.isArray(p.leads) ? p.leads : []).map(normLead)
      .filter(l => l.id && !isAuto(l.state))
      .map(slimLead)
      .map(l => { delete l.seen; return l; })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    return fnv(JSON.stringify({ orders, leads }));
  }
  function snapshotHash() { return payloadHash(snapshot()); }

  function exportPayload() {
    const snap = snapshot();
    return {
      schema: 1,
      app: 'weisser-fleck',
      exportedAt: new Date().toISOString(),
      orders: snap.orders,
      leads: snap.leads
    };
  }

  /* Zusammenführen: pro Eintrag gewinnt der neuere Stand.
     Gibt Zähler zurück; löscht nie lokale Daten. */
  function mergePayload(payload) {
    const res = { ordersAdded: 0, ordersUpdated: 0, leadsAdded: 0, leadsUpdated: 0 };
    if (!payload || typeof payload !== 'object') throw new Error('Keine gültige Datei.');
    (Array.isArray(payload.orders) ? payload.orders : []).forEach(raw => {
      if (!raw || typeof raw !== 'object') return;
      const r = normOrder(raw);
      if (!r.company) return;
      const i = state.orders.findIndex(o => o.id === r.id);
      if (i < 0) { state.orders.push(r); res.ordersAdded++; }
      else if (r.updatedAt > state.orders[i].updatedAt) { state.orders[i] = r; res.ordersUpdated++; }
    });
    (Array.isArray(payload.leads) ? payload.leads : []).forEach(raw => {
      if (!raw || typeof raw !== 'object') return;
      const r = normLead(raw);
      if (!r.id || !Number.isFinite(r.lat) || !Number.isFinite(r.lng) || isAuto(r.state)) return;
      const old = state.leads[r.id];
      if (!old) { state.leads[r.id] = r; res.leadsAdded++; }
      else if (r.stateAt && r.stateAt > (old.stateAt || '')) { state.leads[r.id] = Object.assign({}, old, { state: r.state, stateAt: r.stateAt }); res.leadsUpdated++; }
    });
    saveOrders();
    saveLeads();
    emit('orders');
    emit('leads', { merged: true });
    return res;
  }

  /* ---------- GitHub-Konfiguration ---------- */
  function getGh() {
    const c = readJSON(KEY.gh, {}) || {};
    return {
      repo: str(c.repo),
      branch: str(c.branch),
      dir: c.dir == null ? 'data' : str(c.dir).replace(/^\/+|\/+$/g, ''),
      markdown: c.markdown !== false,
      remember: !!c.remember
    };
  }
  function setGh(patch) {
    writeJSON(KEY.gh, Object.assign(getGh(), patch));
    emit('gh');
  }
  function getToken() { return ss.get(KEY.token) || ls.get(KEY.token) || ''; }
  function setToken(token, remember) {
    ss.del(KEY.token); ls.del(KEY.token);
    token = str(token);
    if (!token) return;
    if (remember) ls.set(KEY.token, token); else ss.set(KEY.token, token);
  }
  /* Google-Places-Schlüssel (optional): wie das GitHub-Token nur im Browser */
  function getGoogleKey() { return ss.get(KEY.gkey) || ls.get(KEY.gkey) || ''; }
  function setGoogleKey(key, remember) {
    ss.del(KEY.gkey); ls.del(KEY.gkey);
    key = str(key);
    if (!key) return;
    if (remember) ls.set(KEY.gkey, key); else ss.set(KEY.gkey, key);
  }
  const googleKeyRemembered = () => !!ls.get(KEY.gkey);
  function getPublished() { return readJSON(KEY.pub, null); }
  function setPublished(p) { if (p) writeJSON(KEY.pub, p); else ls.del(KEY.pub); emit('gh'); }

  /* ---------- UI-Präferenzen ---------- */
  function getPrefs(key, fallback) { return Object.assign({}, fallback, readJSON(key, {}) || {}); }
  function setPrefs(key, value) { writeJSON(key, value); }

  WF.STATUSES = STATUSES;
  WF.STATUS_KEYS = STATUS_KEYS;
  WF.SERVICES = SERVICES;
  WF.LEAD_STATES = LEAD_STATES;
  WF.KEY = KEY;
  WF.statusOf = key => STATUSES.find(s => s.key === key) || STATUSES[0];

  WF.store = {
    state,
    get orders() { return state.orders; },
    get leads() { return state.leads; },
    on, emit,
    getOrder, addOrder, updateOrder, removeOrder,
    upsertLeads, setLeadState, patchLead, commitLeads,
    snapshot, snapshotHash, payloadHash, exportPayload, mergePayload, normOrder,
    getGh, setGh, getToken, setToken, getGoogleKey, setGoogleKey, googleKeyRemembered, getPublished, setPublished,
    getPrefs, setPrefs,
    readJSON, writeJSON
  };
})();
