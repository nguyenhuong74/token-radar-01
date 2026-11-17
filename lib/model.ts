// Token Radar v2 — a fitted, blind-tested value model and farm plans netted to the dollar.
//
// The snapshot is DefiLlama's record of 758 protocols at or above $5M TVL, sealed on one day.
// This model scores only protocols that record no token (no market cap, no CoinGecko id, no
// symbol). Protocols whose token already trades are never ranked: they are the comparison set
// the model is fitted on, validated on, and shown apart from on the dashboard.
//
// The value model, radar-3-fitted, in two layers:
//
//   1. A fitted base, chosen by a blind test. Five candidate pricers compete: the
//      market-median mcap/TVL ratio, the shrunk category-median ratio, a pooled log-log
//      regression of log10(market cap) on log10(TVL) by ordinary least squares, the same
//      regression with a per-category intercept offset (each category's mean residual,
//      shrunk toward zero with a pseudo-count of 3 and clamped to half a decade), and the
//      geometric mean of the two log-log predictions. Each is run through 5-fold
//      cross-validation on the traded set (folds by a hash of the slug, so the split is
//      fixed): fitted on four folds, priced on the fifth, scored by median absolute log
//      error. The winner — the lowest median error — prices the board, and the dashboard
//      prints the whole table, so a reader can see the test the model passed instead of
//      taking its author's word for it. Nothing about any protocol's name enters any fit;
//      every coefficient is recomputed from the snapshot on every run.
//   2. Stated adjustments, the factors the bounty names: growth (1 + 0.6 x clamped 7-day TVL
//      change), maturity (0.70 + 0.30 x age up to 3 years; a protocol that ran longer with no
//      token prices higher) and breadth (+3% per extra chain, up to +12%).
//
//      implied_value_usd = round(base x growth x maturity x breadth), at least $1
//
// Ranks carry their uncertainty. The winning fit is refitted 200 times on bootstrap
// resamples of the traded set (a seeded generator, so every run refits the same 200), the
// board is re-ranked each time, and every row reports the 10th–90th percentile range of
// the ranks it took. A rank of 12 with a range of 9–18 is a steadier claim than a rank of
// 12 with a range of 4–60, and the dashboard shows both.
//
// Farm plans are netted to the dollar. Each row sizes a deposit from the protocol's TVL
// tier, prices an expected claim from the row's own implied value (a stated 10% of it
// allocated to farmers, spread over eligible farmer deposits taken as 5% of TVL), and
// subtracts gas and the opportunity cost of the capital over the hold. The verdict is
// FARM when the net clears $25, THIN when it clears $0, and SKIP when it does not cover
// its costs. The assumptions are printed on the dashboard next to the numbers they feed,
// so a reader who disagrees with one can re-price the board in their head.

/** One protocol of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can check the arithmetic. */
export interface ModelConstants {
  shrink: number;
  offset_clamp_dex: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  cv_folds: number;
  bootstrap_refits: number;
  bootstrap_seed: number;
  airdrop_allocation: number;
  eligible_share_of_tvl: number;
  gas_usd: number;
  opportunity_apr: number;
  farm_net_usd: number;
}

export const MODEL: ModelConstants = {
  shrink: 3,
  offset_clamp_dex: 0.5,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 4,
  cv_folds: 5,
  bootstrap_refits: 200,
  bootstrap_seed: 0x5eed,
  airdrop_allocation: 0.1,
  eligible_share_of_tvl: 0.05,
  gas_usd: 20,
  opportunity_apr: 0.05,
  farm_net_usd: 25,
};

export const MODEL_VERSION = 'radar-3-fitted';

/** How many live-token protocols the dashboard's comps table carries, by market cap. */
export const LIVE_ROWS = 24;

/** A log-log fit: pooled intercept and slope, plus shrunk per-category offsets. */
export interface LogLogFit {
  alpha: number;
  beta: number;
  offsets: Map<string, number>;
  samples: Map<string, number>;
  compCount: number;
}

/** One candidate pricer and its blind-test result. */
export interface CandidateResult {
  name: string;
  median_error_x: number;
  within_2x_pct: number;
}

