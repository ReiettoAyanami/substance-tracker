import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import { ApiError } from '../../data/api-error';
import { ReportsApi } from '../../data/reports-api';
import { Settings } from '../../data/settings';
import { SubstanceBatches } from '../../data/substance-batches';
import { BatchList } from './batch-list';

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

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(element().querySelectorAll(selector)).map(text);

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(BatchList);
    fixture.componentRef.setInput('substanceId', 1);
    fixture.componentRef.setInput('unit', 'capsula');
    fixture.componentRef.setInput('settings', settings);
    await fixture.whenStable();
  }

  async function expand(): Promise<void> {
    element().querySelector<HTMLElement>('mat-expansion-panel-header')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    answer = () => of(coffee);
    await TestBed.configureTestingModule({
      imports: [BatchList],
      providers: [
        { provide: ReportsApi, useValue: { getSubstanceBatches: () => answer() } },
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

  it('says when there is no active batch, and cannot be opened', async () => {
    answer = () => of({ substanceId: 1, stock: '0.000', stockBarMax: '0.000', batches: [] });
    await render();

    expect(text(element().querySelector('.total'))).toBe('No active batches');
    expect(element().querySelector('mat-expansion-panel-header')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('says why when the batches cannot be loaded', async () => {
    answer = () => throwError(() => ({ status: 500, title: 'Internal Server Error', detail: '', fieldErrors: [] }) as ApiError);
    await render();

    expect(text(element().querySelector('.total'))).toBe('Could not load the batches (500)');
  });
});
