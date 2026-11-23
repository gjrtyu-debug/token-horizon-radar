// SPDX-License-Identifier: MIT

export type ValueObservation = {
  slug: string;
  category: string;
  tvl: number;
  growth: number;
  age: number | null;
};

export type ListedPeer = ValueObservation & { marketCap: number; tokenId: string | null };

const minRatio = 0.03;
const maxRatio = 20;
const defaultRatio = 0.38;
const categoryPrior = 8;

function limit(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function quantile(values: number[], position: number): number {
  if (!values.length) return 0;
  const ordered = values.toSorted((left, right) => left - right);
  const index = (ordered.length - 1) * position;
  const lower = Math.floor(index);
  return ordered[lower] + (ordered[Math.ceil(index)] - ordered[lower]) * (index - lower);
}

function features(observation: ValueObservation): number[] {
  return [
    1,
    limit(Math.log(observation.tvl / 50_000_000), -3, 5),
    Math.tanh(observation.growth / 45),
    Math.log1p(Math.min(observation.age ?? 365, 2500) / 365) - Math.log(2),
  ];
}

function solve(matrix: number[][], target: number[]): number[] {
  const augmented = matrix.map((row, index) => [...row, target[index]]);
  for (let column = 0; column < matrix.length; column++) {
    for (let row = column + 1; row < matrix.length; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[column][column])) {
        [augmented[row], augmented[column]] = [augmented[column], augmented[row]];
      }
    }
    const pivot = augmented[column][column];
    if (Math.abs(pivot) < 1e-10) throw new Error('Singular calibration system');
    augmented[column] = augmented[column].map(value => value / pivot);
    for (let row = 0; row < augmented.length; row++) {
      if (row === column) continue;
      const scale = augmented[row][column];
      augmented[row] = augmented[row].map((value, index) => value - scale * augmented[column][index]);
    }
  }
  return augmented.map(row => row.at(-1)!);
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

const choices = [
  { name: 'Category median', penalty: 0 },
  { name: 'Ridge, stronger shrinkage', penalty: 24 },
  { name: 'Ridge, lighter shrinkage', penalty: 8 },
] as const;

type Choice = typeof choices[number];

function fit(peers: ListedPeer[], choice: Choice) {
  const outcomes = peers.map(peer => Math.log(peer.marketCap / peer.tvl));
  const center = outcomes.length ? quantile(outcomes, 0.5) : Math.log(defaultRatio);
  const lower = quantile(outcomes, 0.05);
  const upper = quantile(outcomes, 0.95);
  const samples = peers.map((peer, index) => ({
    x: features(peer), y: limit(outcomes[index], lower, upper), category: peer.category,
  }));

  let coefficients = [center, 0, 0, 0];
  if (choice.penalty && samples.length >= 12) {
    const matrix = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, column) => row === column && row !== 0 ? choice.penalty : 0));
    const values = Array<number>(4).fill(0);
    for (const sample of samples) {
      for (let row = 0; row < 4; row++) {
        values[row] += sample.x[row] * sample.y;
        for (let column = 0; column < 4; column++) {
          matrix[row][column] += sample.x[row] * sample.x[column];
        }
      }
    }
    coefficients = solve(matrix, values);
  }

  const residualsByCategory = new Map<string, number[]>();
  for (const sample of samples) {
    const residuals = residualsByCategory.get(sample.category) ?? [];
    residuals.push(sample.y - dot(coefficients, sample.x));
    residualsByCategory.set(sample.category, residuals);
  }

  return (observation: ValueObservation) => {
    const x = features(observation);
    const residuals = residualsByCategory.get(observation.category) ?? [];
    const categoryWeight = residuals.length / (residuals.length + categoryPrior);
    const categoryEffect = quantile(residuals, 0.5) * categoryWeight;
    const rawRatio = Math.exp(dot(coefficients, x) + categoryEffect);
    const ratio = limit(rawRatio, minRatio, maxRatio);
    return {
      value: observation.tvl * ratio,
      ratio,
      categoryPeers: residuals.length,
      categoryWeight,
      referenceMultiple: Math.exp(coefficients[0]),
      categoryMultiplier: Math.exp(categoryEffect),
      sizeMultiplier: Math.exp(coefficients[1] * x[1]),
      momentumMultiplier: Math.exp(coefficients[2] * x[2]),
      ageMultiplier: Math.exp(coefficients[3] * x[3]),
      capped: ratio !== rawRatio,
    };
  };
}

