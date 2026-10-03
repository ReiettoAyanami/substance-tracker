import type { Pool } from '../../db/pool.js';
import { fmtQty } from '../../shared/decimal.js';
import { badRequest, notFound } from '../../shared/errors.js';
import {
  addDays,
  logicalDate,
  logicalDayStart,
  periodsBetween,
  toIso,
  toIsoOrNull,
  type Clock,
  type TimeScale,
} from '../../shared/time.js';
import type { CatalogService, SubstanceDto } from '../catalog/service.js';
import * as reportsRepo from '../reports/repository.js';
import type { SettingsService } from '../settings/service.js';
import {
  batchValues,
  consumptionValues,
  substanceLedgerOf,
  substanceLedgers,
  substanceValues,
  type MetricContext,
  type MetricValues,
} from './calculations.js';
import { findMetric, findSeries, metricsOf, type MetricScope, type SeriesScale } from './catalog.js';
import { inPeriod, resolvePeriod, type PeriodQuery } from './period.js';
import * as repo from './repository.js';
import { HOURS, lineOf, partsOf, type SeriesLine } from './series.js';
import type { Owner } from '../../shared/owner.js';

/** The metrics of one entity, with the scale and the period they were computed in. */
export interface MetricsResult {
  per: TimeScale;
  /** The period's first logical day; null when open (from the first thing recorded). */
  from: string | null;
  /** Its last logical day; null when open (up to now). */
  to: string | null;
  values: MetricValues;
}

export interface MetricsQuery extends PeriodQuery {
  per?: TimeScale | undefined;
}

export interface TableQuery extends MetricsQuery {
  scope: MetricScope;
  /** Comma-separated keys of the scope; none = all of them. */
  keys?: string | undefined;
  /** Only the rows of this substance (archived or not); none: every substance not archived. */
  substanceId?: number | undefined;
  /** Consumptions: only this batch's (no one-time ones). */
  batchId?: number | undefined;
  /** Consumptions: at most this many, the newest (default 100). */
  limit?: number | undefined;
}

/** The kind of a consumption, as the consumptions list says it. */
export type ConsumptionType = 'consumption' | 'one_time';

/** A row of the substances table of the metrics page. */
export interface SubstanceRow {
  id: number;
  name: string;
  unit: string;
  values: MetricValues;
}

/** A row of the batches table: the batch, its substance, and its metrics. */
export interface BatchRow {
  id: number;
  substanceId: number;
  substanceName: string;
  unit: string;
  name: string | null;
  occurredAt: string;
  deactivatedAt: string | null;
  values: MetricValues;
}

/** A row of the consumptions table: the consumption, as the consumptions list has it, and its metrics. */
export interface ConsumptionRow {
  type: ConsumptionType;
  id: number;
  substanceId: number;
  substanceName: string;
  unit: string;
  batchId: number | null;
  batchName: string | null;
  name: string | null;
  occurredAt: string;
  quantity: string;
  values: MetricValues;
}

/** GET /api/metrics/table: one row per entity, one value per key asked. */
export interface MetricsTable extends Omit<MetricsResult, 'values'> {
  scope: MetricScope;
  keys: string[];
  rows: SubstanceRow[] | BatchRow[] | ConsumptionRow[];
}

export interface SeriesQuery extends PeriodQuery {
  metric: string;
  /** The interval of the periods (default day); the hours of the day take none. */
  per?: SeriesScale | undefined;
  /** One line per substance (default), or per batch of each (and its one-time consumptions). */
  by?: 'substance' | 'batch' | undefined;
  /** Comma-separated ids: only these substances (archived or not); none: every one not archived. */
  substanceIds?: string | undefined;
}

/** GET /api/series: what a chart draws. */
export interface SeriesResult {
  metric: string;
  per: SeriesScale | null;
  by: 'substance' | 'batch';
  from: string;
  to: string;
  /** The periods ('2026-09-29', '2026-W40', '2026-09', '2026'), or the hours '00'..'23'. */
  periods: string[];
  series: SeriesLine[];
}

/** At most this many periods in a series (a day per period for more than five years is too many). */
const MAX_PERIODS = 2000;

/** How many consumptions a table shows at most, by default. */
const CONSUMPTION_ROWS = 100;

/** Only the keys asked, in their order. */
function pick(values: MetricValues, keys: string[]): MetricValues {
  return Object.fromEntries(keys.map((key) => [key, values[key] ?? null]));
}

/**
 * Metrics (design-statistics.md): the numbers of the catalog, for one entity or for a table of
 * them. Part of Reports: read only, computed from the stored movements every time, never stored.
 */
