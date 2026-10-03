import type { Pool } from '../../db/pool.js';
import {
  fmtMoney,
  fmtOrNull,
  fmtQty,
  fmtShare,
  fmtUnitPrice,
  fromDb,
  parseDecimal,
  round2,
  safeDiv,
  SCALE,
  sum,
  ZERO,
  type Dec,
} from '../../shared/decimal.js';
import { badRequest, notFound } from '../../shared/errors.js';
import { DEFAULT_LIMIT } from '../../shared/schemas.js';
import {
  addDays,
  logicalDate,
  logicalDayStart,
  logicalMonthRange,
  logicalRange,
  isValidIsoDate,
  parseInstant,
  periodOf,
  periodsBetween,
  toDbDateTime,
  toIso,
  toIsoOrNull,
  type Clock,
  type GroupBy,
} from '../../shared/time.js';
import type { CatalogService } from '../catalog/service.js';
import type { SettingsService } from '../settings/service.js';
import * as repo from './repository.js';
import type { Owner } from '../../shared/owner.js';

// ---------------------------------------------------------------------------------------------
// Pure calculations (exported for unit tests)
// ---------------------------------------------------------------------------------------------

type BatchLike = Pick<
  repo.BatchStatRow,
  'id' | 'quantity' | 'total_price' | 'deactivated_at' | 'deactivated_by_consumption_id'
>;
type ConsumptionLike = Pick<repo.ConsumptionStatRow, 'id' | 'batch_id' | 'quantity'>;

/** remaining = quantity − Σ consumptions + Σ adjustments (non-deleted). */
export function remainingOf(b: Pick<repo.BatchStatRow, 'quantity' | 'consumed' | 'adjusted'>): Dec {
  return fromDb(b.quantity).minus(fromDb(b.consumed)).plus(fromDb(b.adjusted));
}

/** total_price ÷ quantity, full precision (40 significant digits). */
export function unitPriceOf(b: Pick<repo.BatchStatRow, 'quantity' | 'total_price'>): Dec {
  return safeDiv(fromDb(b.total_price), fromDb(b.quantity));
}

/**
 * Cost of every consumption of the given batches.
 * - normal consumption: round2(quantity × unitPrice);
 * - the consumption that deactivated the batch: round2(unitPrice × total consumed) − Σ the
 *   other costs, so a finished batch's costs add up exactly to what was paid.
 * `consumptions` must hold every non-deleted consumption of those batches.
 */
export function consumptionCosts(batches: BatchLike[], consumptions: ConsumptionLike[]): Map<number, Dec> {
  const byBatch = new Map<number, ConsumptionLike[]>();
  for (const c of consumptions) {
    const list = byBatch.get(c.batch_id);
    if (list) list.push(c);
    else byBatch.set(c.batch_id, [c]);
  }
  const costs = new Map<number, Dec>();
  for (const b of batches) {
    const list = byBatch.get(b.id) ?? [];
    const unitPrice = unitPriceOf(b);
    const closingId = b.deactivated_at ? b.deactivated_by_consumption_id : null;
    let othersTotal = ZERO;
    let consumedTotal = ZERO;
    let closing: ConsumptionLike | null = null;
    for (const c of list) {
      const qty = fromDb(c.quantity);
      consumedTotal = consumedTotal.plus(qty);
      if (c.id === closingId) {
        closing = c;
        continue;
      }
      const cost = round2(qty.times(unitPrice));
      othersTotal = othersTotal.plus(cost);
      costs.set(c.id, cost);
    }
    if (closing) costs.set(closing.id, round2(unitPrice.times(consumedTotal)).minus(othersTotal));
  }
  return costs;
}

export interface PerConsumptionStats {
  count: number;
  avgQuantityPerConsumption: string | null;
  minConsumption: string | null;
  maxConsumption: string | null;
  /** Average cost of one consumption. */
  avgPricePerConsumption: string | null;
}

export function perConsumptionStats(items: Array<{ quantity: Dec; cost: Dec }>): PerConsumptionStats {
  if (items.length === 0) {
    return {
      count: 0,
      avgQuantityPerConsumption: null,
      minConsumption: null,
      maxConsumption: null,
      avgPricePerConsumption: null,
    };
  }
  let min = items[0]!.quantity;
  let max = items[0]!.quantity;
  for (const i of items) {
    if (i.quantity.lt(min)) min = i.quantity;
    if (i.quantity.gt(max)) max = i.quantity;
  }
  const n = items.length;
  return {
    count: n,
    avgQuantityPerConsumption: fmtQty(sum(items.map((i) => i.quantity)).div(n)),
    minConsumption: fmtQty(min),
    maxConsumption: fmtQty(max),
    avgPricePerConsumption: fmtMoney(sum(items.map((i) => i.cost)).div(n)),
  };
}

/**
 * Highest stock ever reached: walk batches (+quantity), adjustments (±delta) and consumptions
 * (−quantity) in time order (ties: batches, then adjustments, then consumptions, then id).
 * One-time consumptions never touch stock. Never below 0.
 */