/** The cross-validation table the dashboard prints. */
export interface Validation {
  folds: number;
  comp_count: number;
  candidates: CandidateResult[];
  winner: string;
  winner_median_error_x: number;
  winner_within_2x_pct: number;
}

/** The fitted coefficients the dashboard prints beside the formula. */
export interface FittedCoefficients {
  alpha: number;
  beta: number;
  pooled_median_error_x: number;
}

/** The model breakdown one board row carries, so the dashboard can show its working. */
export interface ModelBreakdown {
  base_usd: number;
  pooled_usd: number;
  offset_usd: number;
  category_offset_dex: number;
  comp_sample: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One row's farm economics, netted to the dollar. */
export interface FarmEconomics {
  deposit_usd: number;
  expected_claim_usd: number;
  gas_usd: number;
  opportunity_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  hold_days: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  rank_lo: number;
  rank_hi: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm: FarmEconomics;
  farm_steps: string[];
}

/** A live-token protocol, shown as a comp, never ranked. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl: number;
}

/** One category's fitted offset, for the dashboard's model panel. */
export interface CompRow {
  category: string;
  sample: number;
  offset_dex: number;
  median_mcap_tvl: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FittedCoefficients;
  validation: Validation;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  rows: BoardRow[];
  live: LiveRow[];
  comps: CompRow[];
}

/** Why a snapshot cannot be scored. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, at least 0; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of an array of numbers (the array is sorted in place). */
function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
}

/** A protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name ending in a version marker (V2, v3, 2.0) is a pool of another protocol, not a launch. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name marks a product of a token that trades. */
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product, not a launch. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/**
 * Whether the board may rank a protocol: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades — the same visible-field rule the house's
 * watchlist applies, since the snapshot carries no parent-protocol field. Above the
 * watchlist floor the board trusts the watchlist itself (the house saw the parent
 * field); below it, this rule keeps the early rows genuine launches.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_OR_STAKED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The comparison set: traded tokens with a usable market cap and TVL, exchanges aside. */
export function compSet(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/** FNV-1a over a string, for the fixed cross-validation folds. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded generator (mulberry32): the bootstrap refits the same 200 resamples every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The log-log fit on a comparison set: ordinary least squares of log10(market cap) on
 * log10(TVL), plus each category's mean residual shrunk toward zero with a pseudo-count
 * of `shrink` and clamped to `offset_clamp_dex` decades either way. A category with one
 * or two comps barely moves its protocols; a deep category's offset stands.
 */
export function fitLogLog(comps: SnapshotProtocol[], model: ModelConstants): LogLogFit {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd as number));
  const n = comps.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    variance += (xs[i]! - mx) ** 2;
  }
  const beta = variance === 0 ? 0 : cov / variance;
  const alpha = my - beta * mx;
  const residualSum = new Map<string, number>();
  const samples = new Map<string, number>();
  for (const p of comps) {
    const key = p.category ?? 'Uncategorized';
    const residual = Math.log10(p.mcap_usd as number) - (alpha + beta * Math.log10(p.tvl_usd));
    residualSum.set(key, (residualSum.get(key) ?? 0) + residual);
    samples.set(key, (samples.get(key) ?? 0) + 1);
  }
  const offsets = new Map<string, number>();
  for (const [key, sum] of residualSum) {
    const count = samples.get(key) ?? 0;
    const shrunk = sum / (count + model.shrink);
    offsets.set(key, Math.min(model.offset_clamp_dex, Math.max(-model.offset_clamp_dex, shrunk)));
  }
  return { alpha, beta, offsets, samples, compCount: n };
}

/** The pooled prediction: the fit's line alone, no category offset. */
export function pooledPrediction(tvlUsd: number, fit: LogLogFit): number {
  return 10 ** (fit.alpha + fit.beta * Math.log10(tvlUsd));
}

/** The offset prediction: the fit's line plus the protocol's category offset. */
export function offsetPrediction(p: SnapshotProtocol, fit: LogLogFit): number {
  const offset = fit.offsets.get(p.category ?? 'Uncategorized') ?? 0;
  return 10 ** (fit.alpha + fit.beta * Math.log10(p.tvl_usd) + offset);
}

/**
 * The fitted base: the geometric mean of the pooled and offset predictions — the average
 * of their logs. Averaging the two hedges the offset model's variance against the pooled
 * model's bias, and the blind test below is what picked this average over either alone.
 */
