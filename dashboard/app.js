/* Token Radar dashboard: renders window.RADAR (written by main.ts) with no network.
   Board, detail view and filters all run from the same rows board.json carries, so the
   page, the screenshots and the board agree. */
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.innerHTML = '<p style="padding:2em">No radar data loaded.</p>'; return; }

  /* ---------- formatting ---------- */
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.floor(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return document.getElementById(id); }

  /* ---------- header ---------- */
  $('as-of').textContent = D.as_of;
  $('as-of-2').textContent = D.as_of;
  $('model-version').textContent = D.model_version;
  $('market-median').textContent = D.market_median_mcap_tvl.toFixed(3) + '× (' + D.market_comp_sample + ' live comps)';
  $('comp-count').textContent = D.comps.length;
  var topValue = D.rows.length ? D.rows[0].implied_value_usd : 0;
  var totalTvl = D.rows.reduce(function (s, r) { return s + r.tvl_usd; }, 0);
  $('stats').innerHTML =
    stat('Board rows', D.board_size) + stat('Watchlist ($50M+)', D.watchlist_size) +
    stat('Early finds', D.early_size) + stat('Top implied value', money(topValue)) +
    stat('Board TVL', money(totalTvl)) + stat('Live comps', D.live_size);
  function stat(label, value) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
  }

  /* ---------- category comps table ---------- */
  $('comps-table').querySelector('tbody').innerHTML = D.comps.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.sample +
      '</td><td class="num">' + c.median_mcap_tvl.toFixed(3) + '×</td><td class="num">' +
      c.multiple_used.toFixed(3) + '×</td></tr>';
  }).join('');

  /* ---------- live comps table ---------- */
  $('live').querySelector('tbody').innerHTML = D.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '<div class="tag">' + esc(p.slug) + '</div></td><td>' +
      esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' +
      money(p.mcap_usd) + '</td><td class="num">' + p.mcap_tvl.toFixed(3) + '×</td></tr>';
  }).join('');

  /* ---------- filters ---------- */
  var state = { q: '', category: '', chain: '', watchlist: false, sort: 'implied', open: null };
  var categories = [];
  var chains = [];
  D.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();
  fillSelect($('category'), categories);
  fillSelect($('chain'), chains);
  function fillSelect(sel, values) {
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
    age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
    name: function (a, b) { return a.name < b.name ? -1 : 1; },
    category: function (a, b) { return (a.category || '') < (b.category || '') ? -1 : 1; },
    comp: function (a, b) { return b.model.comp_multiple - a.model.comp_multiple; }
  };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.watchlist && !r.on_watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(SORTS[state.sort] || SORTS.implied);
    return rows;
  }

  /* ---------- board ---------- */
  var tbody = $('board').querySelector('tbody');
  function render() {
    var rows = filtered();
    $('row-count').textContent = '— ' + rows.length + ' of ' + D.board_size + ' protocols';
    $('empty').hidden = rows.length > 0;
    var html = '';
    rows.forEach(function (r) {
      var g = r.change_7d;
      var gClass = g === null ? '' : (g >= 0 ? 'up' : 'down');
      var open = state.open === r.slug;
      html += '<tr class="row' + (open ? ' open' : '') + '" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' + (r.on_watchlist ? '<span class="badge">W</span>' : '') +
        '<div class="tag">' + esc(r.slug) + '</div></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + gClass + '">' + pct(g) + '</td>' +
        '<td class="num">' + ageLabel(r.age_days) + '</td>' +
        '<td class="num">' + r.model.comp_multiple.toFixed(2) + '×</td>' +
        '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td>' +
        '<td class="farm-cell">' + esc(firstAction(r)) + '</td></tr>';
      if (open) html += detailRow(r);
    });
    tbody.innerHTML = html;
    markSorted();
  }

  /* The farm plan's core action, shortened for the row: the step the farmer starts with. */
  function firstAction(r) {
    var s = r.farm_steps[1] || r.farm_steps[0] || '';
    var cut = s.indexOf(' Cost:');
    if (cut > 0) s = s.slice(0, cut);
    return s.length > 110 ? s.slice(0, 107) + '…' : s;
  }

  function detailRow(r) {
    var m = r.model;
    var steps = r.farm_steps.map(function (s) {
      var cut = s.indexOf(' Cost:');
      var action = cut > 0 ? s.slice(0, cut) : s;
      var meta = cut > 0 ? s.slice(cut + 1) : '';
      return '<li>' + esc(action) + (meta ? '<br><span class="meta">' + esc(meta) + '</span>' : '') + '</li>';
    }).join('');
    return '<tr class="detail"><td colspan="9"><div class="detail-grid"><div>' +
      '<h3>Why ' + money(r.implied_value_usd) + ' — the model, step by step</h3>' +
      '<table class="breakdown"><tbody>' +
      bd('TVL', money(r.tvl_usd)) +
      bd('Category comp (' + (m.comp_source === 'category' ? 'category median' : m.comp_source === 'blended' ? 'category median shrunk to market' : 'market median') + ', n=' + m.comp_sample + ')', m.comp_multiple.toFixed(3) + '×') +
      bd('Growth (7d ' + pct(m.growth_pct) + ')', '×' + m.growth_multiplier.toFixed(3)) +
      bd('Maturity (' + ageLabel(m.age_days) + ' with no token)', '×' + m.maturity_multiplier.toFixed(3)) +
      bd('Breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')', '×' + m.breadth_multiplier.toFixed(3)) +
      bd('<strong>Implied value</strong>', '<strong>' + money(r.implied_value_usd) + '</strong>') +
      '</tbody></table>' +
      '<div class="chips">' + r.chains.map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') +
      '<span class="chip">Listed ' + esc(r.listed_at || 'unknown') + '</span>' +
      '<span class="chip">' + (r.on_watchlist ? 'On the $50M watchlist' : 'Below the watchlist floor') + '</span></div>' +
      '</div><div><h3>Farm plan — before and after a launch</h3>' +
      '<ol class="steps">' + steps + '</ol></div></div></td></tr>';
  }
  function bd(label, value) { return '<tr><td>' + label + '</td><td>' + value + '</td></tr>'; }

  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr.row');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    state.open = state.open === slug ? null : slug;
    render();
    if (state.open) {
      var row = tbody.querySelector('tr[data-slug="' + state.open + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }
  });

  function markSorted() {
    var ths = $('board').querySelectorAll('thead th[data-sort]');
    ths.forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort ||
        (state.sort === 'implied' && th.getAttribute('data-sort') === 'implied'));
    });
  }
  $('board').querySelector('thead').addEventListener('click', function (e) {
    var th = e.target.closest('th[data-sort]');
    if (!th) return;
    state.sort = th.getAttribute('data-sort');
    $('sort').value = ['implied', 'tvl', 'growth', 'age', 'name'].indexOf(state.sort) >= 0 ? state.sort : 'implied';
    if ($('sort').value !== state.sort) state.sort = $('sort').value;
    render();
  });

  /* ---------- controls ---------- */
  $('q').addEventListener('input', function () { state.q = this.value; state.open = null; render(); });
  $('category').addEventListener('change', function () { state.category = this.value; state.open = null; render(); });
  $('chain').addEventListener('change', function () { state.chain = this.value; state.open = null; render(); });
  $('watchlist-only').addEventListener('change', function () { state.watchlist = this.checked; state.open = null; render(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; render(); });
  $('reset').addEventListener('click', function () {
    state.q = ''; state.category = ''; state.chain = ''; state.watchlist = false; state.sort = 'implied'; state.open = null;
    $('q').value = ''; $('category').value = ''; $('chain').value = ''; $('watchlist-only').checked = false; $('sort').value = 'implied';
    render();
  });

  render();
})();
