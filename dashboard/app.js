// Token Radar v2 — renders window.RADAR (written by main.ts) with no fetch and no network.
//
// The board's rows are built once and then only moved or hidden: sorting reorders the
// existing <tr> elements (focus and state inside rows survive), filtering hides rows
// with the hidden attribute. Column headers are real <button>s inside <th scope="col">,
// the sorted column carries aria-sort on its <th>, and one role="status" element
// announces each sort and filter change. The detail view is a native <dialog>.

(function () {
  'use strict';
  const R = window.RADAR;
  if (!R) return;

  const $ = (id) => document.getElementById(id);
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  /** Escape text the snapshot supplied before it enters the page. */
  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** $1.2B / $45.6M / $12,300, for table cells. */
  function compact(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  /** Full dollars with commas, for the detail view. */
  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }

  /* ---- hero stats ---- */

  $('as-of').textContent = R.as_of;
  $('as-of-2').textContent = R.as_of;
  $('model-version').textContent = R.model_version;
  $('cv-comps').textContent = R.validation.comp_count;
  const winner = R.validation.winner;
  const loglog = 'log10(market cap) = ' + R.fit.alpha + ' + ' + R.fit.beta + ' × log10(TVL), fitted on ' +
    R.validation.comp_count + ' traded tokens';
  const formulas = {
    'pooled log-log': 'implied value = 10^(' + R.fit.alpha + ' + ' + R.fit.beta + ' × log10(TVL)) × growth × maturity × breadth',
    'log-log + category offset': 'implied value = 10^(' + R.fit.alpha + ' + ' + R.fit.beta + ' × log10(TVL) + category offset) × growth × maturity × breadth',
    'log-log mean of pooled & offset': 'implied value = √(pooled line × offset line) × growth × maturity × breadth',
    'market-median ratio': 'implied value = TVL × market-median mcap/TVL × growth × maturity × breadth',
    'category-median ratio': 'implied value = TVL × category-median mcap/TVL (shrunk to market) × growth × maturity × breadth',
  };
  $('formula').textContent = formulas[winner] || formulas['pooled log-log'];
  $('fit-line').textContent =
    'The blind test\'s winner is "' + winner + '": ' +
    (winner.indexOf('log-log') >= 0 ? loglog : 'median market-cap/TVL ratios over ' + R.validation.comp_count + ' traded tokens') +
    '. It priced held-out tokens at a median error of ×' + R.validation.winner_median_error_x +
    ' (' + R.validation.winner_within_2x_pct + '% within 2×).';

  const v = R.verdict_counts;
  $('stats').innerHTML =
    '<div><dt>Board rows</dt><dd>' + R.board_size + '</dd></div>' +
    '<div><dt>Watchlist covered</dt><dd>' + R.watchlist_size + ' / ' + R.watchlist_size + '</dd></div>' +
    '<div><dt>Early finds</dt><dd>' + R.early_size + ' <small>below the $50M floor</small></dd></div>' +
    '<div><dt>Blind-test error</dt><dd>×' + R.validation.winner_median_error_x + ' <small>median, held out</small></dd></div>' +
    '<div><dt>Farms that pay</dt><dd>' + v.FARM + ' <small>FARM · ' + v.THIN + ' THIN · ' + v.SKIP + ' SKIP</small></dd></div>';

  /* ---- blind-test table ---- */

  $('cv-table').querySelector('tbody').innerHTML = R.validation.candidates.map((c) => {
    const winner = c.name === R.validation.winner;
    return '<tr' + (winner ? ' class="winner"' : '') + '><td>' + esc(c.name) + '</td><td class="num">×' + c.median_error_x.toFixed(2) +
      '</td><td class="num">' + c.within_2x_pct.toFixed(1) + '%</td><td>' + (winner ? '★ Used for the board' : '—') + '</td></tr>';
  }).join('');

  /* ---- category offsets ---- */

  $('comp-count').textContent = R.comps.length;
  $('comps-table').querySelector('tbody').innerHTML = R.comps.map((c) =>
    '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.sample + '</td><td class="num">' +
    (c.offset_dex > 0 ? '+' : '') + c.offset_dex.toFixed(3) + '</td><td class="num">' + c.median_mcap_tvl.toFixed(3) + '</td></tr>',
  ).join('');

  /* ---- live comps ---- */

  $('live').querySelector('tbody').innerHTML = R.live.map((p) =>
    '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || '—') + '</td><td class="num">' + compact(p.tvl_usd) +
    '</td><td class="num">' + compact(p.mcap_usd) + '</td><td class="num">' + p.mcap_tvl.toFixed(3) + '</td></tr>',
  ).join('');

  /* ---- the board: rows built once, then moved or hidden ---- */

  const tbody = $('board').querySelector('tbody');
  const bySlug = new Map(R.rows.map((r) => [r.slug, r]));

  function rowHtml(r) {
    const change = r.change_7d === null ? '—' : pct(r.change_7d);
    const changeClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    const net = r.farm.net_usd;
    const netClass = net >= 25 ? 'pos' : net >= 0 ? '' : 'neg';
    return '<tr data-slug="' + esc(r.slug) + '">' +
      '<td class="num" data-value="' + r.rank + '" data-label="#">' + r.rank + (r.on_watchlist ? ' <span class="watch" title="On the $50M watchlist">W</span>' : '') + '</td>' +
      '<td data-value="' + esc(r.name.toLowerCase()) + '" data-label="Protocol"><button type="button" class="name-btn" data-detail="' + esc(r.slug) + '">' + esc(r.name) + '</button></td>' +
      '<td data-value="' + esc((r.category || '').toLowerCase()) + '" data-label="Category">' + esc(r.category || '—') + '</td>' +
      '<td class="num" data-value="' + r.tvl_usd + '" data-label="TVL">' + compact(r.tvl_usd) + '</td>' +
      '<td class="num ' + changeClass + '" data-value="' + (r.change_7d === null ? -1e9 : r.change_7d) + '" data-label="7d">' + change + '</td>' +
      '<td class="num" data-value="' + r.implied_value_usd + '" data-label="Implied value"><strong>' + compact(r.implied_value_usd) + '</strong></td>' +
      '<td class="num" data-label="Rank range">' + r.rank_lo + '–' + r.rank_hi + '</td>' +
      '<td class="num" data-value="' + net + '" data-label="Net / verdict"><span class="' + netClass + '">' +
      (net < 0 ? '−' : '') + money(Math.abs(net)) + '</span> <span class="badge ' + r.farm.verdict + '">' + r.farm.verdict + '</span></td>' +
      '</tr>';
  }

  tbody.innerHTML = R.rows.map(rowHtml).join('');

  const table = $('board');
  const status = $('status');
  const empty = $('empty');
  const rowCount = $('row-count');
  const sortSelect = $('sort');

  const KEY_INDEX = { rank: 0, name: 1, category: 2, tvl: 3, growth: 4, implied: 5, net: 7 };

  /** Reorder the existing rows by a column key and direction; never rebuilds the tbody. */
  function sortBy(key, direction) {
    const index = KEY_INDEX[key];
    const type = key === 'name' || key === 'category' ? 'text' : 'number';
    const factor = direction === 'ascending' ? 1 : -1;
    const rows = [...tbody.rows];
    const value = (row) => row.cells[index].dataset.value;
    rows.sort((a, b) => factor * (type === 'number' ? Number(value(a)) - Number(value(b)) : collator.compare(value(a), value(b))));
    for (const row of rows) tbody.appendChild(row);
    for (const th of table.tHead.rows[0].cells) th.removeAttribute('aria-sort');
    const th = table.tHead.rows[0].cells[index];
    if (th) th.setAttribute('aria-sort', direction);
    status.textContent = 'Sorted by ' + key + ', ' + direction + ', ' + rows.length + ' rows';
  }

  table.querySelectorAll('thead th button').forEach((button) => {
    button.addEventListener('click', () => {
      const th = button.closest('th');
      const key = th.dataset.key;
      const next = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
      sortBy(key, next);
      if (key === 'implied' || key === 'net' || key === 'tvl' || key === 'growth') sortSelect.value = key;
    });
  });

  sortSelect.addEventListener('change', () => {
    const key = sortSelect.value;
    if (key === 'name') { sortBy('name', 'ascending'); return; }
    if (key === 'age') {
      const rows = [...tbody.rows];
      rows.sort((a, b) => (bySlug.get(b.dataset.slug).age_days ?? -1) - (bySlug.get(a.dataset.slug).age_days ?? -1));
      for (const row of rows) tbody.appendChild(row);
      for (const th of table.tHead.rows[0].cells) th.removeAttribute('aria-sort');
      status.textContent = 'Sorted by age, descending, ' + rows.length + ' rows';
      return;
    }
    sortBy(key, 'descending');
  });

  /* ---- filters: hide rows, never rebuild them ---- */

  const qInput = $('q');
  const categorySelect = $('category');
  const chainSelect = $('chain');
  const verdictSelect = $('verdict');
  const watchlistOnly = $('watchlist-only');

  const categories = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort(collator.compare);
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort(collator.compare);
  categorySelect.innerHTML = '<option value="">All categories</option>' + categories.map((c) => '<option>' + esc(c) + '</option>').join('');
  chainSelect.innerHTML = '<option value="">All chains</option>' + chains.map((c) => '<option>' + esc(c) + '</option>').join('');

  function applyFilters() {
    const q = qInput.value.trim().toLowerCase();
    const cat = categorySelect.value;
    const chain = chainSelect.value;
    const verdict = verdictSelect.value;
    const wl = watchlistOnly.checked;
    let shown = 0;
    for (const row of tbody.rows) {
      const r = bySlug.get(row.dataset.slug);
      const hit =
        (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
        (!cat || r.category === cat) &&
        (!chain || r.chains.includes(chain)) &&
        (!verdict || r.farm.verdict === verdict) &&
        (!wl || r.on_watchlist);
      row.hidden = !hit;
      if (hit) shown++;
    }
    empty.hidden = shown > 0;
    rowCount.textContent = '(' + shown + ' of ' + R.rows.length + ' shown)';
    status.textContent = shown + ' of ' + R.rows.length + ' protocols match the filters';
  }

  for (const el of [qInput, categorySelect, chainSelect, verdictSelect, watchlistOnly]) {
    el.addEventListener(el === qInput ? 'input' : 'change', applyFilters);
  }

  $('reset').addEventListener('click', () => {
    qInput.value = '';
    categorySelect.value = '';
    chainSelect.value = '';
    verdictSelect.value = '';
    watchlistOnly.checked = false;
    sortSelect.value = 'implied';
    sortBy('implied', 'descending');
    applyFilters();
  });

  /* ---- detail view: a native dialog, deep-linkable with ?slug= ---- */

  const dialog = $('detail');

  function openDetail(slug) {
    const r = bySlug.get(slug);
    if (!r) return;
    $('detail-title').textContent = '#' + r.rank + ' ' + r.name + (r.on_watchlist ? ' — on the $50M watchlist' : '');
    $('detail-sub').textContent =
      (r.category || 'Uncategorized') + ' · ' + (r.chains.join(', ') || 'no chain listed') +
      ' · TVL ' + compact(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) + ' · age ' + ageText(r.age_days) +
      ' · rank range ' + r.rank_lo + '–' + r.rank_hi + ' over 200 bootstrap refits';
    const m = r.model;
    $('detail-model').innerHTML =
      '<dt>Pricer (blind-test winner)</dt><dd>' + esc(R.validation.winner) + '</dd>' +
      '<dt>Fitted base</dt><dd>' + money(m.base_usd) + '</dd>' +
      '<dt>Pooled line</dt><dd>' + money(m.pooled_usd) + '</dd>' +
      '<dt>Line + category offset</dt><dd>' + money(m.offset_usd) + ' <small>(' + (m.category_offset_dex >= 0 ? '+' : '') + m.category_offset_dex.toFixed(3) + ' dex, ' + m.comp_sample + ' comps)</small></dd>' +
      '<dt>Growth ×</dt><dd>' + m.growth_multiplier.toFixed(3) + '</dd>' +
      '<dt>Maturity ×</dt><dd>' + m.maturity_multiplier.toFixed(3) + '</dd>' +
      '<dt>Breadth ×</dt><dd>' + m.breadth_multiplier.toFixed(3) + '</dd>' +
      '<dt>Implied value</dt><dd><strong>' + money(r.implied_value_usd) + '</strong></dd>';
    const f = r.farm;
    $('detail-farm').innerHTML =
      '<dt>Deposit</dt><dd>' + money(f.deposit_usd) + '</dd>' +
      '<dt>Expected claim</dt><dd>' + money(f.expected_claim_usd) + ' <small>(10% of implied value, over farmer deposits at 5% of TVL)</small></dd>' +
      '<dt>Gas</dt><dd>' + money(f.gas_usd) + '</dd>' +
      '<dt>Opportunity cost</dt><dd>' + money(f.opportunity_usd) + ' <small>(5% a year over ' + f.hold_days + ' days)</small></dd>' +
      '<dt>Net</dt><dd><strong>' + (f.net_usd < 0 ? '−' : '') + money(Math.abs(f.net_usd)) + '</strong> <span class="badge ' + f.verdict + '">' + f.verdict + '</span></dd>' +
      '<dt>Hold</dt><dd>' + f.hold_days + ' days</dd>';
    $('detail-steps').innerHTML = r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('');
    if (!dialog.open) dialog.showModal();
  }

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail]');
    if (button) openDetail(button.dataset.detail);
  });

  dialog.addEventListener('close', () => { dialog.returnValue = ''; });

  /* ---- URL state, so a filtered view and a detail view are linkable ---- */

  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) qInput.value = params.get('q');
  if (params.get('category')) categorySelect.value = params.get('category');
  if (params.get('chain')) chainSelect.value = params.get('chain');
  if (params.get('verdict')) verdictSelect.value = params.get('verdict');
  if (params.get('watchlist') === '1') watchlistOnly.checked = true;
  if (params.get('sort') && ['implied', 'net', 'tvl', 'growth', 'age', 'name'].includes(params.get('sort'))) {
    sortSelect.value = params.get('sort');
    sortSelect.dispatchEvent(new Event('change'));
  }
  applyFilters();
  if (params.get('slug')) openDetail(params.get('slug'));
})();
