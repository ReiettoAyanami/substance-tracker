import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../../data/api-error';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { Batch, SubstanceBatches } from '../../data/substance-batches';
import { BatchActions } from './batch-actions';
import { BatchList } from './batch-list';
import { RecentConsumptions } from './recent-consumptions/recent-consumptions';

/** Where "Details" goes (in the app, the batch's page under the substance's). */
@Component({ template: '' })
class Blank {}

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

/** Lavazza: 1 of 100 left at 0.35; a big unnamed one: 200 of 200 at 0.32. */
const coffee: SubstanceBatches = {
  substanceId: 1,
  stock: '201.000',
  stockBarMax: '300.000',
  batches: [
    {
      id: 1,
      name: 'Lavazza',
      occurredAt: '2026-06-30T22:30:00Z',
      quantity: '100.000',
      remaining: '1.000',
      unitPrice: '0.350000',
      totalPrice: '35.00',
      shareByQuantity: '0.0050',
      shareByValue: '0.0054',
      note: null,
      deactivatedAt: null,
    },
    {
      id: 6,
      name: null,
      occurredAt: '2026-09-25T16:00:00Z',
      quantity: '200.000',
      remaining: '200.000',
      unitPrice: '0.320000',
      totalPrice: '64.00',
      shareByQuantity: '0.9950',
      shareByValue: '0.9946',
      note: null,
      deactivatedAt: null,
    },
  ],
};

