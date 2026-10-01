import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';

import { ApiError } from '../../data/api-error';
import { MetricsApi } from '../../data/metrics-api';
import { SeriesDefinition, SeriesScale } from '../../data/series';
import { ViewItem } from '../../data/view-item';
import { Chart } from '../chart/chart';

/**
 * A widget (design-statistics.md, "widget"): a chart with its settings, a view item of the
 * statistics page (which series, drawn how, in which interval). It asks the API for its series in
 * the period of its page, and shows it in a Material card under the series' name. Reusable: the
 * statistics page shows every one, a substance's page one of its own (`substanceIds`, `by`).
 */
@Component({
  selector: 'app-widget',
  imports: [Chart, MatCardModule],
  templateUrl: './widget.html',
  styleUrl: './widget.css',
})
export class Widget {
  readonly item = input.required<ViewItem>();
  readonly definition = input.required<SeriesDefinition>();
  /** The period: the last N days; 0 = all time. */
  readonly days = input(0);
  readonly currency = input('EUR');
  /** Only these substances; none: every one not archived. */
  readonly substanceIds = input<number[] | undefined>(undefined);
  /** One line per substance, or per batch (and the one-time consumptions) of each. */
  readonly by = input<'substance' | 'batch'>('substance');

  private readonly api = inject(MetricsApi);

  protected readonly series = rxResource({
    params: () => ({
      metric: this.item().metric,
      per: (this.item().scale as SeriesScale | null) ?? undefined,
      days: this.days(),
      substanceIds: this.substanceIds(),
      by: this.by(),
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

  /** What the card says under its name: "per month"; a donut is the share of the whole period. */
  protected readonly subtitle = computed(() => {
    if (this.item().chart === 'donut') return 'share of the period';
    const scale = this.item().scale;
    return scale ? `per ${scale}` : '';
  });

  protected readonly failure = computed(() => {
    const failure = this.series.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the chart${error.status ? ` (${error.status})` : ''}`;
  });
}
