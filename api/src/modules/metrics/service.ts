import type { Pool } from '../../db/pool.js';
import type { Clock, TimeScale } from '../../shared/time.js';
import type { CatalogService } from '../catalog/service.js';
import * as reportsRepo from '../reports/repository.js';
import type { SettingsService } from '../settings/service.js';
import { substanceLedgerOf, substanceValues, type MetricContext, type MetricValues } from './calculations.js';
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
}
