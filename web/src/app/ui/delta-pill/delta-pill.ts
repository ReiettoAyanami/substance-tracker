import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { Consumption } from '../../data/consumption';
import { OneTimeConsumption } from '../../data/one-time';
import { LOCALE } from '../../locale';

/** A delta ratio of the API ("-0.3333") as a signed percentage ("-33.3%"). */
const deltaFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** What a delta is the change of: the quantity of a consumption, or its price (what it cost). */
export type Measure = 'quantity' | 'price';

const other = (measure: Measure): Measure => (measure === 'quantity' ? 'price' : 'quantity');

/**
 * The change of a consumption from the one before it (design-frontend.md, "delta pill"), wherever
 * a consumption is shown: a pill with one change, of the quantity ("quantity -20%") or, once
 * tapped, of the price ("price -20%"; the price is what the consumption cost). It takes the
 * consumption as the API gives it, of a batch or one-time, and needs nothing else from whoever
 * shows it: both kinds come with the same two ratios, computed by the API (what each is compared
 * with is the API's rule, design.md "delta from previous"). Each pill switches on its own (lenzi,
 * 2026-09-30): a tap changes that card only. No pill for the first consumption: nothing to compare it with.
 */
@Component({
  selector: 'app-delta-pill',
  imports: [MatButtonModule],
  templateUrl: './delta-pill.html',
  styleUrl: './delta-pill.css',
})
export class DeltaPill {
  /** The consumption, as the list it is in gives it: of a batch, or one-time. */
  readonly consumption = input.required<Consumption | OneTimeConsumption>();

  /** The change this pill shows: the quantity at first. */
  private readonly measure = signal<Measure>('quantity');

  /** What the pill says; null when the consumption has nothing before it. */
  protected readonly view = computed(() => {
    const { deltaQuantity, deltaCost } = this.consumption();
    if (deltaQuantity === null && deltaCost === null) return null;
    const measure = this.measure();
    const ratio = measure === 'quantity' ? deltaQuantity : deltaCost;
    const next = `Show the change in ${other(measure)}`;
    // Intl reads the decimal string as it is: no binary rounding.
    const change = ratio === null ? null : deltaFormat.format(ratio as unknown as number);
    return {
      measure,
      // Only a price can have no ratio: after a consumption that cost nothing. The pill stays, to switch back.
      change: change ?? '—',
      // It starts with what the pill reads, so that what is seen is also what it is called.
      label:
        change === null
          ? `${measure}: no change to show, the previous consumption was free. ${next}`
          : `${measure} ${change}: the change from the previous consumption. ${next}`,
    };
  });

  protected toggle(): void {
    this.measure.update(other);
  }
}
