/**
 * The catalog of metrics (design-statistics.md): one number the API computes for one entity,
 * never stored. The web reads it from GET /api/metrics, so the labels and the descriptions of the
 * options live here, next to the code that computes them.
 */

import { TIME_SCALES, type TimeScale } from '../../shared/time.js';

/** The intervals a rate or a duration can be read in (TIME_SCALES): the user chooses (lenzi, 2026-09-30). */
export { TIME_SCALES, type TimeScale };

export const METRIC_SCOPES = ['substance', 'batch', 'consumption'] as const;
export type MetricScope = (typeof METRIC_SCOPES)[number];

/**
 * How a value reads. With scales, `quantity`, `money` and `count` are rates ("per <scale>") and
 * `duration` is a time span in <scale>.
 * - quantity: in the substance's unit, 3 decimals;
 * - money: in the currency of the settings, 2 decimals;
 * - count: a whole number, or 2 decimals as a rate;
 * - rank: the n-th, from 1;
 * - change: a relative change, 4 decimals ("0.0500" = +5 %);
 * - share: a part of a whole, 4 decimals ("0.2500" = 25 %);
 * - duration: 2 decimals, in the scale chosen;
 * - hours: signed hours of the clock, 2 decimals ("-0.50" = half an hour earlier).
 */
export const METRIC_UNITS = ['quantity', 'money', 'count', 'rank', 'change', 'share', 'duration', 'hours'] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

export interface MetricDefinition {
  /** `<scope>.<name>`, unique. */
  key: string;
  scope: MetricScope;
  /** Short name on screen. */
  label: string;
  unit: MetricUnit;
  /** The scales it can be read in; empty when it has no time, or when its scale is its meaning. */
  scales: TimeScale[];
  /** The period (from, to, days) changes it. */
  period: boolean;
  /** One line: what the number is. */
  description: string;
}

const ALL = [...TIME_SCALES];

function metric(
  key: string,
  label: string,
  unit: MetricUnit,
  scales: TimeScale[],
  period: boolean,
  description: string,
): MetricDefinition {
  const scope = key.split('.')[0] as MetricScope;
  return { key, scope, label, unit, scales, period, description };
}

