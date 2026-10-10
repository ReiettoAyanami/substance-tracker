import { Component, computed, inject, input, linkedSignal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggleGroup, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ApiError } from '../../data/api-error';
import { MetricsApi } from '../../data/metrics-api';
import { SeriesDefinition, SeriesScale } from '../../data/series';
import { Settings } from '../../data/settings';
import { ViewItem } from '../../data/view-item';
import { ViewsApi } from '../../data/views-api';
import { Chart } from '../chart/chart';
import { refreshOnPull } from '../../refresh/page-refresh';
import { keptValue } from '../kept-value';

/**
 * A widget (design-statistics.md, "widget"): a chart with its settings, a view item of the
 * statistics page (which series, drawn how, in which interval). It asks the API for its series in
 * the period of its page, and shows it in a Material card under the series' name. Reusable: the
 * statistics page shows every one, a substance's page one of its own (`substanceIds`, `by`).
 * Each card chooses its own interval (lenzi, 2026-10-01: "ogni card suo toggle"): a toggle of the
 * series' intervals, drawn at once and saved on the chart, the same field /statistics/edit edits.
 */
@Component({
  selector: 'app-widget',
  imports: [Chart, MatButtonToggleModule, MatCardModule, MatIconModule],
  templateUrl: './widget.html',
  styleUrl: './widget.css',
})
export class Widget {
  readonly item = input.required<ViewItem>();
  readonly definition = input.required<SeriesDefinition>();
  /** The period: the last N days; 0 = all time. */
  readonly days = input(0);
  readonly settings = input.required<Settings>();
  /** Only these substances; none: every one not archived. */
  readonly substanceIds = input<number[] | undefined>(undefined);
  /** One line per substance, or per batch (and the one-time consumptions) of each. */
  readonly by = input<'substance' | 'batch'>('substance');
  /** Any new value asks for the series again (e.g. the substance, after a write on its page). */
  readonly refresh = input<unknown>(null);

  private readonly api = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly snackBar = inject(MatSnackBar);

  /** The chart's interval: its own, or the one just chosen on the card. */
  protected readonly scale = linkedSignal(() => this.item().scale as SeriesScale | null);

  /** The intervals the toggle offers: the series' own; none for the shares of the whole period (donut, treemap) or the hours of the day. */
  private readonly toggle = viewChild(MatButtonToggleGroup);

  protected readonly scales = computed(() => (isShare(this.item().chart) || this.scale() === null ? [] : this.definition().scales));

  protected readonly series = rxResource({
    params: () => ({
      metric: this.item().metric,
      per: this.scale() ?? undefined,
      days: this.days(),
      substanceIds: this.substanceIds(),
      by: this.by(),
      refresh: this.refresh(),
    }),
    stream: ({ params: { metric, per, days, substanceIds, by } }) =>
      this.api.getSeries({
        metric,
        ...(per ? { per } : {}),
        ...(days ? { days } : {}),
        ...(substanceIds?.length ? { substanceIds } : {}),
        ...(by === 'batch' ? { by } : {}),
      }),
  });

  /**
   * The series on screen: the last one stays while another interval or period loads, so the chart
   * redraws in place instead of being built again (and replaying its opening). Another chart, other
   * substances or lines by batch are another thing: then it waits empty.
   */
  protected readonly shownSeries = keptValue(this.series, () =>
    JSON.stringify([this.item().id, this.item().metric, this.substanceIds(), this.by()]),
  );

  constructor() {
    refreshOnPull([this.series]);
  }

  /**
   * The icon by the title (the reference photo: an icon at the head of every card), from what the
   * series measures: quantities, counts, money, prices, or the hours of the day.
   */
  protected readonly icon = computed(() => {
    const definition = this.definition();
    if (definition.scales.length === 0) return 'schedule';
    return { quantity: 'inventory_2', count: 'numbers', money: 'payments', unitPrice: 'sell' }[definition.unit];
  });

  /** What a donut or a treemap says under its name: the share of the whole period (the others have their toggle). */
  protected readonly subtitle = computed(() => (isShare(this.item().chart) ? 'share of the period' : ''));

  protected readonly failure = computed(() => {
    const failure = this.series.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the chart${error.status ? ` (${error.status})` : ''}`;
  });

  /** Draws the chart in another interval at once and saves it; not saved, back to the one it had. */
  protected async chooseScale(scale: SeriesScale): Promise<void> {
    const before = this.scale();
    if (scale === before) return;
    this.scale.set(scale);
    try {
      await firstValueFrom(this.views.change(this.item().id, { scale }));
    } catch (error) {
      this.scale.set(before);
      // The toggle chose by itself: when the answer comes before the page is drawn again, the
      // binding never sees a change, so it is put back here too.
      const toggle = this.toggle();
      if (toggle) toggle.value = before;
      const problem = error as Partial<ApiError>;
      this.snackBar.open(`Not saved: ${problem.detail || problem.title || 'the API did not answer'}`, 'OK', { duration: 6000 });
    }
  }
}

/** The charts of the lines' totals over the whole period: shares, no interval of their own. */
function isShare(chart: ViewItem['chart']): boolean {
  return chart === 'donut' || chart === 'treemap';
}
