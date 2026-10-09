import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { ConsumptionActions } from '../../../consumptions-page/consumption-actions';
import { ApiError } from '../../../data/api-error';
import { Consumption, ConsumptionFilter } from '../../../data/consumption';
import { HistoryPage } from '../../../data/one-time';
import { AuthApi } from '../../../data/auth-api';
import { ReportsApi } from '../../../data/reports-api';
import { Settings } from '../../../data/settings';
import { Batch } from '../../../data/substance-batches';
import { Session } from '../../../session/session';
import { ConsumptionCard } from '../../../ui/consumption-card/consumption-card';
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
  /** The component of the n-th card. */
  const cardOf = (n: number) => fixture.debugElement.queryAll(By.directive(ConsumptionCard))[n]!.componentInstance as ConsumptionCard;

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(RecentConsumptions);
    fixture.componentRef.setInput('batch', pack);
    fixture.componentRef.setInput('substanceId', 2);
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
  }

  /** What the cards asked of the actions, and whether those answer that something was written. */
  let actionCalls: unknown[][];
  let actionWrites: boolean;

  beforeEach(async () => {
    localStorage.clear(); // the change the pills show is remembered there
    calls = [];
    actionCalls = [];
    actionWrites = true;
    answer = () => of([consumption(0), consumption(1), consumption(2)]);
    await TestBed.configureTestingModule({
      imports: [RecentConsumptions],
      providers: [
        provideRouter([]),
        {
          provide: ConsumptionActions,
          useValue: {
            details: async (c: Consumption, s: Settings) => void actionCalls.push(['details', c.id, s]),
            edit: async (c: Consumption) => (actionCalls.push(['edit', c.id]), actionWrites),
            delete: async (c: Consumption) => (actionCalls.push(['delete', c.id]), actionWrites),
          },
        },
        // the consumptions page of the signed-in user, under their username
        { provide: AuthApi, useValue: { getSession: () => of({ id: 1, username: 'lenzi', role: 'user', impersonatedBy: null }) } },
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
    await TestBed.inject(Session).load();
  });

  it('asks for the last 5 consumptions of its batch and shows them as compact cards, newest first, each with its buttons', async () => {
    await render();

    expect(calls).toEqual([{ filter: { batchId: 8 }, page: { limit: 5 } }]);
    const parts = (card: Element) =>
      ['.when', 'app-measure-toggle', '.figure .value', '.delta .number'].map((part) => text(card.querySelector(part)));
    expect(cards().map(parts)).toEqual([
      ['28 Sept 2026, 20:00', 'qty', '4 sigaretta', '+33.3%'],
      ['27 Sept 2026, 20:00', 'qty', '3 sigaretta', '-40%'],
      ['26 Sept 2026, 20:00', 'qty', '5 sigaretta', ''], // the first of the batch
    ]);
    expect(element().querySelector('app-consumption-card .note')).toBeNull();
    // open in the consumptions page, and the ⋮ of every card (lenzi, 2026-10-03)
    expect(element().querySelectorAll('app-consumption-card button.open')).toHaveLength(3);
    expect(element().querySelectorAll('app-consumption-card button.more')).toHaveLength(3);
  });

  it("the open button: the consumptions page filtered on the batch, with that consumption's details open", async () => {
    await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    cardOf(1).open.emit();

    expect(navigate).toHaveBeenCalledWith(['/lenzi'], { queryParams: { substanceId: 2, batchId: 8, consumption: consumption(1).id } });
  });

  it('the ⋮: details over the page; a change or a deletion asks the list again and tells the parent', async () => {
    await render();
    let told = 0;
    fixture.componentInstance.changed.subscribe(() => told++);

    cardOf(0).details.emit();
    expect(actionCalls).toEqual([['details', consumption(0).id, settings]]);

    cardOf(0).edit.emit();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(told).toBe(1);

    actionWrites = false; // a dialog closed without writing: nothing again
    cardOf(2).remove.emit();
    await fixture.whenStable();
    expect(actionCalls.map((c) => c[0])).toEqual(['details', 'edit', 'delete']);
    expect(calls).toHaveLength(2);
    expect(told).toBe(1);
  });

  it('a tap on a toggle switches that card only to the price, its change with it', async () => {
    await render();
    const figures = () => cards().map((card) => text(card.querySelector('.figure .value')));

    cards()[1]!.querySelector<HTMLButtonElement>('app-measure-toggle button')!.click();
    await fixture.whenStable();
    expect(figures()).toEqual(['4 sigaretta', '€0.93', '5 sigaretta']);
    expect(calls.length).toBe(1); // nothing is asked again for that
  });

  it('ends with "…", the way to every consumption of the batch: the consumptions page filtered on it', async () => {
    await render();

    expect(all()!.getAttribute('aria-label')).toBe('All the consumptions of this batch');
    expect(all()!.getAttribute('href')).toBe('/lenzi?substanceId=2&batchId=8');
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
    answer = () => throwError(() => ({ status: 500, code: null, title: 'Internal Server Error', detail: '', fieldErrors: [] }) as ApiError);
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
