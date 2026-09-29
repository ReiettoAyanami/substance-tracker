import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Settings } from '../../data/settings';
import { Substance } from '../../data/substance';
import { LOCALE } from '../../locale';
import { IdentityColorPipe } from '../identity-color-pipe';
import { StockBar } from '../stock-bar/stock-bar';
import { UnitPricePipe } from '../unit-price-pipe';

/** Which unit price the card shows: the last batch's, or the average of the stock. */
type PriceMode = 'last' | 'avg';

/**
 * The price toggle is a display preference of this browser, per substance: localStorage, never the
 * database. Storage can be missing (private mode, blocked site data): then the default applies.
 */
const priceModeKey = (substanceId: number) => `substance-tracker.price-mode.${substanceId}`;

function readPriceMode(substanceId: number): PriceMode {
  try {
    return localStorage.getItem(priceModeKey(substanceId)) === 'avg' ? 'avg' : 'last';
  } catch {
    return 'last';
  }
}

function writePriceMode(substanceId: number, mode: PriceMode): void {
  try {
    localStorage.setItem(priceModeKey(substanceId), mode);
  } catch {
    // Not remembered: the card still switches.
  }
}

/**
 * One substance on the home (design-frontend.md, "substance card"). Presentational: the substance
 * and its card summary come in, every number is the API's; it only formats them. Its ⋮ menu asks
 * the parent to edit or delete the substance.
 */
@Component({
  selector: 'app-substance-card',
  imports: [
    IdentityColorPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    StockBar,
    UnitPricePipe,
  ],
  templateUrl: './substance-card.html',
  styleUrl: './substance-card.css',
  // The whole card is tappable; it is not a single button or link because it contains the toggle.
  host: { '(click)': 'tapped.emit(substance().id)' },
})
export class SubstanceCard {
  readonly substance = input.required<Substance>();
  readonly settings = input.required<Settings>();
  /** The card was tapped (outside the toggle and the menu): the id of its substance. */
  readonly tapped = output<number>();
  /** "Edit" in the ⋮ menu. */
  readonly edit = output<void>();
  /** "Delete" in the ⋮ menu. */
  readonly remove = output<void>();

  protected readonly mode = linkedSignal<PriceMode>(() => readPriceMode(this.substance().id));

  /**
   * The unit price of the chosen mode (decimal string), or null when there is none: no batches
   * yet, or the average with the stock at 0. A substance stores no price of its own.
   */
  protected readonly price = computed(() => {
    const summary = this.substance().summary;
    return (this.mode() === 'avg' ? summary.avgUnitPrice : summary.lastBatch?.unitPrice) ?? null;
  });

  /**
   * Date of the most recent batch, in the time zone of the settings. With no batch yet, the day
   * the substance was created (lenzi, 2026-09-29).
   */
  protected readonly lastPurchase = computed(() => {
    const substance = this.substance();
    const format = new Intl.DateTimeFormat(LOCALE, {
      timeZone: this.settings().timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return format.format(new Date(substance.summary.lastBatch?.occurredAt ?? substance.createdAt));
  });

  /** What the stock bar says to a screen reader. */
  protected readonly stockLabel = computed(() => {
    const quantity = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
    const stock = quantity.format(this.substance().summary.stock as unknown as number);
    return `Stock: ${stock} ${this.substance().unit}`;
  });

  protected choose(mode: PriceMode): void {
    this.mode.set(mode);
    writePriceMode(this.substance().id, mode);
  }
}
