import { Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Sort } from '@angular/material/sort';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { map, of } from 'rxjs';

import { ConsumptionActions } from '../consumptions-page/consumption-actions';
import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { MetricDefinition, MetricsRow, MetricsTable as TableData, TIME_SCALES, TableScope, TimeScale } from '../data/metric';
import { MetricsApi } from '../data/metrics-api';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';
import { ViewsApi } from '../data/views-api';
import { LOCALE } from '../locale';
import { Session } from '../session/session';
import { PageHistoryState } from '../substance-page/substance-page';
import { refreshOnPull } from '../refresh/page-refresh';
import { keptValue } from '../ui/kept-value';
import { MetricsTable, isBatch, isConsumption } from '../ui/metrics-table/metrics-table';
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
  {
    scope: 'consumption',
    label: 'Consumptions',
    first: 'Consumption',
    intro: 'Each consumption made in the period in a row, against its substance, its batch and its day.',
  },
];

/** The consumptions table shows at most this many, the newest (the API's default). */
export const CONSUMPTION_ROWS = 100;

/** What the URL says: the table, the period, the scale, one substance, the order of the rows. */
interface PageQuery {
  table: TableScope;
  days: number;
  per: TimeScale;
  /** Only the rows of this substance (batches, consumptions); null: every one. */
  substanceId: number | null;
  /** Only the consumptions of this batch; null: every one. */
  batchId: number | null;
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
  const batchId = Number(params.get('batchId'));
  const dir = params.get('dir');
  return {
    table,
    days: params.has('days') && PERIODS.some((p) => p.days === days) ? days : DEFAULT_DAYS,
    per: TIME_SCALES.includes(per) ? per : DEFAULT_PER,
    substanceId: table !== 'substance' && Number.isInteger(substanceId) && substanceId > 0 ? substanceId : null,
    batchId: table === 'consumption' && Number.isInteger(batchId) && batchId > 0 ? batchId : null,
    sort: params.get('sort') ?? '',
    dir: dir === 'asc' || dir === 'desc' ? dir : '',
  };
}

/**
 * The metrics page (design-statistics.md, "metrics page"): tables that compare the entities, one
 * per kind in its tab (substances, batches, consumptions), one row per entity, one column per metric
 * the page lists of that kind (view items of the surface `metrics`). Substances compare in the
 * period; batches are those bought in it and consumptions those made in it (the newest 100), with
 * their numbers over all time; both can be narrowed to one substance, consumptions to one batch.
 * The table, the period, the scale, the substance, the batch and the column the rows are ordered by
 * are in the URL (a link, a refresh and back keep them); a row opens its entity's page, or a
 * consumption's details. Every number comes from the API.
 */
@Component({
  selector: 'app-metrics-page',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatSelectModule, MatTabsModule, MetricsTable, PeriodScale, RouterLink],
  templateUrl: './metrics-page.html',
  styleUrl: './metrics-page.css',
})
export class MetricsPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly metricsApi = inject(MetricsApi);
  private readonly views = inject(ViewsApi);
  private readonly settingsApi = inject(SettingsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly reportsApi = inject(ReportsApi);
  private readonly consumptionActions = inject(ConsumptionActions);

  protected readonly tables = TABLES;
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(pageQueryOf)), { requireSync: true });
  /** The tab shown. */
  protected readonly tab = computed(() => TABLES.find((t) => t.scope === this.query().table)!);

  protected readonly catalog = rxResource({ stream: () => this.metricsApi.getCatalog() });
  protected readonly items = rxResource({ stream: () => this.views.list('metrics') });
  protected readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  /** The substances a table of batches or consumptions can be narrowed to. */
  protected readonly substances = rxResource({ stream: () => this.catalogApi.listSubstances() });
  /** The batches of the substance chosen, the consumptions table can be narrowed to. */
  protected readonly batches = rxResource({
    params: () => (this.query().table === 'consumption' ? (this.query().substanceId ?? undefined) : undefined),
    stream: ({ params }) => this.reportsApi.listBatches({ substanceId: params }),
  });

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
      const { table, days, per, substanceId, batchId } = this.query();
      return { scope: table, keys: columns.map((c) => c.key), days, per, substanceId, batchId };
    },
    stream: ({ params: { scope, keys, days, per, substanceId, batchId } }) =>
      keys.length === 0
        ? of<TableData>({ scope, per, from: null, to: null, keys: [], rows: [] })
        : this.metricsApi.getTable({
            scope,
            keys,
            per,
            ...(days ? { days } : {}),
            ...(substanceId !== null ? { substanceId } : {}),
            ...(batchId !== null ? { batchId } : {}),
          }),
  });

  /**
   * The table on screen: the last one stays while another scale, period or filter loads, so it
   * redraws in place instead of shrinking to "…". Another tab or other columns: it waits empty.
   */
  protected readonly shownTable = keptValue(this.table, () =>
    JSON.stringify([this.query().table, (this.columns() ?? []).map((c) => c.key)]),
  );

  constructor() {
    refreshOnPull([this.catalog, this.items, this.settings, this.substances, this.batches, this.table]);
  }

  /** The period: the substances' numbers follow it, and it picks the batches (those bought in it). */
  protected readonly hasPeriod = computed(
    () => this.query().table !== 'substance' || (this.columns() ?? []).some((m) => m.period),
  );
  protected readonly hasScales = computed(() => (this.columns() ?? []).some((m) => m.scales.length > 0));

  /** "5 Sept 2026", a day in the zone of the settings (the batches the consumptions table can be narrowed to). */
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
    const table = this.shownTable();
    if (!table || !this.settings.hasValue()) return { status: 'loading' as const };
    if (table.rows.length === 0) {
      const empty = { substance: 'No substances', batch: 'No batch bought in the period', consumption: 'No consumption made in the period' };
      return { status: 'empty' as const, message: empty[this.query().table] };
    }
    return { status: 'loaded' as const };
  });

  /** The newest 100 are shown: there may be older ones in the period. */
  protected readonly capped = computed(
    () => this.query().table === 'consumption' && (this.shownTable()?.rows.length ?? 0) >= CONSUMPTION_ROWS,
  );

  /** A day, in the zone of the settings: "5 Sept 2026". */
  protected day(instant: string): string {
    return this.dayFormat().format(new Date(instant));
  }

  protected chooseDays(days: number): void {
    this.go({ days });
  }

  protected choosePer(per: TimeScale): void {
    this.go({ per });
  }

  /** One substance, or every one: a batch chosen before is dropped (it may be another substance's). */
  protected chooseSubstance(substanceId: number): void {
    this.go({ substanceId: substanceId || null, batchId: null });
  }

  protected chooseBatch(batchId: number): void {
    this.go({ batchId: batchId || null });
  }

  /** A header was tapped: the rows follow it, and the URL keeps it. */
  protected sortBy(sort: Sort): void {
    this.go({ sort: sort.direction ? sort.active : null, dir: sort.direction || null });
  }

  /**
   * A row opens its entity's page (a substance's, a batch's over its substance's; closing it comes
   * back here), or a consumption's details.
   */
  protected open(row: MetricsRow): void {
    if (isConsumption(row)) {
      if (this.settings.hasValue()) void this.consumptionActions.details(row, this.settings.value());
      return;
    }
    const state: PageHistoryState = { fromList: true };
    const path = isBatch(row) ? [this.session.path('/substances'), row.substanceId, 'batches', row.id] : [this.session.path('/substances'), row.id];
    void this.router.navigate(path, { state });
  }

  private go(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
