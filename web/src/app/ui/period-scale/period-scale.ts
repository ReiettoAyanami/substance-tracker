import { Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { TIME_SCALES, TimeScale } from '../../data/metric';

/** The periods offered: the last N logical days (the API resolves them), or all time (0). */
export const PERIODS: readonly { days: number; label: string }[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 365 days' },
  { days: 0, label: 'All time' },
];

/** "Last 30 days", "All time". */
export function periodLabel(days: number): string {
  return PERIODS.find((p) => p.days === days)?.label ?? `Last ${days} days`;
}

/**
 * The two choices of whoever shows metrics (a panel, the metrics page, the statistics page): the
 * period and the scale, the interval the user reads every rate and duration in (lenzi: always
 * theirs to choose). Material selects; either is left out when its input is null. It keeps no
 * state: the choice goes out, and comes back in.
 */
@Component({
  selector: 'app-period-scale',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './period-scale.html',
  styleUrl: './period-scale.css',
})
export class PeriodScale {
  /** The period, in days (0 = all time); null: no period to choose. */
  readonly days = input<number | null>(null);
  /** The scale; null: no scale to choose. */
  readonly per = input<TimeScale | null>(null);
  readonly daysChange = output<number>();
  readonly perChange = output<TimeScale>();

  protected readonly periods = PERIODS;
  protected readonly scales = TIME_SCALES;
}
