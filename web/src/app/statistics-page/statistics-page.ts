import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { ApiError } from '../data/api-error';
import { MetricsApi } from '../data/metrics-api';
import { SeriesDefinition } from '../data/series';
import { SettingsApi } from '../data/settings-api';
import { ViewItem } from '../data/view-item';
import { ViewsApi } from '../data/views-api';
import { PERIODS, PeriodScale } from '../ui/period-scale/period-scale';
import { Widget } from '../ui/widget/widget';

/** The period the page starts with: charts over time want a longer one than the metrics. */
const DEFAULT_DAYS = 90;

/** A section of the page: its name (null: the charts without one) and its charts, in order. */
interface Section {
  name: string | null;
  charts: { item: ViewItem; definition: SeriesDefinition }[];
}

/**
 * The statistics page (design-statistics.md, "statistics page"): charts over time, the widgets the
 * page lists (view items of the surface `statistics`), grouped in their sections in the order of
 * their first chart. One period for the whole page, in the URL; each chart has its own interval.
 * Written on the page: statistics show time, the metrics page compares. Its "tune" button opens
 * /statistics/edit at the charts.
 */
@Component({
  selector: 'app-statistics-page',
  imports: [MatButtonModule, MatIconModule, PeriodScale, RouterLink, Widget],
  templateUrl: './statistics-page.html',
  styleUrl: './statistics-page.css',
})
export class StatisticsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly settingsApi = inject(SettingsApi);

  /** The period of the URL (`?days=`), the page's default without one. */
  protected readonly days = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const days = Number(params.get('days'));
        return params.has('days') && PERIODS.some((p) => p.days === days) ? days : DEFAULT_DAYS;
      }),
    ),
    { requireSync: true },
  );

  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });
  protected readonly items = rxResource({ stream: () => this.views.list('statistics') });
  protected readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });

  protected readonly sections = computed<Section[] | null>(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue()) return null;
    const series = new Map(
      this.catalog
        .value()
        .filter((d): d is SeriesDefinition => d.scope === 'series')
        .map((d) => [d.key, d]),
    );
    const sections: Section[] = [];
    for (const item of this.items.value()) {
      const definition = series.get(item.metric);
      if (!definition) continue; // not a series any more: /statistics/edit offers to remove it
      let section = sections.find((s) => s.name === item.section);
      if (!section) sections.push((section = { name: item.section, charts: [] }));
      section.charts.push({ item, definition });
    }
    return sections;
  });

  protected readonly currency = computed(() => (this.settings.hasValue() ? this.settings.value().currency : 'EUR'));

  protected readonly failure = computed(() => {
    const failure = this.catalog.error() ?? this.items.error();
    if (!failure) return null;
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the charts${error.status ? ` (${error.status})` : ''}`;
  });

  protected chooseDays(days: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { days }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
