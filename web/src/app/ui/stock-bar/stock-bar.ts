import { Component, computed, input } from '@angular/core';

import { StockBarSegment } from '../../data/substance';
import { BatchBar } from '../batch-bar/batch-bar';

/** One batch drawn alone, out of its own quantity: what is left of what was bought of it. */
export interface OnlyBatch {
  batchId: number;
  /** Decimal string of the API: 0 once the batch is finished. */
  remaining: string;
  /** What was bought of it (decimal string): the whole track. */
  quantity: string;
}

/**
 * The segmented stock bar (design.md): one segment per active batch, oldest first, each a batch
 * bar (identity colour, tooltip); the whole track is the maximum (Σ bought quantity of the active
 * batches). Given `only`, it draws that batch alone, out of its own quantity (the Android card's
 * "last", design-frontend.md): the other segments shrink away and that one grows to its share, both
 * animated. Presentational: the numbers come from the API; they become numbers here only to size
 * segments.
 */
@Component({
  selector: 'app-stock-bar',
  imports: [BatchBar],
  templateUrl: './stock-bar.html',
  styleUrl: './stock-bar.css',
})
export class StockBar {
  readonly segments = input.required<StockBarSegment[]>();
  /** stockBarMax of the card summary (decimal string). */
  readonly max = input.required<string>();
  /** What the bar says to a screen reader (e.g. "Stock: 272 capsula"). */
  readonly label = input('');
  /** Unit of the substance, for the batches' price per unit. */
  readonly unit = input.required<string>();
  /** ISO 4217 currency of the settings. */
  readonly currency = input.required<string>();
  /**
   * Only this batch, out of its own quantity; null: every segment, out of the maximum. A batch not
   * among the segments (finished) leaves the track empty.
   */
  readonly only = input<OnlyBatch | null>(null);

  protected readonly bars = computed(() => {
    const only = this.only();
    const max = Number(only ? only.quantity : this.max());
    return this.segments().map((segment) => {
      const shown = only === null || segment.batchId === only.batchId;
      const remaining = only !== null && shown ? only.remaining : segment.remaining;
      return {
        ...segment,
        shown,
        widthPercent: shown && max > 0 ? (Number(remaining) / max) * 100 : 0,
      };
    });
  });
}