export function fittedBase(p: SnapshotProtocol, fit: LogLogFit): { base: number; pooled: number; offset: number } {
  const pooled = pooledPrediction(p.tvl_usd, fit);
  const offset = offsetPrediction(p, fit);
  return { base: Math.sqrt(pooled * offset), pooled, offset };
}

/** The median mcap/TVL of a comparison set, for the ratio pricers. */
function medianRatio(comps: SnapshotProtocol[]): number {
  return median(comps.map((p) => (p.mcap_usd as number) / p.tvl_usd));
}

/** The five candidate pricers the blind test runs. */
export const PRICER_NAMES = [
  'market-median ratio',
  'category-median ratio',
  'pooled log-log',
  'log-log + category offset',
  'log-log mean of pooled & offset',
] as const;

/**
 * Fit one pricer on a training set and return its base-pricing function. The ratio
 * pricers precompute their medians; the log-log pricers fit once and price many. The
 * same function prices the blind test's held-out folds, the board and the bootstrap,
 * so the winner the test picks is the pricer the board actually uses.
 */
export function fitPricer(name: string, train: SnapshotProtocol[], model: ModelConstants): (p: SnapshotProtocol) => number {
  if (name === 'market-median ratio') {
    const market = medianRatio(train);
    return (p) => p.tvl_usd * market;
  }
  if (name === 'category-median ratio') {
    const market = medianRatio(train);
    const ratiosByCategory = new Map<string, number[]>();
    for (const q of train) {
      const key = q.category ?? 'Uncategorized';
      const list = ratiosByCategory.get(key) ?? [];
      list.push((q.mcap_usd as number) / q.tvl_usd);
      ratiosByCategory.set(key, list);
    }
    const medians = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const [key, ratios] of ratiosByCategory) {
      medians.set(key, median(ratios));
      counts.set(key, ratios.length);
    }
    return (p) => {
      const key = p.category ?? 'Uncategorized';
      const catMedian = medians.get(key);
      const count = counts.get(key) ?? 0;
      if (catMedian === undefined) return p.tvl_usd * market;
      const blended = (count * catMedian + model.shrink * market) / (count + model.shrink);
      return p.tvl_usd * Math.min(1.5, Math.max(0.05, blended));
    };
  }
  const fit = fitLogLog(train, model);
  if (name === 'pooled log-log') return (p) => pooledPrediction(p.tvl_usd, fit);
  if (name === 'log-log + category offset') return (p) => offsetPrediction(p, fit);
  return (p) => fittedBase(p, fit).base;
}

/**
 * The blind test: 5-fold cross-validation of every pricer on the traded set. Folds are
 * assigned by a hash of the slug, so the split never moves. Each pricer is fitted on
 * four folds and priced on the fifth; its score is the median absolute log error over
 * the held-out tokens, reported as a times factor, with the share priced within 2x.
 * The winner is the lowest median error; the board is priced by the winner alone.
 */
export function crossValidate(comps: SnapshotProtocol[], model: ModelConstants): Validation {
  const folds: SnapshotProtocol[][] = Array.from({ length: model.cv_folds }, () => []);
  for (const p of comps) folds[fnv1a(p.slug) % model.cv_folds]!.push(p);
  const candidates: CandidateResult[] = PRICER_NAMES.map((name) => {
    const errors: number[] = [];
    for (let k = 0; k < model.cv_folds; k++) {
      const train = folds.flatMap((fold, j) => (j === k ? [] : fold));
      const price = fitPricer(name, train, model);
      for (const p of folds[k]!) {
        const predicted = price(p);
        if (predicted > 0) errors.push(Math.abs(Math.log10(p.mcap_usd as number) - Math.log10(predicted)));
      }
    }
    const medianError = median(errors);
    const within2x = errors.filter((e) => e <= Math.log10(2)).length / Math.max(errors.length, 1);
    return { name, median_error_x: round2(10 ** medianError), within_2x_pct: round2(within2x * 100) };
  });
  candidates.sort((a, b) => a.median_error_x - b.median_error_x);
  const winner = candidates[0]!;
  return {
    folds: model.cv_folds,
    comp_count: comps.length,
    candidates,
    winner: winner.name,
    winner_median_error_x: winner.median_error_x,
    winner_within_2x_pct: winner.within_2x_pct,
  };
}

