import { Component, computed, input } from '@angular/core';

import { StockBarSegment } from '../../data/substance';
import { BatchBar } from '../batch-bar/batch-bar';

/**
 * The segmented stock bar (design.md): one segment per active batch, oldest first, each a batch
 * bar (identity colour, tooltip); the whole track is the maximum (Σ bought quantity of the active
 * batches). Presentational: the numbers come from the API; they become numbers here only to size
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

  protected readonly bars = computed(() => {
    const max = Number(this.max());
    return this.segments().map((segment) => ({
      ...segment,
      widthPercent: max > 0 ? (Number(segment.remaining) / max) * 100 : 0,
    }));
  });
}
