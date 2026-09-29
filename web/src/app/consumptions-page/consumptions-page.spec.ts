import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../data/api-error';
import { Consumption, ConsumptionFilter } from '../data/consumption';
import { HistoryPage } from '../data/one-time';
import { ReportsApi } from '../data/reports-api';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
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
  let fixture: ComponentFixture<ConsumptionsPage>;
  let pages: HistoryPage[];
  let pageAnswer: (page: HistoryPage) => Observable<Consumption[]>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(ConsumptionsPage);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    pages = [];
    pageAnswer = () => of([consumption(0), consumption(1, 'one_time')]);
    await TestBed.configureTestingModule({
      imports: [ConsumptionsPage],
      providers: [
        { provide: SettingsApi, useValue: { getSettings: () => of(settings) } },
        {
          provide: ReportsApi,
          useValue: {
            listConsumptions: (_filter: ConsumptionFilter, page: HistoryPage) => {
              pages.push(page);
              return pageAnswer(page);
            },
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('shows one full card per consumption, in the order the API gives, and a "+" to come', async () => {
    await render();

    const cards = element().querySelectorAll('app-consumption-card');
    expect(cards.length).toBe(2);
    expect(text(cards[0].querySelector('.source'))).toBe('Unnamed batch');
    expect(text(cards[1].querySelector('.source'))).toBe('One-time');
    expect(pages).toEqual([{ limit: 20 }]);
    const add = element().querySelector<HTMLButtonElement>('button[aria-label="Add consumption"]')!;
    expect(add.disabled).toBe(true); // until the consumption form exists (step 8)
    expect(element().querySelector('.show-more')).toBeNull(); // a page that is not full is the last one
  });

  it('loads older consumptions a page at a time, from before the oldest one shown', async () => {
    pageAnswer = (page) =>
      of(page.before ? Array.from({ length: 5 }, (_, i) => consumption(20 + i)) : Array.from({ length: 20 }, (_, i) => consumption(i)));
    await render();

    const more = element().querySelector<HTMLButtonElement>('.show-more')!;
    expect(text(more)).toBe('Show more');
    more.click();
    await fixture.whenStable();

    expect(pages).toEqual([{ limit: 20 }, { limit: 20, before: consumption(19).occurredAt }]);
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
    await fixture.whenStable();

    expect(text(element().querySelector('.more-error'))).toBe('Could not load more consumptions');
    expect(element().querySelectorAll('app-consumption-card').length).toBe(20);
    expect(element().querySelector('.show-more')).toBeNull();
  });
});