/** The three stated adjustments, shared by the board and the bootstrap. */
export function adjustments(p: SnapshotProtocol, asOf: string, model: ModelConstants): { growth: number; maturity: number; breadth: number; age: number | null } {
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growth = 1 + (growthPct / 100) * model.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturity = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadth = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  return { growth, maturity, breadth, age };
}

/**
 * The fitted base and the implied value one protocol gets, with its breakdown.
 * `priceBase` is the blind test winner's pricing function; `fit` is the full-set
 * log-log fit, kept so the breakdown can still show the pooled and offset predictions
 * as reference beside the winner's base.
 */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  priceBase: (p: SnapshotProtocol) => number,
  fit: LogLogFit,
  model: ModelConstants,
): { implied: number; breakdown: ModelBreakdown } {
  const base = priceBase(p);
  const pooled = pooledPrediction(p.tvl_usd, fit);
  const offset = offsetPrediction(p, fit);
  const adj = adjustments(p, asOf, model);
  const implied = Math.max(1, Math.round(base * adj.growth * adj.maturity * adj.breadth));
  return {
    implied,
    breakdown: {
      base_usd: Math.round(base),
      pooled_usd: Math.round(pooled),
      offset_usd: Math.round(offset),
      category_offset_dex: round4(fit.offsets.get(p.category ?? 'Uncategorized') ?? 0),
      comp_sample: fit.samples.get(p.category ?? 'Uncategorized') ?? 0,
      growth_multiplier: round4(adj.growth),
      maturity_multiplier: round4(adj.maturity),
      breadth_multiplier: round4(adj.breadth),
      age_days: adj.age,
    },
  };
}

/**
 * Rank ranges from the bootstrap: refit the winning pricer on `bootstrap_refits`
 * resamples of the traded set (drawn with replacement from the seeded generator),
 * re-rank the board each time, and take the 10th and 90th percentile of the ranks each
 * protocol took. The resample, the refit and the re-rank are all deterministic.
 */
export function bootstrapRankRanges(
  chosen: SnapshotProtocol[],
  comps: SnapshotProtocol[],
  asOf: string,
  winner: string,
  model: ModelConstants,
): Map<string, { lo: number; hi: number }> {
  const ranks = new Map<string, number[]>();
  for (const p of chosen) ranks.set(p.slug, []);
  const rng = mulberry32(model.bootstrap_seed);
  for (let i = 0; i < model.bootstrap_refits; i++) {
    const resample: SnapshotProtocol[] = [];
    for (let j = 0; j < comps.length; j++) resample.push(comps[Math.floor(rng() * comps.length)]!);
    const priceBase = fitPricer(winner, resample, model);
    const scored = chosen.map((p) => {
      const adj = adjustments(p, asOf, model);
      return { slug: p.slug, value: priceBase(p) * adj.growth * adj.maturity * adj.breadth };
    });
    scored.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, rank) => ranks.get(s.slug)!.push(rank + 1));
  }
  const ranges = new Map<string, { lo: number; hi: number }>();
  for (const [slug, list] of ranks) {
    list.sort((a, b) => a - b);
    const at = (q: number): number => list[Math.min(list.length - 1, Math.max(0, Math.floor(q * list.length)))]!;
    ranges.set(slug, { lo: at(0.1), hi: at(0.9) });
  }
  return ranges;
}

/** The capital one farm position needs, scaled to the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One row's farm economics, netted to the dollar. The expected claim prices the farmer's
 * share of a stated 10% farmer allocation of the row's implied value, spread over
 * eligible farmer deposits taken as 5% of TVL; the costs are gas and the opportunity
 * cost of the deposit over the hold at 5% a year. FARM clears $25 net, THIN clears $0,
 * SKIP does not cover its costs. Every assumption is a constant the dashboard prints.
 */
