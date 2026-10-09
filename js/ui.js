/* Weißer Fleck – kleine UI-Helfer */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC_MAP[c]);

  const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtEUR = n => eur.format(Number(n) || 0);
  const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDate = v => {
    if (!v) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T12:00:00') : new Date(v);
    return isNaN(d) ? '' : dateFmt.format(d);
  };
  const fmtDateTime = v => { const d = new Date(v); return isNaN(d) ? '' : dateTimeFmt.format(d); };

  function todayISO() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- Toasts ---------- */
  function toast(msg, kind) {
    const host = $('#toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.textContent = msg;
    host.appendChild(el);
    const ttl = kind === 'bad' ? 7000 : 3800;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ttl);
  }

  /* ---------- Dialoge ---------- */
  function openDialog(dlg) {
    if (!dlg.open) dlg.showModal();
  }
  function closeDialog(dlg) {
    if (dlg.open) dlg.close();
  }

  document.addEventListener('click', e => {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const dlg = closer.closest('dialog');
      if (dlg) closeDialog(dlg);
      return;
    }
    // Klick auf den Backdrop (Ziel ist das <dialog> selbst)
    if (e.target instanceof HTMLDialogElement && e.target.open) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(e.target);
    }
  });

  /* Bestätigungsdialog, liefert Promise<boolean> */
  function confirmDialog(text, opts) {
    opts = opts || {};
    const dlg = $('#confirmDlg');
    $('#confirmTitle').textContent = opts.title || 'Bist du sicher?';
    $('#confirmText').textContent = text;
    const ok = $('#confirmOk');
    ok.textContent = opts.ok || 'OK';
    ok.classList.toggle('danger-fill', !!opts.danger);
    $('#confirmCancel').textContent = opts.cancel || 'Abbrechen';
    return new Promise(resolve => {
      const done = () => {
        dlg.removeEventListener('close', done);
        resolve(dlg.returnValue === 'ok');
      };
      dlg.returnValue = 'cancel';
      dlg.addEventListener('close', done);
      dlg.showModal();
      ok.focus();
    });
  }

  /* kleine Debounce-Hilfe */
  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
  }

  /* Haversine-Abstand in Metern */
  function distance(aLat, aLng, bLat, bLng) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  WF.ui = { $, $$, esc, fmtEUR, fmtDate, fmtDateTime, todayISO, toast, openDialog, closeDialog, confirm: confirmDialog, debounce, distance };
})();
