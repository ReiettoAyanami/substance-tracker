import { Component, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiError } from '../data/api-error';
import { MetricDefinition, MetricScope } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { Surface, ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { ViewItemList } from './view-item-list/view-item-list';

/** The surfaces this page edits so far (the charts of the statistics page come later). */
type EditedSurface = Exclude<Surface, 'statistics'>;

/** One place that shows metrics: a surface, or one table of the metrics page (a scope of it). */
export interface Place {
  /** Its anchor: `?section=` scrolls to it. */
  id: string;
  surface: EditedSurface;
  scope: MetricScope;
  title: string;
  hint: string;
}

export const PLACES: readonly Place[] = [
  { id: 'substance', surface: 'substance', scope: 'substance', title: 'Substance page', hint: 'The metrics panel under a substance.' },
  { id: 'batch', surface: 'batch', scope: 'batch', title: 'Batch page', hint: 'The metrics panel of a batch.' },
  {
    id: 'consumption',
    surface: 'consumption',
    scope: 'consumption',
    title: 'Consumption details',
    hint: 'What Details shows of a consumption.',
  },
  { id: 'metrics-substance', surface: 'metrics', scope: 'substance', title: 'Metrics page: substances', hint: 'The columns of the table.' },
  { id: 'metrics-batch', surface: 'metrics', scope: 'batch', title: 'Metrics page: batches', hint: 'The columns of the table.' },
  {
    id: 'metrics-consumption',
    surface: 'metrics',
    scope: 'consumption',
    title: 'Metrics page: consumptions',
    hint: 'The columns of the table.',
  },
];

/**
 * What the pages show (design-statistics.md, "/statistics/edit"): for each place that shows metrics
 * (the panels of a substance, a batch and a consumption, the three tables of the metrics page),
 * its metrics in order, each with the catalog's description, to move up or down, remove, or add.
 * Every change is written at once (view items), and the list is asked again: the order and the ids
 * are the API's. A metric can be shown once per place. `?section=<place>` opens the page at it.
 */
@Component({
  selector: 'app-statistics-edit-page',
  imports: [MatCardModule, ViewItemList],
  templateUrl: './statistics-edit-page.html',
  styleUrl: './statistics-edit-page.css',
})
export class StatisticsEditPage {
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly places = PLACES;
  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });

  private readonly surfaces: Record<EditedSurface, ReturnType<typeof this.surfaceResource>> = {
    substance: this.surfaceResource('substance'),
    batch: this.surfaceResource('batch'),
    consumption: this.surfaceResource('consumption'),
    metrics: this.surfaceResource('metrics'),
  };

  /** A write is running: the lists ask nothing more until it ends. */
  protected readonly busy = signal(false);

  /** Each place with its items and the metrics it can show; null while loading. */
  protected readonly view = computed(() => {
    if (!this.catalog.hasValue()) return null;
    const catalog = this.catalog.value();
    const scopeOf = new Map(catalog.map((m) => [m.key, m.scope]));
    return PLACES.map((place) => {
      const resource = this.surfaces[place.surface];
      const items = resource.hasValue() ? resource.value() : null;
      return {
        place,
        metrics: catalog.filter((m) => m.scope === place.scope),
        // on the metrics page, the scope of the metric says which table it is a column of
        items: items?.filter((i) => place.surface !== 'metrics' || scopeOf.get(i.metric) === place.scope) ?? null,
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
        const target = (host.nativeElement as HTMLElement).querySelector(`#${CSS.escape(section)}`);
        if (target) target.scrollIntoView({ block: 'start' });
        else setTimeout(scroll, 100);
      };
      afterNextRender(() => scroll());
    }
  }

  protected add(place: Place, metric: string): Promise<void> {
    return this.write(place.surface, this.views.add({ surface: place.surface, metric }));
  }

  protected remove(place: Place, item: ViewItem): Promise<void> {
    return this.write(place.surface, this.views.remove(item.id));
  }

  /**
   * Moves an item one place up or down among the items of its place. On the metrics page the three
   * tables share one order: the others keep their positions, the place's items swap theirs.
   */
  protected move(place: Place, item: ViewItem, by: -1 | 1): Promise<void> {
    const all = this.surfaces[place.surface].value() ?? [];
    const mine = this.view()?.find((v) => v.place.id === place.id)?.items ?? [];
    const index = mine.findIndex((i) => i.id === item.id);
    const other = mine[index + by];
    if (!other) return Promise.resolve();
    const ids = all.map((i) => (i.id === item.id ? other.id : i.id === other.id ? item.id : i.id));
    return this.write(place.surface, this.views.reorder(place.surface, ids));
  }

  private surfaceResource(surface: EditedSurface) {
    return rxResource({ stream: () => this.views.list(surface) });
  }

  /** Runs one write, then asks the surface again; says why when it fails. */
  private async write(surface: EditedSurface, request: Observable<unknown>): Promise<void> {
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