function uniquePeers(peers: ListedPeer[]): ListedPeer[] {
  const largest = new Map<string, ListedPeer>();
  for (const peer of peers) {
    if (peer.tvl <= 0 || peer.marketCap <= 0 || !Number.isFinite(peer.marketCap / peer.tvl)) continue;
    const identity = peer.tokenId ?? peer.slug;
    const earlier = largest.get(identity);
    if (!earlier || peer.tvl > earlier.tvl ||
      (peer.tvl === earlier.tvl && peer.slug < earlier.slug)) largest.set(identity, peer);
  }
  return [...largest.values()].sort((left, right) => left.slug.localeCompare(right.slug, 'en'));
}

function folds(peers: ListedPeer[], count: number): ListedPeer[][] {
  const buckets = Array.from({ length: count }, () => [] as ListedPeer[]);
  const sorted = peers.toSorted((left, right) =>
    left.category.localeCompare(right.category, 'en') || left.slug.localeCompare(right.slug, 'en'));
  sorted.forEach((peer, index) => buckets[index % count].push(peer));
  return buckets.filter(bucket => bucket.length);
}

function previousPrediction(training: ListedPeer[], peer: ListedPeer): number {
  const ratios = training.filter(item => item.marketCap / item.tvl <= 50);
  const global = limit(ratios.length ? quantile(ratios.map(item => item.marketCap / item.tvl), 0.5) : defaultRatio, 0.06, 4.5);
  const category = ratios.filter(item => item.category === peer.category);
  const categoryRatio = category.length
    ? limit(quantile(category.map(item => item.marketCap / item.tvl), 0.5), 0.06, 4.5)
    : global;
  const weight = category.length / (category.length + 6);
  const momentum = limit(1 + 0.32 * Math.tanh(limit(peer.growth, -75, 150) / 45), 0.76, 1.32);
  const maturity = 0.79 + 0.21 * Math.min(peer.age ?? 365, 1460) / 1460;
  return peer.tvl * (weight * categoryRatio + (1 - weight) * global) * momentum * maturity;
}

function errorsForChoice(buckets: ListedPeer[][], choice: Choice): number[] {
  return buckets.flatMap((validation, excluded) => {
    const model = fit(buckets.filter((_, index) => index !== excluded).flat(), choice);
    return validation.map(peer => Math.abs(Math.log(peer.marketCap / model(peer).value)));
  });
}

function chooseModel(training: ListedPeer[]): Choice {
  if (training.length < 12) return choices[0];
  const validationFolds = folds(training, 4);
  const scores = choices.map(choice => {
    const errors = errorsForChoice(validationFolds, choice);
    const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
    return { choice, mean };
  });
  scores.sort((left, right) => left.mean - right.mean);
  return scores[0].choice;
}

export function calibrate(listed: ListedPeer[]) {
  const peers = uniquePeers(listed);
  const heldOut = folds(peers, 5);
  const residuals: number[] = [];
  const previousErrors: number[] = [];
  const tvlErrors: number[] = [];
  for (const [index, validation] of heldOut.entries()) {
    const training = heldOut.filter((_, fold) => fold !== index).flat();
    if (!training.length) continue;
    const challenger = fit(training, chooseModel(training));
    const tvlRatios = training.map(peer => Math.log(peer.marketCap / peer.tvl));
    const tvlMultiple = Math.exp(quantile(tvlRatios, 0.5));
    for (const peer of validation) {
      residuals.push(Math.log(peer.marketCap / challenger(peer).value));
      previousErrors.push(Math.abs(Math.log(peer.marketCap / previousPrediction(training, peer))));
      tvlErrors.push(Math.abs(Math.log(peer.marketCap / (peer.tvl * tvlMultiple))));
    }
  }

  const selected = chooseModel(peers);
  const predict = fit(peers, selected);
  const lowResidual = residuals.length >= 12 ? Math.min(0, quantile(residuals, 0.1)) : Math.log(0.4);
  const highResidual = residuals.length >= 12 ? Math.max(0, quantile(residuals, 0.9)) : Math.log(2.5);
  const factor = (errors: number[]) => errors.length ? Math.exp(quantile(errors, 0.5)) : null;

  return {
    evidence: {
      model: selected.name,
      test_count: residuals.length,
      folds: heldOut.length,
      median_factor: factor(residuals.map(Math.abs)),
      previous_factor: factor(previousErrors),
      tvl_factor: factor(tvlErrors),
    },
    estimate(observation: ValueObservation) {
      const fitted = predict(observation);
      const value = Math.max(1, Math.round(fitted.value));
      return {
        ...fitted,
        value,
        low: Math.max(1, Math.round(value * Math.exp(lowResidual))),
        high: Math.round(value * Math.exp(highResidual)),
      };
    },
  };
}
