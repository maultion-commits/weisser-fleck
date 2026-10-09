/* Weißer Fleck – Start & Routing */
(function () {
  'use strict';
  const WF = (window.WF = window.WF || {});
  const { $, $$ } = WF.ui;

  const VIEWS = {
    karte: { sel: '#view-karte', title: 'Karte' },
    auftraege: { sel: '#view-auftraege', title: 'Aufträge' }
  };

  function route() {
    const name = (location.hash || '#karte').slice(1);
    const key = VIEWS[name] ? name : 'karte';
    Object.keys(VIEWS).forEach(k => { $(VIEWS[k].sel).hidden = k !== key; });
    $$('[data-nav]').forEach(a => {
      if (a.dataset.nav === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = VIEWS[key].title + ' – Weißer Fleck';
    if (key === 'karte') { WF.map.init(); WF.map.onShow(); }
    else WF.orders.render();
  }

  function start() {
    WF.orders.init();
    WF.github.init();
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
