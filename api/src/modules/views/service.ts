import { withTransaction, type Pool } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../shared/errors.js';
import { toDbDateTime, toIso, truncateToSecond, type Clock } from '../../shared/time.js';
import { findMetric, findSeries, type SeriesDefinition } from '../metrics/catalog.js';
import * as repo from './repository.js';

/** One thing a page shows (design-statistics.md, "view_items"). */
export interface ViewItemDto {
  id: number;
  surface: repo.Surface;
  section: string | null;
  position: number;
  metric: string;
  chart: repo.Chart | null;
  scale: string | null;
  createdAt: string;
}

/** What a chart of the statistics page can change. */
export interface ChartPatch {
  section?: string | null | undefined;
  chart?: repo.Chart | undefined;
  scale?: string | null | undefined;
}

export interface NewViewItemInput {
  surface: repo.Surface;
  metric: string;
  section?: string | null | undefined;
  chart?: repo.Chart | null | undefined;
  scale?: string | null | undefined;
}

function toDto(row: repo.ViewItemRow): ViewItemDto {
  return {
    id: row.id,
    surface: row.surface,
    section: row.section,
    position: row.position,
    metric: row.metric,
    chart: row.chart,
    scale: row.scale,
    createdAt: toIso(row.created_at),
  };
}

/**
 * Views: what each page shows, in which order (lenzi's choices, edited from /statistics/edit).
 * A panel (substance, batch, consumption) lists metrics of its own entity, the metrics page those
 * of every entity (one table per scope), each once. Section, chart and scale belong to the charts
 * of the statistics page. Removing is a soft delete.
 */
export class ViewsService {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
  ) {}

  async list(surface: repo.Surface): Promise<ViewItemDto[]> {
    return (await repo.listViewItems(this.pool, surface)).map(toDto);
  }

  async add(input: NewViewItemInput): Promise<ViewItemDto> {
    if (input.surface === 'statistics') return this.addChart(input);
    const metric = findMetric(input.metric);
    if (!metric) throw badRequest(`metric "${input.metric}" is not in the catalog (GET /api/metrics)`, 'metric');
    if (input.surface !== 'metrics' && metric.scope !== input.surface) {
      throw badRequest(`the ${input.surface} page shows ${input.surface} metrics, not ${metric.scope} ones`, 'metric');
    }
    for (const field of ['section', 'chart', 'scale'] as const) {
      if (input[field] !== undefined && input[field] !== null) {
        throw badRequest(`${field} is for the charts of the statistics page`, field);
      }
    }
    const id = await withTransaction(this.pool, async (conn) => {
      const items = await repo.listViewItems(conn, input.surface, { forUpdate: true });
      if (items.some((i) => i.metric === input.metric)) {
        throw conflict('duplicate', `the ${input.surface} page already shows ${input.metric}`);
      }
      return repo.insertViewItem(conn, {
        surface: input.surface,
        section: null,
        position: (await repo.lastPosition(conn, input.surface)) + 1,
        metric: input.metric,
        chart: null,
        scale: null,
        created_at: toDbDateTime(truncateToSecond(this.clock())),
      });
    });
    return toDto((await repo.findViewItem(this.pool, id))!);
  }

  /** A chart of the statistics page: a series, one of the charts that draw it, its interval, a section. */
  private async addChart(input: NewViewItemInput): Promise<ViewItemDto> {
    const series = findSeries(input.metric);
    if (!series) throw badRequest(`the statistics page draws series: "${input.metric}" is not one`, 'metric');
    if (!input.chart) throw badRequest('a chart of the statistics page needs its chart: bar, line or donut', 'chart');
    const chart = checkChart(series, { chart: input.chart, scale: input.scale ?? null });
    const id = await withTransaction(this.pool, async (conn) =>
      repo.insertViewItem(conn, {
        surface: 'statistics',
        section: sectionOf(input.section),
        position: (await repo.lastPosition(conn, 'statistics')) + 1,
        metric: series.key,
        chart: chart.chart,
        scale: chart.scale,
        created_at: toDbDateTime(truncateToSecond(this.clock())),
      }),
    );
    return toDto((await repo.findViewItem(this.pool, id))!);
  }

  /** Changes a chart of the statistics page: its chart, its interval, its section. */
  async changeChart(id: number, patch: ChartPatch): Promise<ViewItemDto> {
    const row = await repo.findViewItem(this.pool, id);
    if (!row || row.deleted_at) throw notFound('View item', id);
    if (row.surface !== 'statistics') throw badRequest('only the charts of the statistics page change', 'id');
    const series = findSeries(row.metric);
    if (!series) throw badRequest(`"${row.metric}" is not a series any more: remove it`, 'metric');
    const chart = checkChart(series, {
      chart: patch.chart ?? row.chart ?? 'bar',
      scale: patch.scale === undefined ? row.scale : patch.scale,
    });
    await repo.updateChart(this.pool, id, {
      ...(patch.chart !== undefined ? { chart: chart.chart } : {}),
      ...(patch.scale !== undefined ? { scale: chart.scale } : {}),
      ...(patch.section !== undefined ? { section: sectionOf(patch.section) } : {}),
    });
    return toDto((await repo.findViewItem(this.pool, id))!);
  }

  async remove(id: number): Promise<void> {
    const row = await repo.findViewItem(this.pool, id);
    if (!row || row.deleted_at) throw notFound('View item', id);
    await repo.softDeleteViewItem(this.pool, id, toDbDateTime(truncateToSecond(this.clock())));
  }

  /** Puts the surface in the order of `ids`: every item of it, each once. */
  async reorder(surface: repo.Surface, ids: number[]): Promise<ViewItemDto[]> {
    await withTransaction(this.pool, async (conn) => {
      const items = await repo.listViewItems(conn, surface, { forUpdate: true });
      const known = new Set(items.map((i) => i.id));
      if (new Set(ids).size !== ids.length || ids.length !== items.length || !ids.every((id) => known.has(id))) {
        throw badRequest(`ids must be every item of the ${surface} page, each once`, 'ids');
      }
      for (const [index, id] of ids.entries()) await repo.setPosition(conn, id, index + 1);
    });
    return this.list(surface);
  }
}

/** A chart must be one that draws the series, in one of its intervals (none for the hours of the day). */
function checkChart(series: SeriesDefinition, input: { chart: repo.Chart; scale: string | null }): { chart: repo.Chart; scale: string | null } {
  if (!series.charts.includes(input.chart)) {
    throw badRequest(`${series.label} is drawn as ${series.charts.join(', ')}, not as ${input.chart}`, 'chart');
  }
  if (series.scales.length === 0) {
    if (input.scale !== null) throw badRequest(`${series.label} has no interval: its periods are its meaning`, 'scale');
    return { chart: input.chart, scale: null };
  }
  if (input.scale === null || !(series.scales as string[]).includes(input.scale)) {
    throw badRequest(`${series.label} groups by ${series.scales.join(', ')}`, 'scale');
  }
  return { chart: input.chart, scale: input.scale };
}

/** A section's name, trimmed; blank is no section. */
function sectionOf(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? '';
  return text === '' ? null : text;
}
