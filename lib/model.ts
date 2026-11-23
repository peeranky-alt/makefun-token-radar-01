// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks launch candidates only: protocols that record no token and are not a wrapped,
// staked, bridged or exchange product of a token that already trades. That is the snapshot's own
// watchlist rule, applied to every row, not just the watchlist: a bridge's TVL is other chains'
// money passing through, and a staked product's TVL is a token that already trades in another
// form, so neither is a launch waiting to happen. The board covers the whole watchlist (the
// floor) plus every launch candidate below it.
//
// Implied value follows only from the snapshot's own figures, and the multiple is earned from
// them, not picked: for each category, the median market-cap-to-TVL ratio of the live-token
// protocols in that category (at least three of them), clamped to [0.05, 1.5]; a category with
// fewer live comparables falls back to the global median across all live-token protocols.
// A protocol's TVL is then multiplied by its category's multiple, by a growth factor from its
// seven-day TVL change, and by a maturity factor from how long it has run with no token:
//
//   implied = round(tvl_usd x category_multiple x growthMult x maturityMult)
//   growthMult   = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: 365 days)
//
// No protocol name is ever special-cased: the same function scores every row, and the multiples
// are computed from the snapshot at run time, so the board re-derives itself on any snapshot.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_category_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_category_comps: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's valuation multiple, earned from its live-token comparables. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comps: number;
  source: 'category' | 'global';
}

