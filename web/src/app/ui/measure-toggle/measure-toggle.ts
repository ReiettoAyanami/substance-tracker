import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/** What a figure shows: how much, or the price. */
export type Measure = 'quantity' | 'price';

/**
 * The price/qty toggle (lenzi, 2026-10-09: "a toggle on the left for price/qty, pill that changes
 * state not ( 1 | 2 )"): one pill that reads what the figure beside it shows, "price" or "qty", and
 * switches it at a tap. It sits on the left of its figure, which then has no word of its own: the
 * substance card's line and the figures of a consumption (ui/consumption-figures). Its tap never
 * reaches what is around it (a card that opens its page or its details). "qty" is the app's one
 * abbreviation; its label says the whole word.
 */
@Component({
  selector: 'app-measure-toggle',
  imports: [MatButtonModule],
  templateUrl: './measure-toggle.html',
  styleUrl: './measure-toggle.css',
})
export class MeasureToggle {
  /** What the figure beside it shows; a tap switches it. */
  readonly measure = model.required<Measure>();

  /** What the pill reads, and its accessible name: what it reads, then what a tap does. */
  protected readonly view = computed(() =>
    this.measure() === 'quantity'
      ? { word: 'qty', label: 'qty, the quantity. Show the price' }
      : { word: 'price', label: 'price. Show the quantity' },
  );

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.measure.update((measure) => (measure === 'quantity' ? 'price' : 'quantity'));
  }
}
