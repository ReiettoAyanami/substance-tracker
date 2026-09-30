import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { Consumption, ConsumptionFilter, ConsumptionScope } from '../data/consumption';
import { HistoryPage } from '../data/one-time';
import { ReportsApi } from '../data/reports-api';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
import { ConsumptionCard } from '../ui/consumption-card/consumption-card';
import { ConsumptionActions } from './consumption-actions';
import { ConsumptionFilters } from './consumption-filters/consumption-filters';
import { ConsumptionsPage } from './consumptions-page';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

/** The n-th consumption back in time: one a day, from 2026-09-28 18:00 UTC. */
function consumption(n: number, type: Consumption['type'] = 'consumption'): Consumption {
  return {
    type,
    id: 100 - n,
    substanceId: 2,
    substanceName: 'Sigarette',
    unit: 'sigaretta',
    batchId: type === 'consumption' ? 8 : null,
    batchName: null,
    name: null,
    occurredAt: new Date(Date.UTC(2026, 8, 28 - n, 18)).toISOString().replace('.000', ''),
    quantity: '4.000',
    unitPrice: '0.325000',
    cost: '1.30',
    note: null,
    deltaQuantity: null,
    deltaUnitPrice: null,
  };
}

const serverError: ApiError = { status: 500, title: 'Internal Server Error', detail: '', fieldErrors: [] };

