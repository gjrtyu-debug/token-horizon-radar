/* SPDX-License-Identifier: MIT */
window.TokenHorizonEvidence = (() => {
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const compact = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
  });

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function term(list, label, value) {
    const block = element('div');
    block.append(element('dt', label), element('dd', value));
    list.append(block);
  }

  function citation(url, label) {
    const link = element('a', label);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function planCard(protocol) {
    const plan = protocol.participation;
    const card = element('section', null, 'evidence-card decision-card');
    card.append(element('h3', plan.workflow));
    const items = element('dl', null, 'evidence-items');
    term(items, 'Initial research', '$0 · about ' + plan.research_minutes + ' min');
    term(items, 'Reward eligibility', plan.reward_status);
    card.append(items);
    if (plan.source) {
      const links = element('p', null, 'evidence-links');
      links.append(citation(plan.source, plan.source_label));
      if (plan.mechanics_reference) links.append(citation(plan.mechanics_reference, 'Vault withdrawal mechanics'));
      card.append(links);
    } else {
      card.append(element('p', 'Protocol-specific route pending source verification.', 'evidence-note'));
    }
    card.append(element('p', plan.stop_condition, 'stop-condition'));
    return card;
  }

  function peerCard(protocol) {
    const panel = element('details', null, 'evidence-card peer-card');
    panel.append(element('summary', 'See closest listed-token comparisons'));
    panel.append(element('p',
      'Examples selected by size, age, momentum and category. They explain the reference set used by the fitted model.'));
    const table = element('table');
    const header = table.createTHead().insertRow();
    for (const title of ['Listed peer', 'TVL', 'Cap / TVL']) {
      const cell = element('th', title);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    for (const peer of protocol.model.peers) {
      const row = body.insertRow();
      const name = row.insertCell();
      name.append(element('strong', peer.name), element('small', peer.category));
      row.insertCell().textContent = compact.format(peer.tvl_usd);
      row.insertCell().textContent = peer.multiple.toFixed(2) + '×';
    }
    panel.append(table);
    return panel;
  }

  function quoteCard(protocol) {
    const panel = element('details', null, 'evidence-card quote-card');
    panel.append(element('summary', 'Check a round-trip fee quote'));
    panel.append(element('p', 'Actions to quote: ' + protocol.participation.actions_to_quote + '.'));
    panel.append(element('p', 'Use quotes from the official interface. This calculation runs locally and assumes $0 in rewards.'));

    const fields = element('div', null, 'quote-fields');
    function amount(label, maximum) {
      const wrapper = element('label', label);
      const field = element('input');
      field.type = 'number';
      field.step = '0.01';
      field.min = '0';
      field.max = String(maximum);
      field.inputMode = 'decimal';
      wrapper.append(field);
      fields.append(wrapper);
      return field;
    }

    const capital = amount('Capital under review (USD)', 10_000_000);
    const entry = amount('Entry fees (USD)', 1_000_000);
    const unwind = amount('Exit fees and slippage (USD)', 1_000_000);
    const output = element('p', 'Add capital and both fee quotes to see the total.', 'quote-result');
    output.setAttribute('aria-live', 'polite');
    fields.addEventListener('input', () => {
      const values = [capital, entry, unwind];
      if (values.some(field => !field.value || !field.validity.valid) || Number(capital.value) <= 0) {
        output.textContent = 'Enter positive capital and nonnegative values for both fee quotes.';
        return;
      }
      const fees = Number(entry.value) + Number(unwind.value);
      const burden = 100 * fees / Number(capital.value);
      output.textContent = usd.format(fees) + ' in estimated round-trip fees · ' +
        burden.toFixed(2) + '% of stated capital. Fee-only break-even: ' + usd.format(fees) + '.';
    });
    panel.append(fields, output);
    return panel;
  }

  return { planCard, peerCard, quoteCard };
})();
