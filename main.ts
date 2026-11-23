// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Protocol = {
  slug: string;
  name: string;
  category?: string | null;
  chains?: string[];
  tvl_usd?: number | null;
  change_7d?: number | null;
  mcap_usd?: number | null;
  listed_at?: string | null;
  gecko_id?: string | null;
  symbol?: string | null;
};

type Snapshot = {
  protocols: Protocol[];
  watchlist: string[];
  as_of?: string;
  floor_usd?: number;
  source?: string;
};

const root = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const noAssetCategories = /\b(?:wrapped|liquid staking|staked|restaked|receipt token|synthetic token)\b/i;
const versionedProduct = /\s(?:v\d+(?:\.\d+)?|\d+\.\d+)$/i;
const dayInMilliseconds = 86_400_000;
const fallbackMultiple = 0.38;
const minimumMultiple = 0.06;
const maximumMultiple = 4.5;
const cohortPrior = 6;

function option(key: string, fallback: string): string {
  const flag = '--' + key;
  const supplied = args.find(arg => arg === flag || arg.startsWith(flag + '='));
  if (supplied === undefined) return fallback;
  const value = supplied === flag ? args[args.indexOf(flag) + 1] : supplied.slice(flag.length + 1);
  if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
  return value;
}

function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function bound(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

function rounded(value: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function percentile50(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function hasToken(protocol: Protocol): boolean {
  return protocol.mcap_usd != null || protocol.gecko_id != null || protocol.symbol != null;
}

function protocolCategory(protocol: Protocol): string {
  return protocol.category || 'Other';
}

function ageOnSnapshot(snapshotDate: string, openingDate?: string | null): number | null {
  if (!openingDate) return null;
  const days = (Date.parse(snapshotDate) - Date.parse(openingDate)) / dayInMilliseconds;
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : null;
}

function comparableGroups(protocols: Protocol[]) {
  const all: number[] = [];
  const categories = new Map<string, number[]>();
  const live = protocols.filter(protocol => finite(protocol.mcap_usd) > 0 && finite(protocol.tvl_usd) > 0);
  for (const protocol of live) {
    const ratio = finite(protocol.mcap_usd) / finite(protocol.tvl_usd);
    if (ratio > 50) continue;
    const key = protocolCategory(protocol);
    const group = categories.get(key) ?? [];
    group.push(ratio);
    categories.set(key, group);
    all.push(ratio);
  }
  const benchmark = bound(percentile50(all) ?? fallbackMultiple, minimumMultiple, maximumMultiple);
  return { benchmark, categories, live };
}

function researchPlan(protocol: Protocol, confidence: number, age: number | null): string[] {
  const chain = protocol.chains?.[0] ?? 'its supported network';
  const category = protocolCategory(protocol).toLowerCase();
  const routes: [RegExp, string][] = [
    [/lend|borrow|collateral|cdp/, 'Check permitted collateral, borrowing rates and the liquidation threshold.'],
    [/dex|exchange|swap/, 'Get a swap quote and compare pool liquidity, fees and slippage.'],
    [/bridge|cross.chain/, 'Check the supported route, destination address format and settlement delay.'],
    [/staking|restak/, 'Read the staking terms, unbonding window and slashing policy.'],
    [/perp|derivative|options/, 'Inspect the order book and margin rules without opening a leveraged position.'],
    [/yield|vault|aggregator|farm/, 'Review strategy exposure, management fees and whether withdrawals can be paused.'],
    [/prediction/, 'Review the market rules and local eligibility before opening any position.'],
    [/payment|card/, 'Look for a demo or sandbox and compare its terms with the live service.'],
  ];
  const review = routes.find(([pattern]) => pattern.test(category))?.[1] ??
    'Find a documented no-deposit workflow and review what information the application requests.';
  const tvlForBudget = Math.max(0, finite(protocol.tvl_usd));
  const testBudget = bound(Math.round(Math.sqrt(tvlForBudget) / 100), 10, 100);
  const spendLimit = confidence < 0.4 ? 0 : testBudget;
  const cadence = age !== null && age < 90 ? 'after one week' : 'within a month';

  return [
    `VERIFY · Confirm the canonical ${protocol.name} application and its documented deployment on ${chain}. Cost $0; 5–10 min.`,
    'ELIGIBILITY · Check the terms, supported jurisdictions and any published rewards criteria. Cost $0; 10 min.',
    'ISOLATE · Review permissions in a separate wallet profile and verify every contract against official documentation. Cost $0; 10 min.',
    `EVALUATE · ${review} This review needs no funds. If testing later, the planning limit is $${spendLimit}; 15–30 min.`,
    `ESTIMATE FEES · Preview costs for both entry and exit on ${chain} before deciding. Cost $0 for quotes; 5 min.`,
    'TRACK · Save official announcement links and your own activity records. Recheck eligibility weekly. Cost $0; 5 min per week.',
    `EXIT · Review risk and withdrawal terms ${cadence}. If already participating, check the network fee before withdrawing.`,
    'CLAIM · Follow only a claim address published in verified official channels. Rewards and costs remain unknown until announced.',
  ];
}

function rankedRow(protocol: Protocol, snapshotDate: string, watchlist: Set<string>, groups: ReturnType<typeof comparableGroups>) {
  const category = protocolCategory(protocol);
  const peers = groups.categories.get(category) ?? [];
  const benchmark = groups.benchmark;
  const categoryMultiple = bound(percentile50(peers) ?? benchmark, minimumMultiple, maximumMultiple);
  const peerWeight = peers.length / (peers.length + cohortPrior);
  const multiple = categoryMultiple * peerWeight + benchmark * (1 - peerWeight);
  const weeklyChange = bound(finite(protocol.change_7d), -75, 150);
  const momentum = bound(1 + 0.32 * Math.tanh(weeklyChange / 45), 0.76, 1.32);
  const age = ageOnSnapshot(snapshotDate, protocol.listed_at);
  const maturity = 0.79 + 0.21 * Math.min(age ?? 365, 1460) / 1460;
  const tvl = finite(protocol.tvl_usd);
  const value = Math.max(1, Math.round(tvl * multiple * momentum * maturity));
  const chains = protocol.chains ?? [];
  const evidence = 0.25 + Math.min(peers.length / 20, 0.28) +
    Math.min(Math.log10(Math.max(1, tvl)) / 30, 0.28) +
    (age === null ? 0 : 0.12) - (chains.length ? 0 : 0.08);
  const confidence = rounded(bound(evidence, 0.12, 0.88));

  return {
    slug: protocol.slug,
    name: protocol.name,
    category,
    chains,
    tvl_usd: tvl,
    change_7d: protocol.change_7d ?? null,
    age_days: age,
    listed_at: protocol.listed_at ?? null,
    mcap_usd: null,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    origin: watchlist.has(protocol.slug) ? 'watchlist' : 'early',
    implied_value_usd: value,
    value_low_usd: Math.round(value * (0.35 + 0.38 * confidence)),
    value_high_usd: Math.round(value * (2.2 - 0.7 * confidence)),
    confidence,
    model: {
      category_multiple: rounded(categoryMultiple),
      global_multiple: rounded(benchmark),
      shrinkage_weight: rounded(peerWeight),
      peer_count: peers.length,
      growth_factor: rounded(momentum),
      age_factor: rounded(maturity),
    },
    farm_steps: researchPlan(protocol, confidence, age),
  };
}

function analyze(snapshot: Snapshot) {
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    throw new Error('Snapshot requires protocols and watchlist arrays');
  }
  const snapshotDate = snapshot.as_of || '2026-11-23';
  const floor = finite(snapshot.floor_usd) || 10_000_000;
  const watchlist = new Set(snapshot.watchlist);
  const protocols = snapshot.protocols.filter(record =>
    typeof record?.slug === 'string' && record.slug.length > 0 && typeof record.name === 'string');
  const groups = comparableGroups(protocols);
  const candidates = new Map<string, Protocol>();
  for (const protocol of protocols) {
    const tvl = finite(protocol.tvl_usd);
    const earlyCandidate = !hasToken(protocol) && tvl > 0 && tvl < floor &&
      protocol.category !== 'CEX' && !noAssetCategories.test(protocolCategory(protocol)) &&
      !versionedProduct.test(protocol.name);
    if (watchlist.has(protocol.slug) || earlyCandidate) candidates.set(protocol.slug, protocol);
  }
  const missing = [...watchlist].filter(slug => !candidates.has(slug));
  if (missing.length) throw new Error('Watchlist protocols absent from snapshot: ' + missing.join(', '));

  const rows = Array.from(candidates.values(), protocol => rankedRow(protocol, snapshotDate, watchlist, groups))
    .sort((left, right) => right.implied_value_usd - left.implied_value_usd || left.slug.localeCompare(right.slug, 'en'))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const stats = {
    total: rows.length,
    watchlist: watchlist.size,
    watchlist_covered: watchlist.size,
    early: rows.length - watchlist.size,
    median_multiple: rounded(groups.benchmark),
    live_comp_count: groups.live.length,
    as_of: snapshotDate,
    source: snapshot.source || 'sealed snapshot',
  };
  const live = groups.live.toSorted((left, right) => finite(right.mcap_usd) - finite(left.mcap_usd))
    .slice(0, 18)
    .map(({ name, category, tvl_usd, mcap_usd }) => ({ name, category, tvl_usd, mcap_usd }));
  return { rows, stats, live };
}

function copyAssets(directory: string, output: string): void {
  const source = join(root, directory);
  if (!existsSync(source)) return;
  const target = join(output, directory);
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(source, entry.name), join(target, entry.name));
  }
}

const requestedInput = option('input', '/input');
const snapshotFile = requestedInput.endsWith('.json') ? requestedInput : join(requestedInput, 'snapshot.json');
const destination = option('output', process.env.MAKEFUN_OUTPUT_DIR || '/output');
const snapshot: Snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
const radar = analyze(snapshot);
if (radar.rows.length < 100) console.warn('Contest minimum is 100 rows; generated ' + radar.rows.length);
mkdirSync(destination, { recursive: true });
copyAssets('dashboard', destination);
copyAssets('screenshots', destination);
writeFileSync(join(destination, 'board.json'), JSON.stringify({ rows: radar.rows }) + '\n');
writeFileSync(join(destination, 'dashboard', 'data.js'), 'window.TOKEN_HORIZON_DATA=' + JSON.stringify(radar) + ';\n');

if (existsSync(join(root, 'vendor', 'makefun-board.ts'))) {
  const { buildDossier } = await import('./vendor/makefun-board.ts');
  const constraints = {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  };
  writeFileSync(join(destination, 'dossier.json'), buildDossier(destination, constraints));
} else {
  console.warn('Install the official make.fun library to generate dossier.json.');
}
console.log(JSON.stringify(radar.stats, null, 2));
