import { Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, Router } from '@angular/router';

import { ApiError } from '../../data/api-error';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { Batch } from '../../data/substance-batches';
import { LOCALE } from '../../locale';
import { IdentityColorPipe } from '../../ui/identity-color-pipe';
import { StockBar } from '../../ui/stock-bar/stock-bar';
import { UnitPricePipe } from '../../ui/unit-price-pipe';
import { BatchActions } from './batch-actions';
import { RecentConsumptions } from './recent-consumptions/recent-consumptions';

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
 * oldest first). Closed, how many active batches, nothing else ("2 active batches"). Open, one
 * sub-card per batch, with its own bar (maximum = what was bought, filled = what is left), its
 * prices and its share of the stock, by quantity or by value, a ⋮ menu to open its page
 * (Details), edit or delete it, and its recent consumptions, shown on demand (design-frontend.md,
 * "recent consumptions"); at the top right of the open panel, "Add batch" (so the panel opens also
 * with no batch). Loads its data from the API, asks for it again after each of those writes, and
 * tells its page (`changed`), which has the substance's card to refresh.
 */
@Component({
  selector: 'app-batch-list',
  imports: [
    IdentityColorPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatExpansionModule,
    MatIconModule,
    MatMenuModule,
    RecentConsumptions,
    StockBar,
    UnitPricePipe,
  ],
  templateUrl: './batch-list.html',
  styleUrl: './batch-list.css',
})
export class BatchList {
  readonly substanceId = input.required<number>();
  /** Unit of the substance. */
  readonly unit = input.required<string>();
  readonly settings = input.required<Settings>();
  /** A batch was added, changed or deleted: the numbers of the substance changed with it. */
  readonly changed = output<void>();

  private readonly reports = inject(ReportsApi);
  private readonly actions = inject(BatchActions);
  private readonly router = inject(Router);
  /** The substance page's route: a batch's page opens under it. */
  private readonly route = inject(ActivatedRoute);
  protected readonly batches = rxResource({
    params: () => this.substanceId(),
    stream: ({ params }) => this.reports.getSubstanceBatches(params),
  });

  protected readonly shareMode = signal<ShareMode>(readShareMode());
  /** The batches whose recent consumptions are open. Not part of the rows: opening one leaves the others as they are. */
  protected readonly recentOpen = signal<ReadonlySet<number>>(new Set());
  /**
   * The batches whose recent consumptions were opened once: they stay, hidden when closed, so opening
   * them again shows them at once, without asking or drawing them again (lenzi, 2026-10-03: "lagga").
   */
  protected readonly recentShown = signal<ReadonlySet<number>>(new Set());

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

  /**
   * The closed panel: how many active batches, and nothing else (lenzi, 2026-10-09: "'No active
   * batches', 'X active batches' é ok da avere, ma niente altro"; until then also their stock, "2
   * batches · 201 / 300 capsula").
   */
  protected readonly total = computed(() => {
    const failure = this.batches.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return `Could not load the batches${error.status ? ` (${error.status})` : ''}`;
    }
    if (!this.batches.hasValue()) return '…';
    const count = this.batches.value().batches.length;
    if (count === 0) return 'No active batches';
    return count === 1 ? '1 active batch' : `${count} active batches`;
  });

  /** One sub-card per active batch, oldest first. */
  protected readonly rows = computed(() => {
    if (!this.batches.hasValue()) return [];
    const formats = this.formats();
    const byValue = this.shareMode() === 'value';
    return this.batches.value().batches.map((batch) => ({
      batch,
      /** The batch's own bar: its remaining out of what was bought. */
      segments: [{ batchId: batch.id, name: batch.name, quantity: batch.quantity, remaining: batch.remaining, unitPrice: batch.unitPrice }],
      bought: formats.date.format(new Date(batch.occurredAt)),
      left: `${this.exact(formats.quantity, batch.remaining)} / ${this.exact(formats.quantity, batch.quantity)} ${this.unit()}`,
      totalPrice: this.exact(formats.money, batch.totalPrice),
      share: `${this.exact(formats.share, byValue ? batch.shareByValue : batch.shareByQuantity)} ${
        byValue ? 'of the value' : 'of the stock'
      }`,
    }));
  });

  /** Opens the recent consumptions of a batch (they are asked for then), or closes them. */
  protected toggleRecent(batchId: number): void {
    this.recentOpen.update((open) => {
      const next = new Set(open);
      if (!next.delete(batchId)) next.add(batchId);
      return next;
    });
    if (!this.recentShown().has(batchId)) this.recentShown.update((shown) => new Set(shown).add(batchId));
  }

  protected chooseShare(mode: ShareMode): void {
    this.shareMode.set(mode);
    writeShareMode(mode);
  }

  /** The batch's page, over the substance's: closing it comes back here. */
  protected details(batch: Batch): void {
    void this.router.navigate(['batches', batch.id], {
      relativeTo: this.route,
      state: { fromList: true },
      queryParamsHandling: 'preserve',
    });
  }

  protected async add(): Promise<void> {
    if (await this.actions.add(this.substanceId())) this.written();
  }

  protected async edit(batch: Batch): Promise<void> {
    if (await this.actions.edit(batch, this.substanceId())) this.written();
  }

  protected async remove(batch: Batch): Promise<void> {
    if (await this.actions.delete(batch)) this.written();
  }

  /** Asks the batches again: something changed them elsewhere (the batch's own page). */
  refresh(): void {
    this.batches.reload();
  }

  /** The batches are asked again (those shown stay until the new ones arrive), and the page is told. */
  protected written(): void {
    this.batches.reload();
    this.changed.emit();
  }
}
