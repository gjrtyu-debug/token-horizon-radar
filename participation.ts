// SPDX-License-Identifier: MIT

type Route = {
  source: string;
  label: string;
  inspect: string;
  exit: string;
  stop: string;
};

type Candidate = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
};

const morphoVaults = 'https://docs.morpho.org/developers/earn/tutorials/assets-flow/';
const curatorRoute = (slug: string, label: string, inspect: string): Route => ({
  source: 'https://app.morpho.org/curator/' + slug,
  label,
  inspect,
  exit: 'Compare displayed withdrawable assets against the amount under review; verify the selected vault and network.',
  stop: 'Stop if the matching vault, withdrawal liquidity or underlying market concentration cannot be verified.',
});

const protocolRoutes: Record<string, Route> = {
  'steakhouse-financial': curatorRoute('steakhouse-financial', 'Steakhouse on Morpho',
    'Open the selected chain’s Steakhouse vault page. Compare available liquidity with total deposits, then examine exposure to the three largest markets.'),
  gauntlet: curatorRoute('gauntlet', 'Gauntlet on Morpho',
    'Compare vaults on the intended chain. Read collateral and utilization before choosing which withdrawal preview to review.'),
  rockawayx: curatorRoute('rockawayx', 'RockawayX on Morpho',
    'Compare the chosen RockawayX vault’s liquidity and exposure. Check how much of the vault is concentrated in a single market.'),
  hyperithm: {
    source: 'https://data.morpho.org/curation',
    label: 'Morpho curation directory',
    inspect: 'Locate Hyperithm under curators and match the chain. Open the referenced vault and review exposure and withdrawable liquidity.',
    exit: 'Check the liquidity shown at the vault level, because it can differ between Hyperithm vaults.',
    stop: 'Stop if the vault or current withdrawal route cannot be matched to the intended chain.',
  },
  clearstar: {
    source: 'https://data.morpho.org/curation',
    label: 'Morpho curation directory',
    inspect: 'Locate Clearstar in the directory. Inspect underlying collateral and confirm the selected vault asset.',
    exit: 'Check withdrawable assets and any concentration in the largest underlying collateral.',
    stop: 'Stop if the underlying assets or withdrawal route cannot be independently identified.',
  },
  veda: {
    source: 'https://docs.veda.tech/',
    label: 'Veda architecture',
    inspect: 'Identify the exact Veda-powered product and the vault operator. Read the product’s strategy allocations and roles.',
    exit: 'Find the product’s own withdrawal documentation and check whether it uses a queue or charges exit fees.',
    stop: 'Stop if the operator, underlying strategies or product-specific withdrawal terms are missing.',
  },
  onre: {
    source: 'https://docs.onre.finance/technical-resources/frequently-asked-questions',
    label: 'OnRe minting and redemption FAQ',
    inspect: 'Read the ONyc access rules and supported deposit assets. Existing ONyc exposure is distinct from an unannounced protocol reward.',
    exit: 'Check minimum holding period, redemption windows, available liquidity and whether the chosen route qualifies.',
    stop: 'Stop if direct redemption eligibility, terms or liquidity are unclear.',
  },
  opentrade: {
    source: 'https://www.opentrade.io/vaults',
    label: 'OpenTrade vaults',
    inspect: 'Identify which OpenTrade product is available through the provider under review. Verify the underlying lender and access requirements.',
    exit: 'Check the provider’s redemption process and settlement window before assigning a capital budget.',
    stop: 'Stop if no eligible provider publishes the applicable redemption and fee schedule.',
  },
  usdd: {
    source: 'https://docs.usdd.io/user-guide/open-a-vault',
    label: 'USDD collateral vault guide',
    inspect: 'Review supported collateral, vault debt and the liquidation threshold. USDD itself is an existing stablecoin.',
    exit: 'Read the debt repayment workflow and confirm how collateral is unlocked. Record the required repayment asset.',
    stop: 'Keep this to research if the collateral or debt position can be liquidated or exit costs cannot be estimated.',
  },
  symbiotic: {
    source: 'https://docs.symbiotic.fi/learn/core-concepts/vault',
    label: 'Symbiotic vault lifecycle',
    inspect: 'Check a concrete vault’s collateral asset, curator, operators and vault epoch before considering any use.',
    exit: 'Locate the withdrawal request and claim steps and record when the next applicable epoch ends.',
    stop: 'Stop if epoch timing is unclear or slashing exposure continues beyond the desired exit date.',
  },
};

type Playbook = {
  name: string;
  inspect: string;
  exit: string;
  stop: string;
  minutes: number;
  actions: string;
};

