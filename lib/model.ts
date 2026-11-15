// Token Radar: what a protocol's token would be worth if its record stayed as it is.
//
// The snapshot is DefiLlama's record of 758 protocols at or above $5M TVL, sealed on one day.
// This model scores only protocols that record no token (no market cap, no CoinGecko id, no
// symbol). Protocols whose token already trades are never ranked: they are the comparison set
// the model is priced from, and the dashboard shows them apart as live-token comps.
//
// The implied value of a pre-token protocol, in four factors, all from the snapshot:
//
//   comp multiple  the median market-cap/TVL ratio of live-token protocols in the same
//                  category, shrunk toward the whole market's median with a pseudo-count
//                  of 3 — a thin category leans on the market, a deep one stands on its
//                  own — clamped to [0.05, 1.50]. A category with no live comps prices at
//                  the market median outright.
//   growth         1 + 0.6 x clamp(change_7d, -50, +100) / 100
//   maturity       0.70 + 0.30 x min(age_days, 1095) / 1095 (age unknown: 365 days)
//   breadth        1 + 0.03 x min(chains - 1, 4), at most 1.12
//
//   implied_value_usd = round(tvl_usd x comp x growth x maturity x breadth), at least $1
//
// No protocol name is ever special-cased: the same function scores every row, and the
// category medians are recomputed from the snapshot on every run. The board covers the
// whole watchlist (the floor) plus every other rankable pre-token protocol below it, so
// the radar finds the early ones too. Farm plans are derived from each protocol's own
// category, chains, TVL and age, and cover both sides of a launch: what to do before a
// token exists, and what to do after one issues.

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
  comp_min_sample: number;
  comp_shrink: number;
  comp_floor: number;
  comp_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  comp_min_sample: 3,
  comp_shrink: 3,
  comp_floor: 0.05,
  comp_cap: 1.5,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.03,
  breadth_max_chains: 4,
};

export const MODEL_VERSION = 'radar-2-comps';

/** How many live-token protocols the dashboard's comps table carries, by market cap. */
export const LIVE_ROWS = 24;

