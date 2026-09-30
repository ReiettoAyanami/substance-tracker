import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { map, of } from 'rxjs';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { BatchMetricsRow, MetricDefinition, MetricsRow, MetricsTable, TIME_SCALES, TableScope, TimeScale } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { SettingsApi } from '../data/settings-api';
import { ViewsApi } from '../data/views-api';
import { LOCALE } from '../locale';
import { PageHistoryState } from '../substance-page/substance-page';
import { IdentityColorPipe } from '../ui/identity-color-pipe';
import { MetricValuePipe } from '../ui/metric-value-pipe';
import { PERIODS, PeriodScale } from '../ui/period-scale/period-scale';

/** The tables of the page, one per kind of entity, in the order of their tabs. */
export const TABLES: readonly { scope: TableScope; label: string; first: string; intro: string }[] = [
  {
    scope: 'substance',
    label: 'Substances',
    first: 'Substance',
    intro: 'Each substance in a row, each number in a column: they compare in the period chosen.',
  },
  {
    scope: 'batch',
    label: 'Batches',
    first: 'Batch',
    intro: 'Each batch bought in the period in a row; its numbers are over its whole life.',
  },
];

/** What the URL says: the table, the period, the scale, one substance, the order of the rows. */
interface PageQuery {
  table: TableScope;
  days: number;
  per: TimeScale;
  /** Only the rows of this substance (batches); null: every one. */
  substanceId: number | null;
  /** The column the rows are ordered by ('name' or a metric's key); '' = the API's order. */
  sort: string;
  dir: 'asc' | 'desc' | '';
}

const DEFAULT_DAYS = 30;
const DEFAULT_PER: TimeScale = 'day';