/** The multiples table the model derives from the snapshot, and the global fallback. */
export interface MultiplesTable {
  global_multiple: number;
  global_comps: number;
  by_category: CategoryMultiple[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** What one farm plan costs in gas and hands-on time, from the same numbers
 *  the steps state: $3 of gas for the first transaction, $4 of gas to set the
 *  position up ($8 when the capital is $150 or more), $2 of gas a week for the
 *  weekly action, and 5 + 15 + 10 + 5 minutes of hands-on time plus 10 minutes
 *  a week. The capital itself is not a cost: it stays in the position and
 *  comes back on withdrawal, so only gas is charged against the hours. */
export interface FarmCost {
  total_gas_usd: number;
  total_hours: number;
  per_hour_usd: number;
}

/** One farm plan's cost in dollars per hour of hands-on time. */
export function farmCost(p: SnapshotProtocol, age: number | null): FarmCost {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const totalGas = 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
  const totalHours = (5 + 15 + 10 + 5 + 10 * weeks) / 60;
  return {
    total_gas_usd: totalGas,
    total_hours: Math.round(totalHours * 100) / 100,
    per_hour_usd: Math.round((totalGas / totalHours) * 100) / 100,
  };
}

/** One row of board.json: the ranked board's row. */
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
  age_days: number | null;
  implied_value_usd: number;
  /** The fitted chance this protocol launches a token in the next 12 months. */
  launch_odds_12m: number;
  /** What its farm plan costs in gas per hour of hands-on time. */
  farm_cost_per_hour_usd: number;
  /** The farm plan's total gas in dollars, and its total hands-on hours. */
  farm_gas_usd: number;
  farm_hours: number;
  model: {
    multiple: number;
    multiple_source: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  multiple_source: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  launch_odds_12m: number;
  farm_cost_per_hour_usd: number;
  farm_gas_usd: number;
  farm_hours: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  multiples: MultiplesTable;
  rows: RadarRow[];
  live: LiveRow[];
  /** The program's self-check, computed from the same snapshot: coverage,
   *  exclusions, the held-out validation and the launch-odds fit. */
  self_check: SelfCheck;
}

/** One held-out check of the valuation model: the model predicts the market
 *  cap of live-token protocols from their TVL and is compared with the market
 *  cap they actually trade at. The median ratio says whether the model is
 *  biased; the typical factor says how far a prediction usually lands; the
 *  within-2x share is the fraction of predictions inside a factor of two. */
export interface ValidationMetrics {
  n: number;
  median_ratio: number;
  typical_factor: number;
  within_2x: number;
}

/** The model's held-out validation: leave-one-out and walk-forward. */
export interface ModelValidation {
  loo: ValidationMetrics;
  walk_forward: ValidationMetrics;
  note: string;
}

/** The launch-odds fit: a current-status survival model on the protocols the
 *  board's universe covers. Live-token protocols are launches that happened
 *  by their age; pre-token candidates are protocols that have not launched by
 *  theirs. The hazard falls with age on a one-year scale — a modelling choice,
 *  since one snapshot cannot identify the decay — and its level is fitted to
 *  the snapshot by maximum likelihood. */
export interface OddsFit {
  h0_per_day: number;
  tau_days: number;
  h_inf_per_day: number;
  log_likelihood: number;
  n_live: number;
  n_pre: number;
  ever_launch: number;
}

/** The integrity strip: what the program checked about its own run, from the
 *  same snapshot, so the dashboard cover states it instead of asserting it. */
export interface SelfCheck {
  snapshot_as_of: string;
  protocols_in_snapshot: number;
  board_rows: number;
  watchlist_covered: number;
  watchlist_size: number;
  live_set_aside: number;
  excluded_pre_token: number;
  categories_with_multiples: number;
  global_multiple: number;
  validation: ModelValidation;
  odds: OddsFit;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The valuation multiples, derived from a list of protocols: for every
 * category, the median market-cap-to-TVL ratio of its live-token protocols,
 * when at least three of them trade; otherwise the global median across all
 * live-token protocols. Both are clamped to the model's multiple band, so no
 * category's thin comparables can stretch a value past sense. The snapshot
 * version takes the snapshot's own protocols; the validation below reuses this
 * on smaller pools (leave-one-out, walk-forward) so the checks score the
 * same multiple the board uses.
 */
export function multiplesFrom(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): MultiplesTable {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (isPreToken(p) || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const list = byCategory.get(p.category ?? 'Other') ?? [];
    list.push(ratio);
    byCategory.set(p.category ?? 'Other', list);
  }
  const clamp = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const rows: CategoryMultiple[] = [];
  for (const category of [...byCategory.keys()].sort()) {
    const comps = byCategory.get(category)!;
    if (comps.length >= model.min_category_comps) {
      rows.push({ category, multiple: round4(clamp(median(comps))), comps: comps.length, source: 'category' });
    }
  }
  return { global_multiple: round4(global), global_comps: all.length, by_category: rows };
}

/** The multiples the snapshot itself earns. */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): MultiplesTable {
  return multiplesFrom(snapshot.protocols, model);
}

/** The multiple one category earns: its own median when it has enough comparables, else global. */
export function multipleFor(category: string | null, table: MultiplesTable, model: ModelConstants = MODEL): { multiple: number; source: string; comps: number } {
  const hit = table.by_category.find((r) => r.category === (category ?? 'Other'));
  if (hit !== undefined) {
    return { multiple: hit.multiple, source: `${hit.category} median`, comps: hit.comps };
  }
  return { multiple: table.global_multiple, source: 'global median', comps: table.global_comps };
}

/** The live-token protocols the multiples are earned from: live, not an
 *  exchange, with a positive market cap and TVL and a positive ratio. The
 *  validation scores the model on these same protocols, since they are the
 *  only ones whose market cap is a fact to check a prediction against. */
export function comparableProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => {
    if (isPreToken(p) || p.category === 'CEX') return false;
    if (p.mcap_usd === null || p.tvl_usd <= 0) return false;
    const ratio = p.mcap_usd / p.tvl_usd;
    return Number.isFinite(ratio) && ratio > 0;
  });
}

/** One held-out check's numbers out of its log prediction errors. */
function metricsFrom(logRatios: number[]): ValidationMetrics {
  const sorted = logRatios.slice().sort((a, b) => a - b);
  const abs = logRatios.map((x) => Math.abs(x)).sort((a, b) => a - b);
  const within = logRatios.filter((x) => Math.abs(x) < Math.log(2)).length;
  return {
    n: logRatios.length,
    median_ratio: round4(Math.exp(median(sorted))),
    typical_factor: round4(Math.exp(median(abs))),
    within_2x: logRatios.length > 0 ? Math.round((within / logRatios.length) * 1e4) / 1e4 : 0,
  };
}