/** In the order of the tables of design-statistics.md; every page shows them in this order by default. */
export const METRICS: readonly MetricDefinition[] = [
  // Substance: over the period (from..to, or the last N days; all time without one), up to now.
  metric(
    'substance.consumed',
    'Consumed',
    'quantity',
    [],
    true,
    'Quantity consumed in the period, batch and one-time consumptions together.',
  ),
  metric(
    'substance.pace',
    'Pace',
    'quantity',
    ALL,
    true,
    'Average quantity consumed per interval, over the period up to now.',
  ),
  metric('substance.frequency', 'How often', 'count', ALL, true, 'Consumptions per interval, over the period up to now.'),
  metric(
    'substance.avgGap',
    'Average time between two',
    'duration',
    ALL,
    true,
    'Average time between two consumptions in a row, in the period.',
  ),
  metric('substance.sinceLast', 'Since the last one', 'duration', ALL, false, 'Time from the last consumption to now.'),
  metric(
    'substance.longestPause',
    'Longest pause',
    'duration',
    ALL,
    true,
    'Longest time without it between two consumptions, the current pause included, among the pauses that end in the period.',
  ),
  metric(
    'substance.cost',
    'Cost',
    'money',
    [],
    true,
    "What the consumptions of the period cost: batch consumptions at their batch's unit price, one-time ones at their price.",
  ),
  metric(
    'substance.spend',
    'Spend',
    'money',
    [],
    true,
    'What was paid in the period: the batches bought and the one-time consumptions.',
  ),
  metric(
    'substance.unitPriceTrend',
    'Unit price, batch after batch',
    'change',
    [],
    true,
    'Average change of the unit price from one batch to the next, over the batches bought in the period.',
  ),
  metric(
    'substance.stockTime',
    'Stock lasts',
    'duration',
    ALL,
    true,
    'How long the stock left lasts at the pace of the period (batch consumptions only: one-time ones do not use the stock).',
  ),

  // Batch: over its whole life, from the purchase to its end (or to now while it is active).
  metric('batch.used', 'Used', 'share', [], false, 'Quantity consumed from the batch, out of what was bought.'),
  metric(
    'batch.unitPriceVsAverage',
    'Unit price against the average',
    'change',
    [],
    false,
    'Its unit price against the average unit price of every batch of the substance (total paid ÷ total bought).',
  ),
  metric(
    'batch.unitPriceVsPrevious',
    'Unit price against the previous batch',
    'change',
    [],
    false,
    'Its unit price against that of the batch of the same substance bought before it.',
  ),
  metric(
    'batch.valueConsumed',
    'Value consumed',
    'money',
    [],
    false,
    'What its consumptions cost so far, out of the price paid for it.',
  ),
  metric('batch.consumptions', 'Consumptions', 'count', [], false, 'How many consumptions it has had.'),
  metric('batch.avgQuantity', 'Average consumption', 'quantity', [], false, 'Average quantity of its consumptions.'),
  metric('batch.minQuantity', 'Smallest consumption', 'quantity', [], false, 'Quantity of its smallest consumption.'),
  metric('batch.maxQuantity', 'Largest consumption', 'quantity', [], false, 'Quantity of its largest consumption.'),
  metric(
    'batch.pace',
    'Pace',
    'quantity',
    ALL,
    false,
    'Quantity consumed per interval, from the purchase to its end (or to now while it is active).',
  ),
  metric('batch.waitBeforeFirst', 'Before the first use', 'duration', ALL, false, 'Time from the purchase to its first consumption.'),
  metric(
    'batch.timeToFinish',
    'Time to finish',
    'duration',
    ALL,
    false,
    'From the purchase to its end: how long it lasted when finished, how long it should last at its pace while active.',
  ),
  metric(
    'batch.costPerTime',
    'Cost over time',
    'money',
    ALL,
    false,
    'Value consumed per interval, from the purchase to its end (or to now while it is active).',
  ),

  // Consumption: against its substance (never another one), its batch and its day, over all time.
  metric(
    'consumption.deltaQuantity',
    'Quantity against the previous one',
    'change',
    [],
    false,
    'Its quantity against the consumption before it of the same substance.',
  ),
  metric(
    'consumption.quantityVsSubstanceAverage',
    'Quantity against the average',
    'change',
    [],
    false,
    'Its quantity against the average consumption of the substance.',
  ),
  metric(
    'consumption.quantityVsBatchAverage',
    'Quantity against its batch',
    'change',
    [],
    false,
    'Its quantity against the average consumption of its batch (for a one-time consumption, of the one-time ones).',
  ),
  metric(
    'consumption.deltaCost',
    'Price against the previous one',
    'change',
    [],
    false,
    'What it cost against the consumption before it of the same substance.',
  ),
  metric(
    'consumption.unitPriceVsStock',
    'Unit price against the stock',
    'change',
    [],
    false,
    'Its unit price against the average unit price of the stock left now.',
  ),
  metric(
    'consumption.unitPriceVsBatches',
    'Unit price against every batch',
    'change',
    [],
    false,
    'Its unit price against the average unit price of every batch of the substance (total paid ÷ total bought).',
  ),
  metric('consumption.rankInSubstance', 'Number', 'rank', [], false, 'Which consumption of the substance it is, from the first.'),
  metric(
    'consumption.rankInBatch',
    'Number in its batch',
    'rank',
    [],
    false,
    'Which consumption of its batch it is (for a one-time consumption, of the one-time ones).',
  ),
  metric('consumption.rankInDay', 'Number that day', 'rank', [], false, 'Which consumption of the substance it is, in its day.'),
  metric(
    'consumption.sincePrevious',
    'Since the previous one',
    'duration',
    ALL,
    false,
    'Time from the consumption before it of the same substance.',
  ),
  metric(
    'consumption.hourVsUsual',
    'Hour against the usual',
    'hours',
    [],
    false,
    'How much earlier or later in the day it was than the usual hour of the substance.',
  ),
  metric(
    'consumption.shareOfBatch',
    'Share of its batch',
    'share',
    [],
    false,
    'Its quantity out of what its batch was bought with; none for a one-time consumption.',
  ),
];

