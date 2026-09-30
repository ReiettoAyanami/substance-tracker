// Types of the Metrics API (design.md, Appendix B; design-statistics.md). Every value is a decimal
// string computed by the API, or null when it cannot be computed: the browser only shows it.

/** The interval of rates and durations: the user chooses it. */
export type TimeScale = 'hour' | 'day' | 'week' | 'month' | 'year';

export const TIME_SCALES: readonly TimeScale[] = ['hour', 'day', 'week', 'month', 'year'];

export type MetricScope = 'substance' | 'batch' | 'consumption';

/**
 * How a value reads. With scales, quantity / money / count are rates ("per <scale>") and duration is
 * a time span in <scale>. change: "0.0500" = +5 %; share: "0.2500" = 25 %; hours: signed hours.
 */
export type MetricUnit = 'quantity' | 'money' | 'count' | 'rank' | 'change' | 'share' | 'duration' | 'hours';

/** One entry of GET /api/metrics, the catalog. */
export interface MetricDefinition {
  /** `<scope>.<name>`, e.g. "substance.pace". */
  key: string;
  scope: MetricScope;
  label: string;
  unit: MetricUnit;
  /** The scales it can be read in; empty when it has none. */
  scales: TimeScale[];
  /** The period changes it. */
  period: boolean;
  description: string;
}

/** Every key of a scope, with its value. */
export type MetricValues = Record<string, string | null>;

/** GET /api/substances/:id/metrics (and the batch and consumption ones). */
export interface MetricsResult {
  per: TimeScale;
  /** The period's first logical day; null when open. */
  from: string | null;
  /** Its last logical day; null when open (up to now). */
  to: string | null;
  values: MetricValues;
}

/** The scale, and the period: the last N days (none: all time). */
export interface MetricsQuery {
  per?: TimeScale;
  days?: number;
}

/** The tables of the metrics page built so far. */
export type TableScope = 'substance' | 'batch';

/** One row of the substances table. */
export interface SubstanceMetricsRow {
  id: number;
  name: string;
  unit: string;
  values: MetricValues;
}

/** One row of the batches table: the batch, its substance, and its metrics. */
export interface BatchMetricsRow {
  id: number;
  substanceId: number;
  substanceName: string;
  unit: string;
  name: string | null;
  occurredAt: string;
  deactivatedAt: string | null;
  values: MetricValues;
}

export type MetricsRow = SubstanceMetricsRow | BatchMetricsRow;

/** GET /api/metrics/table: one row per entity, one value per key asked. */
export interface MetricsTable {
  scope: TableScope;
  per: TimeScale;
  from: string | null;
  to: string | null;
  keys: string[];
  rows: MetricsRow[];
}

/** What a table is asked for: its scope, the keys (its columns), the scale, the period, one substance. */
export interface MetricsTableQuery extends MetricsQuery {
  scope: TableScope;
  keys: string[];
  substanceId?: number;
}
