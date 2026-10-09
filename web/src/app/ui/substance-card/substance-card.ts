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
import { Measure, MeasureToggle } from '../measure-toggle/measure-toggle';
import { OnlyBatch, StockBar } from '../stock-bar/stock-bar';
import { UnitPricePipe } from '../unit-price-pipe';

/**
 * Which batches the card's figure is of: the selected batch's (the one tapped in the bar, else the
 * last one), or the whole stock's (the unit price's average, the quantity's total). "last" before
 * 2026-10-07: a stored "last" reads as "selected".
 */
type PriceMode = 'selected' | 'avg';

/**
 * The toggles are display preferences of this browser, per substance: localStorage, never the
 * database. Storage can be missing (private mode, blocked site data): then the default applies.
 */
const priceModeKey = (substanceId: number) => `substance-tracker.price-mode.${substanceId}`;
const measureKey = (substanceId: number) => `substance-tracker.card-measure.${substanceId}`;

function readPriceMode(substanceId: number): PriceMode {
  try {
    return localStorage.getItem(priceModeKey(substanceId)) === 'avg' ? 'avg' : 'selected';
  } catch {
    return 'selected';
  }
}

function readMeasure(substanceId: number): Measure {
  try {
    return localStorage.getItem(measureKey(substanceId)) === 'quantity' ? 'quantity' : 'price';
  } catch {
    return 'price';
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered: the card still switches.
  }
}

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (value: string) => quantityFormat.format(value as unknown as number);

/**
 * One substance on the substances page (design-frontend.md, "substance card"). Presentational: the substance
 * and its card summary come in, every number is the API's; it only formats them. Its ⋮ menu asks
 * the parent to edit or delete the substance.
 *
 * The line is the price/qty toggle (ui/measure-toggle) and its figure, with no word of its own
 * (lenzi, 2026-10-09; from 2026-10-07 the line was a toggle itself, "price: €8.93/g" or
 * "qty: 7/10 g"): the unit price ("€8.93/g"), or the quantity, what is left of what was bought
 * ("7/10 g"). The pill beside it says "selected | average" for the price and "selected | total" for
 * the quantity; "selected" is the batch tapped in the bar, the last one until then, and draws only
 * that batch in the bar, out of what was bought of it (lenzi, 2026-10-07: "al click del segmento fai
 * in modo di selezionarlo e al posto di last mettiamo selected"). A tap on a segment selects its
 * batch and turns the pill to "selected"; a tap on the selected one, alone in the bar, goes back to
 * every batch (lenzi, 2026-10-09: "clicking back on the selected should bring me back to the normal
 * view"). The choice of a batch lasts until the page is left.
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
    MeasureToggle,
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
  protected readonly measure = linkedSignal<Measure>(() => readMeasure(this.substance().id));

  /** The batch tapped in the bar; it stays while the substance does (its numbers may reload). */
  private readonly picked = linkedSignal<number, number | null>({
    source: () => this.substance().id,
    computation: () => null,
  });

  /**
   * The batch of "selected": the one tapped, while it is still among the active ones, else the last
   * one (active or finished: 0 left once finished); null with no batches.
   */
  protected readonly selected = computed(() => {
    const { stockBarSegments, lastBatch } = this.substance().summary;
    const picked = stockBarSegments.find((segment) => segment.batchId === this.picked());
    if (picked) return { ...picked, id: picked.batchId };
    return lastBatch;
  });

  /**
   * The unit price of the chosen mode (decimal string), or null when there is none: no batches
   * yet, or the average with the stock at 0. A substance stores no price of its own.
   */
  protected readonly price = computed(() => {
    const summary = this.substance().summary;
    return (this.mode() === 'avg' ? summary.avgUnitPrice : this.selected()?.unitPrice) ?? null;
  });

  /**
   * The quantity of the chosen mode, what is left of what was bought: of the selected batch, or of
   * the whole stock out of the active batches' total. "—" with nothing bought.
   */
  protected readonly quantity = computed(() => {
    const { summary, unit } = this.substance();
    if (this.mode() === 'selected') {
      const batch = this.selected();
      return batch ? `${exact(batch.remaining)}/${exact(batch.quantity)} ${unit}` : '—';
    }
    return Number(summary.stockBarMax) > 0 ? `${exact(summary.stock)}/${exact(summary.stockBarMax)} ${unit}` : '—';
  });

  /** The selected batch alone in the bar, on "selected". */
  protected readonly only = computed<OnlyBatch | null>(() => {
    const batch = this.selected();
    if (this.mode() !== 'selected' || !batch) return null;
    return { batchId: batch.id, remaining: batch.remaining, quantity: batch.quantity };
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
    const { summary, unit } = this.substance();
    const only = this.only();
    if (only) return `Selected batch: ${exact(only.remaining)} of ${exact(only.quantity)} ${unit} left`;
    return `Stock: ${exact(summary.stock)} ${unit}`;
  });

  protected choose(mode: PriceMode): void {
    this.mode.set(mode);
    remember(priceModeKey(this.substance().id), mode);
  }

  /**
   * A batch tapped in the bar: it is the selected one, and the pill turns to "selected". The selected
   * one again (alone in the bar) goes back to every batch, the pill to "average" / "total".
   */
  protected pick(batchId: number): void {
    if (this.mode() === 'selected' && this.selected()?.id === batchId) {
      this.picked.set(null);
      this.choose('avg');
      return;
    }
    this.picked.set(batchId);
    if (this.mode() !== 'selected') this.choose('selected');
  }

  /** The price/qty toggle switched: the line shows the other one, remembered for this substance. */
  protected chooseMeasure(measure: Measure): void {
    this.measure.set(measure);
    remember(measureKey(this.substance().id), measure);
  }
}
