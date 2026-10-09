import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import { HistoryPage, OneTimeConsumption } from '../../data/one-time';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { ConsumptionActions } from '../../consumptions-page/consumption-actions';
import { OneTimeList } from './one-time-list';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

/**
 * The n-th consumption back in time: one a day, from 2026-09-26 22:00 UTC (27 Sep in Rome). `delta`
 * is its change from the consumption before it of the substance, on the quantity and on the price;
 * none for the first.
 */
function consumption(
  n: number,
  name: string | null = null,
  note: string | null = null,
  delta: { quantity: string; cost: string } | null = null,
): OneTimeConsumption {
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
    deltaQuantity: delta?.quantity ?? null,
    deltaUnitPrice: null,
    deltaCost: delta?.cost ?? null,
  };
}

describe('OneTimeList', () => {
  let fixture: ComponentFixture<OneTimeList>;
  let pages: HistoryPage[];
  let pageAnswer: (page: HistoryPage) => Observable<OneTimeConsumption[]>;
  /** What was asked of the actions, their answer, and what the list told its page. */
  let asked: number[];
  let written: boolean;
  let told: number;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(OneTimeList);
    fixture.componentRef.setInput('substanceId', 4);
    fixture.componentRef.setInput('unit', 'bottiglia');
    fixture.componentRef.setInput('settings', settings);
    told = 0;
    fixture.componentInstance.changed.subscribe(() => told++);
    await fixture.whenStable();
  }

  async function expand(): Promise<void> {
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    pages = [];
    asked = [];
    written = true;
    // The newest: twice the single bottle taken from a batch before it, for 9.00 against 1.50.
    pageAnswer = () =>
      of([consumption(0, 'Bar sotto casa', 'con Luca', { quantity: '1.0000', cost: '5.0000' }), consumption(1)]);
    await TestBed.configureTestingModule({
      imports: [OneTimeList],
      providers: [
        {
          provide: ReportsApi,
          useValue: {
            listOneTimeConsumptions: (_id: number, page: HistoryPage) => {
              pages.push(page);
              return pageAnswer(page);
            },
          },
        },
        { provide: ConsumptionActions, useValue: { addOneTime: async (id: number) => (asked.push(id), written) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, is only its title: no total beside it (lenzi, 2026-10-09)', async () => {
    await render();

    expect(text(element().querySelector('mat-expansion-panel-header'))).toBe('One-time');
    expect(element().querySelector('mat-panel-description')).toBeNull();
  });

  it('opens into one item per consumption, newest first, with its name, day, quantity and price', async () => {
    await render();
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();

    expect(texts('.item-name')).toEqual(['Bar sotto casa', 'Unnamed']);
    expect(texts('.when')).toEqual(['27 Sept 2026', '26 Sept 2026']);
    expect(texts('.item app-measure-toggle')).toEqual(['qty', 'qty']); // the toggle, then how much
    expect(texts('.figure .value')).toEqual(['2 bottiglia', '2 bottiglia']);
    element().querySelector<HTMLButtonElement>('.item app-measure-toggle button')!.click(); // what was paid, one at a time
    await fixture.whenStable();
    expect(texts('.figure .value')).toEqual(['€9.00', '2 bottiglia']);
    expect(texts('.note')).toEqual(['con Luca']);
    expect(element().querySelector('.more')).toBeNull(); // a page that is not full is the last one
  });

  it('shows the change of each from the consumption before it of the substance, that its toggle switches to the price', async () => {
    await render();
    await expand();
    const changes = () => Array.from(element().querySelectorAll('.item')).map((item) => text(item.querySelector('.delta .number')));

    expect(changes()).toEqual(['+100%', '']); // none for the first consumption of the substance

    element().querySelector<HTMLButtonElement>('.item app-measure-toggle button')!.click();
    await fixture.whenStable();

    expect(changes()).toEqual(['+500%', '']);
    expect(texts('.figure .value')).toEqual(['€9.00', '2 bottiglia']); // the figure with it
    expect(pages.length).toBe(1); // nothing is asked again for that
  });

  it('loads older consumptions a page at a time, from before the oldest one shown', async () => {
    pageAnswer = (page) =>
      of(page.before ? Array.from({ length: 5 }, (_, i) => consumption(20 + i)) : Array.from({ length: 20 }, (_, i) => consumption(i)));
    await render();

    const more = element().querySelector<HTMLButtonElement>('.more')!;
    expect(text(more)).toBe('Show more');
    more.click();
    await fixture.whenStable();

    expect(pages).toEqual([{ limit: 20 }, { limit: 20, before: consumption(19).occurredAt }]);
    expect(element().querySelectorAll('.item').length).toBe(25);
    expect(element().querySelector('.more')).toBeNull();
  });

  it('opens with none too: the first one is added from here', async () => {
    pageAnswer = () => of([]);
    await render();

    expect(element().querySelector('mat-expansion-panel-header')!.getAttribute('aria-disabled')).toBe('false');
    await expand();
    expect(text(element().querySelector('.tools button.add'))).toContain('Add one-time');
    expect(element().querySelector('.item')).toBeNull();
  });

  it('adds a one-time consumption of its substance from the button at the top of the panel, then asks the list again and tells the page', async () => {
    pageAnswer = (page) =>
      of(page.before ? Array.from({ length: 5 }, (_, i) => consumption(20 + i)) : Array.from({ length: 20 }, (_, i) => consumption(i)));
    await render();
    await expand();
    element().querySelector<HTMLButtonElement>('.more')!.click(); // a second page is shown
    await fixture.whenStable();
    expect(element().querySelectorAll('.item').length).toBe(25);

    element().querySelector<HTMLButtonElement>('.tools button.add')!.click();
    await fixture.whenStable();

    expect(asked).toEqual([4]);
    expect(pages.at(-1)).toEqual({ limit: 20 }); // from the first page again
    expect(element().querySelectorAll('.item').length).toBe(20);
    expect(told).toBe(1);
  });

  it('asks nothing again when nothing was written (the dialog cancelled)', async () => {
    written = false;
    await render();
    await expand();

    element().querySelector<HTMLButtonElement>('.tools button.add')!.click();
    await fixture.whenStable();

    expect(asked).toEqual([4]);
    expect(pages.length).toBe(1);
    expect(told).toBe(0);
  });

  it('says inside the panel when the consumptions could not be loaded', async () => {
    pageAnswer = () => throwError(() => ({ status: 500 }));
    await render();
    await expand();

    expect(text(element().querySelector('.error[role="alert"]'))).toBe('Could not load the consumptions');
    expect(element().querySelector('.item')).toBeNull();
  });
});
