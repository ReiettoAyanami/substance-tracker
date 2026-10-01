// Types of GET /api/series (design.md, Appendix B; design-statistics.md, "series"): what a chart
// draws. Every value is a decimal string computed by the API; the chart only reads it.

/** How a chart draws a series. */
export type ChartType = 'bar' | 'line' | 'donut' | 'treemap' | 'radar';

/** The intervals a series groups by. */
export type SeriesScale = 'day' | 'week' | 'month' | 'year';

export const SERIES_SCALES: readonly SeriesScale[] = ['day', 'week', 'month', 'year'];

/** One entry of the catalog with scope `series`. */
export interface SeriesDefinition {
  key: string;
  scope: 'series';
  label: string;
  /** quantity: each line in its own unit; unitPrice: money per unit. */
  unit: 'quantity' | 'count' | 'money' | 'unitPrice';
  /** The intervals it groups by; empty for the hours of the day. */
  scales: SeriesScale[];
  period: true;
  /** The charts that can draw it. */
  charts: ChartType[];
  description: string;
}

/** One line of a chart: a substance, a batch, or the one-time consumptions of a substance. */
export interface SeriesLine {
  key: string;
  kind: 'substance' | 'batch' | 'one_time';
  id: number;
  substanceId: number;
  /** The substance's or the batch's name; null for a batch without one, and for the one-time line. */
  name: string | null;
  unit: string;
  /** When a batch was bought; null for the others. */
  occurredAt: string | null;
  /** One per period; null where there is nothing (a price with no purchase). */
  values: (string | null)[];
  total: string | null;
}

/** GET /api/series. */
export interface SeriesData {
  metric: string;
  per: SeriesScale | null;
  by: 'substance' | 'batch';
  from: string;
  to: string;
  /** '2026-09-29', '2026-W40', '2026-09', '2026', or the hours '00'..'23'. */
  periods: string[];
  series: SeriesLine[];
}

/** What a series is asked for: its key, the scale, the period (the last N days; none: all time), whose lines. */
export interface SeriesQuery {
  metric: string;
  per?: SeriesScale;
  days?: number;
  by?: 'substance' | 'batch';
  substanceIds?: number[];
}
