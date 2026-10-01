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

/**
 * The surfaces that draw charts: the statistics page (in sections), the substance page (for its
 * substance), the substances page (one line per substance; charts only).
 */
const CHART_SURFACES: readonly repo.Surface[] = ['statistics', 'substance', 'substances'];

/** What a chart can change (the section: on the statistics page only). */
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
 * of every entity (one table per scope), each once. Chart and scale belong to the charts: those of
 * the statistics page, in sections, and those of the substance page (an item of its surface with a
 * chart, drawn for the substance), which share the order of its panel's metrics. Removing is a soft
 * delete.
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
    if (input.surface === 'statistics' || input.surface === 'substances' || findSeries(input.metric)) return this.addChart(input);
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

  /**
   * A chart: a series, one of the charts that draw it, its interval; on the statistics page a
   * section, on the substance page none (it is drawn for the substance, under its metrics).
   */
  private async addChart(input: NewViewItemInput): Promise<ViewItemDto> {
    if (!CHART_SURFACES.includes(input.surface)) {
      throw badRequest(`the ${input.surface} page draws no charts: the statistics, the substance and the substances pages do`, 'surface');
    }
    const series = findSeries(input.metric);
    if (!series) throw badRequest(`the ${input.surface} page draws series: "${input.metric}" is not one`, 'metric');
    if (!input.chart) throw badRequest('a chart needs its chart: bar, line or donut', 'chart');
    const chart = checkChart(series, { chart: input.chart, scale: input.scale ?? null });
    const section = sectionFor(input.surface, input.section);
    const id = await withTransaction(this.pool, async (conn) =>
      repo.insertViewItem(conn, {
        surface: input.surface,
        section,
        position: (await repo.lastPosition(conn, input.surface)) + 1,
        metric: series.key,
        chart: chart.chart,
        scale: chart.scale,
        created_at: toDbDateTime(truncateToSecond(this.clock())),
      }),
    );
    return toDto((await repo.findViewItem(this.pool, id))!);
  }

  /** Changes a chart: its chart, its interval, its section (the statistics page's). */
  async changeChart(id: number, patch: ChartPatch): Promise<ViewItemDto> {
    const row = await repo.findViewItem(this.pool, id);
    if (!row || row.deleted_at) throw notFound('View item', id);
    if (row.chart === null) throw badRequest('only charts change: this is a metric of a panel or of the metrics page', 'id');
    const series = findSeries(row.metric);
    if (!series) throw badRequest(`"${row.metric}" is not a series any more: remove it`, 'metric');
    const chart = checkChart(series, {
      chart: patch.chart ?? row.chart,
      scale: patch.scale === undefined ? row.scale : patch.scale,
    });
    await repo.updateChart(this.pool, id, {
      ...(patch.chart !== undefined ? { chart: chart.chart } : {}),
      ...(patch.scale !== undefined ? { scale: chart.scale } : {}),
      ...(patch.section !== undefined ? { section: sectionFor(row.surface, patch.section) } : {}),
    });
    return toDto((await repo.findViewItem(this.pool, id))!);
  }

  /**
   * Renames a section of the statistics page: every chart in `from` (null: those without one) takes
   * `to` (blank: no section), keeping its place; a name another section has merges the two.
   */
  async renameSection(from: string | null, to: string | null): Promise<ViewItemDto[]> {
    const source = sectionOf(from);
    const target = sectionOf(to);
    await withTransaction(this.pool, async (conn) => {
      const moved = (await repo.listViewItems(conn, 'statistics', { forUpdate: true })).filter((i) => i.section === source);
      if (moved.length === 0) {
        throw badRequest(
          source === null ? 'every chart of the statistics page has a section' : `no chart of the statistics page is in "${source}"`,
          'from',
        );
      }
      for (const item of moved) await repo.updateChart(conn, item.id, { section: target });
    });
    return this.list('statistics');
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

/** The section of a chart of `surface`: only the statistics page has sections. */
function sectionFor(surface: repo.Surface, raw: string | null | undefined): string | null {
  const section = sectionOf(raw);
  if (section !== null && surface !== 'statistics') {
    throw badRequest(`the ${surface} page has no sections: only the statistics page does`, 'section');
  }
  return section;
}
