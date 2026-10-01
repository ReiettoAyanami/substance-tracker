import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { Sort } from '@angular/material/sort';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';

import { ApiError } from '../../data/api-error';
import { MetricDefinition, MetricsRow, MetricsTable as TableData, TIME_SCALES, TimeScale } from '../../data/metric';
import { MetricsApi } from '../../data/metrics-api';
import { Settings } from '../../data/settings';
import { ViewsApi } from '../../data/views-api';
import { MetricsTable } from '../../ui/metrics-table/metrics-table';
import { PERIODS, PeriodScale, periodLabel } from '../../ui/period-scale/period-scale';
import { readPreference, writePreference } from '../../ui/preferences';

/** The choices of this panel, remembered by this browser. */
const PER_KEY = 'substance-tracker.substances.metrics.per';
const DAYS_KEY = 'substance-tracker.substances.metrics.days';

const readPer = () => readPreference<TimeScale>(PER_KEY, (v) => (TIME_SCALES.includes(v as TimeScale) ? (v as TimeScale) : null), 'day');
const readDays = () => readPreference<number>(DAYS_KEY, (v) => (PERIODS.some((p) => String(p.days) === v) ? Number(v) : null), 30);

/**
 * The metrics of the substances, on the substances page (design-statistics.md, "substances
 * overview"; lenzi, 2026-10-01: a metrics table without opening a card): the metrics page's
 * substances table, the same columns (chosen once, in /statistics/edit, where "tune" leads), in an
 * expansion panel. One period and one scale for the panel, remembered by this browser; the rows'
 * order is the panel's. A row opens its substance. It asks nothing until it is first opened.
 */
@Component({
  selector: 'app-substances-metrics-panel',
  imports: [MatButtonModule, MatExpansionModule, MatIconModule, MetricsTable, PeriodScale, RouterLink],
  templateUrl: './substances-metrics-panel.html',
  styleUrl: './substances-metrics-panel.css',
})
export class SubstancesMetricsPanel {
  readonly settings = input.required<Settings>();
  /** Starts open; closed, it asks for nothing until opened. */
  readonly open = input(false);
  /** Any new value asks for the table again (e.g. the list, after a write). */
  readonly refresh = input<unknown>(null);
  /** A row was tapped: its substance. */
  readonly opened = output<number>();

  private readonly api = inject(MetricsApi);
  private readonly views = inject(ViewsApi);

  protected readonly per = signal<TimeScale>(readPer());
  protected readonly days = signal<number>(readDays());
  protected readonly sort = signal<Sort>({ active: '', direction: '' });
  /** It was opened once: from then on it keeps its numbers up to date. */
  protected readonly wasOpened = linkedSignal(() => this.open());

  protected readonly catalog = rxResource({
    params: () => (this.wasOpened() ? true : undefined),
    stream: () => this.api.getCatalog(),
  });

  protected readonly items = rxResource({
    params: () => (this.wasOpened() ? ('metrics' as const) : undefined),
    stream: ({ params }) => this.views.list(params),
  });

  /** The columns: the substance metrics the metrics page lists, in its order. */
  protected readonly columns = computed<MetricDefinition[] | null>(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue()) return null;
    const byKey = new Map(this.catalog.value().map((m) => [m.key, m]));
    return this.items
      .value()
      .map((item) => byKey.get(item.metric))
      .filter((m): m is MetricDefinition => m !== undefined && m.scope === 'substance');
  });

  protected readonly table = rxResource({
    params: () => {
      const columns = this.columns();
      if (columns === null) return undefined;
      return { keys: columns.map((c) => c.key), per: this.per(), days: this.days(), refresh: this.refresh() };
    },
    stream: ({ params: { keys, per, days } }) =>
      keys.length === 0
        ? of<TableData>({ scope: 'substance', per, from: null, to: null, keys: [], rows: [] })
        : this.api.getTable({ scope: 'substance', keys, per, ...(days ? { days } : {}) }),
  });

  protected readonly hasPeriod = computed(() => (this.columns() ?? []).some((m) => m.period));
  protected readonly hasScales = computed(() => (this.columns() ?? []).some((m) => m.scales.length > 0));

  /** What the closed panel says: the period and the scale the numbers are in. */
  protected readonly summary = computed(() =>
    [
      this.hasPeriod() || !this.items.hasValue() ? periodLabel(this.days()) : null,
      this.hasScales() || !this.items.hasValue() ? `per ${this.per()}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  protected readonly state = computed(() => {
    const failure = this.catalog.error() ?? this.items.error() ?? this.table.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return { status: 'failed' as const, message: `Could not load the metrics${error.status ? ` (${error.status})` : ''}` };
    }
    if (this.columns()?.length === 0) return { status: 'empty' as const, message: 'No metric is chosen for this table.' };
    if (!this.table.hasValue()) return { status: 'loading' as const };
    if (this.table.value().rows.length === 0) return { status: 'empty' as const, message: 'No substances' };
    return { status: 'loaded' as const };
  });

  protected choosePer(per: TimeScale): void {
    this.per.set(per);
    writePreference(PER_KEY, per);
  }

  protected chooseDays(days: number): void {
    this.days.set(days);
    writePreference(DAYS_KEY, String(days));
  }

  protected openRow(row: MetricsRow): void {
    this.opened.emit(row.id);
  }
}
