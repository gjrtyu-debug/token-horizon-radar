// SPDX-License-Identifier: MIT
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrate } from './valuation.ts';
import { buildParticipation } from './participation.ts';

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

function observation(protocol: Protocol, snapshotDate: string) {
  return {
    slug: protocol.slug,
    category: protocolCategory(protocol),
    tvl: finite(protocol.tvl_usd),
    growth: finite(protocol.change_7d),
    age: ageOnSnapshot(snapshotDate, protocol.listed_at),
  };
}

function rankedRow(
  protocol: Protocol,
  snapshotDate: string,
  watchlist: Set<string>,
  calibration: ReturnType<typeof calibrate>,
) {
  const input = observation(protocol, snapshotDate);
  const { category, age, tvl } = input;
  const estimate = calibration.estimate(input);
  const chains = protocol.chains ?? [];
  const evidence = 0.25 + Math.min(estimate.categoryPeers / 20, 0.28) +
    Math.min(Math.log10(Math.max(1, tvl)) / 30, 0.28) +
    (age === null ? 0 : 0.12) - (chains.length ? 0 : 0.08);
  const confidence = rounded(bound(evidence, 0.12, 0.88));
  const plan = buildParticipation({ slug: protocol.slug, name: protocol.name, category, chains });

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
    implied_value_usd: estimate.value,
    value_low_usd: estimate.low,
    value_high_usd: estimate.high,
    confidence,
    model: {
      category_multiple: rounded(estimate.referenceMultiple * estimate.categoryMultiplier),
      global_multiple: rounded(estimate.referenceMultiple),
      shrinkage_weight: rounded(estimate.categoryWeight),
      peer_count: estimate.categoryPeers,
      growth_factor: rounded(estimate.momentumMultiplier),
      age_factor: rounded(estimate.ageMultiplier),
      size_factor: rounded(estimate.sizeMultiplier),
      applied_multiple: rounded(estimate.ratio),
      ratio_capped: estimate.capped,
      peers: estimate.peer_examples,
    },
    ...plan,
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
  const liveTokens = protocols.filter(hasToken);
  const live = liveTokens.filter(protocol => finite(protocol.mcap_usd) > 0 && finite(protocol.tvl_usd) > 0);
  const calibration = calibrate(live.map(protocol => ({
    ...observation(protocol, snapshotDate),
    tokenId: protocol.gecko_id ?? null,
    marketCap: finite(protocol.mcap_usd),
  })));
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

  const rows = Array.from(candidates.values(), protocol => rankedRow(protocol, snapshotDate, watchlist, calibration))
    .sort((left, right) => right.implied_value_usd - left.implied_value_usd || left.slug.localeCompare(right.slug, 'en'))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const stats = {
    total: rows.length,
    watchlist: watchlist.size,
    watchlist_covered: watchlist.size,
    early: rows.length - watchlist.size,
    live_comp_count: live.length,
    live_token_count: liveTokens.length,
    as_of: snapshotDate,
    source: snapshot.source || 'sealed snapshot',
  };
  const comparables = live.toSorted((left, right) =>
    finite(right.mcap_usd) - finite(left.mcap_usd) || left.slug.localeCompare(right.slug, 'en'))
    .map(({ slug, name, category, tvl_usd, mcap_usd }) => ({ slug, name, category, tvl_usd, mcap_usd }));
  return { rows, stats, live: comparables, calibration: calibration.evidence };
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
writeFileSync(join(destination, 'board.json'), JSON.stringify({ rows: radar.rows, calibration: radar.calibration }) + '\n');
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
console.log(JSON.stringify({ ...radar.stats, calibration: radar.calibration }, null, 2));
