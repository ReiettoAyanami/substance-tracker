import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { map, of } from 'rxjs';

import { ApiError } from '../data/api-error';
import { MetricDefinition, MetricsTable, SubstanceMetricsRow, TIME_SCALES, TimeScale } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { SettingsApi } from '../data/settings-api';
import { ViewsApi } from '../data/views-api';
import { LOCALE } from '../locale';
import { PageHistoryState } from '../substance-page/substance-page';
import { IdentityColorPipe } from '../ui/identity-color-pipe';
import { MetricValuePipe } from '../ui/metric-value-pipe';
import { PERIODS, PeriodScale } from '../ui/period-scale/period-scale';

/** What the URL says: the period, the scale and the order of the table. */
interface PageQuery {
  days: number;
  per: TimeScale;
  /** The column the rows are ordered by ('name' or a metric's key); '' = the API's order. */
  sort: string;
  dir: 'asc' | 'desc' | '';
}

const DEFAULT_DAYS = 30;
const DEFAULT_PER: TimeScale = 'day';

function pageQueryOf(params: ParamMap): PageQuery {
  const days = Number(params.get('days'));
  const per = params.get('per') as TimeScale;
  const dir = params.get('dir');
  return {
    days: params.has('days') && PERIODS.some((p) => p.days === days) ? days : DEFAULT_DAYS,
    per: TIME_SCALES.includes(per) ? per : DEFAULT_PER,
    sort: params.get('sort') ?? '',
    dir: dir === 'asc' || dir === 'desc' ? dir : '',
  };
}

const collator = new Intl.Collator(LOCALE);

/**
 * Two cells of a column, in the direction asked. A cell with no value goes last either way; the
 * numbers are the API's decimal strings, read as numbers only to put them in order.
 */
function compareCells(a: string | number | null, b: string | number | null, dir: 'asc' | 'desc'): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = typeof a === 'string' ? collator.compare(a, b as string) : a - (b as number);
  return dir === 'asc' ? order : -order;
}

const EMPTY_TABLE = (per: TimeScale): MetricsTable => ({ scope: 'substance', per, from: null, to: null, keys: [], rows: [] });

/**
 * The metrics page (design-statistics.md, "metrics page"): tables that compare the entities in the
 * period chosen, one row per entity, one column per metric its page lists (view items of the
 * surface `metrics`, the metric's scope saying which table). The substances table so far. Period,
 * scale and the column the rows are ordered by are in the URL (a link, a refresh and back keep
 * them); a row opens its entity. Every number comes from the API.
 */
@Component({
  selector: 'app-metrics-page',
  imports: [IdentityColorPipe, MatButtonModule, MatIconModule, MatSortModule, MatTableModule, MetricValuePipe, PeriodScale],
  templateUrl: './metrics-page.html',
  styleUrl: './metrics-page.css',
})
export class MetricsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly settingsApi = inject(SettingsApi);

  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(pageQueryOf)), { requireSync: true });

  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });
  protected readonly items = rxResource({ stream: () => this.views.list('metrics') });
  protected readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });

  /** The columns of the substances table: what the metrics page lists of that scope, in order. */
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
      const { days, per } = this.query();
      return { keys: columns.map((c) => c.key), days, per };
    },
    stream: ({ params: { keys, days, per } }) =>
      keys.length === 0
        ? of(EMPTY_TABLE(per))
        : this.metricsApi.getTable({ scope: 'substance', keys, per, ...(days ? { days } : {}) }),
  });

  /** Does any column follow a period, or read in a scale? Only then is it offered. */
  protected readonly hasPeriod = computed(() => (this.columns() ?? []).some((m) => m.period));
  protected readonly hasScales = computed(() => (this.columns() ?? []).some((m) => m.scales.length > 0));

  protected readonly columnIds = computed(() => ['name', ...(this.columns() ?? []).map((c) => c.key)]);

  /** The rows, in the order of the column chosen. */
  protected readonly rows = computed<SubstanceMetricsRow[]>(() => {
    if (!this.table.hasValue()) return [];
    const rows = [...this.table.value().rows];
    const { sort, dir } = this.query();
    if (!sort || !dir) return rows;
    const cell = (row: SubstanceMetricsRow) => {
      if (sort === 'name') return row.name;
      const value = row.values[sort];
      return value == null ? null : Number(value);
    };
    return rows.sort((a, b) => compareCells(cell(a), cell(b), dir));
  });

  protected readonly currency = computed(() => (this.settings.hasValue() ? this.settings.value().currency : 'EUR'));

  protected readonly state = computed(() => {
    const failure = this.catalog.error() ?? this.items.error() ?? this.settings.error() ?? this.table.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return { status: 'failed' as const, message: `Could not load the metrics${error.status ? ` (${error.status})` : ''}` };
    }
    if (this.columns()?.length === 0) return { status: 'empty' as const, message: 'No metric is chosen for this table.' };
    if (!this.table.hasValue() || !this.settings.hasValue()) return { status: 'loading' as const };
    if (this.table.value().rows.length === 0) return { status: 'empty' as const, message: 'No substances' };
    return { status: 'loaded' as const };
  });

  protected chooseDays(days: number): void {
    this.go({ days });
  }

  protected choosePer(per: TimeScale): void {
    this.go({ per });
  }

  /** A header was tapped: the rows follow it, and the URL keeps it. */
  protected sortBy(sort: Sort): void {
    this.go({ sort: sort.direction ? sort.active : null, dir: sort.direction || null });
  }

  /** A row opens its substance's page; closing it comes back here. */
  protected open(row: SubstanceMetricsRow): void {
    const state: PageHistoryState = { fromList: true };
    void this.router.navigate(['/substances', row.id], { state });
  }

  private go(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
