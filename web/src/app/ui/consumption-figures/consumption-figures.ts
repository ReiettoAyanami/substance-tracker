import { Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { Consumption } from '../../data/consumption';
import { OneTimeConsumption } from '../../data/one-time';
import { LOCALE } from '../../locale';
import { Measure, MeasureToggle } from '../measure-toggle/measure-toggle';

/** A delta ratio of the API ("-0.3333") as a signed percentage ("-33.3%"). */
const deltaFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** Which way a change went: a rise, a fall, or neither (no change, or none to show). */
export type DeltaDirection = 'up' | 'down' | null;

/**
 * How much a consumption was or what it cost, with its change from the consumption before it,
 * wherever a consumption is shown: the consumption card (full and compact) and the one-time list.
 * On the left the price/qty toggle (ui/measure-toggle; lenzi, 2026-10-09: "a toggle on the left for
 * price/qty ... that will change both the delta and the price") and the figure, with no word of its
 * own: "2 capsula", or "€0.64", what it cost. On the right the change of the same measure,
 * "delta: -33.3%", green with a triangle down when it fell, red with a triangle up when it rose,
 * neither when it did not change. The toggle switches both, this consumption only, and is not
 * remembered; its tap never reaches the card around it (a full card opens its details). The change
 * goes under the figure where they do not fit.
 *
 * The changes are the API's ratios, and what each is compared with is the API's rule (design.md,
 * "delta from previous"): a consumption of a batch and a one-time one come with the same two. None
 * for the first consumption (nothing to compare it with), and no change in price after a
 * consumption that cost nothing ("delta: —"). The figures come formatted: the consumption card and
 * the one-time list format them their own way.
 */
@Component({
  selector: 'app-consumption-figures',
  imports: [MatIconModule, MeasureToggle],
  templateUrl: './consumption-figures.html',
  styleUrl: './consumption-figures.css',
})
export class ConsumptionFigures {
  /** The consumption as its list gives it, of a batch or one-time: its changes. */
  readonly consumption = input.required<Consumption | OneTimeConsumption>();
  /** How much, with its unit ("2 capsula"). */
  readonly quantity = input.required<string>();
  /** What it cost, in the currency ("€0.64"). */
  readonly price = input.required<string>();

  /** What the figure and the change show: the quantity at first. */
  protected readonly measure = signal<Measure>('quantity');

  /** The change of the measure shown; null for the first consumption, which has nothing before it. */
  protected readonly delta = computed(() => {
    const { deltaQuantity, deltaCost } = this.consumption();
    if (deltaQuantity === null && deltaCost === null) return null;
    const ratio = this.measure() === 'quantity' ? deltaQuantity : deltaCost;
    // Only a price can have no ratio: after a consumption that cost nothing.
    if (ratio === null) return { change: '—', direction: null, label: 'no change in price: the previous consumption was free' };
    // Intl reads the decimal string as it is: no binary rounding. The direction is the sign shown,
    // so a change too small to show (0%) is neither.
    const parts = deltaFormat.formatToParts(ratio as unknown as number);
    const sign = (type: string) => parts.some((part) => part.type === type);
    const direction: DeltaDirection = sign('plusSign') ? 'up' : sign('minusSign') ? 'down' : null;
    const change = parts.map((part) => part.value).join('');
    return { change, direction, label: null };
  });
}
