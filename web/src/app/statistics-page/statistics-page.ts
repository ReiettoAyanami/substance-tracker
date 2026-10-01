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
import { Section, sectionsOf } from './sections';

/** The period the page starts with: charts over time want a longer one than the metrics. */
const DEFAULT_DAYS = 90;

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

  /** The charts by section, each with its series; null while loading (the settings too: a chart needs them). */
  protected readonly sections = computed<Section<{ item: ViewItem; definition: SeriesDefinition }>[] | null>(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue() || !this.settings.hasValue()) return null;
    const series = new Map(
      this.catalog
        .value()
        .filter((d): d is SeriesDefinition => d.scope === 'series')
        .map((d) => [d.key, d]),
    );
    const charts = this.items
      .value()
      .filter((item) => series.has(item.metric)) // not a series any more: /statistics/edit offers to remove it
      .map((item) => ({ item, definition: series.get(item.metric)!, section: item.section }));
    return sectionsOf(charts);
  });

  protected readonly failure = computed(() => {
    const failure = this.catalog.error() ?? this.items.error() ?? this.settings.error();
    if (!failure) return null;
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the charts${error.status ? ` (${error.status})` : ''}`;
  });

  protected chooseDays(days: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { days }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