function pageQueryOf(params: ParamMap): PageQuery {
  const table = TABLES.find((t) => t.scope === params.get('table'))?.scope ?? 'substance';
  const days = Number(params.get('days'));
  const per = params.get('per') as TimeScale;
  const substanceId = Number(params.get('substanceId'));
  const dir = params.get('dir');
  return {
    table,
    days: params.has('days') && PERIODS.some((p) => p.days === days) ? days : DEFAULT_DAYS,
    per: TIME_SCALES.includes(per) ? per : DEFAULT_PER,
    substanceId: table !== 'substance' && Number.isInteger(substanceId) && substanceId > 0 ? substanceId : null,
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

const isBatch = (row: MetricsRow): row is BatchMetricsRow => 'substanceName' in row;

/**
 * The metrics page (design-statistics.md, "metrics page"): tables that compare the entities, one
 * per kind in its tab (substances, batches), one row per entity, one column per metric the page
 * lists of that kind (view items of the surface `metrics`). Substances compare in the period;
 * batches are those bought in it, with their numbers over their life, and can be narrowed to one
 * substance. The table, the period, the scale, the substance and the column the rows are ordered
 * by are in the URL (a link, a refresh and back keep them); a row opens its entity's page. Every
 * number comes from the API.
 */
@Component({
  selector: 'app-metrics-page',
  imports: [
    IdentityColorPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTabsModule,
    MetricValuePipe,
    PeriodScale,
    RouterLink,
  ],
  templateUrl: './metrics-page.html',
  styleUrl: './metrics-page.css',
})
export class MetricsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly settingsApi = inject(SettingsApi);
  private readonly catalogApi = inject(CatalogApi);

  protected readonly tables = TABLES;
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(pageQueryOf)), { requireSync: true });
  /** The tab shown. */
  protected readonly tab = computed(() => TABLES.find((t) => t.scope === this.query().table)!);

  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });
  protected readonly items = rxResource({ stream: () => this.views.list('metrics') });
  protected readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  /** The substances a table of batches can be narrowed to. */
  protected readonly substances = rxResource({ stream: () => this.catalogApi.listSubstances() });

  /** The columns of the table shown: what the metrics page lists of its kind, in order. */
  protected readonly columns = computed<MetricDefinition[] | null>(() => {
    if (!this.catalog.hasValue() || !this.items.hasValue()) return null;
    const scope = this.query().table;
    const byKey = new Map(this.catalog.value().map((m) => [m.key, m]));
    return this.items
      .value()
      .map((item) => byKey.get(item.metric))
      .filter((m): m is MetricDefinition => m !== undefined && m.scope === scope);
  });

  protected readonly table = rxResource({
    params: () => {
      const columns = this.columns();
      if (columns === null) return undefined;
      const { table, days, per, substanceId } = this.query();
      return { scope: table, keys: columns.map((c) => c.key), days, per, substanceId };
    },
    stream: ({ params: { scope, keys, days, per, substanceId } }) =>
      keys.length === 0
        ? of<MetricsTable>({ scope, per, from: null, to: null, keys: [], rows: [] })
        : this.metricsApi.getTable({
            scope,
            keys,
            per,
            ...(days ? { days } : {}),
            ...(substanceId !== null ? { substanceId } : {}),
          }),
  });

  /** The period: the substances' numbers follow it, and it picks the batches (those bought in it). */
  protected readonly hasPeriod = computed(
    () => this.query().table !== 'substance' || (this.columns() ?? []).some((m) => m.period),
  );
  protected readonly hasScales = computed(() => (this.columns() ?? []).some((m) => m.scales.length > 0));

  protected readonly columnIds = computed(() => ['name', ...(this.columns() ?? []).map((c) => c.key)]);

  /** The rows, in the order of the column chosen. */
  protected readonly rows = computed<MetricsRow[]>(() => {
    if (!this.table.hasValue()) return [];
    const rows = [...this.table.value().rows];
    const { sort, dir } = this.query();
    if (!sort || !dir) return rows;
    const cell = (row: MetricsRow) => {
      if (sort === 'name') return row.name ?? '';
      const value = row.values[sort];
      return value == null ? null : Number(value);
    };
    return rows.sort((a, b) => compareCells(cell(a), cell(b), dir));
  });

  protected readonly currency = computed(() => (this.settings.hasValue() ? this.settings.value().currency : 'EUR'));

  /** "5 Sept 2026", the day a batch was bought, in the zone of the settings. */
  protected readonly dayFormat = computed(
    () =>
      new Intl.DateTimeFormat(LOCALE, {
        timeZone: this.settings.hasValue() ? this.settings.value().timezone : undefined,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
  );

  protected readonly state = computed(() => {
    const failure = this.catalog.error() ?? this.items.error() ?? this.settings.error() ?? this.table.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return { status: 'failed' as const, message: `Could not load the metrics${error.status ? ` (${error.status})` : ''}` };
    }
    if (this.columns()?.length === 0) return { status: 'empty' as const, message: 'No metric is chosen for this table.' };
    if (!this.table.hasValue() || !this.settings.hasValue()) return { status: 'loading' as const };
    if (this.table.value().rows.length === 0) {
      return { status: 'empty' as const, message: this.query().table === 'batch' ? 'No batch bought in the period' : 'No substances' };
    }
    return { status: 'loaded' as const };
  });

  protected isBatch = isBatch;

  /** The day a batch was bought. */
  protected bought(row: BatchMetricsRow): string {
    return this.dayFormat().format(new Date(row.occurredAt));
  }

  protected chooseDays(days: number): void {
    this.go({ days });
  }

  protected choosePer(per: TimeScale): void {
    this.go({ per });
  }

  protected chooseSubstance(substanceId: number): void {
    this.go({ substanceId: substanceId || null });
  }

  /** A header was tapped: the rows follow it, and the URL keeps it. */
  protected sortBy(sort: Sort): void {
    this.go({ sort: sort.direction ? sort.active : null, dir: sort.direction || null });
  }

  /** A row opens its entity's page (a substance's, a batch's over its substance's); closing it comes back here. */
  protected open(row: MetricsRow): void {
    const state: PageHistoryState = { fromList: true };
    const path = isBatch(row) ? ['/substances', row.substanceId, 'batches', row.id] : ['/substances', row.id];
    void this.router.navigate(path, { state });
  }

  private go(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