export function peakStock(
  batches: Array<Pick<repo.BatchStatRow, 'id' | 'quantity' | 'occurred_at'>>,
  consumptions: Array<Pick<repo.ConsumptionStatRow, 'id' | 'quantity' | 'occurred_at'>>,
  adjustments: Array<Pick<repo.AdjustmentStatRow, 'id' | 'delta' | 'occurred_at'>>,
): Dec {
  const events: Array<{ t: number; rank: number; id: number; delta: Dec }> = [
    ...batches.map((b) => ({ t: b.occurred_at.getTime(), rank: 0, id: b.id, delta: fromDb(b.quantity) })),
    ...adjustments.map((a) => ({ t: a.occurred_at.getTime(), rank: 1, id: a.id, delta: fromDb(a.delta) })),
    ...consumptions.map((c) => ({ t: c.occurred_at.getTime(), rank: 2, id: c.id, delta: fromDb(c.quantity).negated() })),
  ];
  events.sort((x, y) => x.t - y.t || x.rank - y.rank || x.id - y.id);
  let running = ZERO;
  let peak = ZERO;
  for (const e of events) {
    running = running.plus(e.delta);
    if (running.gt(peak)) peak = running;
  }
  return peak;
}

// ---------------------------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------------------------

export interface CardSummary {
  stock: string;
  stockBarMax: string;
  /** One segment per active batch, oldest first: what the card's stock bar draws. */
  stockBarSegments: { batchId: number; name: string | null; remaining: string; unitPrice: string }[];
  peakStock: string;
  /** The most recent batch, active or finished. */
  lastBatch: { id: number; name: string | null; occurredAt: string; totalPrice: string; unitPrice: string } | null;
  /** Average unit price of the stock: Σ(remaining × unit price) ÷ stock over the active batches. */
  avgUnitPrice: string | null;
  lastConsumption: { occurredAt: string; quantity: string; cost: string } | null;
  avgQuantityPerConsumption: string | null;
  avgPricePerConsumption: string | null;
  spendThisMonth: string;
}

export interface StockBarBatch {
  id: number;
  name: string | null;
  occurredAt: string;
  quantity: string;
  remaining: string;
  unitPrice: string;
  totalPrice: string;
  shareByQuantity: string;
  shareByValue: string;
  note: string | null;
  deactivatedAt: string | null;
}

export interface StockBar {
  substanceId: number;
  stock: string;
  stockBarMax: string;
  batches: StockBarBatch[];
}

export interface StatsPoint {
  period: string;
  consumed: string;
  cost: string;
  spend: string;
}

/** One item of GET /api/consumptions: a batch or one-time consumption. */
export interface ConsumptionItem {
  type: 'consumption' | 'one_time';
  id: number;
  substanceId: number;
  substanceName: string;
  unit: string;
  /** null for a one-time consumption. */
  batchId: number | null;
  batchName: string | null;
  /** The one-time consumption's own name; null for a batch consumption. */
  name: string | null;
  occurredAt: string;
  quantity: string;
  /** Unit price of the consumption: its batch's, or price ÷ quantity for a one-time one. */
  unitPrice: string;
  cost: string;
  note: string | null;
  /**
   * (this − previous) ÷ previous; previous = the one before it of the same substance (never of
   * another one), or of the same batch when the list is one batch's. Null for the first.
   */
  deltaQuantity: string | null;
  /** Same on the unit price; also null after a unit price of 0. */
  deltaUnitPrice: string | null;
  /** Same on the cost, the price of the consumption; also null after a cost of 0. */
  deltaCost: string | null;
}

/** One item of GET /api/batches (the batch filter of the consumptions page). */
export interface BatchListItem {
  id: number;
  substanceId: number;
  substanceName: string;
  name: string | null;
  occurredAt: string;
  deactivatedAt: string | null;
}

/** GET /api/consumptions/bounds: the ends of the price (cost of a consumption) and quantity sliders. */
export interface ConsumptionBounds {
  minCost: string | null;
  maxCost: string | null;
  minQuantity: string | null;
  maxQuantity: string | null;
}

interface Ledger {
  batches: repo.BatchStatRow[];
  consumptions: repo.ConsumptionStatRow[];
  adjustments: repo.AdjustmentStatRow[];
  oneTimes: repo.OneTimeStatRow[];
}

function groupBySubstance<T extends { substance_id: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const list = map.get(r.substance_id);
    if (list) list.push(r);
    else map.set(r.substance_id, [r]);
  }
  return map;
}

