import { Injectable, signal } from '@angular/core';

/** What a delta is the change of: the quantity of a consumption, or its price (what it cost). */
export type Measure = 'quantity' | 'price';

/** A display preference of this browser: localStorage, never the database. */
const MEASURE_KEY = 'substance-tracker.delta-measure';

function readMeasure(): Measure {
  try {
    return localStorage.getItem(MEASURE_KEY) === 'price' ? 'price' : 'quantity';
  } catch {
    return 'quantity';
  }
}

function writeMeasure(measure: Measure): void {
  try {
    localStorage.setItem(MEASURE_KEY, measure);
  } catch {
    // Not remembered: the pills still switch.
  }
}

/**
 * Which change from the previous consumption the delta pills show (design-frontend.md, "delta
 * pill"): of the quantity, or of the price. One at a time (lenzi), and the same in every pill: a
 * tap on one switches them all, so the consumptions of a list stay comparable.
 */
@Injectable({
  providedIn: 'root',
})
export class DeltaMeasure {
  private readonly chosen = signal<Measure>(readMeasure());
  /** The change shown now. */
  readonly shown = this.chosen.asReadonly();

  /** From the quantity to the price, and back. */
  toggle(): void {
    const next = this.chosen() === 'quantity' ? 'price' : 'quantity';
    this.chosen.set(next);
    writeMeasure(next);
  }
}
