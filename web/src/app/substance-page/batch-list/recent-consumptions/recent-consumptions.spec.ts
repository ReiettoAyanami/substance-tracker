import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../../../data/api-error';
import { Consumption, ConsumptionFilter } from '../../../data/consumption';
import { HistoryPage } from '../../../data/one-time';
import { ReportsApi } from '../../../data/reports-api';
import { Settings } from '../../../data/settings';
import { Batch } from '../../../data/substance-batches';
import { RecentConsumptions } from './recent-consumptions';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

/** A batch of the Sigarette, as their batch list gives it. */
const pack = { id: 8, name: null, quantity: '20.000', remaining: '8.000', unitPrice: '0.310000' } as Batch;

/**
 * The consumptions of the pack, newest first: how many, what they cost at 0.31 each, and the change
 * from the one before in the batch. At one unit price the cost changes as the quantity does.
 */
const LAST = [
  { quantity: '4.000', cost: '1.24', delta: '0.3333' },
  { quantity: '3.000', cost: '0.93', delta: '-0.4000' },
  { quantity: '5.000', cost: '1.55', delta: null }, // the first of the batch
];

/** The n-th consumption of the pack back in time: one a day, from 2026-09-28 18:00 UTC. */
function consumption(n: number): Consumption {
  const { quantity, cost, delta } = LAST[n] ?? LAST[2]!;
  return {
    type: 'consumption',
    id: 100 - n,
    substanceId: 2,
    substanceName: 'Sigarette',
    unit: 'sigaretta',
    batchId: 8,
    batchName: null,
    name: null,
    occurredAt: new Date(Date.UTC(2026, 8, 28 - n, 18)).toISOString().replace('.000', ''),
    quantity,
    unitPrice: '0.310000',
    cost,
    note: 'a note the compact card leaves out',
    deltaQuantity: delta,
    deltaUnitPrice: delta === null ? null : '0.0000',
    deltaCost: delta,
  };
}

describe('RecentConsumptions', () => {
  let fixture: ComponentFixture<RecentConsumptions>;
  let calls: { filter: ConsumptionFilter; page: HistoryPage }[];
  let answer: () => Observable<Consumption[]>;

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cards = () => Array.from(element().querySelectorAll('app-consumption-card'));
  const all = () => element().querySelector<HTMLAnchorElement>('a.all');

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(RecentConsumptions);
    fixture.componentRef.setInput('batch', pack);
    fixture.componentRef.setInput('substanceId', 2);
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear(); // the change the pills show is remembered there
    calls = [];
    answer = () => of([consumption(0), consumption(1), consumption(2)]);
    await TestBed.configureTestingModule({
      imports: [RecentConsumptions],
      providers: [
        provideRouter([]),
        {
          provide: ReportsApi,
          useValue: {
            listConsumptions: (filter: ConsumptionFilter, page: HistoryPage) => {
              calls.push({ filter, page });
              return answer();
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('asks for the last 5 consumptions of its batch and shows them as compact cards, newest first, with no menu', async () => {
    await render();

    expect(calls).toEqual([{ filter: { batchId: 8 }, page: { limit: 5 } }]);
    const parts = (card: Element) => ['.when', '.amount', '.delta'].map((part) => text(card.querySelector(part)));
    expect(cards().map(parts)).toEqual([
      ['28 Sept 2026, 20:00', '4 sigaretta · €1.24', 'quantity +33.3%'],
      ['27 Sept 2026, 20:00', '3 sigaretta · €0.93', 'quantity -40%'],
      ['26 Sept 2026, 20:00', '5 sigaretta · €1.55', ''], // the first of the batch
    ]);
    expect(element().querySelector('app-consumption-card .note')).toBeNull();
    expect(element().querySelector('app-consumption-card button.more')).toBeNull(); // edited and deleted in the consumptions page
  });

  it('a tap on a pill switches that card only to the change in price', async () => {
    await render();
    const deltas = () => cards().map((card) => text(card.querySelector('.delta')));
    expect(deltas()).toEqual(['quantity +33.3%', 'quantity -40%', '']);

    cards()[1]!.querySelector<HTMLButtonElement>('app-delta-pill button')!.click();
    await fixture.whenStable();
    expect(deltas()).toEqual(['quantity +33.3%', 'price -40%', '']);
    expect(calls.length).toBe(1); // nothing is asked again for that
  });

  it('ends with "…", the way to every consumption of the batch: the consumptions page filtered on it', async () => {
    await render();

    expect(all()!.getAttribute('aria-label')).toBe('All the consumptions of this batch');
    expect(all()!.getAttribute('href')).toBe('/consumptions?substanceId=2&batchId=8');
    // after the cards: the sixth item when there are five of them
    const last = cards().at(-1)!;
    expect((last.compareDocumentPosition(all()!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('shows five at most, even when the API adds the ones at the same instant as the fifth', async () => {
    answer = () => of(Array.from({ length: 7 }, (_, n) => consumption(n)));
    await render();

    expect(cards().length).toBe(5);
    expect(all()).not.toBeNull();
  });

  it('says "No consumptions" for a batch with none, with nothing to go and see', async () => {
    answer = () => of([]);
    await render();

    expect(text(element().querySelector('.empty'))).toBe('No consumptions');
    expect(cards()).toEqual([]);
    expect(all()).toBeNull();
  });

  it('says why when they cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 500, title: 'Internal Server Error', detail: '', fieldErrors: [] }) as ApiError);
    await render();

    expect(text(element().querySelector('.error'))).toBe('Could not load the consumptions (500)');
    expect(cards()).toEqual([]);
  });

  it('asks again when its batch is asked again (its price may have changed, and the costs with it)', async () => {
    await render();

    fixture.componentRef.setInput('batch', { ...pack, unitPrice: '0.350000' });
    await fixture.whenStable();

    expect(calls.length).toBe(2);
    expect(cards().length).toBe(3);
  });
});
