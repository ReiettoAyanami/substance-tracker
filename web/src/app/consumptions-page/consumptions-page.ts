import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { Consumption, ConsumptionFilter, ConsumptionScope } from '../data/consumption';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';
import { ConsumptionCard } from '../ui/consumption-card/consumption-card';
import { ConsumptionFilters } from './consumption-filters/consumption-filters';

/** How many consumptions one page shows. */
const PAGE = 20;

const ID = /^[1-9]\d*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * The filter in the URL's query (?substanceId=&batchId=&from=&to=&minUnitPrice=&maxUnitPrice=
 * &minQuantity=&maxQuantity=). A value that does not look right is left out: the API would refuse
 * it, and an old or hand-made link should still show a list.
 */
function filterOfQuery(query: Params): ConsumptionFilter {
  const text = (key: string, pattern: RegExp) => {
    const value: unknown = query[key];
    return typeof value === 'string' && pattern.test(value) ? value : undefined;
  };
  const id = (key: string) => {
    const value = text(key, ID);
    return value === undefined ? undefined : Number(value);
  };
  const filter: ConsumptionFilter = {
    substanceId: id('substanceId'),
    batchId: id('batchId'),
    from: text('from', DAY),
    to: text('to', DAY),
    minUnitPrice: text('minUnitPrice', DECIMAL),
    maxUnitPrice: text('maxUnitPrice', DECIMAL),
    minQuantity: text('minQuantity', DECIMAL),
    maxQuantity: text('maxQuantity', DECIMAL),
  };
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined)) as ConsumptionFilter;
}

/** The part of the filter the slider bounds depend on. */
function scopeOf({ substanceId, batchId, from, to }: ConsumptionFilter): ConsumptionScope {
  return Object.fromEntries(Object.entries({ substanceId, batchId, from, to }).filter(([, v]) => v !== undefined));
}

/** Two filters built by the functions above (same key order) are equal when they print the same. */
const sameFilter = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/** An error of a resource, as a short line: the interceptor's ApiError is wrapped as its cause. */
function reason(failure: Error): string {
  const error = (failure.cause ?? failure) as Partial<ApiError>;
  return `${error.title ?? failure.message}${error.status ? ` (${error.status})` : ''}`;
}

/**
 * The consumptions page (design-frontend.md, "consumptions page"): where the app opens. The
 * filters, kept in the URL's query (a link opens the page filtered; back and refresh keep them),
 * the consumptions of both kinds as full cards, newest first, a page at a time ("Show more" loads
 * the page before the oldest one shown), and the "+" at the top right that will open the
 * consumption form. Every number on the cards and every slider bound is the API's.
 */
@Component({
  selector: 'app-consumptions-page',
  imports: [ConsumptionCard, ConsumptionFilters, MatButtonModule, MatIconModule],
  templateUrl: './consumptions-page.html',
  styleUrl: './consumptions-page.css',
})
export class ConsumptionsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reports = inject(ReportsApi);
  private readonly settingsApi = inject(SettingsApi);
  private readonly catalog = inject(CatalogApi);

  private readonly query = toSignal(this.route.queryParams, { requireSync: true });
  /** What the list shows: the filter of the URL. */
  protected readonly filter = computed(() => filterOfQuery(this.query()), { equal: sameFilter });
  private readonly scope = computed(() => scopeOf(this.filter()), { equal: sameFilter });

  private readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  /** Every substance, archived ones too: their consumptions are listed. */
  protected readonly substances = rxResource({ stream: () => this.catalog.listSubstances({ archived: true }) });
  protected readonly batches = rxResource({ stream: () => this.reports.listBatches() });
  /** The ends of the sliders: they follow substance, batch and days, never the ranges themselves. */
  protected readonly bounds = rxResource({
    params: () => this.scope(),
    stream: ({ params }) => this.reports.getConsumptionBounds(params),
  });

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

  protected readonly loadedSettings = computed(() => (this.settings.hasValue() ? this.settings.value() : null));

  /** Why the list cannot be shown, if it cannot. */
  protected readonly error = computed(() => {
    const failure = this.settings.error() ?? this.firstPage.error();
    return failure ? reason(failure) : null;
  });

  /** The consumptions shown, newest first, and the settings that format them; null while loading. */
  protected readonly list = computed(() => {
    const settings = this.loadedSettings();
    if (!settings || !this.firstPage.hasValue()) return null;
    return { settings, items: [...this.firstPage.value(), ...this.olderPages()] };
  });

  protected readonly hasMore = computed(() => this.lastPageFull() && !this.moreFailed());

  /** A new filter goes into the URL, which replaces the page's entry: back does not walk through every tweak. */
  protected apply(filter: ConsumptionFilter): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: filter, replaceUrl: true });
  }

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
