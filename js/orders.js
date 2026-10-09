/* Weißer Fleck – Aufträge: Board, Liste, Dialog */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});
  const { $, $$, esc, fmtEUR, fmtDate, fmtDateTime, todayISO, toast } = WF.ui;
  const store = WF.store;

  const FLOW = ['anfrage', 'angebot', 'beauftragt', 'arbeit', 'abnahme', 'fertig'];
  const prefs = store.getPrefs(WF.KEY.ordersPrefs, { view: 'board', showCancelled: false });
  const savePrefs = () => store.setPrefs(WF.KEY.ordersPrefs, prefs);

  let query = '';
  let editingId = null;
  let draft = null; // Vorbelegung für neue Aufträge (inkl. Ort & leadId)

  /* ---------- Daten ---------- */
  function visibleOrders() {
    const q = query.trim().toLowerCase();
    return store.orders.filter(o => {
      if (o.status === 'abgesagt' && !prefs.showCancelled) return false;
      if (!q) return true;
      return [o.company, o.contact, o.notes, o.service, o.address].join(' ').toLowerCase().includes(q);
    });
  }
  const byDeadline = (a, b) =>
    (a.deadline || '9999') < (b.deadline || '9999') ? -1 :
    (a.deadline || '9999') > (b.deadline || '9999') ? 1 :
    (a.createdAt < b.createdAt ? -1 : 1);

  function nextStep(o) {
    if (o.status === 'abgesagt') return { act: 'o-reopen', label: 'Wieder öffnen', to: 'anfrage' };
    if (o.status === 'fertig') return o.paid ? null : { act: 'o-paid', label: 'Als bezahlt markieren' };
    const to = FLOW[FLOW.indexOf(o.status) + 1];
    return { act: 'o-next', label: WF.statusOf(to).label, to };
  }

  function dueInfo(o) {
    if (!o.deadline) return null;
    if (o.status === 'fertig' || o.status === 'abgesagt') return { text: fmtDate(o.deadline), cls: '' };
    const today = todayISO();
    if (o.deadline < today) return { text: 'überfällig seit ' + fmtDate(o.deadline), cls: 'overdue' };
    const days = Math.round((new Date(o.deadline + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
    if (days <= 3) return { text: days === 0 ? 'heute fällig' : days === 1 ? 'morgen fällig' : 'in ' + days + ' Tagen', cls: 'soon' };
    return { text: 'bis ' + fmtDate(o.deadline), cls: '' };
  }

  /* ---------- Rendering ---------- */
  function renderKpis() {
    const all = store.orders;
    const sum = list => list.reduce((s, o) => s + o.price, 0);
    const pick = fn => all.filter(fn);
    const potential = pick(o => o.status === 'anfrage' || o.status === 'angebot');
    const running = pick(o => ['beauftragt', 'arbeit', 'abnahme'].includes(o.status));
    const open = pick(o => o.status === 'fertig' && !o.paid);
    const paid = pick(o => o.status === 'fertig' && o.paid);
    const k = (label, list, tone) =>
      `<div class="kpi kpi-${tone}"><dt>${label}</dt><dd>${fmtEUR(sum(list))}</dd><small>${list.length} ${list.length === 1 ? 'Auftrag' : 'Aufträge'}</small></div>`;
    $('#kpis').innerHTML =
      k('Potenzial', potential, 'stone') + k('Laufende Projekte', running, 'blue') +
      k('Offene Rechnungen', open, 'ochre') + k('Eingenommen', paid, 'green');
  }

  function cardHtml(o) {
    const due = dueInfo(o);
    const step = nextStep(o);
    return `<article class="card${o.status === 'abgesagt' ? ' cancelled' : ''}" draggable="true" data-id="${esc(o.id)}" tabindex="0" role="button" aria-label="Auftrag bearbeiten: ${esc(o.company)}">
      <div class="card-top"><h3>${esc(o.company)}</h3>${o.price ? `<span class="price">${esc(fmtEUR(o.price))}</span>` : ''}</div>
      <div class="card-meta">
        ${o.service ? `<span class="tag">${esc(o.service)}</span>` : ''}
        ${due ? `<span class="due ${due.cls}">${esc(due.text)}</span>` : ''}
        ${o.status === 'fertig' && o.paid ? '<span class="tag tag-ok">Bezahlt</span>' : ''}
      </div>
      ${o.address ? `<p class="card-loc"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg>${esc(o.address)}</p>` : ''}
      ${step ? `<div class="card-actions"><button type="button" class="mini" data-act="${step.act}" data-id="${esc(o.id)}">${step.act === 'o-next' ? '<svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>' : ''}${esc(step.label)}</button></div>` : ''}
    </article>`;
  }

  function renderBoard(orders) {
    const cols = WF.STATUSES.filter(s => s.key !== 'abgesagt' || prefs.showCancelled);
    return `<div class="board" role="list">` + cols.map(s => {
      const list = orders.filter(o => o.status === s.key).sort(byDeadline);
      const total = list.reduce((n, o) => n + o.price, 0);
      return `<section class="col" role="listitem" data-status="${s.key}" aria-label="${esc(s.label)}">
        <header class="col-head" style="--c:${s.color}">
          <h2><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</h2>
          <span class="col-count">${list.length}</span>
          <span class="col-sum">${total ? esc(fmtEUR(total)) : ''}</span>
        </header>
        <div class="col-body">${list.map(cardHtml).join('') || '<p class="col-empty">Hier ablegen</p>'}</div>
        <button type="button" class="col-add" data-act="o-add" data-status="${s.key}"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Auftrag</button>
      </section>`;
    }).join('') + `</div>`;
  }

  function renderTable(orders) {
    const rank = k => WF.STATUS_KEYS.indexOf(k);
    const rows = orders.slice().sort((a, b) => rank(a.status) - rank(b.status) || byDeadline(a, b));
    if (!rows.length) return `<p class="list-empty">Keine Aufträge zu diesem Filter.</p>`;
    return `<div class="table-wrap"><table class="otable">
      <thead><tr><th scope="col">Firma</th><th scope="col">Leistung</th><th scope="col">Status</th><th scope="col" class="r">Preis</th><th scope="col">Deadline</th><th scope="col"><span class="sr-only">Aktionen</span></th></tr></thead>
      <tbody>${rows.map(o => {
        const due = dueInfo(o);
        return `<tr data-id="${esc(o.id)}" tabindex="0">
          <th scope="row"><strong>${esc(o.company)}</strong>${o.contact ? `<small>${esc(o.contact)}</small>` : ''}</th>
          <td>${esc(o.service)}</td>
          <td><label class="sr-only" for="st-${esc(o.id)}">Status von ${esc(o.company)}</label>
            <select class="o-status" id="st-${esc(o.id)}" data-id="${esc(o.id)}" style="--c:${WF.statusOf(o.status).color}">
              ${WF.STATUSES.map(s => `<option value="${s.key}"${s.key === o.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}
            </select>${o.status === 'fertig' && o.paid ? ' <span class="tag tag-ok">Bezahlt</span>' : ''}</td>
          <td class="r">${o.price ? esc(fmtEUR(o.price)) : '–'}</td>
          <td>${due ? `<span class="due ${due.cls}">${esc(due.text)}</span>` : '–'}</td>
          <td class="r">${o.lat != null ? `<button type="button" class="mini" data-act="o-map" data-id="${esc(o.id)}" title="Auf der Karte zeigen"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg>Karte</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function renderEmpty() {
    return `<div class="empty">
      <p class="eyebrow">Noch leer</p>
      <h2>Dein erster Auftrag wartet</h2>
      <p>Leg direkt einen Auftrag an – oder such auf der Karte einen Betrieb ohne Website und klick dort auf <strong>Auftrag</strong>. Dann sind Name, Adresse und Position schon eingetragen.</p>
      <div class="empty-actions">
        <button type="button" class="btn primary" data-act="o-add" data-status="anfrage"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg> Auftrag anlegen</button>
        <a class="btn" href="#karte"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg> Zur Karte</a>
      </div>
    </div>`;
  }

  function render() {
    renderKpis();
    const body = $('#ordersBody');
    $$('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === prefs.view)));
    $('#showCancelled').checked = !!prefs.showCancelled;

    const active = store.orders.filter(o => o.status !== 'fertig' && o.status !== 'abgesagt').length;
    const badge = $('#navOrderCount');
    badge.textContent = active;
    badge.hidden = !active;

    if (!store.orders.length) { body.innerHTML = renderEmpty(); return; }
    const list = visibleOrders();
    body.innerHTML = prefs.view === 'list' ? renderTable(list) : renderBoard(list);
  }

  /* ---------- Dialog ---------- */
  function fillSelects() {
    const f = $('#orderForm').elements;
    f.service.innerHTML = WF.SERVICES.map(s => `<option>${esc(s)}</option>`).join('');
    f.status.innerHTML = WF.STATUSES.map(s => `<option value="${s.key}">${esc(s.label)}</option>`).join('');
  }

  function togglePaidRow() {
    const f = $('#orderForm').elements;
    $('#paidRow').hidden = f.status.value !== 'fertig';
  }

  function setLocNote(o) {
    const el = $('#orderLoc');
    const has = o && o.lat != null && o.lng != null;
    el.hidden = !has;
    if (!has) return;
    const saved = o.id && store.getOrder(o.id);
    el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg> ${saved ? 'Mit der Karte verknüpft' : 'Wird mit der Karte verknüpft'} (${o.lat.toFixed(4)}, ${o.lng.toFixed(4)})` +
      (saved ? ` · <button type="button" class="link" id="orderOnMap">Auf Karte zeigen</button>` : '');
  }

  function openDialog(o, isNew) {
    const f = $('#orderForm').elements;
    fillSelects();
    const values = Object.assign({
      company: '', contact: '', phone: '', email: '', address: '', service: WF.SERVICES[0],
      price: '', status: 'anfrage', deadline: '', paid: false, notes: ''
    }, o);
    ['company', 'contact', 'phone', 'email', 'address', 'deadline', 'notes'].forEach(k => { f[k].value = values[k] || ''; });
    if (values.service && !WF.SERVICES.includes(values.service)) {
      f.service.insertAdjacentHTML('beforeend', `<option>${esc(values.service)}</option>`);
    }
    f.service.value = values.service || WF.SERVICES[0];
    f.price.value = values.price ? values.price : '';
    f.status.value = values.status;
    f.paid.checked = !!values.paid;
    togglePaidRow();
    $('#companyErr').hidden = true;
    f.company.removeAttribute('aria-invalid');

    $('#orderDlgTitle').textContent = isNew ? 'Neuer Auftrag' : 'Auftrag bearbeiten';
    $('#orderDelete').hidden = isNew;
    setLocNote(values);

    const stored = !isNew && store.getOrder(editingId);
    $('#orderHistoryWrap').hidden = !(stored && stored.history.length);
    $('#orderHistory').innerHTML = stored
      ? stored.history.slice().reverse().map(h => {
          const s = WF.statusOf(h.status);
          return `<li><span class="dot" style="background:${s.color}"></span>${esc(s.label)} <time datetime="${esc(h.at)}">${esc(fmtDateTime(h.at))}</time></li>`;
        }).join('')
      : '';

    WF.ui.openDialog($('#orderDlg'));
    setTimeout(() => f.company.focus(), 30);
  }

  function openNew(prefill) {
    editingId = null;
    draft = Object.assign({}, prefill || {});
    openDialog(draft, true);
  }

  function openEdit(id) {
    const o = store.getOrder(id);
    if (!o) return;
    editingId = id;
    draft = null;
    openDialog(o, false);
  }

  function readForm() {
    const f = $('#orderForm').elements;
    return {
      company: f.company.value.trim(), contact: f.contact.value, phone: f.phone.value, email: f.email.value,
      address: f.address.value, service: f.service.value, price: f.price.value, status: f.status.value,
      deadline: f.deadline.value, paid: f.paid.checked, notes: f.notes.value
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const data = readForm();
    const f = $('#orderForm').elements;
    if (!data.company) {
      $('#companyErr').hidden = false;
      f.company.setAttribute('aria-invalid', 'true');
      f.company.focus();
      return;
    }
    if (editingId) {
      store.updateOrder(editingId, data);
      toast('Auftrag gespeichert.', 'ok');
    } else {
      const extra = draft ? { lat: draft.lat, lng: draft.lng, leadId: draft.leadId } : {};
      store.addOrder(Object.assign({}, data, extra));
      toast('Auftrag angelegt.', 'ok');
    }
    WF.ui.closeDialog($('#orderDlg'));
  }

  async function onDelete() {
    const o = store.getOrder(editingId);
    if (!o) return;
    const ok = await WF.ui.confirm(`„${o.company}“ endgültig löschen? Das lässt sich nur über einen früheren GitHub-Stand zurückholen.`, { title: 'Auftrag löschen', ok: 'Löschen', danger: true });
    if (!ok) return;
    store.removeOrder(editingId);
    WF.ui.closeDialog($('#orderDlg'));
    toast('Auftrag gelöscht.');
  }

  /* ---------- Aktionen ---------- */
  function move(id, status) {
    const o = store.getOrder(id);
    if (!o || o.status === status) return;
    store.updateOrder(id, { status });
    if (status === 'fertig') toast('Abgeschlossen – Rechnung nicht vergessen.', 'ok');
  }

  function onBodyClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const id = act.dataset.id;
      if (act.dataset.act === 'o-next') { const o = store.getOrder(id); const s = o && nextStep(o); if (s && s.to) move(id, s.to); }
      else if (act.dataset.act === 'o-reopen') move(id, 'anfrage');
      else if (act.dataset.act === 'o-paid') { store.updateOrder(id, { paid: true }); toast('Als bezahlt markiert.', 'ok'); }
      else if (act.dataset.act === 'o-add') openNew({ status: act.dataset.status });
      else if (act.dataset.act === 'o-map') WF.map.focusOrder(id);
      return;
    }
    if (e.target.closest('select, a, label')) return;
    const item = e.target.closest('[data-id]');
    if (item) openEdit(item.dataset.id);
  }

  function onBodyKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.matches('.card, tr[data-id]')) return;
    e.preventDefault();
    openEdit(e.target.dataset.id);
  }

  function initDnD() {
    const body = $('#ordersBody');
    body.addEventListener('dragstart', e => {
      const c = e.target.closest && e.target.closest('.card');
      if (!c) return;
      e.dataTransfer.setData('text/plain', c.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => c.classList.add('dragging'));
    });
    body.addEventListener('dragend', () => {
      $$('.card.dragging, .col.over', body).forEach(el => el.classList.remove('dragging', 'over'));
    });
    body.addEventListener('dragover', e => {
      const col = e.target.closest && e.target.closest('.col');
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('over');
    });
    body.addEventListener('dragleave', e => {
      const col = e.target.closest && e.target.closest('.col');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('over');
    });
    body.addEventListener('drop', e => {
      const col = e.target.closest && e.target.closest('.col');
      if (!col) return;
      e.preventDefault();
      col.classList.remove('over');
      move(e.dataTransfer.getData('text/plain'), col.dataset.status);
    });
  }

  function init() {
    const body = $('#ordersBody');
    body.addEventListener('click', onBodyClick);
    body.addEventListener('keydown', onBodyKey);
    body.addEventListener('change', e => {
      const sel = e.target.closest('.o-status');
      if (sel) move(sel.dataset.id, sel.value);
    });
    initDnD();

    $('#newOrderBtn').addEventListener('click', () => openNew({}));
    $('#publishQuick').addEventListener('click', () => WF.github.open());
    $('#orderSearch').addEventListener('input', e => { query = e.target.value; render(); });
    $('#showCancelled').addEventListener('change', e => { prefs.showCancelled = e.target.checked; savePrefs(); render(); });
    $('#viewSeg').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      prefs.view = b.dataset.view; savePrefs(); render();
    });

    const form = $('#orderForm');
    form.addEventListener('submit', onSubmit);
    form.elements.status.addEventListener('change', togglePaidRow);
    $('#orderDelete').addEventListener('click', onDelete);
    $('#orderLoc').addEventListener('click', e => {
      if (e.target.id === 'orderOnMap') {
        const id = editingId;
        WF.ui.closeDialog($('#orderDlg'));
        WF.map.focusOrder(id);
      }
    });

    store.on('orders', render);
    render();
  }

  WF.orders = { init, openNew, openEdit, render };
})();
