import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of } from 'rxjs';

import { HistoryPage, OneTimeConsumption, OneTimeStats } from '../../data/one-time';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { OneTimeList } from './one-time-list';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const stats = (count: number, totalQuantity = '0.000', totalSpent = '0.00') =>
  ({ substanceId: 4, count, totalQuantity, totalSpent }) as OneTimeStats;

/** The n-th consumption back in time: one a day, from 2026-09-26 22:00 UTC (27 Sep in Rome). */
function consumption(n: number, name: string | null = null, note: string | null = null): OneTimeConsumption {
  return {
    type: 'one_time',
    id: 100 - n,
    substanceId: 4,
    name,
    occurredAt: new Date(Date.UTC(2026, 8, 26 - n, 22)).toISOString().replace('.000', ''),
    quantity: '2.000',
    totalPrice: '9.00',
    cost: '9.00',
    note,
    clientRef: null,
    createdAt: '2026-09-29T10:00:00Z',
  };
}

describe('OneTimeList', () => {
  let fixture: ComponentFixture<OneTimeList>;
  let statsAnswer: () => Observable<OneTimeStats>;
  let pages: HistoryPage[];
  let pageAnswer: (page: HistoryPage) => OneTimeConsumption[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(OneTimeList);
    fixture.componentRef.setInput('substanceId', 4);
    fixture.componentRef.setInput('unit', 'bottiglia');
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    pages = [];
    statsAnswer = () => of(stats(2, '4.000', '18.00'));
    pageAnswer = () => [consumption(0, 'Bar sotto casa', 'con Luca'), consumption(1)];
    await TestBed.configureTestingModule({
      imports: [OneTimeList],
      providers: [
        {
          provide: ReportsApi,
          useValue: {
            getOneTimeStats: () => statsAnswer(),
            listOneTimeConsumptions: (_id: number, page: HistoryPage) => {
              pages.push(page);
              return of(pageAnswer(page));
            },
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, is the total: how many, how much and what they cost', async () => {
    await render();

    expect(text(element().querySelector('mat-panel-title'))).toBe('One-time');
    expect(text(element().querySelector('.total'))).toBe('2 consumptions · 4 bottiglia · €18.00');
  });

  it('opens into one item per consumption, newest first, with its name, day, quantity and price', async () => {
    await render();
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();

    expect(texts('.item-name')).toEqual(['Bar sotto casa', 'Unnamed']);
    expect(texts('.when')).toEqual(['27 Sept 2026', '26 Sept 2026']);
    expect(texts('.quantity')).toEqual(['2 bottiglia', '2 bottiglia']);
    expect(texts('.price')).toEqual(['€9.00', '€9.00']);
    expect(texts('.note')).toEqual(['con Luca']);
    expect(element().querySelector('.more')).toBeNull(); // a page that is not full is the last one
  });

  it('loads older consumptions a page at a time, from before the oldest one shown', async () => {
    statsAnswer = () => of(stats(25, '50.000', '225.00'));
    pageAnswer = (page) =>
      page.before
        ? Array.from({ length: 5 }, (_, i) => consumption(20 + i))
        : Array.from({ length: 20 }, (_, i) => consumption(i));
    await render();

    const more = element().querySelector<HTMLButtonElement>('.more')!;
    expect(text(more)).toBe('Show more');
    more.click();
    await fixture.whenStable();

    expect(pages).toEqual([{ limit: 20 }, { limit: 20, before: consumption(19).occurredAt }]);
    expect(element().querySelectorAll('.item').length).toBe(25);
    expect(element().querySelector('.more')).toBeNull();
  });

  it('says when there are none, and cannot be opened', async () => {
    statsAnswer = () => of(stats(0));
    pageAnswer = () => [];
    await render();

    expect(text(element().querySelector('.total'))).toBe('No consumptions');
    expect(element().querySelector('mat-expansion-panel-header')!.getAttribute('aria-disabled')).toBe('true');
  });
});