export function farmEconomics(p: SnapshotProtocol, implied: number, age: number | null, model: ModelConstants): FarmEconomics {
  const deposit = capitalFor(p);
  const hold = holdDaysFor(age);
  const eligibleDeposits = model.eligible_share_of_tvl * p.tvl_usd;
  const expectedClaim = implied * model.airdrop_allocation * (deposit / Math.max(eligibleDeposits, 1));
  const opportunity = (deposit * model.opportunity_apr * hold) / 365;
  const net = expectedClaim - model.gas_usd - opportunity;
  const verdict: FarmEconomics['verdict'] = net >= model.farm_net_usd ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
  return {
    deposit_usd: deposit,
    expected_claim_usd: round2(expectedClaim),
    gas_usd: model.gas_usd,
    opportunity_usd: round2(opportunity),
    net_usd: round2(net),
    verdict,
    hold_days: hold,
  };
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One step as a single string, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 597)}...`;
  if (s.length < 20) s = `${s} Keep a note of the wallet, the dates and every transaction.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n < 10 && n !== Math.round(n) ? 2 : 0)}`;
}

/** The category's one core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply ${money(capital)} of USDC to ${name} on ${chain} and leave the position open so it counts in snapshots`;
  if (c.includes('dex')) return `Provide ${money(capital)} of liquidity to ${name}'s busiest pool on ${chain} and keep the position open`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit ${money(capital)} into ${name}'s main vault on ${chain} and hold the receipt tokens`;
  if (c.includes('leveraged farm')) return `Open a ${money(capital)} leveraged farming position on ${name} on ${chain} at the lowest leverage offered`;
  if (c.includes('bridge')) return `Bridge ${money(capital)} of USDC through ${name} to ${chain} and use the bridged funds inside its app`;
  if (c.includes('restak') || c.includes('staking')) return `Stake ${money(capital)} of the chain's staking asset through ${name} and keep the receipt token in the same wallet`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit ${money(capital)} of USDC as margin on ${name} and open one small hedged position`;
  if (c.includes('prediction')) return `Fund ${money(capital)} and place one position on a ${name} market, then hold it to settlement`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit ${money(capital)} into a ${name} vault on ${chain} and keep the shares in one wallet`;
  if (c.includes('stablecoin') || c.includes('stable')) return `Mint or deposit ${money(capital)} of the stable asset through ${name} on ${chain} and hold it`;
  if (c.includes('rwa')) return `Mint ${money(capital)} of the protocol's yield-bearing asset on ${chain} and hold it in one wallet`;
  if (c.includes('insurance')) return `Buy ${money(capital)} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('payments')) return `Route ${money(capital)} of payments through ${name} on ${chain} across at least two separate weeks`;
  if (c.includes('governance')) return `Deposit ${money(capital)} into ${name}'s incentive pool on ${chain} and vote in its next round`;
  if (c.includes('chain')) return `Bridge ${money(capital)} onto ${name}'s chain and use its native app at least once a week`;
  if (c.includes('basis')) return `Deposit ${money(capital)} into ${name}'s basis vault on ${chain} and hold the position through one funding cycle`;
  if (c.includes('privacy')) return `Deposit ${money(capital)} through ${name}'s shielded pool on ${chain} and keep the notes safe offline`;
  if (c.includes('indexes')) return `Buy ${money(capital)} of the ${name} index on ${chain} and hold it in one wallet`;
  return `Deposit ${money(capital)} of USDC into ${name} on ${chain} and keep the position open`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, priced from
 * the row's own economics. Step 2 states the deposit, the expected claim and the net, so
 * the plan is a priced decision, not a slogan; steps 1–4 farm it before any token
 * exists, step 5 is launch day, step 6 is what to do with the claim.
 */
