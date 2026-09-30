import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { of } from 'rxjs';

import { ApiError } from '../../data/api-error';
import { MetricDefinition, MetricScope, TIME_SCALES, TimeScale } from '../../data/metric';
import { MetricsApi } from '../../data/metrics-api';
import { Settings } from '../../data/settings';
import { ViewsApi } from '../../data/views-api';
import { MetricReading, MetricValuePipe } from '../metric-value-pipe';
import { PERIODS, PeriodScale, periodLabel } from '../period-scale/period-scale';

/** Display preferences of this browser, for every panel: localStorage, never the database. */
const PER_KEY = 'substance-tracker.metrics.per';
const DAYS_KEY = 'substance-tracker.metrics.days';

function read<T>(key: string, valid: (value: string) => T | null, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return (stored === null ? null : valid(stored)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered: the panel still changes.
  }
}

const readPer = () => read<TimeScale>(PER_KEY, (v) => (TIME_SCALES.includes(v as TimeScale) ? (v as TimeScale) : null), 'day');
const readDays = () => read<number>(DAYS_KEY, (v) => (PERIODS.some((p) => String(p.days) === v) ? Number(v) : null), 30);

/**
 * The metrics of one entity (design-statistics.md, "entity metrics panel"): the numbers the API
 * computes for it, one per line (the value, what it is, and on demand its description), in an
 * expansion panel like the batch and one-time lists of the substance page. One scale for the whole panel (hour … year: the user
 * chooses the interval of every rate and duration), and a period when some metric follows one.
 * Both are remembered by this browser. It asks the API when it is first opened, and again when the
 * scale, the period or `refresh` changes.
 */
@Component({
  selector: 'app-metrics-panel',
  imports: [MatButtonModule, MatExpansionModule, MatIconModule, MetricValuePipe, PeriodScale],
  templateUrl: './metrics-panel.html',
  styleUrl: './metrics-panel.css',
})
export class MetricsPanel {
  readonly scope = input.required<MetricScope>();
  /** The id of the substance or of the batch. */
  readonly entityId = input.required<number>();
  /** Unit of the substance the numbers are about. */
  readonly unit = input.required<string>();
  readonly settings = input.required<Settings>();
  /** Starts open (a page of its own); closed, it asks for nothing until opened. */
  readonly open = input(false);
  /** Any new value asks for the numbers again (e.g. the substance, after a write on its page). */
  readonly refresh = input<unknown>(null);

  private readonly api = inject(MetricsApi);
  private readonly views = inject(ViewsApi);

  protected readonly per = signal<TimeScale>(readPer());
  protected readonly days = signal<number>(readDays());
  /** The descriptions are shown under the numbers. */
  protected readonly explain = signal(false);
  /** It was opened once: from then on it keeps its numbers up to date. */
  protected readonly wasOpened = linkedSignal(() => this.open());

  protected readonly catalog = rxResource({
    params: () => (this.wasOpened() ? true : undefined),
    stream: () => this.api.getCatalog(),
  });

  /** What this page shows (the panel's surface is its scope), in order: lenzi's choices. */
  protected readonly items = rxResource({
    params: () => (this.wasOpened() ? this.scope() : undefined),
    stream: ({ params }) => this.views.list(params),
  });

  protected readonly metrics = rxResource({
    params: () =>
      this.wasOpened()
        ? { scope: this.scope(), id: this.entityId(), per: this.per(), days: this.days(), refresh: this.refresh() }
        : undefined,
    stream: ({ params }) => {
      switch (params.scope) {
        case 'substance':
          return this.api.getSubstanceMetrics(params.id, { per: params.per, ...(params.days ? { days: params.days } : {}) });
        case 'batch':
          return this.api.getBatchMetrics(params.id, { per: params.per });
        default:
          return of(null);
      }
    },
  });

  /** The metrics its surface lists, in their order (one the catalog no longer has is left out). */
  protected readonly shown = computed(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue()) return [];
    const byKey = new Map(this.catalog.value().map((m) => [m.key, m]));
    return this.items
      .value()
      .map((item) => byKey.get(item.metric))
      .filter((m): m is MetricDefinition => m !== undefined && m.scope === this.scope());
  });
  protected readonly hasScales = computed(() => this.shown().some((m) => m.scales.length > 0));
  protected readonly hasPeriod = computed(() => this.shown().some((m) => m.period));
  /** Everything is loaded, and this page shows nothing. */
  protected readonly empty = computed(() => this.catalog.hasValue() && this.items.hasValue() && this.shown().length === 0);

  protected readonly reading = computed<MetricReading>(() => ({
    unit: this.unit(),
    currency: this.settings().currency,
    per: this.per(),
  }));

  protected readonly values = computed(() => (this.metrics.hasValue() ? (this.metrics.value()?.values ?? null) : null));

  /** What the closed panel says: the period and the scale the numbers are in. */
  protected readonly summary = computed(() =>
    [
      this.hasPeriod() || !this.items.hasValue() ? periodLabel(this.days()) : null,
      this.hasScales() || !this.items.hasValue() ? `per ${this.per()}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  protected readonly failure = computed(() => {
    const failure = this.catalog.error() ?? this.items.error() ?? this.metrics.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the metrics${error.status ? ` (${error.status})` : ''}`;
  });

  protected choosePer(per: TimeScale): void {
    this.per.set(per);
    write(PER_KEY, per);
  }

  protected chooseDays(days: number): void {
    this.days.set(days);
    write(DAYS_KEY, String(days));
  }
}
