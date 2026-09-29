import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ApiError } from '../data/api-error';
import { Consumption, ConsumptionFilter } from '../data/consumption';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';
import { ConsumptionCard } from '../ui/consumption-card/consumption-card';

/** How many consumptions one page shows. */
const PAGE = 20;

/** An error of a resource, as a short line: the interceptor's ApiError is wrapped as its cause. */
function reason(failure: Error): string {
  const error = (failure.cause ?? failure) as Partial<ApiError>;
  return `${error.title ?? failure.message}${error.status ? ` (${error.status})` : ''}`;
}

/**
 * The consumptions page (design-frontend.md, "consumptions page"): where the app opens. The
 * consumptions of both kinds as full cards, newest first, a page at a time ("Show more" loads the
 * page before the oldest one shown), and the "+" at the top right that will open the consumption
 * form. Every number on the cards is the API's.
 */
@Component({
  selector: 'app-consumptions-page',
  imports: [ConsumptionCard, MatButtonModule, MatIconModule],
  templateUrl: './consumptions-page.html',
  styleUrl: './consumptions-page.css',
})
export class ConsumptionsPage {
  private readonly reports = inject(ReportsApi);
  private readonly settingsApi = inject(SettingsApi);

  /** What the list shows: every consumption for now (the filters come with step 6). */
  protected readonly filter = signal<ConsumptionFilter>({});

  private readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  private readonly firstPage = rxResource({
    params: () => this.filter(),
    stream: ({ params }) => this.reports.listConsumptions(params, { limit: PAGE }),
  });
  /** The pages loaded with "Show more", after the first; none for another filter. */
  private readonly olderPages = linkedSignal<ConsumptionFilter, Consumption[]>({
    source: this.filter,
    computation: () => [],
  });
  /** The last page loaded was full: there may be older consumptions. */
  private readonly lastPageFull = linkedSignal(() => this.firstPage.hasValue() && this.firstPage.value().length >= PAGE);
  protected readonly loadingMore = signal(false);
  protected readonly moreFailed = linkedSignal<ConsumptionFilter, boolean>({ source: this.filter, computation: () => false });

  /** Why the list cannot be shown, if it cannot. */
  protected readonly error = computed(() => {
    const failure = this.settings.error() ?? this.firstPage.error();
    return failure ? reason(failure) : null;
  });

  /** The consumptions shown, newest first, and the settings that format them; null while loading. */
  protected readonly list = computed(() => {
    if (!this.settings.hasValue() || !this.firstPage.hasValue()) return null;
    return { settings: this.settings.value(), items: [...this.firstPage.value(), ...this.olderPages()] };
  });

  protected readonly hasMore = computed(() => this.lastPageFull() && !this.moreFailed());

  /** The next page: the consumptions before the oldest one shown. */
  protected showMore(): void {
    const oldest = this.list()?.items.at(-1);
    if (!oldest || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.reports.listConsumptions(this.filter(), { limit: PAGE, before: oldest.occurredAt }).subscribe({
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
