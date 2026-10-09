/* Weißer Fleck – Veröffentlichen auf GitHub (Contents-API) */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});
  const { $, esc, toast, fmtDateTime, fmtEUR, fmtDate } = WF.ui;
  const store = WF.store;
  const API = 'https://api.github.com';

  class GhError extends Error {
    constructor(msg, status) { super(msg); this.status = status || 0; }
  }

  /* ---------- Base64 (UTF-8-sicher) ---------- */
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  /* ---------- API ---------- */
  function explain(status, data) {
    const msg = data && data.message ? data.message : '';
    if (status === 401) return 'GitHub lehnt das Token ab (ungültig oder abgelaufen).';
    if (status === 403) return /rate limit/i.test(msg)
      ? 'GitHub-Limit erreicht – bitte in ein paar Minuten erneut versuchen.'
      : 'Zugriff verweigert. Hat das Token die Berechtigung „Contents: Read and write“ für dieses Repository?';
    if (status === 404) return 'Repository oder Datei nicht gefunden. Prüfe die Schreibweise („name/repo“) und ob das Token auf dieses Repo zugreifen darf.';
    if (status === 409) return 'Konflikt: Der Branch wurde parallel geändert. Bitte noch einmal versuchen.';
    if (status === 422) return 'GitHub konnte die Anfrage nicht verarbeiten' + (msg ? ': ' + msg : '.');
    return msg || 'Unerwarteter GitHub-Fehler (HTTP ' + status + ').';
  }

  async function api(path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: Object.assign({
          Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          Authorization: 'Bearer ' + store.getToken(),
          'X-GitHub-Api-Version': '2022-11-28'
        }, opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store'
      });
    } catch (e) {
      throw new GhError('Keine Verbindung zu GitHub – bist du online?', 0);
    }
    if (opts.raw && res.ok) return res.text();
    let data = null;
    try { data = await res.json(); } catch (e) { /* leer */ }
    if (!res.ok) throw new GhError(explain(res.status, data), res.status);
    return data;
  }

  const encPath = p => p.split('/').map(encodeURIComponent).join('/');

  async function getFile(cfg, path) {
    try {
      return await api(`/repos/${cfg.repo}/contents/${encPath(path)}` + (cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : ''));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  function putFile(cfg, path, text, message, sha) {
    const body = { message, content: toB64(text) };
    if (cfg.branch) body.branch = cfg.branch;
    if (sha) body.sha = sha;
    return api(`/repos/${cfg.repo}/contents/${encPath(path)}`, { method: 'PUT', body });
  }

  async function readFileText(cfg, file) {
    if (file.content && file.encoding === 'base64') return fromB64(file.content);
    return api(`/repos/${cfg.repo}/contents/${encPath(file.path)}` + (cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : ''), { raw: true });
  }

  /* ---------- Markdown-Übersicht (bewusst ohne Kontaktdaten) ---------- */
  const mdCell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '–';

  function buildMarkdown(orders) {
    const sum = list => list.reduce((s, o) => s + o.price, 0);
    const lines = [
      '# Aufträge – Weißer Fleck', '',
      `_Stand: ${fmtDateTime(new Date().toISOString())} · ${orders.length} ${orders.length === 1 ? 'Auftrag' : 'Aufträge'}_`, ''
    ];
    const potential = orders.filter(o => o.status === 'anfrage' || o.status === 'angebot');
    const running = orders.filter(o => ['beauftragt', 'arbeit', 'abnahme'].includes(o.status));
    const open = orders.filter(o => o.status === 'fertig' && !o.paid);
    const paid = orders.filter(o => o.status === 'fertig' && o.paid);
    lines.push('| Kennzahl | Aufträge | Summe |', '|---|---:|---:|');
    [['Potenzial (Anfrage + Angebot)', potential], ['Laufende Projekte', running], ['Offene Rechnungen', open], ['Eingenommen', paid]]
      .forEach(([l, list]) => lines.push(`| ${l} | ${list.length} | ${fmtEUR(sum(list))} |`));
    lines.push('');
    WF.STATUSES.forEach(s => {
      const list = orders.filter(o => o.status === s.key)
        .sort((a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1);
      if (!list.length) return;
      lines.push(`## ${s.label} (${list.length})`, '', '| Firma | Leistung | Preis | Deadline | Ort |', '|---|---|---:|---|---|');
      list.forEach(o => lines.push(`| ${mdCell(o.company)} | ${mdCell(o.service)} | ${o.price ? fmtEUR(o.price) : '–'}${s.key === 'fertig' ? (o.paid ? ' ✓' : ' offen') : ''} | ${o.deadline ? fmtDate(o.deadline) : '–'} | ${mdCell(o.address)} |`));
      lines.push('');
    });
    lines.push('---', '_Automatisch erzeugt von Weißer Fleck. Die vollständigen Daten liegen in `auftraege.json`._', '');
    return lines.join('\n');
  }

  /* ---------- Formular / Log ---------- */
  function readCfg() {
    const f = $('#ghForm').elements;
    const repo = f.repo.value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    return {
      repo,
      branch: f.branch.value.trim(),
      dir: f.dir.value.trim().replace(/^\/+|\/+$/g, ''),
      token: f.token.value.trim(),
      remember: f.remember.checked,
      markdown: f.markdown.checked
    };
  }
  function validate(cfg) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) throw new GhError('Bitte das Repository als „name/repo“ eintragen.');
    if (!cfg.token) throw new GhError('Bitte ein Personal Access Token eintragen.');
  }
  function persist(cfg) {
    store.setToken(cfg.token, cfg.remember);
    store.setGh({ repo: cfg.repo, branch: cfg.branch, dir: cfg.dir, markdown: cfg.markdown, remember: cfg.remember });
  }

  function log(text, kind, html) {
    const el = document.createElement('p');
    el.className = 'log-line' + (kind ? ' log-' + kind : '');
    if (html) el.innerHTML = html; else el.textContent = text;
    $('#ghLog').appendChild(el);
    el.scrollIntoView({ block: 'nearest' });
  }
  const clearLog = () => { $('#ghLog').innerHTML = ''; };

  function setBusy(on) {
    ['ghTest', 'ghPull', 'ghPublish'].forEach(id => { $('#' + id).disabled = on; });
    $('#ghPublish').classList.toggle('busy', on);
  }

  const paths = cfg => ({
    json: (cfg.dir ? cfg.dir + '/' : '') + 'auftraege.json',
    md: (cfg.dir ? cfg.dir + '/' : '') + 'AUFTRAEGE.md'
  });

  /* ---------- Aktionen ---------- */
  async function test() {
    const cfg = readCfg();
    clearLog();
    validate(cfg);
    persist(cfg);
    log('Verbinde mit GitHub …');
    const r = await api(`/repos/${cfg.repo}`);
    const canPush = !r.permissions || r.permissions.push;
    log(`Verbunden mit ${r.full_name} – ${r.private ? 'privates' : 'ÖFFENTLICHES'} Repository, Standard-Branch „${r.default_branch}“.`, r.private ? 'ok' : 'warn');
    if (!canPush) log('Achtung: Das Token hat keinen Schreibzugriff.', 'bad');
    else log('Schreibzugriff vorhanden.', 'ok');
    if (!r.private) log('Hinweis: Im öffentlichen Repo wäre auftraege.json für alle sichtbar – Kundendaten besser in ein privates Repo.', 'warn');
  }

  async function publish() {
    const cfg = readCfg();
    clearLog();
    validate(cfg);
    persist(cfg);
    if (!store.orders.length) throw new GhError('Es gibt noch keine Aufträge zum Veröffentlichen.');

    log('Prüfe Repository …');
    const repo = await api(`/repos/${cfg.repo}`);
    if (repo.permissions && repo.permissions.push === false) throw new GhError('Das Token hat keinen Schreibzugriff auf dieses Repository.');
    if (!repo.private) {
      const ok = await WF.ui.confirm('Dieses Repository ist öffentlich. Die Datei enthält Kundennamen, Telefonnummern, E-Mail-Adressen und Preise – alle können sie lesen. Wirklich veröffentlichen?',
        { title: 'Öffentliches Repository', ok: 'Trotzdem veröffentlichen', danger: true });
      if (!ok) { log('Abgebrochen – nichts wurde übertragen.', 'warn'); return; }
    }

    const p = paths(cfg);
    const existing = await getFile(cfg, p.json);
    const prev = store.getPublished();
    const known = prev && prev.repo === cfg.repo && prev.shas ? prev.shas[p.json] : '';
    const payload = store.exportPayload();

    if (existing) {
      if (existing.sha === known && store.snapshotHash() === prev.hash) {
        log('Alles bereits aktuell – es gibt nichts Neues zu veröffentlichen.', 'ok');
        return;
      }
      if (existing.sha !== known) {
        let same = false;
        try { same = store.payloadHash(JSON.parse(await readFileText(cfg, existing))) === store.snapshotHash(); } catch (e) { /* ignorieren */ }
        if (!same) {
          const ok = await WF.ui.confirm(known
            ? 'Auf GitHub liegen Änderungen, die du lokal noch nicht hast (z. B. von einem anderen Gerät). Mit „Veröffentlichen“ gewinnt dein lokaler Stand. Tipp: erst „Von GitHub laden“, dann veröffentlichen.'
            : 'Auf GitHub liegt bereits eine auftraege.json, die diese Browser-Daten nicht kennen. Mit „Veröffentlichen“ wird sie durch deinen lokalen Stand ersetzt. Tipp: erst „Von GitHub laden“.',
          { title: 'Datei auf GitHub überschreiben?', ok: 'Überschreiben', danger: true });
          if (!ok) { log('Abgebrochen – nichts wurde übertragen. Nutze „Von GitHub laden“, um die Daten zusammenzuführen.', 'warn'); return; }
        }
      }
    }

    const n = payload.orders.length;
    const message = `Aufträge aktualisiert (${n} ${n === 1 ? 'Auftrag' : 'Aufträge'})`;
    log(`Schreibe ${p.json} …`);
    const res = await putFile(cfg, p.json, JSON.stringify(payload, null, 2) + '\n', message, existing && existing.sha);
    const shas = { [p.json]: res.content.sha };
    const commitUrl = res.commit && res.commit.html_url ? res.commit.html_url : '';

    if (cfg.markdown) {
      log(`Schreibe ${p.md} …`);
      const mdExisting = await getFile(cfg, p.md);
      const mdRes = await putFile(cfg, p.md, buildMarkdown(payload.orders), message, mdExisting && mdExisting.sha);
      shas[p.md] = mdRes.content.sha;
    }

    store.setPublished({ repo: cfg.repo, at: new Date().toISOString(), hash: store.payloadHash(payload), shas, commitUrl });
    const link = commitUrl ? ` <a href="${esc(commitUrl)}" target="_blank" rel="noopener noreferrer">Commit ansehen ↗</a>` : '';
    log('', 'ok', `Veröffentlicht: ${n} ${n === 1 ? 'Auftrag' : 'Aufträge'} in <strong>${esc(cfg.repo)}</strong>.${link}`);
    toast('Auf GitHub veröffentlicht.', 'ok');
  }

  async function pull() {
    const cfg = readCfg();
    clearLog();
    validate(cfg);
    persist(cfg);
    const p = paths(cfg);
    log('Lade von GitHub …');
    const file = await getFile(cfg, p.json);
    if (!file) throw new GhError(`In ${cfg.repo} liegt noch keine ${p.json}. Veröffentliche zuerst einmal.`);
    let payload;
    try { payload = JSON.parse(await readFileText(cfg, file)); } catch (e) { throw new GhError('Die Datei auf GitHub ist kein gültiges JSON.'); }
    if (!payload || !Array.isArray(payload.orders)) throw new GhError('Die Datei sieht nicht nach Weißer-Fleck-Daten aus.');

    const r = store.mergePayload(payload);
    const prev = store.getPublished();
    const shas = Object.assign({}, prev && prev.repo === cfg.repo ? prev.shas : {}, { [p.json]: file.sha });
    const synced = store.snapshotHash() === store.payloadHash(payload);
    store.setPublished({
      repo: cfg.repo,
      at: synced ? new Date().toISOString() : (prev && prev.at) || new Date().toISOString(),
      hash: synced ? store.snapshotHash() : (prev && prev.hash) || '',
      shas,
      commitUrl: (prev && prev.commitUrl) || ''
    });
    const parts = [];
    if (r.ordersAdded) parts.push(`${r.ordersAdded} neue${r.ordersAdded === 1 ? 'r' : ''} Auftrag${r.ordersAdded === 1 ? '' : 'e'}`);
    if (r.ordersUpdated) parts.push(`${r.ordersUpdated} aktualisiert`);
    if (r.leadsAdded + r.leadsUpdated) parts.push(`${r.leadsAdded + r.leadsUpdated} Fundstellen-Markierungen`);
    log(parts.length ? 'Zusammengeführt: ' + parts.join(', ') + '.' : 'Schon auf dem neuesten Stand – nichts zu übernehmen.', 'ok');
    toast(parts.length ? 'Von GitHub geladen.' : 'Bereits aktuell.', 'ok');
  }

  /* Fehler einheitlich im Log anzeigen */
  function guarded(fn) {
    return async function (e) {
      if (e && e.preventDefault) e.preventDefault();
      setBusy(true);
      try { await fn(); } catch (err) {
        log(err && err.message ? err.message : String(err), 'bad');
        if (!(err instanceof GhError)) console.error(err);
      } finally { setBusy(false); }
    };
  }

  /* ---------- Status-Badge in der Kopfzeile ---------- */
  function refreshBadge() {
    const cfg = store.getGh(), token = store.getToken(), pub = store.getPublished();
    let st = 'off', text = 'GitHub', title = 'Noch nicht eingerichtet – hier klicken';
    if (cfg.repo && !token) { st = 'off'; text = 'Token fehlt'; title = 'Repository ist eingetragen, das Token fehlt in dieser Sitzung'; }
    else if (cfg.repo && token) {
      const inSync = pub && pub.repo === cfg.repo && pub.hash === store.snapshotHash();
      if (inSync) { st = 'ok'; text = 'Veröffentlicht'; title = 'Zuletzt veröffentlicht: ' + fmtDateTime(pub.at); }
      else if (!store.orders.length && !(pub && pub.repo === cfg.repo)) { st = 'idle'; text = 'Bereit'; title = 'Verbunden mit ' + cfg.repo; }
      else { st = 'dirty'; text = 'Änderungen offen'; title = 'Es gibt Änderungen, die noch nicht auf GitHub liegen'; }
    }
    $('#ghBtn').dataset.state = st;
    $('#ghBtn').title = title;
    $('#ghLabel').textContent = text;
    $('#publishQuick').dataset.state = st;
  }

  /* ---------- Dialog ---------- */
  function open() {
    const cfg = store.getGh(), f = $('#ghForm').elements;
    f.repo.value = cfg.repo;
    f.branch.value = cfg.branch;
    f.dir.value = cfg.dir;
    f.token.value = store.getToken();
    f.remember.checked = cfg.remember;
    f.markdown.checked = cfg.markdown;
    clearLog();
    const pub = store.getPublished();
    if (pub && pub.repo === cfg.repo) {
      const link = pub.commitUrl ? ` · <a href="${esc(pub.commitUrl)}" target="_blank" rel="noopener noreferrer">letzter Commit ↗</a>` : '';
      log('', '', `Zuletzt veröffentlicht: ${esc(fmtDateTime(pub.at))}${link}`);
    }
    WF.ui.openDialog($('#ghDlg'));
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(store.exportPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'weisser-fleck-' + WF.ui.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Sicherung heruntergeladen.', 'ok');
  }

  async function importFile(file) {
    if (!file) return;
    clearLog();
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || !Array.isArray(payload.orders)) throw new Error('Die Datei sieht nicht nach Weißer-Fleck-Daten aus.');
      const r = store.mergePayload(payload);
      log(`Eingelesen: ${r.ordersAdded} neue, ${r.ordersUpdated} aktualisierte Aufträge.`, 'ok');
    } catch (e) {
      log(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : e.message, 'bad');
    }
  }

  function init() {
    $('#ghBtn').addEventListener('click', open);
    $('#ghForm').addEventListener('submit', guarded(publish));
    $('#ghTest').addEventListener('click', guarded(test));
    $('#ghPull').addEventListener('click', guarded(pull));
    $('#exportBtn').addEventListener('click', exportFile);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', e => { importFile(e.target.files[0]); e.target.value = ''; });
    store.on('orders', refreshBadge);
    store.on('leads', refreshBadge);
    store.on('gh', refreshBadge);
    refreshBadge();
  }

  WF.github = { init, open, buildMarkdown, refreshBadge, _api: api };
})();