describe('BatchList', () => {
  let fixture: ComponentFixture<BatchList>;
  let answer: () => Observable<SubstanceBatches>;
  /** How many times the batches were asked for. */
  let asks: number;
  /** What was asked of the actions, whether they answer that something was written, and what the list told its page. */
  let asked: unknown[];
  let written: boolean;
  let told: number;
  /** The batches whose recent consumptions were asked for. */
  let recentAsks: number[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(BatchList);
    fixture.componentRef.setInput('substanceId', 1);
    fixture.componentRef.setInput('unit', 'capsula');
    fixture.componentRef.setInput('settings', settings);
    told = 0;
    fixture.componentInstance.changed.subscribe(() => told++);
    await fixture.whenStable();
  }

  /** Opens the ⋮ menu of a sub-card and taps one of its items. */
  async function menu(batch: number, item: string): Promise<void> {
    element().querySelectorAll<HTMLButtonElement>('.batch button.more')[batch]!.click();
    await fixture.whenStable();
    Array.from(document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'))
      .find((b) => b.textContent?.includes(item))!
      .click();
    await fixture.whenStable();
  }

  async function expand(): Promise<void> {
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    answer = () => of(coffee);
    asks = 0;
    asked = [];
    written = true;
    recentAsks = [];
    await TestBed.configureTestingModule({
      imports: [BatchList],
      providers: [
        {
          provide: ReportsApi,
          useValue: {
            getSubstanceBatches: () => {
              asks++;
              return answer();
            },
            listConsumptions: (filter: { batchId: number }) => {
              recentAsks.push(filter.batchId);
              return of([]);
            },
          },
        },
        provideRouter([{ path: 'batches/:batchId', component: Blank }]),
        {
          provide: BatchActions,
          useValue: {
            add: async (substanceId: number) => (asked.push(['add', substanceId]), written),
            edit: async (batch: Batch, substanceId: number) => (asked.push(['edit', batch.id, substanceId]), written),
            delete: async (batch: Batch) => (asked.push(['delete', batch.id]), written),
          },
        },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
  });

  it('closed, is the total: how many active batches and their stock out of what was bought', async () => {
    await render();

    expect(text(element().querySelector('mat-panel-title'))).toBe('Active batches');
    expect(text(element().querySelector('.total'))).toBe('2 batches · 201 / 300 capsula');
  });

  it('opens into one sub-card per batch, oldest first, with its own bar, what is left and its prices', async () => {
    await render();
    await expand();

    expect(texts('.batch-name')).toEqual(['Lavazza', 'Unnamed batch']);
    expect(texts('.bought')).toEqual(['1 Jul 2026', '25 Sept 2026']);
    expect(texts('.left')).toEqual(['1 / 100 capsula', '200 / 200 capsula']);
    expect(texts('.prices')).toEqual(['€0.35/capsula · total €35.00', '€0.32/capsula · total €64.00']);
    const bars = element().querySelectorAll<HTMLElement>('.batch app-stock-bar .segment');
    expect(parseFloat(bars[0].style.flexBasis)).toBeCloseTo(1, 6); // 1 of 100
    expect(parseFloat(bars[1].style.flexBasis)).toBeCloseTo(100, 6);
  });

  it('shows the share by quantity, or by value once chosen, and remembers the choice', async () => {
    await render();
    await expand();
    expect(texts('.share')).toEqual(['0.5% of the stock', '99.5% of the stock']);

    const toggle = Array.from(element().querySelectorAll<HTMLButtonElement>('.share-mode button')).find(
      (b) => text(b) === 'value',
    )!;
    toggle.click();
    await fixture.whenStable();
    expect(texts('.share')).toEqual(['0.5% of the value', '99.5% of the value']);

    await render(); // e.g. another substance, or after a reload
    await expand();
    expect(texts('.share')).toEqual(['0.5% of the value', '99.5% of the value']);
  });

  it('says when there is no active batch, and still opens: the first one is added from here', async () => {
    answer = () => of({ substanceId: 1, stock: '0.000', stockBarMax: '0.000', batches: [] });
    await render();

    expect(text(element().querySelector('.total'))).toBe('No active batches');
    expect(element().querySelector('mat-expansion-panel-header')!.getAttribute('aria-disabled')).toBe('false');
    await expand();
    expect(text(element().querySelector('.tools button.add'))).toContain('Add batch');
    expect(element().querySelector('.share-mode')).toBeNull();
    expect(element().querySelector('.batch')).toBeNull();
  });

  it('adds a batch for its substance from the button at the top of the panel, then asks the batches again and tells the page', async () => {
    await render();
    await expand();
    expect(asks).toBe(1);

    answer = () => of({ ...coffee, batches: [...coffee.batches, { ...coffee.batches[1]!, id: 7, name: 'New one' }] });
    element().querySelector<HTMLButtonElement>('.tools button.add')!.click();
    await fixture.whenStable();

    expect(asked).toEqual([['add', 1]]);
    expect(asks).toBe(2);
    expect(told).toBe(1);
    expect(texts('.batch-name')).toEqual(['Lavazza', 'Unnamed batch', 'New one']);
  });

  it('edits and deletes a batch from the ⋮ menu of its sub-card', async () => {
    await render();
    await expand();

    await menu(0, 'Edit');
    await menu(1, 'Delete');

    expect(asked).toEqual([
      ['edit', 1, 1],
      ['delete', 6],
    ]);
    expect(asks).toBe(3);
    expect(told).toBe(2);
  });

  it("opens a batch's page from the ⋮ menu of its sub-card (Details), under the substance's", async () => {
    await render();
    await expand();
    const router = TestBed.inject(Router);
    await menu(1, 'Details');
    await fixture.whenStable();

    expect(router.url).toBe('/batches/6');
    expect(router.lastSuccessfulNavigation()?.extras.state).toEqual({ fromList: true });
    expect(asked).toEqual([]);
  });

  it('asks nothing again when nothing was written (a dialog cancelled)', async () => {
    written = false;
    await render();
    await expand();

    element().querySelector<HTMLButtonElement>('.tools button.add')!.click();
    await menu(0, 'Delete');

    expect(asked.length).toBe(2);
    expect(asks).toBe(1);
    expect(told).toBe(0);
  });

  it('shows the recent consumptions of a batch under its sub-card, asked for only once it is opened', async () => {
    await render();
    await expand();
    const toggles = () => Array.from(element().querySelectorAll<HTMLButtonElement>('.batch button.recent-toggle'));
    expect(toggles().map((t) => [text(t), t.getAttribute('aria-expanded')])).toEqual([
      ['expand_more Recent consumptions', 'false'],
      ['expand_more Recent consumptions', 'false'],
    ]);
    expect(element().querySelector('app-recent-consumptions')).toBeNull();
    expect(recentAsks).toEqual([]);

    toggles()[1]!.click(); // the unnamed batch, id 6
    await fixture.whenStable();
    const subCards = element().querySelectorAll('.batch');
    expect(subCards[0]!.querySelector('app-recent-consumptions')).toBeNull();
    expect(subCards[1]!.querySelector('app-recent-consumptions')).not.toBeNull();
    expect(toggles()[1]!.getAttribute('aria-expanded')).toBe('true');
    expect(recentAsks).toEqual([6]);
    // which change they show is chosen on their delta pills: the only toggle of the panel is the share's
    expect(element().querySelectorAll('mat-button-toggle-group').length).toBe(1);

    // closed, it stays out of sight; opened again it is there at once, nothing asked again
    toggles()[1]!.click();
    await fixture.whenStable();
    expect(toggles()[1]!.getAttribute('aria-expanded')).toBe('false');
    expect(subCards[1]!.querySelector('app-recent-consumptions')!.classList).toContain('closed');
    toggles()[1]!.click();
    await fixture.whenStable();
    expect(subCards[1]!.querySelector('app-recent-consumptions')!.classList).not.toContain('closed');
    expect(recentAsks).toEqual([6]);
  });

  it('opening one batch’s recent consumptions leaves the other sub-cards as they are (no new rows)', async () => {
    await render();
    await expand();
    const bars = () => Array.from(element().querySelectorAll('.batch app-stock-bar'));
    const before = bars();
    element().querySelectorAll<HTMLButtonElement>('.batch button.recent-toggle')[1]!.click();
    await fixture.whenStable();
    // the same elements, not drawn again
    expect(bars()).toEqual(before);
    expect(bars().every((bar, i) => bar === before[i])).toBe(true);
  });

  it('a consumption changed or deleted from the recent ones: the batches are asked again and the page is told', async () => {
    await render();
    await expand();
    element().querySelectorAll<HTMLButtonElement>('.batch button.recent-toggle')[0]!.click();
    await fixture.whenStable();
    const asksBefore = asks;

    (fixture.debugElement.query(By.directive(RecentConsumptions)).componentInstance as RecentConsumptions).changed.emit();
    await fixture.whenStable();

    expect(told).toBe(1);
    expect(asks).toBe(asksBefore + 1);
  });

  it('asks the recent consumptions of an open sub-card again when the batches are (a batch was edited)', async () => {
    await render();
    await expand();
    element().querySelectorAll<HTMLButtonElement>('.batch button.recent-toggle')[0]!.click();
    await fixture.whenStable();
    expect(recentAsks).toEqual([1]);

    // As the API would after the edit: the batches anew, the first one with another price.
    const edited = structuredClone(coffee);
    edited.batches[0]!.totalPrice = '30.00';
    edited.batches[0]!.unitPrice = '0.300000';
    answer = () => of(edited);
    await menu(0, 'Edit');

    expect(texts('.prices')[0]).toBe('€0.30/capsula · total €30.00');
    expect(recentAsks).toEqual([1, 1]);
    expect(element().querySelectorAll('app-recent-consumptions').length).toBe(1); // still open
  });

  it('says why when the batches cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 500, code: null, title: 'Internal Server Error', detail: '', fieldErrors: [] }) as ApiError);
    await render();

    expect(text(element().querySelector('.total'))).toBe('Could not load the batches (500)');
  });
});
