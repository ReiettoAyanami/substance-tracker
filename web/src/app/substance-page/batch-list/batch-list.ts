import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';

import { ApiError } from '../../data/api-error';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { IdentityColorPipe } from '../../ui/identity-color-pipe';
import { StockBar } from '../../ui/stock-bar/stock-bar';
import { UnitPricePipe } from '../../ui/unit-price-pipe';

/** UI language of the app. */
const LOCALE = 'it-IT';

/** What a batch's share is of: the stock by quantity, or its value. */
type ShareMode = 'quantity' | 'value';

/** A display preference of this browser, for every substance: localStorage, never the database. */
const SHARE_MODE_KEY = 'substance-tracker.share-mode';

function readShareMode(): ShareMode {
  try {
    return localStorage.getItem(SHARE_MODE_KEY) === 'value' ? 'value' : 'quantity';
  } catch {
    return 'quantity';
  }
}

function writeShareMode(mode: ShareMode): void {
  try {
    localStorage.setItem(SHARE_MODE_KEY, mode);
  } catch {
    // Not remembered: the list still switches.
  }
}

/**
 * The active batches of a substance, in its page (design.md, "stock bar": one sub-card per batch,
 * oldest first). Closed, it is the total: how many batches and the stock they make up. Open, one
 * sub-card per batch, with its own bar (maximum = what was bought, filled = what is left), its
 * prices and its share of the stock, by quantity or by value. Loads its data from the API.
 */
@Component({
  selector: 'app-batch-list',
  imports: [IdentityColorPipe, MatButtonToggleModule, MatExpansionModule, StockBar, UnitPricePipe],
  templateUrl: './batch-list.html',
  styleUrl: './batch-list.css',
})
export class BatchList {
  readonly substanceId = input.required<number>();
  /** Unit of the substance. */
  readonly unit = input.required<string>();
  readonly settings = input.required<Settings>();

  private readonly reports = inject(ReportsApi);
  protected readonly batches = rxResource({
    params: () => this.substanceId(),
    stream: ({ params }) => this.reports.getSubstanceBatches(params),
  });

  protected readonly shareMode = signal<ShareMode>(readShareMode());

  private readonly formats = computed(() => ({
    quantity: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }),
    money: new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: this.settings().currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    share: new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 }),
    date: new Intl.DateTimeFormat(LOCALE, {
      timeZone: this.settings().timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  }));

  /** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
  private exact(format: Intl.NumberFormat, value: string): string {
    return format.format(value as unknown as number);
  }

  /** The closed panel: the total of the active batches. */
  protected readonly total = computed(() => {
    const failure = this.batches.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return `Impossibile caricare i lotti${error.status ? ` (${error.status})` : ''}`;
    }
    if (!this.batches.hasValue()) return '…';
    const { batches, stock, stockBarMax } = this.batches.value();
    if (batches.length === 0) return 'Nessun lotto attivo';
    const quantity = this.formats().quantity;
    const count = batches.length === 1 ? '1 lotto' : `${batches.length} lotti`;
    return `${count} · ${this.exact(quantity, stock)} / ${this.exact(quantity, stockBarMax)} ${this.unit()}`;
  });

  /** One sub-card per active batch, oldest first. */
  protected readonly rows = computed(() => {
    if (!this.batches.hasValue()) return [];
    const formats = this.formats();
    const byValue = this.shareMode() === 'value';
    return this.batches.value().batches.map((batch) => ({
      batch,
      /** The batch's own bar: its remaining out of what was bought. */
      segments: [{ batchId: batch.id, name: batch.name, remaining: batch.remaining, unitPrice: batch.unitPrice }],
      bought: formats.date.format(new Date(batch.occurredAt)),
      left: `${this.exact(formats.quantity, batch.remaining)} / ${this.exact(formats.quantity, batch.quantity)} ${this.unit()}`,
      totalPrice: this.exact(formats.money, batch.totalPrice),
      share: `${this.exact(formats.share, byValue ? batch.shareByValue : batch.shareByQuantity)} ${
        byValue ? 'del valore' : 'della scorta'
      }`,
    }));
  });

  protected chooseShare(mode: ShareMode): void {
    this.shareMode.set(mode);
    writeShareMode(mode);
  }
}
