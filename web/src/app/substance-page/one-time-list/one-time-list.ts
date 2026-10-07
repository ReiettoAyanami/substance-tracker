import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { ConsumptionActions } from '../../consumptions-page/consumption-actions';
import { ApiError } from '../../data/api-error';
import { OneTimeConsumption } from '../../data/one-time';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { LOCALE } from '../../locale';
import { ConsumptionFigures } from '../../ui/consumption-figures/consumption-figures';

/** How many one-time consumptions one page shows. */
const PAGE = 20;

/**
 * The one-time consumptions of a substance, in its page (design.md, "one-time consumption":
 * bought and used at once, no batch, never in stock). Closed, it is the total: how many, how much
 * and what they cost. Open, one item per consumption, newest first, a page at a time, each with how
 * much or what was paid, a toggle (ui/consumption-figures, lenzi 2026-10-07), and its change from
 * the consumption before it of the substance, from a batch or one-time (a delta pill: a one-time
 * consumption has no batch to be compared within), and at the top right "Add one-time"
 * (lenzi: a quick way to one from its list; every other consumption is added in the consumptions
 * page), so the panel opens also with none. Loads its data from the API, asks for it again after
 * an addition, and tells its page (`changed`).
 */
@Component({
  selector: 'app-one-time-list',
  imports: [ConsumptionFigures, MatButtonModule, MatExpansionModule, MatIconModule],
  templateUrl: './one-time-list.html',
  styleUrl: './one-time-list.css',
})
export class OneTimeList {
  readonly substanceId = input.required<number>();
  /** Unit of the substance. */
  readonly unit = input.required<string>();
  readonly settings = input.required<Settings>();
  /** A one-time consumption was added: the numbers of the substance changed with it. */
  readonly changed = output<void>();

  private readonly reports = inject(ReportsApi);
  private readonly actions = inject(ConsumptionActions);
  private readonly stats = rxResource({
    params: () => this.substanceId(),
    stream: ({ params }) => this.reports.getOneTimeStats(params),
  });
  private readonly firstPage = rxResource({
    params: () => this.substanceId(),
    stream: ({ params }) => this.reports.listOneTimeConsumptions(params, { limit: PAGE }),
  });
  /** The pages loaded with "Show more", after the first; none for another substance. */
  private readonly olderPages = linkedSignal<number, OneTimeConsumption[]>({
    source: this.substanceId,
    computation: () => [],
  });
  /** The last page loaded was full: there may be older consumptions. */
  private readonly lastPageFull = linkedSignal(
    () => this.firstPage.hasValue() && this.firstPage.value().length >= PAGE,
  );
  protected readonly loadingMore = signal(false);
  protected readonly moreFailed = linkedSignal<number, boolean>({ source: this.substanceId, computation: () => false });

  private readonly formats = computed(() => ({
    quantity: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }),
    money: new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: this.settings().currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
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

  /** The closed panel: how many one-time consumptions, how much, and what they cost. */
  protected readonly total = computed(() => {
    const failure = this.stats.error();
    if (failure) {
      // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
      const error = (failure.cause ?? failure) as Partial<ApiError>;
      return `Could not load them${error.status ? ` (${error.status})` : ''}`;
    }
    if (!this.stats.hasValue()) return '…';
    const { count, totalQuantity, totalSpent } = this.stats.value();
    if (count === 0) return 'No consumptions';
    const formats = this.formats();
    const consumptions = count === 1 ? '1 consumption' : `${count} consumptions`;
    return `${consumptions} · ${this.exact(formats.quantity, totalQuantity)} ${this.unit()} · ${this.exact(formats.money, totalSpent)}`;
  });

  /** One item per consumption, newest first. */
  protected readonly rows = computed(() => {
    const formats = this.formats();
    const first = this.firstPage.hasValue() ? this.firstPage.value() : [];
    return [...first, ...this.olderPages()].map((item) => ({
      item,
      when: formats.date.format(new Date(item.occurredAt)),
      quantity: `${this.exact(formats.quantity, item.quantity)} ${this.unit()}`,
      price: this.exact(formats.money, item.totalPrice),
    }));
  });

  protected readonly hasMore = computed(() => this.lastPageFull() && !this.moreFailed());

  /** The consumption form for a one-time consumption of this substance; once saved, total and list start again. */
  protected async add(): Promise<void> {
    if (!(await this.actions.addOneTime(this.substanceId()))) return;
    this.olderPages.set([]);
    this.moreFailed.set(false);
    this.stats.reload();
    this.firstPage.reload();
    this.changed.emit();
  }

  /** The next page: the consumptions before the oldest one shown. */
  protected showMore(): void {
    const oldest = this.rows().at(-1)?.item;
    if (!oldest || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.reports.listOneTimeConsumptions(this.substanceId(), { limit: PAGE, before: oldest.occurredAt }).subscribe({
      next: (page) => {
        this.olderPages.update((pages) => [...pages, ...page]);
        this.lastPageFull.set(page.length >= PAGE);
        this.loadingMore.set(false);
      },
      error: () => {
        this.moreFailed.set(true);
        this.loadingMore.set(false);
      },
    });
  }
}