export function farmSteps(p: SnapshotProtocol, econ: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const netLine =
    econ.verdict === 'FARM'
      ? `the model nets about ${money(econ.net_usd)} after costs, so this farm pays`
      : econ.verdict === 'THIN'
        ? `the model nets about ${money(econ.net_usd)} after costs, so this farm barely pays — farm it only with idle capital`
        : `the model nets about ${money(Math.abs(econ.net_usd))} below its costs, so this farm loses money at this deposit size`;
  return [
    {
      text: `Set up one fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${actionFor(p, econ.deposit_usd, chain)} — a ${money(econ.deposit_usd)} position prices an expected claim near ${money(econ.expected_claim_usd)}, and ${netLine}`,
      cost: `${money(econ.deposit_usd)} of capital plus about $8 of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as a deposit, a swap, a borrow or a vote, so the wallet shows repeat activity`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${econ.hold_days} days so the activity is counted in more than one snapshot`,
      cost: `the ${money(econ.deposit_usd)} stays in the position`,
      time: `${econ.hold_days} days`,
    },
    {
      text: `When ${p.name} announces a token, claim only from the link its own official page publishes, and never pay anyone to claim for you`,
      cost: "the claim's gas only, usually under $5",
      time: '15 minutes on launch day',
    },
    {
      text:
        econ.verdict === 'SKIP'
          ? `If the claim still arrives, sell enough of it to cover the gas you spent and keep the rest staked only if the token pays a real yield`
          : `After the token issues, stake or provide liquidity with part of the claim instead of selling it all at once, and keep the farm position open for later seasons`,
      cost: 'about $5 of gas to stake or add liquidity',
      time: '20 minutes, then 10 minutes a week',
    },
  ];
}

/** The board's protocol set: every watchlist slug, plus every other rankable pre-token protocol below the floor. */
export function boardProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor. Above the floor
  // the watchlist is the authority — the house's parent-protocol field is not in the snapshot,
  // so an above-floor protocol it left out is not second-guessed here.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  return [...chosen.values()];
}

/** The board: the chosen protocols scored by the blind test's winner, ranked by implied value. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; fit: LogLogFit; validation: Validation } {
  const comps = compSet(snapshot.protocols);
  const fit = fitLogLog(comps, model);
  const validation = crossValidate(comps, model);
  const priceBase = fitPricer(validation.winner, comps, model);
  const chosen = boardProtocols(snapshot);
  const ranges = bootstrapRankRanges(chosen, comps, snapshot.as_of, validation.winner, model);
  const scored = chosen.map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, priceBase, fit, model);
    const econ = farmEconomics(p, implied, breakdown.age_days, model);
    return { p, implied, breakdown, econ };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watchlist = new Set(snapshot.watchlist);
  const board: BoardRow[] = scored.map((s, i) => {
    const range = ranges.get(s.p.slug) ?? { lo: i + 1, hi: i + 1 };
    return {
      rank: i + 1,
      rank_lo: range.lo,
      rank_hi: range.hi,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      on_watchlist: watchlist.has(s.p.slug),
      age_days: s.breakdown.age_days,
      implied_value_usd: s.implied,
      model: s.breakdown,
      farm: s.econ,
      farm_steps: farmSteps(s.p, s.econ).map(stepText),
    };
  });
  return { board, fit, validation };
}

/** The live-token comps, by market cap, for the dashboard's comparison table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return compSet(snapshot.protocols)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      mcap_tvl: round4((p.mcap_usd as number) / p.tvl_usd),
    }));
}

/** One row per category that has live comps, for the dashboard's model panel. */
export function compRows(snapshot: Snapshot, fit: LogLogFit): CompRow[] {
  const byCategory = new Map<string, number[]>();
  for (const p of compSet(snapshot.protocols)) {
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push((p.mcap_usd as number) / p.tvl_usd);
    byCategory.set(key, list);
  }
  const rows: CompRow[] = [];
  for (const [category, ratios] of byCategory) {
    rows.push({
      category,
      sample: ratios.length,
      offset_dex: round4(fit.offsets.get(category) ?? 0),
      median_mcap_tvl: round4(median(ratios)),
    });
  }
  rows.sort((a, b) => b.sample - a.sample || (a.category < b.category ? -1 : 1));
  return rows;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, fit, validation } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.farm.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit: { alpha: round4(fit.alpha), beta: round4(fit.beta), pooled_median_error_x: validation.candidates.find((c) => c.name === 'pooled log-log')?.median_error_x ?? 0 },
    validation,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    verdict_counts: verdictCounts,
    rows: board,
    live,
    comps: compRows(snapshot, fit),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 the gate needs`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (/\s/.test(r.slug)) return `${r.slug} carries whitespace`;
    if (r.rank_lo < 1 || r.rank_hi > board.length || r.rank_lo > r.rank_hi) return `${r.slug} has a rank range of ${r.rank_lo}–${r.rank_hi}`;
  }
  return null;
}

/** The dashboard's dataset as one script: window.RADAR, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