/** How a chart draws a series (design-statistics.md, "chart"). */
export const CHARTS = ['bar', 'line', 'donut', 'treemap', 'radar'] as const;
export type Chart = (typeof CHARTS)[number];

/** The intervals a series groups its values by (its periods): the user chooses. */
export const SERIES_SCALES = ['day', 'week', 'month', 'year'] as const;
export type SeriesScale = (typeof SERIES_SCALES)[number];

/**
 * A series (design-statistics.md, "series"): numbers of a measure over time, one per period, for
 * each substance (or each batch of one), what a chart draws. `unit` quantity is each series' own
 * unit; unitPrice is money per unit (6 decimals). `charts` are those that can draw it (a donut and
 * a treemap need totals that add up: none for quantities in different units, nor for prices; a
 * radar draws what a line draws, its periods around a circle).
 */
export interface SeriesDefinition {
  key: string;
  scope: 'series';
  label: string;
  unit: 'quantity' | 'count' | 'money' | 'unitPrice';
  /** The intervals it groups by; empty when its periods are its meaning (the hours of the day). */
  scales: SeriesScale[];
  /** It follows the period (all series do). */
  period: true;
  charts: Chart[];
  description: string;
}

const EVERY: SeriesScale[] = [...SERIES_SCALES];

function series(
  key: string,
  label: string,
  unit: SeriesDefinition['unit'],
  scales: SeriesScale[],
  charts: Chart[],
  description: string,
): SeriesDefinition {
  return { key, scope: 'series', label, unit, scales, period: true, charts, description };
}

export const SERIES: readonly SeriesDefinition[] = [
  series('series.consumed', 'Consumed', 'quantity', EVERY, ['bar', 'line', 'radar'], 'Quantity consumed in each interval (each substance in its own unit).'),
  series('series.consumptions', 'Consumptions', 'count', EVERY, ['bar', 'line', 'donut', 'treemap', 'radar'], 'How many consumptions in each interval.'),
  series('series.cost', 'Cost', 'money', EVERY, ['bar', 'line', 'donut', 'treemap', 'radar'], 'What the consumptions of each interval cost.'),
  series('series.spend', 'Spend', 'money', EVERY, ['bar', 'line', 'donut', 'treemap', 'radar'], 'What was paid in each interval: batches bought and one-time consumptions.'),
  series(
    'series.unitPrice',
    'Unit price of the batches',
    'unitPrice',
    EVERY,
    ['line', 'bar', 'radar'],
    'The average unit price of the batches bought in each interval (total paid ÷ total bought); none where none was bought.',
  ),
  series('series.hourOfDay', 'Hour of the day', 'count', [], ['bar', 'line', 'radar'], 'How many consumptions at each hour of the clock, over the period.'),
];

/** Everything the pages can show: the metrics of the entities, then the series of the charts. */
export const CATALOG: readonly (MetricDefinition | SeriesDefinition)[] = [...METRICS, ...SERIES];

const SERIES_BY_KEY = new Map(SERIES.map((s) => [s.key, s]));

export function findSeries(key: string): SeriesDefinition | undefined {
  return SERIES_BY_KEY.get(key);
}

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function findMetric(key: string): MetricDefinition | undefined {
  return BY_KEY.get(key);
}

export function metricsOf(scope: MetricScope): MetricDefinition[] {
  return METRICS.filter((m) => m.scope === scope);
}