function inRange(date: Date, range: { start: Date; end: Date }): boolean {
  const t = date.getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** Newest first: occurred_at, then created_at, then id. */
function newestFirst(
  a: { occurred_at: Date; created_at: Date; id: number },
  b: { occurred_at: Date; created_at: Date; id: number },
): number {
  return (
    b.occurred_at.getTime() - a.occurred_at.getTime() ||
    b.created_at.getTime() - a.created_at.getTime() ||
    b.id - a.id
  );
}

export interface Page {
  limit?: number | undefined;
  before?: string | undefined;
}

function pageLimit(page: Page): number {
  return page.limit ?? DEFAULT_LIMIT;
}

/**
 * The first `limit` rows of a newest-first list, plus every later row with the same
 * occurred_at as the last one: a page never splits an instant, so the next page's
 * `before=<last occurredAt>` loses nothing.
 */
function withTies<T extends { occurred_at: Date }>(sorted: T[], limit: number): T[] {
  let end = Math.min(limit, sorted.length);
  const last = sorted[end - 1];
  while (last && end < sorted.length && sorted[end]!.occurred_at.getTime() === last.occurred_at.getTime()) end++;
  return sorted.slice(0, end);
}

function pageBefore(page: Page): Date | null {
  return page.before === undefined ? null : parseInstant(page.before, 'before');
}

/** Which consumptions: of a substance, of a batch (no one-time ones), in logical days (inclusive). */
export interface ConsumptionScope {
  substanceId?: number | undefined;
  batchId?: number | undefined;
  from?: string | undefined;
  to?: string | undefined;
  /** Only the one-time consumptions; never with a batch. */
  oneTime?: boolean | undefined;
}

/** The scope, plus inclusive ranges on the cost of the consumption and on its quantity (decimal strings). */
export interface ConsumptionFilter extends ConsumptionScope {
  minCost?: string | undefined;
  maxCost?: string | undefined;
  minQuantity?: string | undefined;
  maxQuantity?: string | undefined;
}

interface DecimalRange {
  min: Dec | null;
  max: Dec | null;
}

/** An optional min..max pair of non-negative decimals; 400 when min > max. */
function decimalRange(
  minRaw: string | undefined,
  maxRaw: string | undefined,
  minField: string,
  maxField: string,
): DecimalRange {
  const min = minRaw === undefined ? null : parseDecimal(minRaw, { field: minField, gte: 0 });
  const max = maxRaw === undefined ? null : parseDecimal(maxRaw, { field: maxField, gte: 0 });
  if (min && max && min.gt(max)) throw badRequest(`${minField} must not be greater than ${maxField}`, minField);
  return { min, max };
}

function within(value: Dec, range: DecimalRange): boolean {
  return (range.min === null || value.gte(range.min)) && (range.max === null || value.lte(range.max));
}

const lowest = (values: Dec[]): Dec => values.reduce((a, b) => (b.lt(a) ? b : a));
const highest = (values: Dec[]): Dec => values.reduce((a, b) => (b.gt(a) ? b : a));

/** A consumption of either kind, with the numbers the consumptions list shows. */
export interface ConsumptionEntry {
  type: 'consumption' | 'one_time';
  id: number;
  substance_id: number;
  batch_id: number | null;
  batch_name: string | null;
  name: string | null;
  occurred_at: Date;
  created_at: Date;
  quantity: Dec;
  unitPrice: Dec;
  cost: Dec;
  note: string | null;
  deltaQuantity: Dec | null;
  deltaUnitPrice: Dec | null;
  deltaCost: Dec | null;
}

const KIND_RANK = { consumption: 0, one_time: 1 } as const;

/** Oldest first: occurred_at, then created_at, then kind (ids of two tables can tie), then id. */
function chronological(a: ConsumptionEntry, b: ConsumptionEntry): number {
  return (
    a.occurred_at.getTime() - b.occurred_at.getTime() ||
    a.created_at.getTime() - b.created_at.getTime() ||
    KIND_RANK[a.type] - KIND_RANK[b.type] ||
    a.id - b.id
  );
}

/**
 * The series a consumption is compared within, unless the list is one batch's (lenzi, 2026-09-30):
 * the consumptions of its substance, from whatever batch or one-time. Never those of another
 * substance. A one-time consumption has no batch, so this is always its series.
 */
export const ofItsSubstance = (e: ConsumptionEntry): number => e.substance_id;

/**
 * Gives every entry its deltas from the previous one of its series, (this − previous) ÷ previous:
 * on the quantity, on the unit price and on the cost. `entries` are oldest first; the first of a
 * series has none. Quantities are always > 0; a price can be 0 (a gift), and there is no ratio of 0.
 */
export function compareWithPrevious(entries: ConsumptionEntry[], seriesOf: (e: ConsumptionEntry) => number): void {
  const previousOf = new Map<number, ConsumptionEntry>();
  for (const e of entries) {
    const previous = previousOf.get(seriesOf(e));
    if (previous) {
      e.deltaQuantity = e.quantity.minus(previous.quantity).div(previous.quantity);
      e.deltaUnitPrice = previous.unitPrice.isZero() ? null : e.unitPrice.minus(previous.unitPrice).div(previous.unitPrice);
      e.deltaCost = previous.cost.isZero() ? null : e.cost.minus(previous.cost).div(previous.cost);
    }
    previousOf.set(seriesOf(e), e);
  }
}

/**
 * Every consumption of either kind, oldest first, with its unit price and its cost; the deltas are
 * set by whoever knows the series (`compareWithPrevious`). `consumptions` must hold every
 * non-deleted consumption of `batches` (the costs of a finished batch need them all).
 */
export function consumptionEntriesOf(
  batches: repo.BatchStatRow[],
  consumptions: repo.ConsumptionStatRow[],
  oneTimes: repo.OneTimeStatRow[],
): ConsumptionEntry[] {
  const costs = consumptionCosts(batches, consumptions);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const entries: ConsumptionEntry[] = [
    ...consumptions.map((c) => {
      const batch = batchById.get(c.batch_id)!;
      return {
        type: 'consumption' as const,
        id: c.id,
        substance_id: c.substance_id,
        batch_id: c.batch_id,
        batch_name: batch.name,
        name: null,
        occurred_at: c.occurred_at,
        created_at: c.created_at,
        quantity: fromDb(c.quantity),
        unitPrice: unitPriceOf(batch),
        cost: costs.get(c.id) ?? ZERO,
        note: c.note,
        deltaQuantity: null,
        deltaUnitPrice: null,
        deltaCost: null,
      };
    }),
    ...oneTimes.map((o) => {
      const quantity = fromDb(o.quantity);
      const price = fromDb(o.total_price);
      return {
        type: 'one_time' as const,
        id: o.id,
        substance_id: o.substance_id,
        batch_id: null,
        batch_name: null,
        name: o.name,
        occurred_at: o.occurred_at,
        created_at: o.created_at,
        quantity,
        unitPrice: safeDiv(price, quantity),
        cost: price,
        note: o.note,
        deltaQuantity: null,
        deltaUnitPrice: null,
        deltaCost: null,
      };
    }),
  ];
  return entries.sort(chronological);
}

/**
 * Reports: every derived number (stock, stock bar, shares, peak, costs, spend,
 * per-consumption statistics, time series). Read only.
 */
export class ReportsService {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  private async loadLedger(owner: Owner, scope: repo.LedgerScope): Promise<Ledger> {
    const [batches, consumptions, adjustments, oneTimes] = await Promise.all([
      repo.loadBatches(this.pool, owner, scope),
      repo.loadConsumptions(this.pool, owner, scope),
      repo.loadAdjustments(this.pool, owner, scope),
      scope.batchIds !== undefined
        ? Promise.resolve([])
        : repo.loadOneTimes(this.pool, owner, scope.substanceIds !== undefined ? { substanceIds: scope.substanceIds } : {}),
    ]);
    return { batches, consumptions, adjustments, oneTimes };
  }

  // -------------------------------------------------------------------------------------------
  // Card summaries (home cards, substance page)
  // -------------------------------------------------------------------------------------------

  async summaries(owner: Owner, substanceIds: number[]): Promise<Map<number, CardSummary>> {
    const result = new Map<number, CardSummary>();
    if (substanceIds.length === 0) return result;
    const settings = await this.settings.get(owner);
    const month = logicalMonthRange(this.clock(), settings);
    const ledger = await this.loadLedger(owner, { substanceIds });
    const costs = consumptionCosts(ledger.batches, ledger.consumptions);

    const batchesBy = groupBySubstance(ledger.batches);
    const consumptionsBy = groupBySubstance(ledger.consumptions);
    const adjustmentsBy = groupBySubstance(ledger.adjustments);
    const oneTimesBy = groupBySubstance(ledger.oneTimes);

    for (const id of substanceIds) {
      const batches = batchesBy.get(id) ?? [];
      const consumptions = consumptionsBy.get(id) ?? [];
      const adjustments = adjustmentsBy.get(id) ?? [];
      const oneTimes = oneTimesBy.get(id) ?? [];

      const active = batches.filter((b) => !b.deactivated_at);
      const stock = sum(active.map(remainingOf));
      const stockBarMax = sum(active.map((b) => fromDb(b.quantity)));
      const stockValue = sum(active.map((b) => remainingOf(b).times(unitPriceOf(b))));

      const lastBatchRow = [...batches].sort(newestFirst)[0];
      const items = [
        ...consumptions.map((c) => ({
          occurred_at: c.occurred_at,
          created_at: c.created_at,
          id: c.id,
          quantity: fromDb(c.quantity),
          cost: costs.get(c.id) ?? ZERO,
        })),
        ...oneTimes.map((o) => ({
          occurred_at: o.occurred_at,
          created_at: o.created_at,
          id: o.id,
          quantity: fromDb(o.quantity),
          cost: fromDb(o.total_price),
        })),
      ];
      const last = [...items].sort(newestFirst)[0];
      const stats = perConsumptionStats(items);
      const spend = sum([
        ...batches.filter((b) => inRange(b.occurred_at, month)).map((b) => fromDb(b.total_price)),
        ...oneTimes.filter((o) => inRange(o.occurred_at, month)).map((o) => fromDb(o.total_price)),
      ]);

      result.set(id, {
        stock: fmtQty(stock),
        stockBarMax: fmtQty(stockBarMax),
        stockBarSegments: active.map((b) => ({
          batchId: b.id,
          name: b.name,
          remaining: fmtQty(remainingOf(b)),
          unitPrice: fmtUnitPrice(unitPriceOf(b)),
        })),
        peakStock: fmtQty(peakStock(batches, consumptions, adjustments)),
        lastBatch: lastBatchRow
          ? {
              id: lastBatchRow.id,
              name: lastBatchRow.name,
              occurredAt: toIso(lastBatchRow.occurred_at),
              totalPrice: fmtMoney(fromDb(lastBatchRow.total_price)),
              unitPrice: fmtUnitPrice(unitPriceOf(lastBatchRow)),
            }
          : null,
        avgUnitPrice: stock.isZero() ? null : fmtUnitPrice(stockValue.div(stock)),
        lastConsumption: last
          ? { occurredAt: toIso(last.occurred_at), quantity: fmtQty(last.quantity), cost: fmtMoney(last.cost) }
          : null,
        avgQuantityPerConsumption: stats.avgQuantityPerConsumption,
        avgPricePerConsumption: stats.avgPricePerConsumption,
        spendThisMonth: fmtMoney(spend),
      });
    }
    return result;
  }

  async summary(owner: Owner, substanceId: number): Promise<CardSummary> {
    const map = await this.summaries(owner, [substanceId]);
    return map.get(substanceId) as CardSummary;
  }

  // -------------------------------------------------------------------------------------------
  // Stock bar and sub-cards
  // -------------------------------------------------------------------------------------------

  async stockBar(owner: Owner, substanceId: number, includeDeactivated: boolean): Promise<StockBar> {
    await this.catalog.get(owner, substanceId);
    const batches = await repo.loadBatches(this.pool, owner, { substanceIds: [substanceId] });
    const active = batches.filter((b) => !b.deactivated_at);
    const stock = sum(active.map(remainingOf));
    const stockBarMax = sum(active.map((b) => fromDb(b.quantity)));
    const totalValue = sum(active.map((b) => remainingOf(b).times(unitPriceOf(b))));

    const shown = includeDeactivated ? batches : active;
    return {
      substanceId,
      stock: fmtQty(stock),
      stockBarMax: fmtQty(stockBarMax),
      batches: shown.map((b) => {
        const isActive = !b.deactivated_at;
        const remaining = isActive ? remainingOf(b) : ZERO;
        const unitPrice = unitPriceOf(b);
        return {
          id: b.id,
          name: b.name,
          occurredAt: toIso(b.occurred_at),
          quantity: fmtQty(fromDb(b.quantity)),
          remaining: fmtQty(remainingOf(b)),
          unitPrice: fmtUnitPrice(unitPrice),
          totalPrice: fmtMoney(fromDb(b.total_price)),
          shareByQuantity: fmtShare(safeDiv(remaining, stock)),
          shareByValue: fmtShare(safeDiv(remaining.times(unitPrice), totalValue)),
          note: b.note,
          deactivatedAt: toIsoOrNull(b.deactivated_at),
        };
      }),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Batch list (every batch, for the batch filter)
  // -------------------------------------------------------------------------------------------

  async batchList(owner: Owner, filter: { substanceId?: number | undefined }): Promise<BatchListItem[]> {
    if (filter.substanceId !== undefined) await this.catalog.get(owner, filter.substanceId);
    const rows = await repo.listBatches(this.pool, owner, filter);
    return rows.map((b) => ({
      id: b.id,
      substanceId: b.substance_id,
      substanceName: b.substance_name,
      name: b.name,
      occurredAt: toIso(b.occurred_at),
      deactivatedAt: toIsoOrNull(b.deactivated_at),
    }));
  }

  // -------------------------------------------------------------------------------------------
  // Batch page
  // -------------------------------------------------------------------------------------------

  private async loadBatchLedger(owner: Owner, batchId: number): Promise<{ batch: repo.BatchStatRow; ledger: Ledger }> {
    const ledger = await this.loadLedger(owner, { batchIds: [batchId] });
    const batch = ledger.batches[0];
    if (!batch) throw notFound('Batch', batchId);
    return { batch, ledger };
  }

  async batchPage(owner: Owner, batchId: number) {
    const { batch, ledger } = await this.loadBatchLedger(owner, batchId);
    const costs = consumptionCosts([batch], ledger.consumptions);
    const stats = perConsumptionStats(
      ledger.consumptions.map((c) => ({ quantity: fromDb(c.quantity), cost: costs.get(c.id) ?? ZERO })),
    );
    const first = ledger.consumptions[0];
    return {
      id: batch.id,
      substanceId: batch.substance_id,
      name: batch.name,
      quantity: fmtQty(fromDb(batch.quantity)),
      totalPrice: fmtMoney(fromDb(batch.total_price)),
      occurredAt: toIso(batch.occurred_at),
      note: batch.note,
      clientRef: batch.client_ref,
      createdAt: toIso(batch.created_at),
      remaining: fmtQty(remainingOf(batch)),
      unitPrice: fmtUnitPrice(unitPriceOf(batch)),
      deactivatedAt: toIsoOrNull(batch.deactivated_at),
      deactivatedByConsumptionId: batch.deactivated_by_consumption_id,
      deactivatedByAdjustmentId: batch.deactivated_by_adjustment_id,
      consumptionCount: stats.count,
      avgQuantityPerConsumption: stats.avgQuantityPerConsumption,
      minConsumption: stats.minConsumption,
      maxConsumption: stats.maxConsumption,
      avgPricePerConsumption: stats.avgPricePerConsumption,
      firstConsumedAt: first ? toIso(first.occurred_at) : null,
    };
  }

  /** Consumptions (with cost) and adjustments (cost null) of the batch, newest first. */
  async batchMovements(owner: Owner, batchId: number, page: Page) {
    const { batch, ledger } = await this.loadBatchLedger(owner, batchId);
    const costs = consumptionCosts([batch], ledger.consumptions);
    const before = pageBefore(page);
    const rows = [
      ...ledger.consumptions.map((c) => ({
        occurred_at: c.occurred_at,
        created_at: c.created_at,
        id: c.id,
        view: {
          type: 'consumption' as const,
          id: c.id,
          batchId: c.batch_id,
          occurredAt: toIso(c.occurred_at),
          quantity: fmtQty(fromDb(c.quantity)),
          cost: fmtMoney(costs.get(c.id) ?? ZERO),
          note: c.note,
          clientRef: c.client_ref,
          createdAt: toIso(c.created_at),
        },
      })),
      ...ledger.adjustments.map((a) => ({
        occurred_at: a.occurred_at,
        created_at: a.created_at,
        id: a.id,
        view: {
          type: 'adjustment' as const,
          id: a.id,
          batchId: a.batch_id,
          occurredAt: toIso(a.occurred_at),
          delta: fmtQty(fromDb(a.delta)),
          reason: a.reason,
          cost: null,
          clientRef: a.client_ref,
          createdAt: toIso(a.created_at),
        },
      })),
    ];
    const sorted = rows
      .filter((r) => before === null || r.occurred_at.getTime() < before.getTime())
      .sort(newestFirst);
    return withTies(sorted, pageLimit(page)).map((r) => r.view);
  }

  // -------------------------------------------------------------------------------------------
  // One-time batch
  // -------------------------------------------------------------------------------------------

  async oneTimeStats(owner: Owner, substanceId: number) {
    await this.catalog.get(owner, substanceId);
    const rows = await repo.loadOneTimes(this.pool, owner, { substanceIds: [substanceId] });
    const items = rows.map((o) => ({ quantity: fromDb(o.quantity), cost: fromDb(o.total_price) }));
    const stats = perConsumptionStats(items);
    const totalQuantity = sum(items.map((i) => i.quantity));
    const totalSpent = sum(items.map((i) => i.cost));
    return {
      substanceId,
      count: stats.count,
      totalQuantity: fmtQty(totalQuantity),
      totalSpent: fmtMoney(totalSpent),
      avgUnitPrice: stats.count === 0 ? null : fmtUnitPrice(safeDiv(totalSpent, totalQuantity)),
      avgQuantityPerConsumption: stats.avgQuantityPerConsumption,
      minConsumption: stats.minConsumption,
      maxConsumption: stats.maxConsumption,
      avgPricePerConsumption: stats.avgPricePerConsumption,
      firstAt: rows[0] ? toIso(rows[0].occurred_at) : null,
      lastAt: rows.length ? toIso(rows[rows.length - 1]!.occurred_at) : null,
    };
  }

  /**
   * The one-time consumptions of a substance, newest first, a page. Each has its deltas from the
   * consumption before it of the substance, from a batch or one-time (it has no batch to be
   * compared within): the numbers the consumptions list gives it, whatever the page leaves out.
   */
  async oneTimeConsumptions(owner: Owner, substanceId: number, page: Page) {
    await this.catalog.get(owner, substanceId);
    const before = pageBefore(page);
    const [rows, history] = await Promise.all([
      repo.pageOneTimes(this.pool, owner, substanceId, {
        limit: pageLimit(page),
        before: before ? toDbDateTime(before) : null,
      }),
      this.consumptionEntries(owner, substanceId),
    ]);
    compareWithPrevious(history, ofItsSubstance);
    const compared = new Map(history.filter((e) => e.type === 'one_time').map((e) => [e.id, e]));
    return rows.map((o) => {
      const entry = compared.get(o.id);
      return {
        type: 'one_time' as const,
        id: o.id,
        substanceId: o.substance_id,
        name: o.name,
        occurredAt: toIso(o.occurred_at),
        quantity: fmtQty(fromDb(o.quantity)),
        totalPrice: fmtMoney(fromDb(o.total_price)),
        cost: fmtMoney(fromDb(o.total_price)),
        note: o.note,
        clientRef: o.client_ref,
        createdAt: toIso(o.created_at),
        deltaQuantity: fmtOrNull(entry?.deltaQuantity ?? null, SCALE.ratio),
        deltaUnitPrice: fmtOrNull(entry?.deltaUnitPrice ?? null, SCALE.ratio),
        deltaCost: fmtOrNull(entry?.deltaCost ?? null, SCALE.ratio),
      };
    });
  }

  // -------------------------------------------------------------------------------------------
  // Movements (history)
  // -------------------------------------------------------------------------------------------

  async movements(owner: Owner, filter: {
    substanceId?: number | undefined;
    type?: repo.MovementType | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit?: number | undefined;
    before?: string | undefined;
  }) {
    if (filter.substanceId !== undefined) await this.catalog.get(owner, filter.substanceId);
    const days = await this.logicalDays(owner, filter.from, filter.to);
    const before = pageBefore(filter);
    const rows = await repo.listMovements(this.pool, owner, {
      substanceId: filter.substanceId,
      types: filter.type ? [filter.type] : ['batch', 'consumption', 'one_time', 'adjustment'],
      fromInstant: days.start ? toDbDateTime(days.start) : undefined,
      toInstant: days.end ? toDbDateTime(days.end) : undefined,
      before: before ? toDbDateTime(before) : undefined,
      limit: pageLimit(filter),
    });

    // Costs of the listed consumptions need every consumption of their batches.
    const batchIds = [...new Set(rows.filter((r) => r.type === 'consumption').map((r) => r.batch_id as number))];
    let costs = new Map<number, Dec>();
    if (batchIds.length > 0) {
      const [batches, consumptions] = await Promise.all([
        repo.loadBatches(this.pool, owner, { batchIds }),
        repo.loadConsumptions(this.pool, owner, { batchIds }),
      ]);
      costs = consumptionCosts(batches, consumptions);
    }

    return rows.map((r) => {
      const common = {
        type: r.type,
        id: r.id,
        substanceId: r.substance_id,
        substanceName: r.substance_name,
        unit: r.unit,
        occurredAt: toIso(r.occurred_at),
        createdAt: toIso(r.created_at),
        clientRef: r.client_ref,
      };
      switch (r.type) {
        case 'batch':
          return {
            ...common,
            name: r.name,
            quantity: fmtQty(fromDb(r.quantity)),
            totalPrice: fmtMoney(fromDb(r.total_price)),
            note: r.note,
            deactivatedAt: toIsoOrNull(r.deactivated_at),
          };
        case 'consumption':
          return {
            ...common,
            batchId: r.batch_id,
            batchName: r.batch_name,
            quantity: fmtQty(fromDb(r.quantity)),
            cost: fmtMoney(costs.get(r.id) ?? ZERO),
            note: r.note,
          };
        case 'one_time':
          return {
            ...common,
            name: r.name,
            quantity: fmtQty(fromDb(r.quantity)),
            totalPrice: fmtMoney(fromDb(r.total_price)),
            cost: fmtMoney(fromDb(r.total_price)),
            note: r.note,
          };
        case 'adjustment':
          return {
            ...common,
            batchId: r.batch_id,
            batchName: r.batch_name,
            delta: fmtQty(fromDb(r.delta)),
            reason: r.reason,
          };
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Consumptions list (batch and one-time consumptions together)
  // -------------------------------------------------------------------------------------------

  /** Batch and one-time consumptions, newest first, filtered, paginated like the histories. */
  async consumptionList(owner: Owner, filter: ConsumptionFilter, page: Page): Promise<ConsumptionItem[]> {
    const cost = decimalRange(filter.minCost, filter.maxCost, 'minCost', 'maxCost');
    const quantity = decimalRange(filter.minQuantity, filter.maxQuantity, 'minQuantity', 'maxQuantity');
    const before = pageBefore(page);
    const [entries, substances] = await Promise.all([
      this.scopedConsumptions(owner, filter),
      this.catalog.list(owner, { includeArchived: true }),
    ]);
    const substanceById = new Map(substances.map((s) => [s.id, s]));
    const newestFirst = entries
      .filter(
        (e) =>
          within(e.cost, cost) &&
          within(e.quantity, quantity) &&
          (before === null || e.occurred_at.getTime() < before.getTime()),
      )
      .reverse();
    return withTies(newestFirst, pageLimit(page)).map((e) => {
      const substance = substanceById.get(e.substance_id)!;
      return {
        type: e.type,
        id: e.id,
        substanceId: e.substance_id,
        substanceName: substance.name,
        unit: substance.unit,
        batchId: e.batch_id,
        batchName: e.batch_name,
        name: e.name,
        occurredAt: toIso(e.occurred_at),
        quantity: fmtQty(e.quantity),
        unitPrice: fmtUnitPrice(e.unitPrice),
        cost: fmtMoney(e.cost),
        note: e.note,
        deltaQuantity: fmtOrNull(e.deltaQuantity, SCALE.ratio),
        deltaUnitPrice: fmtOrNull(e.deltaUnitPrice, SCALE.ratio),
        deltaCost: fmtOrNull(e.deltaCost, SCALE.ratio),
      };
    });
  }

  /** The ends of the price and quantity sliders over the consumptions in scope; nulls with none. */
  async consumptionBounds(owner: Owner, scope: ConsumptionScope): Promise<ConsumptionBounds> {
    const entries = await this.scopedConsumptions(owner, scope);
    if (entries.length === 0) return { minCost: null, maxCost: null, minQuantity: null, maxQuantity: null };
    const costs = entries.map((e) => e.cost);
    const quantities = entries.map((e) => e.quantity);
    return {
      minCost: fmtMoney(lowest(costs)),
      maxCost: fmtMoney(highest(costs)),
      minQuantity: fmtQty(lowest(quantities)),
      maxQuantity: fmtQty(highest(quantities)),
    };
  }

  /**
   * The consumptions in `scope`, oldest first, each with its deltas from the previous one of its
   * series: the consumptions of its batch when the list is one batch's (what that list shows),
   * else those of its substance, of either kind; never those of another substance. The whole
   * series is loaded before the logical days narrow it, so every delta compares with the real
   * previous one, whatever the days hide. Only the one-time ones (`oneTime`): they keep the rule of
   * their substance, so they are picked after the deltas.
   */
  private async scopedConsumptions(owner: Owner, scope: ConsumptionScope): Promise<ConsumptionEntry[]> {
    if (scope.oneTime && scope.batchId !== undefined) {
      throw badRequest('a one-time consumption has no batch: choose one or the other', 'oneTime');
    }
    const days = await this.logicalDays(owner, scope.from, scope.to);
    let substanceId = scope.substanceId;
    if (substanceId !== undefined) await this.catalog.get(owner, substanceId);
    if (scope.batchId !== undefined) {
      const [batch] = await repo.loadBatches(this.pool, owner, { batchIds: [scope.batchId] });
      if (!batch) throw notFound('Batch', scope.batchId);
      if (substanceId !== undefined && batch.substance_id !== substanceId) return [];
      substanceId = batch.substance_id;
    }
    const all = await this.consumptionEntries(owner, substanceId);
    const entries = scope.batchId === undefined ? all : all.filter((e) => e.batch_id === scope.batchId);
    compareWithPrevious(entries, scope.batchId === undefined ? ofItsSubstance : () => scope.batchId!);
    return entries.filter(
      (e) =>
        (!scope.oneTime || e.type === 'one_time') &&
        (days.start === null || e.occurred_at.getTime() >= days.start.getTime()) &&
        (days.end === null || e.occurred_at.getTime() < days.end.getTime()),
    );
  }

  /** [start, end) of the logical days from..to; either end may be open. 400 when invalid. */
  private async logicalDays(
    owner: Owner,
    from: string | undefined,
    to: string | undefined,
  ): Promise<{ start: Date | null; end: Date | null }> {
    if (from === undefined && to === undefined) return { start: null, end: null };
    if (from !== undefined && !isValidIsoDate(from)) throw badRequest('from must be a date YYYY-MM-DD', 'from');
    if (to !== undefined && !isValidIsoDate(to)) throw badRequest('to must be a date YYYY-MM-DD', 'to');
    if (from !== undefined && to !== undefined && from > to) throw badRequest('from must not be after to', 'from');
    const settings = await this.settings.get(owner);
    return {
      start: from === undefined ? null : logicalDayStart(from, settings),
      end: to === undefined ? null : logicalDayStart(addDays(to, 1), settings),
    };
  }

  /**
   * Every non-deleted consumption of either kind (of one substance, or of all), oldest first,
   * with its unit price and its cost; the deltas are set by whoever knows the series.
   */
  private async consumptionEntries(owner: Owner, substanceId: number | undefined): Promise<ConsumptionEntry[]> {
    const scope = substanceId === undefined ? {} : { substanceIds: [substanceId] };
    const [batches, consumptions, oneTimes] = await Promise.all([
      repo.loadBatches(this.pool, owner, scope),
      repo.loadConsumptions(this.pool, owner, scope),
      repo.loadOneTimes(this.pool, owner, scope),
    ]);
    return consumptionEntriesOf(batches, consumptions, oneTimes);
  }

  // -------------------------------------------------------------------------------------------
  // Time series
  // -------------------------------------------------------------------------------------------

  /**
   * [{ period, consumed, cost, spend }] for every period touched by the logical days
   * from..to (inclusive), zero-filled. consumed and cost include batch and one-time
   * consumptions; spend = batch purchases + one-time prices in the period.
   */
  async stats(owner: Owner, query: { from: string; to: string; groupBy: GroupBy; substanceId?: number | undefined }): Promise<StatsPoint[]> {
    if (!isValidIsoDate(query.from)) throw badRequest('from must be a date YYYY-MM-DD', 'from');
    if (!isValidIsoDate(query.to)) throw badRequest('to must be a date YYYY-MM-DD', 'to');
    if (query.from > query.to) throw badRequest('from must not be after to', 'from');
    if (query.substanceId !== undefined) await this.catalog.get(owner, query.substanceId);

    const settings = await this.settings.get(owner);
    const periods = periodsBetween(query.from, query.to, query.groupBy, 5000);
    const range = logicalRange(query.from, query.to, settings);
    const ledger = await this.loadLedger(owner, query.substanceId !== undefined ? { substanceIds: [query.substanceId] } : {});
    const costs = consumptionCosts(ledger.batches, ledger.consumptions);

    const buckets = new Map<string, { consumed: Dec; cost: Dec; spend: Dec }>();
    for (const p of periods) buckets.set(p, { consumed: ZERO, cost: ZERO, spend: ZERO });
    const bucketOf = (instant: Date) => {
      const bucket = buckets.get(periodOf(logicalDate(instant, settings), query.groupBy));
      if (!bucket) throw new Error(`No bucket for ${instant.toISOString()}`);
      return bucket;
    };

    for (const c of ledger.consumptions) {
      if (!inRange(c.occurred_at, range)) continue;
      const bucket = bucketOf(c.occurred_at);
      bucket.consumed = bucket.consumed.plus(fromDb(c.quantity));
      bucket.cost = bucket.cost.plus(costs.get(c.id) ?? ZERO);
    }
    for (const o of ledger.oneTimes) {
      if (!inRange(o.occurred_at, range)) continue;
      const bucket = bucketOf(o.occurred_at);
      const price = fromDb(o.total_price);
      bucket.consumed = bucket.consumed.plus(fromDb(o.quantity));
      bucket.cost = bucket.cost.plus(price);
      bucket.spend = bucket.spend.plus(price);
    }
    for (const b of ledger.batches) {
      if (!inRange(b.occurred_at, range)) continue;
      const bucket = bucketOf(b.occurred_at);
      bucket.spend = bucket.spend.plus(fromDb(b.total_price));
    }

    return periods.map((period) => {
      const b = buckets.get(period)!;
      return { period, consumed: fmtQty(b.consumed), cost: fmtMoney(b.cost), spend: fmtMoney(b.spend) };
    });
  }
}
