import { Component, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiError } from '../data/api-error';
import { MetricDefinition, MetricScope } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { SeriesDefinition } from '../data/series';
import { ChartChange, Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { ChartList, NewChart } from './chart-list/chart-list';
import { ViewItemList } from './view-item-list/view-item-list';

/** One place that shows metrics: a panel, or one table of the metrics page (a scope of it). */
export interface MetricsPlace {
  kind: 'metrics';
  /** Its anchor: `?section=` scrolls to it. */
  id: string;
  surface: Exclude<Surface, 'statistics'>;
  scope: MetricScope;
  title: string;
  hint: string;
}

/**
 * One place that draws charts: the statistics page (in sections), the substance page (for its
 * substance), the substances page (a line per substance).
 */
export interface ChartsPlace {
  kind: 'charts';
  id: string;
  surface: 'statistics' | 'substance' | 'substances';
  sections: boolean;
  title: string;
  hint: string;
}

export type Place = MetricsPlace | ChartsPlace;

export const PLACES: readonly Place[] = [
  { kind: 'charts', id: 'statistics', surface: 'statistics', sections: true, title: 'Statistics page', hint: 'Its charts, by section.' },
  {
    kind: 'charts',
    id: 'substances-charts',
    surface: 'substances',
    sections: false,
    title: 'Substances page: charts',
    hint: 'The charts next to the list of substances: a line per substance.',
  },
  {
    kind: 'metrics',
    id: 'substance',
    surface: 'substance',
    scope: 'substance',
    title: 'Substance page: metrics',
    hint: 'The metrics panel under a substance.',
  },
  {
    kind: 'charts',
    id: 'substance-charts',
    surface: 'substance',
    sections: false,
    title: 'Substance page: charts',
    hint: 'The charts panel under a substance: a line per batch.',
  },
  { kind: 'metrics', id: 'batch', surface: 'batch', scope: 'batch', title: 'Batch page', hint: 'The metrics panel of a batch.' },
  {
    kind: 'metrics',
    id: 'consumption',
    surface: 'consumption',
    scope: 'consumption',
    title: 'Consumption details',
    hint: 'What Details shows of a consumption.',
  },
  {
    kind: 'metrics',
    id: 'metrics-substance',
    surface: 'metrics',
    scope: 'substance',
    title: 'Metrics page: substances',
    hint: 'The columns of the table, also on the substances page.',
  },
  { kind: 'metrics', id: 'metrics-batch', surface: 'metrics', scope: 'batch', title: 'Metrics page: batches', hint: 'The columns of the table.' },
  {
    kind: 'metrics',
    id: 'metrics-consumption',
    surface: 'metrics',
    scope: 'consumption',
    title: 'Metrics page: consumptions',
    hint: 'The columns of the table.',
  },
];

/** A place with what it shows: its metrics and those it can add, or its charts and the series. */
type Entry =
  | { kind: 'metrics'; place: MetricsPlace; metrics: MetricDefinition[]; items: ViewItem[] | null }
  | { kind: 'charts'; place: ChartsPlace; series: SeriesDefinition[]; items: ViewItem[] | null };

/**
 * What the pages show (design-statistics.md, "/statistics/edit"): for each place that shows metrics
 * (the panels of a substance, a batch and a consumption, the three tables of the metrics page),
 * its metrics in order, each with the catalog's description, to move up or down, remove, or add;
 * for each place that draws charts (the statistics page, by section; the substance page), its
 * charts, each drawn by a chart in an interval. Every change is written at once (view items), and
 * the list is asked again: the order and the ids are the API's. A metric can be shown once per
 * place, a series drawn more than once. `?section=<place>` opens the page at it.
 */
@Component({
  selector: 'app-statistics-edit-page',
  imports: [ChartList, MatCardModule, ViewItemList],
  templateUrl: './statistics-edit-page.html',
  styleUrl: './statistics-edit-page.css',
})
export class StatisticsEditPage {
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly places = PLACES;
  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });

  private readonly surfaces: Record<Surface, ReturnType<typeof this.surfaceResource>> = {
    statistics: this.surfaceResource('statistics'),
    substance: this.surfaceResource('substance'),
    batch: this.surfaceResource('batch'),
    consumption: this.surfaceResource('consumption'),
    metrics: this.surfaceResource('metrics'),
    substances: this.surfaceResource('substances'),
  };

  /** A write is running: the lists ask nothing more until it ends. */
  protected readonly busy = signal(false);

  /** Each place with its items and what it can show; null while loading. */
  protected readonly view = computed<Entry[] | null>(() => {
    if (!this.catalog.hasValue()) return null;
    const catalog = this.catalog.value();
    const scopeOf = new Map(catalog.map((m) => [m.key, m.scope]));
    const series = catalog.filter((d): d is SeriesDefinition => d.scope === 'series');
    return PLACES.map((place): Entry => {
      const resource = this.surfaces[place.surface];
      const items = resource.hasValue() ? resource.value() : null;
      // an item with a chart is a chart; the substance page has both
      if (place.kind === 'charts') return { kind: 'charts', place, series, items: items?.filter((i) => i.chart !== null) ?? null };
      return {
        kind: 'metrics',
        place,
        metrics: catalog.filter((m): m is MetricDefinition => m.scope === place.scope),
        // on the metrics page, the scope of the metric says which table it is a column of
        items: items?.filter((i) => i.chart === null && (place.surface !== 'metrics' || scopeOf.get(i.metric) === place.scope)) ?? null,
      };
    });
  });

  protected readonly failure = computed(() => {
    const failure = this.catalog.error() ?? Object.values(this.surfaces).find((r) => r.error())?.error();
    if (!failure) return null;
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load what the pages show${error.status ? ` (${error.status})` : ''}`;
  });

  constructor() {
    // Opened for one place (`?section=`): the page starts at it, once it is there.
    const section = inject(ActivatedRoute).snapshot.queryParamMap.get('section');
    const host = inject(ElementRef<HTMLElement>);
    if (section) {
      const scroll = () => {
        const cards = (host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mat-card[id]');
        const target = Array.from(cards).find((card) => card.id === section);
        if (target) target.scrollIntoView({ block: 'start' });
        else if (cards.length === 0) setTimeout(scroll, 100); // not there yet: still loading
      };
      afterNextRender(() => scroll());
    }
  }

  protected add(place: MetricsPlace, metric: string): Promise<void> {
    return this.write(place.surface, this.views.add({ surface: place.surface, metric }));
  }

  protected addChart(place: ChartsPlace, chart: NewChart): Promise<void> {
    return this.write(place.surface, this.views.add({ surface: place.surface, ...chart }));
  }

  protected changeChart(place: ChartsPlace, item: ViewItem, change: ChartChange): Promise<void> {
    return this.write(place.surface, this.views.change(item.id, change));
  }

  /** The charts in their new order, in the places charts hold in the surface: the metrics of the substance page keep theirs. */
  protected reorderCharts(place: ChartsPlace, ids: number[]): Promise<void> {
    const charts = [...ids];
    const all = (this.surfaces[place.surface].value() ?? []).map((i) => (i.chart !== null ? charts.shift()! : i.id));
    return this.write(place.surface, this.views.reorder(place.surface, all));
  }

  protected renameSection(from: string | null, to: string): Promise<void> {
    return this.write('statistics', this.views.renameSection(from, to));
  }

  protected remove(place: Place, item: ViewItem): Promise<void> {
    return this.write(place.surface, this.views.remove(item.id));
  }

  /**
   * Moves an item one place up or down among the items of its place. On the metrics page the three
   * tables share one order: the others keep their positions, the place's items swap theirs.
   */
  protected move(place: MetricsPlace, item: ViewItem, by: -1 | 1): Promise<void> {
    const all = this.surfaces[place.surface].value() ?? [];
    const mine = this.view()?.find((v) => v.place.id === place.id)?.items ?? [];
    const index = mine.findIndex((i) => i.id === item.id);
    const other = mine[index + by];
    if (!other) return Promise.resolve();
    const ids = all.map((i) => (i.id === item.id ? other.id : i.id === other.id ? item.id : i.id));
    return this.write(place.surface, this.views.reorder(place.surface, ids));
  }

  private surfaceResource(surface: Surface) {
    return rxResource({ stream: () => this.views.list(surface) });
  }

  /** Runs one write, then asks the surface again; says why when it fails. */
  private async write(surface: Surface, request: Observable<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(request, { defaultValue: undefined });
    } catch (error) {
      const problem = error as Partial<ApiError>;
      this.snackBar.open(`Not saved: ${problem.detail || problem.title || 'the API did not answer'}`, 'OK', { duration: 6000 });
    } finally {
      this.surfaces[surface].reload();
      this.busy.set(false);
    }
  }
}