export class MetricsService {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
  ) {}

  private async context(owner: Owner, per: TimeScale | undefined): Promise<MetricContext> {
    const day = await this.settings.get(owner);
    return { scale: per ?? 'day', day, now: this.clock() };
  }

  /** The ledgers of several substances, read once. */
  private async substanceLedgersOf(owner: Owner, ids: number[]) {
    const scope = { substanceIds: ids };
    const [batches, consumptions, adjustments, oneTimes] = await Promise.all([
      reportsRepo.loadBatches(this.pool, owner, scope),
      reportsRepo.loadConsumptions(this.pool, owner, scope),
      reportsRepo.loadAdjustments(this.pool, owner, scope),
      reportsRepo.loadOneTimes(this.pool, owner, scope),
    ]);
    return substanceLedgers(ids, { batches, consumptions, adjustments, oneTimes });
  }

  /** The substances of a table: the one asked (archived or not), or every one not archived, by name. */
  private async substancesOf(owner: Owner, substanceId: number | undefined): Promise<SubstanceDto[]> {
    return substanceId === undefined ? this.catalog.list(owner, { includeArchived: false }) : [await this.catalog.get(owner, substanceId)];
  }

  /** Everything that counts of one substance (nothing deleted), oldest first. */
  private async substanceLedger(owner: Owner, substanceId: number) {
    const scope = { substanceIds: [substanceId] };
    const [batches, consumptions, adjustments, oneTimes] = await Promise.all([
      reportsRepo.loadBatches(this.pool, owner, scope),
      reportsRepo.loadConsumptions(this.pool, owner, scope),
      reportsRepo.loadAdjustments(this.pool, owner, scope),
      reportsRepo.loadOneTimes(this.pool, owner, scope),
    ]);
    return substanceLedgerOf({ batches, consumptions, adjustments, oneTimes });
  }

  async substanceMetrics(owner: Owner, substanceId: number, query: MetricsQuery): Promise<MetricsResult> {
    await this.catalog.get(owner, substanceId);
    const ctx = await this.context(owner, query.per);
    const period = resolvePeriod(query, ctx.day, ctx.now);
    const ledger = await this.substanceLedger(owner, substanceId);
    return { per: ctx.scale, from: period.from, to: period.to, values: substanceValues(ledger, period, ctx) };
  }

  /** A consumption's metrics, of either kind, over all time: no period. 404 when it does not count. */
  async consumptionMetrics(owner: Owner, type: ConsumptionType, id: number, per: TimeScale | undefined): Promise<MetricsResult> {
    const substanceId =
      type === 'consumption' ? await repo.findConsumptionSubstance(this.pool, owner, id) : await repo.findOneTimeSubstance(this.pool, owner, id);
    if (substanceId === null) throw notFound(type === 'consumption' ? 'Consumption' : 'One-time consumption', id);
    const ctx = await this.context(owner, per);
    const ledger = await this.substanceLedger(owner, substanceId);
    const entry = ledger.entries.find((e) => e.type === type && e.id === id)!;
    return { per: ctx.scale, from: null, to: null, values: consumptionValues(entry, ledger, ctx) };
  }

  /** A batch's metrics, over its life: no period. 404 when it does not exist or is deleted. */
  async batchMetrics(owner: Owner, batchId: number, per: TimeScale | undefined): Promise<MetricsResult> {
    const [found] = await reportsRepo.loadBatches(this.pool, owner, { batchIds: [batchId] });
    if (!found) throw notFound('Batch', batchId);
    const ctx = await this.context(owner, per);
    const ledger = await this.substanceLedger(owner, found.substance_id);
    const batch = ledger.batches.find((b) => b.id === batchId)!;
    return { per: ctx.scale, from: null, to: null, values: batchValues(batch, ledger, ctx) };
  }

  /**
   * A table of the metrics page: one row per entity of the scope, with the metrics asked; the
   * same computation as each entity's own metrics, on the ledgers read once. Substances: every one
   * not archived (or the one asked), their numbers in the period. Batches: those bought in the
   * period, by substance and newest first, their numbers over their life.
   */
  async table(owner: Owner, query: TableQuery): Promise<MetricsTable> {
    const keys = this.keysOf(query.scope, query.keys);
    if (query.scope !== 'consumption' && query.batchId !== undefined) {
      throw badRequest('batchId narrows the consumptions table only', 'batchId');
    }
    const ctx = await this.context(owner, query.per);
    const period = resolvePeriod(query, ctx.day, ctx.now);
    let substanceId = query.substanceId;
    if (query.batchId !== undefined) {
      const [batch] = await reportsRepo.loadBatches(this.pool, owner, { batchIds: [query.batchId] });
      if (!batch) throw notFound('Batch', query.batchId);
      if (substanceId !== undefined && batch.substance_id !== substanceId) {
        return { scope: query.scope, per: ctx.scale, from: period.from, to: period.to, keys, rows: [] };
      }
      substanceId = batch.substance_id;
    }
    const substances = await this.substancesOf(owner, substanceId);
    const ledgers = await this.substanceLedgersOf(owner, substances.map((s) => s.id));
    const head = { scope: query.scope, per: ctx.scale, from: period.from, to: period.to, keys };

    if (query.scope === 'batch') {
      const rows = substances.flatMap((s) => {
        const ledger = ledgers.get(s.id)!;
        return [...ledger.batches]
          .filter((b) => inPeriod(period, b.occurred_at))
          .sort((x, y) => y.occurred_at.getTime() - x.occurred_at.getTime() || y.id - x.id)
          .map((b) => ({
            id: b.id,
            substanceId: s.id,
            substanceName: s.name,
            unit: s.unit,
            name: b.name,
            occurredAt: toIso(b.occurred_at),
            deactivatedAt: toIsoOrNull(b.deactivated_at),
            values: pick(batchValues(b, ledger, ctx), keys),
          }));
      });
      return { ...head, rows };
    }
    if (query.scope === 'consumption') {
      const bySubstance = new Map(substances.map((s) => [s.id, s]));
      const rows = substances
        .flatMap((s) => ledgers.get(s.id)!.entries)
        .filter(
          (e) => inPeriod(period, e.occurred_at) && (query.batchId === undefined || (e.type === 'consumption' && e.batch_id === query.batchId)),
        )
        .sort(
          (x, y) =>
            y.occurred_at.getTime() - x.occurred_at.getTime() ||
            y.created_at.getTime() - x.created_at.getTime() ||
            (x.type === y.type ? 0 : x.type === 'one_time' ? -1 : 1) ||
            y.id - x.id,
        )
        .slice(0, query.limit ?? CONSUMPTION_ROWS)
        .map((e) => {
          const s = bySubstance.get(e.substance_id)!;
          return {
            type: e.type,
            id: e.id,
            substanceId: s.id,
            substanceName: s.name,
            unit: s.unit,
            batchId: e.batch_id,
            batchName: e.batch_name,
            name: e.name,
            occurredAt: toIso(e.occurred_at),
            quantity: fmtQty(e.quantity),
            values: pick(consumptionValues(e, ledgers.get(s.id)!, ctx), keys),
          };
        });
      return { ...head, rows };
    }
    return {
      ...head,
      rows: substances.map((s) => ({
        id: s.id,
        name: s.name,
        unit: s.unit,
        values: pick(substanceValues(ledgers.get(s.id)!, period, ctx), keys),
      })),
    };
  }

  /**
   * A series (design-statistics.md, "series"): the values of a measure in each period, one line per
   * substance (or per batch, and the one-time consumptions, of each), zero-filled; a line with
   * nothing in the period is left out. Without a period: from the first thing recorded of those
   * substances to today.
   */
  async series(owner: Owner, query: SeriesQuery): Promise<SeriesResult> {
    const definition = findSeries(query.metric);
    if (!definition) throw badRequest(`"${query.metric}" is not a series of the catalog`, 'metric');
    const ctx = await this.context(owner, undefined);
    const asked = resolvePeriod(query, ctx.day, ctx.now);
    const substances = await this.seriesSubstances(owner, query.substanceIds);
    const ledgers = await this.substanceLedgersOf(owner, substances.map((s) => s.id));

    const today = logicalDate(ctx.now, ctx.day);
    const instants = [...ledgers.values()].flatMap((l) => [
      ...l.batches.map((b) => b.occurred_at.getTime()),
      ...l.entries.map((e) => e.occurred_at.getTime()),
    ]);
    const first = instants.length === 0 ? today : logicalDate(new Date(Math.min(...instants)), ctx.day);
    const from = asked.from ?? (first < today ? first : today);
    const to = asked.to ?? today;
    const period = { from, to, start: logicalDayStart(from, ctx.day), end: logicalDayStart(addDays(to, 1), ctx.day) };
    const per = definition.scales.length === 0 ? null : (query.per ?? 'day');
    const periods = per === null ? HOURS : periodsBetween(from, to, per, MAX_PERIODS);
    const by = query.by ?? 'substance';

    const lines = substances
      .flatMap((s) => partsOf(s, ledgers.get(s.id)!, by))
      .map((part) => lineOf(definition, part, { period, day: ctx.day, per, periods }))
      .filter((line): line is SeriesLine => line !== null);
    return { metric: definition.key, per, by, from, to, periods, series: lines };
  }

  /** The substances of a series: those asked (archived or not, 404 when one is unknown), or every one not archived; by name. */
  private async seriesSubstances(owner: Owner, raw: string | undefined): Promise<SubstanceDto[]> {
    if (raw === undefined) return this.catalog.list(owner, { includeArchived: false });
    const ids = [...new Set(raw.split(',').map(Number))];
    const all = await this.catalog.list(owner, { includeArchived: true });
    const found = all.filter((s) => ids.includes(s.id));
    const missing = ids.find((id) => !found.some((s) => s.id === id));
    if (missing !== undefined) throw notFound('Substance', missing);
    return found;
  }

  /** The keys asked, each a metric of the scope (400 otherwise); none asked = all of the scope. */
  private keysOf(scope: MetricScope, raw: string | undefined): string[] {
    if (raw === undefined) return metricsOf(scope).map((m) => m.key);
    const keys = raw.split(',');
    for (const key of keys) {
      const metric = findMetric(key);
      if (!metric) throw badRequest(`"${key}" is not a metric of the catalog`, 'keys');
      if (metric.scope !== scope) throw badRequest(`"${key}" is a ${metric.scope} metric, not a ${scope} one`, 'keys');
    }
    return keys;
  }
}
