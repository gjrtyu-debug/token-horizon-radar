/* SPDX-License-Identifier: MIT */
(() => {
  const radar = window.TOKEN_HORIZON_DATA ?? { rows: [], stats: {}, live: [] };
  const protocols = radar.rows;
  const bySlug = new Map(protocols.map(protocol => [protocol.slug, protocol]));
  const get = id => document.getElementById(id);
  const state = { scope: 'all', query: '', chain: '', category: '', order: 'value', page: 0 };
  const pageSize = 40;
  const figures = {
    value: protocol => protocol.implied_value_usd,
    growth: protocol => protocol.change_7d ?? -Infinity,
    confidence: protocol => protocol.confidence,
    tvl: protocol => protocol.tvl_usd,
  };
  const scopeNames = { all: 'all', watch: 'watchlist', early: 'early' };

  const money = (amount, digits = 1) => {
    if (!Number.isFinite(amount)) return '—';
    const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const unit = units.find(([threshold]) => amount >= threshold);
    return unit ? '$' + (amount / unit[0]).toFixed(digits) + unit[1] : '$' + Math.round(amount);
  };

  const change = amount => amount == null ? '—' : (amount >= 0 ? '+' : '') + amount.toFixed(1) + '%';
  const percent = fraction => Math.round(100 * fraction) + '%';
  const multiple = number => number.toFixed(2) + '×';
  const setText = (id, value) => { get(id).textContent = value ?? '—'; };
  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  };

  setText('n-total', protocols.length.toLocaleString('en-US'));
  setText('n-watch', radar.stats.watchlist_covered + '/' + radar.stats.watchlist);
  setText('n-early', radar.stats.early);
  setText('n-comp', radar.stats.live_comp_count);
  const demo = radar.stats.source === 'synthetic demo';
  setText('date', (radar.stats.as_of ?? '—') + (demo ? ' · DEMO' : ''));

  for (const [id, values] of [
    ['chain', protocols.flatMap(protocol => protocol.chains)],
    ['category', protocols.map(protocol => protocol.category)],
  ]) {
    for (const value of [...new Set(values.filter(Boolean))].sort()) {
      get(id).add(new Option(value, value));
    }
  }

  const table = get('rows');
  const navigation = element('div', 'page-controls');
  const previous = element('button', 'export', '‹ Previous');
  const next = element('button', 'export', 'Next ›');
  navigation.setAttribute('role', 'group');
  navigation.setAttribute('aria-label', 'Board pages');
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', 'Previous protocol page');
  next.setAttribute('aria-label', 'Next protocol page');
  navigation.append(previous, next);
  get('shown').after(navigation);
  get('shown').setAttribute('aria-live', 'polite');

  function matchingProtocols() {
    return protocols.filter(protocol => {
      if (state.scope !== 'all' && protocol.origin !== state.scope) return false;
      if (state.category && protocol.category !== state.category) return false;
      if (state.chain && !protocol.chains.includes(state.chain)) return false;
      const searchable = [protocol.name, protocol.slug, protocol.category, ...protocol.chains];
      const words = state.query.split(/\s+/);
      const searchText = searchable.join(' ').toLowerCase();
      return words.every(word => searchText.includes(word));
    }).sort((left, right) => {
      const value = figures[state.order];
      return value(right) - value(left) || left.rank - right.rank;
    });
  }

  function protocolRow(protocol) {
    const row = element('tr', '');
    row.dataset.slug = protocol.slug;
    const identityCell = row.insertCell();
    const identity = element('div', 'proto');
    const rank = element('span', 'rank', String(protocol.rank).padStart(2, '0'));
    const avatar = element('span', 'avatar', protocol.name.slice(0, 2).toUpperCase());
    const name = element('button', 'pname protocol-link', protocol.name);
    name.type = 'button';
    name.setAttribute('aria-label', 'Open details for ' + protocol.name);
    const names = element('div', '');
    names.append(name, element('div', 'slug', protocol.slug));
    identity.append(rank, avatar, names);
    identityCell.append(identity);
    const category = row.insertCell();
    category.append(element('div', 'category', protocol.category));
    category.append(element('span', 'chainpill', protocol.chains[0] ?? 'Multi-chain'));
    row.insertCell().textContent = money(protocol.tvl_usd);
    row.insertCell().append(element('span', protocol.change_7d < 0 ? 'change neg' : 'change', change(protocol.change_7d)));
    row.insertCell().append(element('span', 'val', money(protocol.implied_value_usd)));

    const confidence = element('div', 'conf');
    const meter = element('span', 'bar');
    const fill = element('span', '');
    fill.style.width = percent(protocol.confidence);
    meter.append(fill);
    confidence.append(meter, document.createTextNode(percent(protocol.confidence)));
    row.insertCell().append(confidence);
    const arrow = row.insertCell();
    arrow.className = 'chevron';
    arrow.textContent = '↗';
    return row;
  }

  function render() {
    const matches = matchingProtocols();
    const start = pageSize * state.page;
    const shown = matches.slice(start, start + pageSize);
    if (shown.length) {
      table.replaceChildren(...shown.map(protocolRow));
    } else {
      const row = element('tr', '');
      const cell = row.insertCell();
      cell.colSpan = 7;
      cell.className = 'empty';
      cell.textContent = 'No candidates match these filters.';
      table.replaceChildren(row);
    }
    setText('count', matches.length);
    setText('shown', shown.length ? (start + 1) + '–' + (start + shown.length) + ' of ' + matches.length : '0 shown');
    previous.disabled = state.page === 0;
    next.disabled = start + pageSize >= matches.length;
  }

  function metric(label, value) {
    const box = element('div', 'minibox');
    box.append(element('small', '', label), element('b', '', value));
    return box;
  }

  function scenario(protocol) {
    const block = element('div', 'bigvalue');
    block.append(
      element('small', '', 'IMPLIED LAUNCH VALUE · SCENARIO'),
      element('strong', '', money(protocol.implied_value_usd, 2)),
      element('div', 'range', 'Peer-error range ' + money(protocol.value_low_usd, 2) + ' – ' + money(protocol.value_high_usd, 2)),
    );
    const chart = element('div', 'chart');
    chart.setAttribute('aria-label', 'Low, base and high value scenarios');
    chart.setAttribute('role', 'img');
    const bands = [protocol.value_low_usd, protocol.implied_value_usd, protocol.value_high_usd];
    for (const [index, amount] of bands.entries()) {
      const bar = element('div', 'scenario-bar');
      bar.style.width = Math.max(7, 100 * amount / bands[2]) + '%';
      bar.style.backgroundColor = ['#476f78', '#71e1be', '#6688bd'][index];
      chart.append(bar);
    }
    block.append(chart);
    return block;
  }

  let opener = null;
  function show(slug, trigger = null) {
    const protocol = bySlug.get(slug);
    if (!protocol) return;
    if (trigger) opener = trigger;
    const body = element('div', 'dbody');
    const metrics = element('div', 'mini');
    metrics.append(
      metric('TOTAL VALUE LOCKED', money(protocol.tvl_usd)),
      metric('7D CHANGE', change(protocol.change_7d)),
      metric('APPLIED CAP / TVL', multiple(protocol.model.applied_multiple)),
      metric('MODEL CONFIDENCE', percent(protocol.confidence)),
    );
    const factors = protocol.model;
    const details = element('p', 'scenario-explanation',
      'TVL × ' + multiple(factors.applied_multiple) + ' gives the estimate. Peer-group support: ' + factors.peer_count +
      '. Size ' + multiple(factors.size_factor) + ' · 7D momentum ' + multiple(factors.growth_factor) +
      ' · age ' + multiple(factors.age_factor) + (factors.ratio_capped ? ' · ratio cap applied.' : '.') +
      ' The range comes from held-out peer errors; it describes a valuation scenario, not a launch probability.');
    const plan = element('ol', 'steps');
    for (const [index, step] of protocol.farm_steps.entries()) {
      const item = element('li', '');
      item.append(element('b', '', index + 1), element('span', '', step));
      plan.append(item);
    }
    body.append(
      element('div', 'deyebrow', 'RANK #' + protocol.rank + ' · ' + protocol.origin.toUpperCase()),
      element('h2', '', protocol.name),
      element('div', 'dsub', protocol.category + ' · ' + (protocol.chains.join(', ') || 'Chain unlisted')),
      scenario(protocol), metrics, element('div', 'sect', 'HOW THE SCENARIO IS ESTIMATED'),
      details, element('div', 'sect', 'RESEARCH & PARTICIPATION PLAN'), plan,
      element('div', 'risk', 'Unannounced rewards are speculative. Verify published terms, contracts and withdrawal rules before putting funds at risk.'),
    );
    get('detail-body').replaceChildren(body);
    const detail = get('detail');
    detail.classList.add('open');
    detail.setAttribute('aria-hidden', 'false');
    get('close').focus();
    if (location.hash !== '#' + encodeURIComponent(slug)) location.hash = encodeURIComponent(slug);
  }

  function hide(updateAddress = true) {
    const detail = get('detail');
    if (!detail.classList.contains('open')) return;
    detail.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    if (updateAddress) history.replaceState(null, '', location.pathname + location.search);
    opener?.focus();
    opener = null;
  }

  function resetPage() {
    state.page = 0;
    render();
  }

  for (const [id, key] of [['search', 'query'], ['chain', 'chain'], ['category', 'category'], ['sort', 'order']]) {
    get(id).addEventListener(id === 'search' ? 'input' : 'change', event => {
      const value = event.currentTarget.value;
      state[key] = key === 'query' ? value.trim().toLowerCase() : value;
      resetPage();
    });
  }
  for (const [id, scope] of Object.entries(scopeNames)) {
    const button = get('nav-' + id);
    button.setAttribute('aria-pressed', String(scope === state.scope));
    button.addEventListener('click', () => {
      state.scope = scope;
      for (const item of document.querySelectorAll('.nav')) {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      }
      resetPage();
    });
  }
  previous.addEventListener('click', () => { state.page--; render(); });
  next.addEventListener('click', () => { state.page++; render(); });
  table.addEventListener('click', event => {
    const row = event.target.closest('tr[data-slug]');
    if (row) show(row.dataset.slug, row.querySelector('button'));
  });
  get('close').addEventListener('click', () => hide());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });

  get('export').addEventListener('click', () => {
    const columns = ['rank', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'implied_value_usd',
      'value_low_usd', 'value_high_usd', 'confidence'];
    const csvField = value => {
      const text = String(value ?? '');
      const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const rows = protocols.map(protocol => columns.map(key => key === 'chains' ? protocol.chains.join(';') : protocol[key]));
    const csv = [columns, ...rows].map(row => row.map(csvField).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = element('a', '');
    link.href = url;
    link.download = 'token-horizon-board.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function restoreDetail() {
    let slug;
    try { slug = decodeURIComponent(location.hash.slice(1)); } catch { slug = ''; }
    if (bySlug.has(slug)) show(slug);
    else hide(false);
  }
  render();
  window.addEventListener('hashchange', restoreDetail);
  restoreDetail();
})();
