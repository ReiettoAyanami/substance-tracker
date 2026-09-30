import type { Pool } from '../../db/pool.js';
import { badRequest } from '../../shared/errors.js';
import type { Clock, TimeScale } from '../../shared/time.js';
import type { CatalogService } from '../catalog/service.js';
import * as reportsRepo from '../reports/repository.js';
import type { SettingsService } from '../settings/service.js';
import {
  substanceLedgerOf,
  substanceLedgers,
  substanceValues,
  type MetricContext,
  type MetricValues,
} from './calculations.js';
import { findMetric, metricsOf, type MetricScope } from './catalog.js';
import { resolvePeriod, type PeriodQuery } from './period.js';

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
}

/** A row of the substances table of the metrics page. */
export interface SubstanceRow {
  id: number;
  name: string;
  unit: string;
  values: MetricValues;
}

/** GET /api/metrics/table: one row per entity, one value per key asked. */
export interface MetricsTable extends Omit<MetricsResult, 'values'> {
  scope: MetricScope;
  keys: string[];
  rows: SubstanceRow[];
}

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

  private async context(per: TimeScale | undefined): Promise<MetricContext> {
    const day = await this.settings.get();
    return { scale: per ?? 'day', day, now: this.clock() };
  }

  async substanceMetrics(substanceId: number, query: MetricsQuery): Promise<MetricsResult> {
    await this.catalog.get(substanceId);
    const ctx = await this.context(query.per);
    const period = resolvePeriod(query, ctx.day, ctx.now);
    const scope = { substanceIds: [substanceId] };
    const [batches, consumptions, adjustments, oneTimes] = await Promise.all([
      reportsRepo.loadBatches(this.pool, scope),
      reportsRepo.loadConsumptions(this.pool, scope),
      reportsRepo.loadAdjustments(this.pool, scope),
      reportsRepo.loadOneTimes(this.pool, scope),
    ]);
    const ledger = substanceLedgerOf({ batches, consumptions, adjustments, oneTimes });
    return { per: ctx.scale, from: period.from, to: period.to, values: substanceValues(ledger, period, ctx) };
  }

  /**
   * The table of the metrics page for a scope: every substance (not archived) with the metrics
   * asked. The same computation as each entity's own metrics, on the whole ledger read once.
   */
  async table(query: TableQuery): Promise<MetricsTable> {
    const keys = this.keysOf(query.scope, query.keys);
    const ctx = await this.context(query.per);
    const period = resolvePeriod(query, ctx.day, ctx.now);
    const substances = await this.catalog.list({ includeArchived: false });
    const ids = substances.map((s) => s.id);
    const scope = { substanceIds: ids };
    const [batches, consumptions, adjustments, oneTimes] = await Promise.all([
      reportsRepo.loadBatches(this.pool, scope),
      reportsRepo.loadConsumptions(this.pool, scope),
      reportsRepo.loadAdjustments(this.pool, scope),
      reportsRepo.loadOneTimes(this.pool, scope),
    ]);
    const ledgers = substanceLedgers(ids, { batches, consumptions, adjustments, oneTimes });
    return {
      scope: query.scope,
      per: ctx.scale,
      from: period.from,
      to: period.to,
      keys,
      rows: substances.map((s) => ({
        id: s.id,
        name: s.name,
        unit: s.unit,
        values: pick(substanceValues(ledgers.get(s.id)!, period, ctx), keys),
      })),
    };
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
