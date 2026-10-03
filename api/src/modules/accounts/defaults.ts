import type { Chart, Surface } from '../views/repository.js';

/**
 * The layout every new user starts with (design-accounts.md, "Account lifecycle"): what the
 * migrations 003-006 put in once, for everybody, before the accounts, now copied for each user.
 * The user changes it from /statistics/edit; these rows are only the start.
 */
export interface DefaultViewItem {
  surface: Surface;
  section: string | null;
  position: number;
  metric: string;
  chart: Chart | null;
  scale: string | null;
}

const metrics = (surface: Surface, keys: string[]): DefaultViewItem[] =>
  keys.map((metric, index) => ({ surface, section: null, position: index + 1, metric, chart: null, scale: null }));

export const DEFAULT_VIEW_ITEMS: readonly DefaultViewItem[] = [
  // The substance page: every substance metric (003), then its chart (005).
  ...metrics('substance', [
    'substance.consumed',
    'substance.pace',
    'substance.frequency',
    'substance.avgGap',
    'substance.sinceLast',
    'substance.longestPause',
    'substance.cost',
    'substance.spend',
    'substance.unitPriceTrend',
    'substance.stockTime',
  ]),
  { surface: 'substance', section: null, position: 11, metric: 'series.consumed', chart: 'bar', scale: 'week' },
  // The batch page: every batch metric (003).
  ...metrics('batch', [
    'batch.used',
    'batch.unitPriceVsAverage',
    'batch.unitPriceVsPrevious',
    'batch.valueConsumed',
    'batch.consumptions',
    'batch.avgQuantity',
    'batch.minQuantity',
    'batch.maxQuantity',
    'batch.pace',
    'batch.waitBeforeFirst',
    'batch.timeToFinish',
    'batch.costPerTime',
  ]),
  // A consumption's details: every consumption metric (003).
  ...metrics('consumption', [
    'consumption.deltaQuantity',
    'consumption.quantityVsSubstanceAverage',
    'consumption.quantityVsBatchAverage',
    'consumption.deltaCost',
    'consumption.unitPriceVsStock',
    'consumption.unitPriceVsBatches',
    'consumption.rankInSubstance',
    'consumption.rankInBatch',
    'consumption.rankInDay',
    'consumption.sincePrevious',
    'consumption.hourVsUsual',
    'consumption.shareOfBatch',
  ]),
  // The metrics page: a few columns per table (003).
  ...metrics('metrics', [
    'substance.consumed',
    'substance.pace',
    'substance.cost',
    'substance.spend',
    'substance.sinceLast',
    'substance.stockTime',
    'batch.used',
    'batch.unitPriceVsAverage',
    'batch.pace',
    'batch.timeToFinish',
    'batch.valueConsumed',
    'consumption.deltaQuantity',
    'consumption.quantityVsSubstanceAverage',
    'consumption.unitPriceVsBatches',
    'consumption.sincePrevious',
    'consumption.rankInDay',
  ]),
  // The statistics page (004).
  { surface: 'statistics', section: 'Consumption', position: 1, metric: 'series.consumed', chart: 'line', scale: 'week' },
  { surface: 'statistics', section: 'Consumption', position: 2, metric: 'series.consumptions', chart: 'bar', scale: 'week' },
  { surface: 'statistics', section: 'Money', position: 3, metric: 'series.cost', chart: 'bar', scale: 'month' },
  { surface: 'statistics', section: 'Money', position: 4, metric: 'series.cost', chart: 'donut', scale: 'month' },
  { surface: 'statistics', section: 'Money', position: 5, metric: 'series.spend', chart: 'bar', scale: 'month' },
  { surface: 'statistics', section: 'Prices', position: 6, metric: 'series.unitPrice', chart: 'line', scale: 'month' },
  { surface: 'statistics', section: 'Habits', position: 7, metric: 'series.hourOfDay', chart: 'bar', scale: null },
  // The substances page (006).
  { surface: 'substances', section: null, position: 1, metric: 'series.consumed', chart: 'bar', scale: 'week' },
  { surface: 'substances', section: null, position: 2, metric: 'series.spend', chart: 'bar', scale: 'month' },
  { surface: 'substances', section: null, position: 3, metric: 'series.cost', chart: 'donut', scale: 'month' },
];
