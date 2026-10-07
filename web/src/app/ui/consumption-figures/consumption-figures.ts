import { Component, input, signal } from '@angular/core';

import { Consumption } from '../../data/consumption';
import { OneTimeConsumption } from '../../data/one-time';
import { DeltaPill, Measure } from '../delta-pill/delta-pill';

/**
 * How much a consumption was and what it cost, one at a time, with its delta pill (lenzi,
 * 2026-10-07: "make the actual text ... a toggle itself ... from price: blah to qty: blah", then on
 * every list of consumptions): the figure is a toggle of its own, "qty: 2 capsula" or
 * "price: €0.64" (what it cost), and the pill switches with it, "qty -33.3%" or "price -46.7%"; a
 * tap on either switches both, this consumption only, and is not remembered, like the pill. Its taps
 * never reach the card around it (a full card opens its details). The figure on the left, the pill
 * on the right; the pill under the figure where they do not fit. The texts come formatted: the
 * consumption card and the one-time list format them their own way.
 */
@Component({
  selector: 'app-consumption-figures',
  imports: [DeltaPill],
  templateUrl: './consumption-figures.html',
  styleUrl: './consumption-figures.css',
})
export class ConsumptionFigures {
  /** The consumption as its list gives it, of a batch or one-time: the pill's changes. */
  readonly consumption = input.required<Consumption | OneTimeConsumption>();
  /** How much, with its unit ("2 capsula"). */
  readonly quantity = input.required<string>();
  /** What it cost, in the currency ("€0.64"). */
  readonly price = input.required<string>();

  /** What the figure and the pill show: the quantity at first. */
  protected readonly measure = signal<Measure>('quantity');

  protected switchMeasure(event: Event): void {
    event.stopPropagation();
    this.measure.update((measure) => (measure === 'quantity' ? 'price' : 'quantity'));
  }
}
