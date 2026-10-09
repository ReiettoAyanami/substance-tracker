import { Component, ElementRef, computed, inject, input, output } from '@angular/core';

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
 * batches). Given `only`, it draws that batch alone, out of its own quantity (the substance card's
 * "selected", design-frontend.md): the other segments shrink away and that one grows to its share,
 * both animated. Selectable, a tap on a segment says which batch it is (`batchSelect`). Presentational:
 * the numbers come from the API; they become numbers here only to size segments.
 */
@Component({
  selector: 'app-stock-bar',
  imports: [BatchBar],
  templateUrl: './stock-bar.html',
  styleUrl: './stock-bar.css',
  host: { '[class.selectable]': 'selectable()', '(click)': 'tapped($event)' },
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
  /**
   * Its batches can be tapped (the substance card; lenzi, 2026-10-07: "al click del segmento fai in
   * modo di selezionarlo"): a tap on a segment, or just above or below it (the track is 12 px high),
   * says which batch and goes no further; anywhere else it reaches the parent. From the keyboard,
   * each segment is a button. A long press only shows the batch's tooltip (BatchBar).
   */
  readonly selectable = input(false);
  /** The batch whose segment was tapped. */
  readonly batchSelect = output<number>();

  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

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

  /** A tap on the bar: on a segment, or above or below one, it is that batch's. */
  protected tapped(event: MouseEvent): void {
    if (!this.selectable()) return;
    let segment = (event.target as Element | null)?.closest<HTMLElement>('.segment');
    if (!segment) {
      // In the room above or below the track: the segment at the same x, in the track's middle.
      const track = this.host.nativeElement.querySelector('.track')!.getBoundingClientRect();
      segment = document.elementFromPoint(event.clientX, track.top + track.height / 2)?.closest<HTMLElement>('.segment');
    }
    const batchId = Number(segment?.dataset['batch']);
    if (!segment || Number.isNaN(batchId)) return; // the part consumed: the parent's tap
    event.stopPropagation();
    this.batchSelect.emit(batchId);
  }

  /** Enter or Space on a segment, from the keyboard. */
  protected pressed(event: Event, batchId: number): void {
    if (!this.selectable()) return;
    event.preventDefault();
    event.stopPropagation();
    this.batchSelect.emit(batchId);
  }
}