/**
 * The model's held-out validation, computed from the snapshot at run time.
 * Leave-one-out predicts each live-token protocol from multiples earned
 * without it, so no protocol ever scores itself. Walk-forward predicts each
 * live-token protocol from multiples earned only from protocols listed
 * before it — the multiples the model would have had at that protocol's
 * listing date. The protocol's own seven-day growth and age are the
 * snapshot's in both, since the snapshot carries no history; only the
 * comparables window walks forward.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): ModelValidation {
  const comps = comparableProtocols(snapshot);
  const looLogs: number[] = [];
  for (const p of comps) {
    const pool = comps.filter((q) => q.slug !== p.slug);
    const table = multiplesFrom(pool, model);
    const v = impliedValue(p, snapshot.as_of, table, model);
    looLogs.push(Math.log(v.implied / (p.mcap_usd as number)));
  }
  const ordered = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) =>
      (a.listed_at as string) < (b.listed_at as string) ? -1
      : (a.listed_at as string) > (b.listed_at as string) ? 1
      : a.slug < b.slug ? -1 : 1,
    );
  const wfLogs: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const pool = ordered.slice(0, i);
    if (pool.length < 3) continue;
    const table = multiplesFrom(pool, model);
    const v = impliedValue(ordered[i]!, snapshot.as_of, table, model);
    wfLogs.push(Math.log(v.implied / (ordered[i]!.mcap_usd as number)));
  }
  return {
    loo: metricsFrom(looLogs),
    walk_forward: metricsFrom(wfLogs),
    note: 'Leave-one-out predicts each live-token protocol from multiples earned without it. Walk-forward predicts each live-token protocol from multiples earned only from protocols listed before it; the protocol’s own seven-day growth and age are the snapshot’s, since the snapshot carries no history. Both compare the prediction with the market cap the protocol actually trades at.',
  };
}

/** The survival curve of the launch-odds fit: the share of protocols still
 *  tokenless at a given age under a hazard that falls with a one-year scale. */
function oddsSurvival(a: number, h0: number, tau: number, hInf: number): number {
  return Math.exp(-hInf * a - h0 * tau * (1 - Math.exp(-a / tau)));
}

/** The launch-odds decay scale in days: one year, a modelling choice. A
 *  single snapshot cannot identify the decay — listing cohorts launched
 *  tokens at different rates — so the scale is set and the level is fitted. */
export const ODDS_TAU_DAYS = 365;

/**
 * The launch-odds fit, by maximum likelihood on the snapshot: live-token
 * protocols in the board's universe count as launches that happened by their
 * age, pre-token launch candidates as protocols that have not launched by
 * theirs. The hazard is h0 · exp(-age / 365) plus a fitted floor; the grid
 * is fixed, so the same snapshot always fits the same numbers.
 */
export function fitLaunchOdds(snapshot: Snapshot): OddsFit {
  const liveAges: number[] = [];
  const preAges: number[] = [];
  for (const p of comparableProtocols(snapshot)) {
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) continue;
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a !== null) liveAges.push(a);
  }
  for (const p of snapshot.protocols) {
    if (!isLaunchCandidate(p)) continue;
    const a = ageDays(snapshot.as_of, p.listed_at);
    if (a !== null) preAges.push(a);
  }
  const logLik = (h0: number, hInf: number): number => {
    let ll = 0;
    for (const a of liveAges) ll += Math.log(Math.max(1 - oddsSurvival(a, h0, ODDS_TAU_DAYS, hInf), 1e-12));
    for (const a of preAges) ll += Math.log(Math.max(oddsSurvival(a, h0, ODDS_TAU_DAYS, hInf), 1e-12));
    return ll;
  };
  let best: OddsFit | null = null;
  for (let hi = 1; hi <= 100; hi++) {
    const h0 = hi * 0.0001;
    for (const hInf of [0, 0.002, 0.005, 0.01, 0.02]) {
      const ll = logLik(h0, hInf);
      if (best === null || ll > best.log_likelihood) {
        best = {
          h0_per_day: h0,
          tau_days: ODDS_TAU_DAYS,
          h_inf_per_day: hInf,
          log_likelihood: Math.round(ll * 100) / 100,
          n_live: liveAges.length,
          n_pre: preAges.length,
          ever_launch: 0,
        };
      }
    }
  }
  const fit = best as OddsFit;
  fit.ever_launch = Math.round((1 - oddsSurvival(3650, fit.h0_per_day, fit.tau_days, fit.h_inf_per_day)) * 1e4) / 1e4;
  return fit;
}

/** The chance a protocol of `age` days launches a token in the next 12
 *  months, from the fitted survival curve. Unknown age scores as one year,
 *  the same fallback the valuation model uses. The curve falls with age by
 *  construction: the hazard decays, so an older protocol that has not
 *  launched yet is less likely to launch next year than a young one. */
