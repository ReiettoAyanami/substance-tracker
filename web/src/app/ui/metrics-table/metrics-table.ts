import { Component, computed, input, output } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';

import { BatchMetricsRow, ConsumptionMetricsRow, MetricDefinition, MetricsRow, TimeScale } from '../../data/metric';
import { Settings } from '../../data/settings';
import { LOCALE } from '../../locale';
import { IdentityColorPipe } from '../identity-color-pipe';
import { MetricValuePipe } from '../metric-value-pipe';

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

export const isConsumption = (row: MetricsRow): row is ConsumptionMetricsRow => 'type' in row;
export const isBatch = (row: MetricsRow): row is BatchMetricsRow => 'substanceName' in row && !isConsumption(row);

/**
 * A table of metrics (design-statistics.md, "metrics page"): one row per entity (a substance, a
 * batch, a consumption), its name fixed at the left, one column per metric, the numbers of the API.
 * Shared by the metrics page (its three tables) and the substances page (the substances). It puts
 * the rows in the order of the column asked (`sort`, `direction`): whoever hosts it keeps that choice (the
 * URL, a signal) and hears it change; a row tapped is said, its host opens it.
 */
@Component({
  selector: 'app-metrics-table',
  imports: [IdentityColorPipe, MatSortModule, MatTableModule, MetricValuePipe],
  templateUrl: './metrics-table.html',
  styleUrl: './metrics-table.css',
})
export class MetricsTable {
  /** The header of the names' column: "Substance", "Batch", "Consumption". */
  readonly first = input.required<string>();
  /** What the table is, for a screen reader. */
  readonly label = input.required<string>();
  readonly columns = input.required<MetricDefinition[]>();
  readonly rows = input.required<MetricsRow[]>();
  readonly settings = input.required<Settings>();
  /** The scale the rates and durations are read in. */
  readonly per = input.required<TimeScale>();
  /** The column the rows are ordered by ('name' or a metric's key); '' = the API's order. */
  readonly sort = input('');
  readonly direction = input<'asc' | 'desc' | ''>('');
  readonly sortChange = output<Sort>();
  readonly opened = output<MetricsRow>();

  protected readonly isBatch = isBatch;
  protected readonly isConsumption = isConsumption;

  protected readonly columnIds = computed(() => ['name', ...this.columns().map((c) => c.key)]);

  /** The rows, in the order of the column chosen. */
  protected readonly sorted = computed<MetricsRow[]>(() => {
    const rows = [...this.rows()];
    const sort = this.sort();
    const dir = this.direction();
    if (!sort || !dir) return rows;
    const cell = (row: MetricsRow) => {
      // A consumption's first column is when it happened: ISO instants order as strings do.
      if (sort === 'name') return isConsumption(row) ? row.occurredAt : (row.name ?? '');
      const value = row.values[sort];
      return value == null ? null : Number(value);
    };
    return rows.sort((a, b) => compareCells(cell(a), cell(b), dir));
  });

  /** "25 Sept 2026, 22:00", when a consumption happened, in the zone of the settings. */
  private readonly momentFormat = computed(
    () =>
      new Intl.DateTimeFormat(LOCALE, {
        timeZone: this.settings().timezone,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
  );

  /** "5 Sept 2026", the day a batch was bought, in the zone of the settings. */
  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(LOCALE, { timeZone: this.settings().timezone, day: 'numeric', month: 'short', year: 'numeric' }),
  );

  /** When a consumption happened: "25 Sept 2026, 22:00". */
  protected moment(row: ConsumptionMetricsRow): string {
    return this.momentFormat().format(new Date(row.occurredAt));
  }

  /** Where a consumption came from, and how much: "Corona · 1 bottiglia", "One-time · bar · 1 bottiglia". */
  protected consumptionSource(row: ConsumptionMetricsRow): string {
    const source = row.type === 'one_time' ? `One-time${row.name ? ` · ${row.name}` : ''}` : (row.batchName ?? 'Unnamed batch');
    const quantity = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(row.quantity as unknown as number);
    return `${source} · ${quantity} ${row.unit}`;
  }

  /** The day a batch was bought, in the zone of the settings: "5 Sept 2026". */
  protected bought(row: BatchMetricsRow): string {
    return this.dayFormat().format(new Date(row.occurredAt));
  }
}