/** The model breakdown one board row carries, so the dashboard can show its working. */
export interface ModelBreakdown {
  comp_multiple: number;
  comp_sample: number;
  comp_source: 'category' | 'blended' | 'market';
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
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

/** One category's comp multiple, for the dashboard's model panel. */
export interface CompRow {
  category: string;
  sample: number;
  median_mcap_tvl: number;
  multiple_used: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  market_median_mcap_tvl: number;
  market_comp_sample: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

/** The median of a sorted array of numbers. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
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

/**
 * The comparison set: every live-token protocol's market-cap/TVL ratio, grouped by category,
 * plus the whole market's median. Medians, not means, so one outlier cannot move a category.
 */
export interface CompTable {
  byCategory: Map<string, { median: number; sample: number }>;
  marketMedian: number;
  marketSample: number;
}

export function buildCompTable(protocols: SnapshotProtocol[]): CompTable {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (isPreToken(p) || p.category === 'CEX') continue;
    const mcap = p.mcap_usd;
    if (mcap === null || mcap <= 0 || p.tvl_usd <= 0) continue;
    const ratio = mcap / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  all.sort((a, b) => a - b);
  const table = new Map<string, { median: number; sample: number }>();
  for (const [cat, ratios] of byCategory) {
    ratios.sort((a, b) => a - b);
    table.set(cat, { median: median(ratios), sample: ratios.length });
  }
  return { byCategory: table, marketMedian: median(all), marketSample: all.length };
}

/**
 * The comp multiple one protocol is priced at: its category's median mcap/TVL, shrunk
 * toward the market median with a pseudo-count of comp_shrink — (n x category median +
 * k x market median) / (n + k) — so one thin category's odd comp cannot set the price,
 * while a deep category's median barely moves. A category with no live comps prices at
 * the market median. Always clamped, so no sample can explode a value.
 */
export function compMultiple(p: SnapshotProtocol, table: CompTable, model: ModelConstants): { multiple: number; sample: number; source: 'category' | 'blended' | 'market' } {
  const entry = p.category === null ? undefined : table.byCategory.get(p.category);
  let multiple: number;
  let sample: number;
  let source: 'category' | 'blended' | 'market';
  if (entry === undefined || entry.sample === 0) {
    multiple = table.marketMedian;
    sample = table.marketSample;
    source = 'market';
  } else {
    const k = model.comp_shrink;
    multiple = (entry.sample * entry.median + k * table.marketMedian) / (entry.sample + k);
    sample = entry.sample;
    source = entry.sample >= model.comp_min_sample ? 'category' : 'blended';
  }
  multiple = Math.min(model.comp_cap, Math.max(model.comp_floor, multiple));
  return { multiple, sample, source };
}

/** The four factors and the implied value one protocol gets. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  table: CompTable,
  model: ModelConstants,
): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, p.listed_at);
  const comp = compMultiple(p, table, model);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_chains);
  const implied = Math.max(1, Math.round(p.tvl_usd * comp.multiple * growthMult * maturityMult * breadthMult));
  return {
    implied,
    breakdown: {
      comp_multiple: round4(comp.multiple),
      comp_sample: comp.sample,
      comp_source: comp.source,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      breadth_multiplier: round4(breadthMult),
      age_days: age,
    },
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

/** The category's one core action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the position open so it counts in snapshots`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s busiest pool on ${chain} and keep the position open`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and hold the receipt tokens`;
  if (c.includes('leveraged farm')) return `Open a $${capital} leveraged farming position on ${name} on ${chain} at the lowest leverage offered`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds inside its app`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position`;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on a ${name} market, then hold it to settlement`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares in one wallet`;
  if (c.includes('stablecoin') || c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it in one wallet`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active`;
  if (c.includes('payments')) return `Route $${capital} of payments through ${name} on ${chain} across at least two separate weeks`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s incentive pool on ${chain} and vote in its next round`;
  if (c.includes('chain')) return `Bridge $${capital} onto ${name}'s chain and use its native app at least once a week`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and hold the position through one funding cycle`;
  if (c.includes('privacy')) return `Deposit $${capital} through ${name}'s shielded pool on ${chain} and keep the notes safe offline`;
  if (c.includes('indexes')) return `Buy $${capital} of the ${name} index on ${chain} and hold it in one wallet`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record. Steps 1-4 farm it before any token exists; step 5 is the launch day
 * itself; step 6 is what to do after the token issues.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Set up one fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as a deposit, a swap, a borrow or a vote, so the wallet shows repeat activity`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `When ${p.name} announces a token, claim only from the link its own official page publishes, and never pay anyone to claim for you`,
      cost: "the claim's gas only, usually under $5",
      time: '15 minutes on launch day',
    },
    {
      text: `After the token issues, stake or provide liquidity with part of the claim instead of selling it all at once, and keep the farm position open for later seasons`,
      cost: 'about $5 of gas to stake or add liquidity',
      time: '20 minutes, then 10 minutes a week',
    },
  ];
}

/** The board: every watchlist slug, plus every other rankable pre-token protocol below the floor, by implied value. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const table = buildCompTable(snapshot.protocols);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = new Set(snapshot.watchlist);
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
  const scored = [...chosen.values()].map((p) => {
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, table, model);
    return { p, implied, breakdown };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
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
    farm_steps: farmSteps(s.p, s.breakdown.age_days).map(stepText),
  }));
}

/** The live-token comps, by market cap, for the dashboard's comparison table. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
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
export function compRows(table: CompTable, model: ModelConstants): CompRow[] {
  const rows: CompRow[] = [];
  for (const [category, entry] of table.byCategory) {
    const k = model.comp_shrink;
    const used = (entry.sample * entry.median + k * table.marketMedian) / (entry.sample + k);
    rows.push({
      category,
      sample: entry.sample,
      median_mcap_tvl: round4(entry.median),
      multiple_used: round4(Math.min(model.comp_cap, Math.max(model.comp_floor, used))),
    });
  }
  rows.sort((a, b) => b.sample - a.sample || (a.category < b.category ? -1 : 1));
  return rows;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const table = buildCompTable(snapshot.protocols);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    market_median_mcap_tvl: round4(table.marketMedian),
    market_comp_sample: table.marketSample,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board,
    live,
    comps: compRows(table, model),
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
  }
  return null;
}

/** The dashboard's dataset as one script: window.RADAR, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