const playbooks: [RegExp, Playbook][] = [
  [/risk curator|allocat|rwa|vault|yield/, {
    name: 'Vault or allocation review',
    inspect: 'Inspect exposure, deposit cap, available liquidity and the controller’s permissions before comparing fees.',
    exit: 'Quote withdrawal on the same chain. Read queue length, redemption minimum and delayed settlement clauses.',
    stop: 'Stop if exit liquidity, deposit asset or withdrawal terms are missing.',
    minutes: 20, actions: 'approval if needed, deposit, withdrawal or claim',
  }],
  [/lend|borrow|collateral|cdp/, {
    name: 'Lending market review',
    inspect: 'Compare supply cap and utilization. For any debt route, write down liquidation threshold and rate curve.',
    exit: 'Simulate closing the debt and withdrawing collateral under stressed utilization.',
    stop: 'Stop if collateral can be liquidated or there is no demonstrably liquid exit path.',
    minutes: 20, actions: 'approval if needed, supply, withdrawal; add repayment for any debt',
  }],
  [/dex|exchange|swap|perp|derivative|options/, {
    name: 'Trading venue quote review',
    inspect: 'Compare entry and reverse quotes for the same asset size, with price impact and venue fee separated.',
    exit: 'Get an independent reverse quote after fees. Review margin and settlement only in read-only mode.',
    stop: 'Stop if the reverse quote is unavailable, fee estimates exceed the budget, or leverage is required.',
    minutes: 15, actions: 'approval if needed, entry, exit',
  }],
  [/bridge|cross.chain/, {
    name: 'Bridge route review',
    inspect: 'Confirm the canonical source and destination asset and quote both directions on matching chains.',
    exit: 'Record source finality, destination gas, transfer limit and refund process for a failed delivery.',
    stop: 'Stop if asset mapping, destination fees or refund procedure is unverified.',
    minutes: 20, actions: 'approval if needed, send, claim if required, return',
  }],
  [/stake|restak|security/, {
    name: 'Staking withdrawal review',
    inspect: 'Check selected operator, delegation permissions, slashable exposure and unbonding rules.',
    exit: 'Check where to submit the exit request, how long it remains pending and whether claiming is separate.',
    stop: 'Stop if slashing, exit window or collateral seizure rules are unclear.',
    minutes: 25, actions: 'approval if needed, supply or delegate, request exit, claim',
  }],
];

const generic: Playbook = {
  name: 'Documentation review',
  inspect: 'Identify a documented read-only workflow. Confirm network, supported assets and valid user roles.',
  exit: 'Look for an explicit fee schedule and documented process for reversing the action.',
  stop: 'Stop if the legitimate product, user eligibility or unwinding instructions are not documented.',
  minutes: 15, actions: 'verify each required action in the official documentation',
};

export function buildParticipation(candidate: Candidate) {
  const route = protocolRoutes[candidate.slug];
  const category = candidate.category.toLowerCase();
  const selected = playbooks.find(([pattern]) => pattern.test(category))?.[1] ?? generic;
  const chain = candidate.chains[0] ?? 'the supported network';
  const inspect = route?.inspect ?? selected.inspect;
  const exit = route?.exit ?? selected.exit;
  const stop = route?.stop ?? selected.stop;
  const canonical = route ? route.label + ' (' + route.source + ')' : 'official documentation for ' + candidate.name;

  return {
    participation: {
      workflow: selected.name,
      primary_chain: chain,
      source: route?.source ?? null,
      source_label: route?.label ?? null,
      mechanics_reference: route?.source.includes('morpho.org/curator/') ? morphoVaults : null,
      research_minutes: selected.minutes + 20,
      research_cost_usd: 0,
      actions_to_quote: selected.actions,
      exit_check: exit,
      stop_condition: stop,
      reward_status: 'Unverified in the sealed snapshot',
    },
    farm_steps: [
      'SOURCE · Begin with ' + canonical + ' and identify the deployment on ' + chain + '. Cost $0; 5 min.',
      'ACCESS · Check permitted users, supported assets and regional terms on the selected deployment. Cost $0; 5 min.',
      'REVIEW · ' + inspect + ' Cost $0 to inspect; ' + selected.minutes + ' min.',
      'QUOTE · Price ' + selected.actions + '. Include network, venue and conversion charges. Cost $0 to quote; 5 min.',
      'EXIT · ' + exit + ' Cost $0 to review; 5 min plus any documented settlement delay.',
      'DECISION · ' + stop + ' Cost $0 if skipped; financial exposure depends on any later activity.',
      'TRACK · Save the official announcement and keep an activity log. Recheck terms and risk weekly. Five minutes per check; $0.',
      'REWARD · Check the official status and claim window if one is announced. Cost $0 to verify; 5 min; actual claim costs are unknown.',
    ],
  };
}