export function launchOdds12m(age: number | null, fit: OddsFit): number {
  const a = age ?? MODEL.unknown_age_days;
  const odds = 1 - oddsSurvival(a + 365, fit.h0_per_day, fit.tau_days, fit.h_inf_per_day) / oddsSurvival(a, fit.h0_per_day, fit.tau_days, fit.h_inf_per_day);
  return Math.min(1, Math.max(0, Math.round(odds * 1e4) / 1e4));
}

/** The three factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  table: MultiplesTable,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; multipleSource: string; multipleComps: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const { multiple, source, comps } = multipleFor(protocol.category, table, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, multiple, multipleSource: source, multipleComps: comps, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name carrying a whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Categories the watchlist rule sets aside: bridges, liquid staking, restaked products, exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a launch candidate: pre-token, and not a wrapped, staked, bridged or
 * exchange product of a token that already trades. This is the snapshot's own watchlist rule,
 * applied to every row the board ranks. Any category naming a bridge counts as a bridge.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && (EXCLUDED_CATEGORIES.has(p.category) || p.category.toLowerCase().includes('bridge'))) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, oddsFit: OddsFit | null = null): BoardRow[] {
  const table = categoryMultiples(snapshot, model);
  const fit = oddsFit ?? fitLaunchOdds(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every launch candidate the watchlist leaves out, whatever its TVL. The
  // watchlist is a floor, never a ceiling, and the biggest finds sit above it: a protocol with
  // billions in TVL and no token on record is the radar's whole point, and the starter's
  // below-the-floor-only early radar misses all nineteen of them. Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isLaunchCandidate(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, table, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const cost = farmCost(s.p, s.age);
    return {
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
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      launch_odds_12m: launchOdds12m(s.age, fit),
      farm_cost_per_hour_usd: cost.per_hour_usd,
      farm_gas_usd: cost.total_gas_usd,
      farm_hours: cost.total_hours,
      model: {
        multiple: s.multiple,
        multiple_source: `${s.multipleSource}, ${s.multipleComps} live tokens`,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
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

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index token on ${chain} and hold it.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name}'s governance vault on ${chain} and vote once.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: the same position, used, not left idle. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow a small amount against the deposit once, then repay it, so the position shows both sides of the market.';
  if (c.includes('dex') || c.includes('leveraged farm')) return 'Swap a small amount through the pool each week so the wallet shows trading activity as well as liquidity.';
  if (c.includes('yield') || c.includes('farm')) return 'Claim the vault yield once a week and restake it, so the position compounds on the record.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Open and close one small hedge each month so the position reads as active, not idle.';
  if (c.includes('prediction')) return 'Settle one small market position each month and keep the receipts.';
  if (c.includes('curator') || c.includes('allocator')) return 'Check the vault allocation report each month and note any strategy change in the farm log.';
  if (c.includes('stable')) return 'Mint or redeem a small amount each month so the wallet shows both directions.';
  if (c.includes('rwa')) return 'Check the yield accrual each month and record the payout in the farm log.';
  if (c.includes('basis')) return 'Check the funding rate each week and note whether the vault is long or short.';
  return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list
 * of names. The first and last steps are the same for every protocol on purpose: a fresh wallet
 * and a written log are what keep a farm auditable and its funds separate.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Never connect a wallet to a claim link from a post or a DM.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    launch_odds_12m: row.launch_odds_12m,
    farm_cost_per_hour_usd: row.farm_cost_per_hour_usd,
    farm_gas_usd: row.farm_gas_usd,
    farm_hours: row.farm_hours,
    on_watchlist: onWatchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitLaunchOdds(snapshot);
  const board = buildBoard(snapshot, model, fit);
  const live = liveRows(snapshot);
  const table = categoryMultiples(snapshot, model);
  const validation = validateModel(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const watchlistCovered = board.filter((r) => watchlist.has(r.slug)).length;
  const excludedPreToken = snapshot.protocols.filter((p) => isPreToken(p) && !isLaunchCandidate(p)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    multiples: table,
    rows: board.map((r) => radarRow(r, watchlist.has(r.slug))),
    live,
    self_check: {
      snapshot_as_of: snapshot.as_of,
      protocols_in_snapshot: snapshot.protocols.length,
      board_rows: board.length,
      watchlist_covered: watchlistCovered,
      watchlist_size: snapshot.watchlist.length,
      live_set_aside: live.length,
      excluded_pre_token: excludedPreToken,
      categories_with_multiples: table.by_category.length,
      global_multiple: table.global_multiple,
      validation,
      odds: fit,
    },
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
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
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
