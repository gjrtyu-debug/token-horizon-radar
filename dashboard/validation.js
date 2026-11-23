/* SPDX-License-Identifier: MIT */
(() => {
  const radar = window.TOKEN_HORIZON_DATA;
  if (!radar?.calibration?.test_count) return;

  const evidence = radar.calibration;
  const metrics = document.querySelector('.stats');
  const panel = document.createElement('section');
  panel.className = 'validation-panel';
  panel.setAttribute('aria-labelledby', 'validation-title');

  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  const heading = make('h2', 'Model validation on listed peers');
  heading.id = 'validation-title';
  const factors = document.createElement('dl');
  factors.className = 'validation-metrics';

  for (const [label, value] of [
    ['Peers tested', String(evidence.test_count)],
    ['Calibrated model', evidence.median_factor.toFixed(2) + '×'],
    ['Previous radar', evidence.previous_factor.toFixed(2) + '×'],
    ['TVL-only baseline', evidence.tvl_factor.toFixed(2) + '×'],
  ]) {
    const metric = document.createElement('div');
    metric.append(make('dt', label), make('dd', value));
    factors.append(metric);
  }

  const description = make('p',
    'Lower is better. Median factor between each held-out estimate and its observed market cap. ' +
      'Model selection runs inside each training fold. The data is a single snapshot of listed peers.');
  const reference = document.createElement('details');
  reference.className = 'listed-peers';
  reference.append(make('summary', 'View listed-token reference set · ' + radar.live.length));
  reference.append(make('p',
    'These tokens already have reported market caps. Listed peers are displayed here, outside the candidate ranking. ' +
      'Repeated CoinGecko IDs use one representative in model validation.'));

  const table = document.createElement('table');
  const header = table.createTHead().insertRow();
  for (const title of ['Protocol', 'Category', 'TVL', 'Recorded market cap', 'Market cap / TVL']) {
    const cell = make('th', title);
    cell.scope = 'col';
    header.append(cell);
  }
  const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const body = table.createTBody();
  for (const protocol of radar.live) {
    const row = body.insertRow();
    const values = [
      protocol.name,
      protocol.category || 'Uncategorized',
      usd.format(protocol.tvl_usd),
      usd.format(protocol.mcap_usd),
      (protocol.mcap_usd / protocol.tvl_usd).toFixed(2) + '×',
    ];
    for (const value of values) row.insertCell().textContent = value;
  }
  const scroll = document.createElement('div');
  scroll.className = 'peer-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', 'Listed token comparison table');
  scroll.append(table);
  reference.append(scroll);
  panel.append(heading, factors, description, reference);
  metrics.after(panel);
})();
