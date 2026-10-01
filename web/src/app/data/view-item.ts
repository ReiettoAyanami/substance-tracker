// Types of the Views API (design.md, Appendix B; design-statistics.md, "view_items"): what each
// page shows, in which order. lenzi's choices, edited from /statistics/edit.

/**
 * Where an item is shown: an entity's metrics panel (substance, batch, consumption), the metrics
 * page (one table per scope of the metric), or the statistics page (a chart).
 */
export type Surface = 'statistics' | 'metrics' | 'substance' | 'batch' | 'consumption';

export type Chart = 'bar' | 'line' | 'donut';

/** One item of GET /api/view-items. */
export interface ViewItem {
  id: number;
  surface: Surface;
  /** The statistics page's section; null elsewhere. */
  section: string | null;
  /** Order in the surface, from 1. */
  position: number;
  /** A key of the catalog (GET /api/metrics). */
  metric: string;
  /** How a chart of the statistics page is drawn; null elsewhere. */
  chart: Chart | null;
  /** The interval of a chart of the statistics page; null elsewhere. */
  scale: string | null;
  createdAt: string;
}

/** Body of POST /api/view-items: added at the end of its surface. A chart also has its chart, scale and section. */
export interface NewViewItem {
  surface: Surface;
  metric: string;
  section?: string | null;
  chart?: Chart;
  scale?: string | null;
}

/** Body of PATCH /api/view-items/:id: what changes of a chart of the statistics page. */
export interface ChartChange {
  section?: string | null;
  chart?: Chart;
  scale?: string | null;
}
