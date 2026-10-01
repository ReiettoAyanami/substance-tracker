import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../data/api-error';
import { MetricsApi } from '../../data/metrics-api';
import { SeriesDefinition } from '../../data/series';
import { Settings } from '../../data/settings';
import { ViewItem } from '../../data/view-item';
import { ViewsApi } from '../../data/views-api';
import { PERIODS, PeriodScale, periodLabel } from '../period-scale/period-scale';
import { readPreference, writePreference } from '../preferences';
import { Widget } from '../widget/widget';

/** The period of the charts panels, remembered by this browser; charts over time want a long one. */
const DAYS_KEY = 'substance-tracker.charts.days';
const readDays = () => readPreference<number>(DAYS_KEY, (v) => (PERIODS.some((p) => String(p.days) === v) ? Number(v) : null), 90);

/**
 * The charts of a substance (design-statistics.md, "widget"): the widgets the substance page lists
 * (its view items with a chart, edited from /statistics/edit, where the "tune" button leads), each
 * drawn for this substance with one line per batch and one for its one-time consumptions, in an
 * expansion panel under its metrics. Without a substance, the charts of the substances page (the
 * surface `substances`), one line per substance (lenzi, 2026-10-01). One period for the panel, remembered by this browser; each
 * chart its own interval. It asks nothing until it is first opened, and the charts' library comes
 * only then (a deferred block): the substance page does not carry it.
 */
@Component({
  selector: 'app-charts-panel',
  imports: [MatButtonModule, MatExpansionModule, MatIconModule, PeriodScale, RouterLink, Widget],
  templateUrl: './charts-panel.html',
  styleUrl: './charts-panel.css',
})
export class ChartsPanel {
  /** The substance drawn, a line per batch; null: the substances page's charts, a line per substance. */
  readonly substanceId = input<number | null>(null);
  readonly settings = input.required<Settings>();
  /** Starts open; closed, it asks for nothing until opened. */
  readonly open = input(false);
  /** Any new value asks for the charts' series again (e.g. the substance, after a write on its page). */
  readonly refresh = input<unknown>(null);

  private readonly api = inject(MetricsApi);
  private readonly views = inject(ViewsApi);

  protected readonly days = signal<number>(readDays());
  /** It was opened once: from then on it keeps its charts up to date. */
  protected readonly wasOpened = linkedSignal(() => this.open());

  protected readonly catalog = rxResource({
    params: () => (this.wasOpened() ? true : undefined),
    stream: () => this.api.getCatalog(),
  });

  protected readonly items = rxResource({
    params: () => (this.wasOpened() ? this.surface() : undefined),
    stream: ({ params }) => this.views.list(params),
  });

  /** The charts the substance page lists, each with its series (one the catalog no longer has is left out). */
  protected readonly charts = computed<{ item: ViewItem; definition: SeriesDefinition }[] | null>(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue()) return null;
    const series = new Map(
      this.catalog
        .value()
        .filter((d): d is SeriesDefinition => d.scope === 'series')
        .map((d) => [d.key, d]),
    );
    return this.items
      .value()
      .filter((item) => item.chart !== null && series.has(item.metric))
      .map((item) => ({ item, definition: series.get(item.metric)! }));
  });

  /** Whose charts: the substance page's, or the substances page's. */
  protected readonly surface = computed(() => (this.substanceId() === null ? ('substances' as const) : ('substance' as const)));
  /** The card of /statistics/edit its "tune" button opens. */
  protected readonly editSection = computed(() => (this.substanceId() === null ? 'substances-charts' : 'substance-charts'));
  /** The substances drawn (none: every one) and their lines. */
  protected readonly substanceIds = computed(() => {
    const id = this.substanceId();
    return id === null ? undefined : [id];
  });
  protected readonly by = computed(() => (this.substanceId() === null ? ('substance' as const) : ('batch' as const)));

  /** What the closed panel says: the period of the charts. */
  protected readonly summary = computed(() => periodLabel(this.days()));

  protected readonly failure = computed(() => {
    const failure = this.catalog.error() ?? this.items.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the charts${error.status ? ` (${error.status})` : ''}`;
  });

  protected chooseDays(days: number): void {
    this.days.set(days);
    writePreference(DAYS_KEY, String(days));
  }
}
