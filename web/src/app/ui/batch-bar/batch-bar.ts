import { FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { Component, input, viewChild } from '@angular/core';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';

import { IdentityColorPipe } from '../identity-color-pipe';
import { UnitPricePipe } from '../unit-price-pipe';

/** MatTooltip's default delay before a long press shows the tooltip. */
const LONG_PRESS_MS = 500;

/**
 * One batch drawn as a bar in its identity colour: a segment of the stock bar, and wherever else a
 * batch is drawn, so it looks and behaves the same everywhere. Hovering it (a long press on touch)
 * shows the batch's name and, below it, its unit price, just above the pointer and following it.
 * How wide it is, is up to the parent.
 */
@Component({
  selector: 'app-batch-bar',
  imports: [IdentityColorPipe, MatTooltipModule, UnitPricePipe],
  templateUrl: './batch-bar.html',
  styleUrl: './batch-bar.css',
  host: {
    '(pointerdown)': 'pressed($event)',
    '(click)': 'clicked($event)',
  },
})
export class BatchBar {
  readonly batchId = input.required<number>();
  readonly name = input.required<string | null>();
  /** Unit price of the batch (decimal string from the API). */
  readonly unitPrice = input.required<string>();
  /** Unit of the substance: the price is per this unit. */
  readonly unit = input.required<string>();
  /** ISO 4217 currency of the settings. */
  readonly currency = input.required<string>();

  private readonly tooltip = viewChild.required(MatTooltip);

  /** When the current touch began; null for a mouse. */
  private touchedAt: number | null = null;

  /**
   * The tooltip follows the mouse. MatTooltip only anchors it where the mouse came in
   * (matTooltipPositionAtOrigin), so this moves that anchor. `_overlayRef` is a Material internal:
   * if it changes, the tooltip stays where the mouse came in (and the spec fails).
   */
  protected follow(event: MouseEvent): void {
    const overlay = this.tooltip()._overlayRef;
    const strategy = overlay?.getConfig().positionStrategy;
    if (overlay && strategy instanceof FlexibleConnectedPositionStrategy) {
      strategy.setOrigin({ x: event.clientX, y: event.clientY });
      overlay.updatePosition();
    }
  }

  protected pressed(event: PointerEvent): void {
    this.touchedAt = event.pointerType === 'mouse' ? null : event.timeStamp;
  }

  /**
   * A long press only shows the tooltip. Some browsers follow it with a click on release, which
   * must not reach the parent: the card would open its page over the tooltip. A tap still does.
   */
  protected clicked(event: MouseEvent): void {
    if (this.touchedAt !== null && event.timeStamp - this.touchedAt >= LONG_PRESS_MS) {
      event.stopPropagation();
    }
    this.touchedAt = null;
  }
}