describe('ConsumptionsPage', () => {
  let harness: RouterTestingHarness;
  let calls: { filter: ConsumptionFilter; page: HistoryPage }[];
  let scopes: ConsumptionScope[];
  let batchLists: number;
  /** What was asked of the actions, and whether they answer that something was written. */
  let asked: unknown[];
  let written: boolean;
  let pageAnswer: (page: HistoryPage) => Observable<Consumption[]>;

  const element = () => harness.routeNativeElement!;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(url = '/consumptions'): Promise<void> {
    harness = await RouterTestingHarness.create(url);
    await harness.fixture.whenStable();
  }

  beforeEach(() => {
    calls = [];
    scopes = [];
    batchLists = 0;
    asked = [];
    written = true;
    pageAnswer = () => of([consumption(0), consumption(1, 'one_time')]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'consumptions', component: ConsumptionsPage }]),
        { provide: SettingsApi, useValue: { getSettings: () => of(settings) } },
        { provide: CatalogApi, useValue: { listSubstances: () => of([]) } },
        {
          provide: ReportsApi,
          useValue: {
            listConsumptions: (filter: ConsumptionFilter, page: HistoryPage) => {
              calls.push({ filter, page });
              return pageAnswer(page);
            },
            listBatches: () => {
              batchLists++;
              return of([]);
            },
            getConsumptionBounds: (scope: ConsumptionScope) => {
              scopes.push(scope);
              return of({ minUnitPrice: '0.300000', maxUnitPrice: '0.325000', minQuantity: '1.000', maxQuantity: '13.000' });
            },
          },
        },
        {
          provide: ConsumptionActions,
          useValue: {
            add: async () => (asked.push('add'), written),
            edit: async (item: Consumption) => (asked.push(['edit', item.id]), written),
            delete: async (item: Consumption) => (asked.push(['delete', item.id]), written),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
  });

  it('shows one full card per consumption, in the order the API gives, the filters and the "+"', async () => {
    await render();

    const cards = element().querySelectorAll('app-consumption-card');
    expect(cards.length).toBe(2);
    expect(text(cards[0].querySelector('.source'))).toBe('Unnamed batch');
    expect(text(cards[1].querySelector('.source'))).toBe('One-time');
    expect(calls).toEqual([{ filter: {}, page: { limit: 20 } }]);
    expect(element().querySelector('app-consumption-filters')).not.toBeNull();
    expect(element().querySelector<HTMLButtonElement>('button[aria-label="Add consumption"]')!.disabled).toBe(false);
    expect(element().querySelector('.show-more')).toBeNull(); // a page that is not full is the last one
  });

  it('reads the filters from the URL, leaving out what does not look right', async () => {
    await render('/consumptions?substanceId=2&batchId=8&from=2026-09-01&to=2026-09&minUnitPrice=0.3&maxQuantity=abc&other=1');

    const filter = { substanceId: 2, batchId: 8, from: '2026-09-01', minUnitPrice: '0.3' };
    expect(calls).toEqual([{ filter, page: { limit: 20 } }]);
    expect(scopes).toEqual([{ substanceId: 2, batchId: 8, from: '2026-09-01' }]); // the bounds ignore the ranges
  });

  it('puts a new filter in the URL, in place of the current entry, and lists what it asks for', async () => {
    await render('/consumptions?from=2026-09-01');
    const entries = history.length;
    const filters = harness.routeDebugElement!.query(By.directive(ConsumptionFilters)).componentInstance as ConsumptionFilters;

    filters.changed.emit({ from: '2026-09-01', substanceId: 4, minQuantity: '2' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/consumptions?from=2026-09-01&substanceId=4&minQuantity=2');
    expect(calls.at(-1)).toEqual({ filter: { substanceId: 4, from: '2026-09-01', minQuantity: '2' }, page: { limit: 20 } });
    expect(scopes.at(-1)).toEqual({ substanceId: 4, from: '2026-09-01' });
    expect(history.length).toBe(entries);
  });

  it('loads older consumptions a page at a time, from before the oldest one shown, with the same filter', async () => {
    pageAnswer = (page) =>
      of(page.before ? Array.from({ length: 5 }, (_, i) => consumption(20 + i)) : Array.from({ length: 20 }, (_, i) => consumption(i)));
    await render('/consumptions?substanceId=2');

    const more = element().querySelector<HTMLButtonElement>('.show-more')!;
    expect(text(more)).toBe('Show more');
    more.click();
    await harness.fixture.whenStable();

    expect(calls).toEqual([
      { filter: { substanceId: 2 }, page: { limit: 20 } },
      { filter: { substanceId: 2 }, page: { limit: 20, before: consumption(19).occurredAt } },
    ]);
    expect(element().querySelectorAll('app-consumption-card').length).toBe(25);
    expect(element().querySelector('.show-more')).toBeNull();
  });

  it('says "No consumptions" when there are none', async () => {
    pageAnswer = () => of([]);
    await render();

    expect(text(element().querySelector('.empty'))).toBe('No consumptions');
    expect(element().querySelector('app-consumption-card')).toBeNull();
  });

  it('says why when the API fails, instead of an empty page', async () => {
    pageAnswer = () => throwError(() => serverError);
    await render();

    expect(text(element().querySelector('.error'))).toBe('Could not load the consumptions: Internal Server Error (500)');
    expect(element().querySelector('.empty')).toBeNull();
  });

  it('says so when the next page cannot be loaded, and keeps what it shows', async () => {
    pageAnswer = (page) => (page.before ? throwError(() => serverError) : of(Array.from({ length: 20 }, (_, i) => consumption(i))));
    await render();

    element().querySelector<HTMLButtonElement>('.show-more')!.click();
    await harness.fixture.whenStable();

    expect(text(element().querySelector('.more-error'))).toBe('Could not load more consumptions');
    expect(element().querySelectorAll('app-consumption-card').length).toBe(20);
    expect(element().querySelector('.show-more')).toBeNull();
  });

  /** The cards' outputs, as the ⋮ menu would fire them. */
  const card = (index: number) =>
    harness.routeDebugElement!.queryAll(By.directive(ConsumptionCard))[index]!.componentInstance as ConsumptionCard;

  it('after a write starts again from the first page, and asks the bounds and the batches again', async () => {
    pageAnswer = (page) =>
      of(page.before ? Array.from({ length: 5 }, (_, i) => consumption(20 + i)) : Array.from({ length: 20 }, (_, i) => consumption(i)));
    await render('/consumptions?substanceId=2');
    element().querySelector<HTMLButtonElement>('.show-more')!.click();
    await harness.fixture.whenStable();
    expect(element().querySelectorAll('app-consumption-card').length).toBe(25);

    element().querySelector<HTMLButtonElement>('button[aria-label="Add consumption"]')!.click();
    await harness.fixture.whenStable();

    expect(asked).toEqual(['add']);
    expect(calls.at(-1)).toEqual({ filter: { substanceId: 2 }, page: { limit: 20 } });
    expect(calls.length).toBe(3);
    expect(scopes.length).toBe(2);
    expect(batchLists).toBe(2);
    expect(element().querySelectorAll('app-consumption-card').length).toBe(20);
    expect(element().querySelector('.show-more')).not.toBeNull();
  });

  it('edits and deletes the consumption of the card whose menu asked', async () => {
    await render();

    card(0).edit.emit();
    await harness.fixture.whenStable();
    card(1).remove.emit();
    await harness.fixture.whenStable();

    expect(asked).toEqual([
      ['edit', consumption(0).id],
      ['delete', consumption(1, 'one_time').id],
    ]);
    expect(calls.length).toBe(3);
  });

  it('loads nothing again when nothing was written (a dialog cancelled)', async () => {
    written = false;
    await render();

    element().querySelector<HTMLButtonElement>('button[aria-label="Add consumption"]')!.click();
    card(0).remove.emit();
    await harness.fixture.whenStable();

    expect(asked.length).toBe(2);
    expect(calls.length).toBe(1);
    expect(scopes.length).toBe(1);
  });
});
