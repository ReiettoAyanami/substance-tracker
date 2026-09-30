import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { BatchListItem } from '../../data/batch';
import { ConsumptionBounds, ConsumptionFilter } from '../../data/consumption';
import { Settings } from '../../data/settings';
import { Substance } from '../../data/substance';
import { ConsumptionFilters } from './consumption-filters';

const settings: Settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const substance = (id: number, name: string, createdAt: string, archived = false) =>
  ({ id, name, unit: 'x', createdAt, archived }) as Substance;

const substances = [
  substance(4, 'Birra', '2026-08-01T10:00:00Z'),
  substance(2, 'Sigarette', '2026-07-01T08:00:00Z'),
  substance(7, 'Energy drink', '2026-07-01T08:00:00Z', true),
];

/** As GET /api/batches gives them: by substance, newest first. */
const batches: BatchListItem[] = [
  { id: 11, substanceId: 4, substanceName: 'Birra', name: 'Peroni 6-pack', occurredAt: '2026-09-05T17:00:00Z', deactivatedAt: '2026-09-12T19:00:00Z' },
  { id: 8, substanceId: 2, substanceName: 'Sigarette', name: null, occurredAt: '2026-09-20T10:00:00Z', deactivatedAt: null },
  { id: 7, substanceId: 2, substanceName: 'Sigarette', name: null, occurredAt: '2026-08-01T10:00:00Z', deactivatedAt: null },
];

const bounds: ConsumptionBounds = { minUnitPrice: '0.000000', maxUnitPrice: '10.000000', minQuantity: '0.250', maxQuantity: '40.000' };

describe('ConsumptionFilters', () => {
  let fixture: ComponentFixture<ConsumptionFilters>;
  let emitted: ConsumptionFilter[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (e: Element | null | undefined) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(
    filter: ConsumptionFilter,
    withBounds: ConsumptionBounds | null = bounds,
    lists: { substances: Substance[]; batches: BatchListItem[] } = { substances, batches },
  ): Promise<void> {
    fixture = TestBed.createComponent(ConsumptionFilters);
    fixture.componentRef.setInput('filter', filter);
    fixture.componentRef.setInput('substances', lists.substances);
    fixture.componentRef.setInput('batches', lists.batches);
    fixture.componentRef.setInput('bounds', withBounds);
    fixture.componentRef.setInput('settings', settings);
    emitted = [];
    fixture.componentInstance.changed.subscribe((filter) => emitted.push(filter));
    await fixture.whenStable();
  }

  /** Opens a select and returns its options (labels, and the group each one is in). */
  async function open(select: 'substance' | 'batch') {
    element().querySelector<HTMLElement>(`mat-select.${select} .mat-mdc-select-trigger`)!.click();
    await fixture.whenStable();
    return Array.from(document.querySelectorAll<HTMLElement>('.mat-mdc-select-panel mat-option, .mat-mdc-select-panel .mat-mdc-option'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumptionFilters],
      providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    }).compileComponents();
  });

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => (overlay.innerHTML = '')));

  it('says how many filters are set, and Clear empties them', async () => {
    await render({ substanceId: 2, from: '2026-09-01', to: '2026-09-30', minUnitPrice: '0.30', maxUnitPrice: '0.40' });

    expect(text(element().querySelector('.count'))).toBe('3 active');
    element().querySelector<HTMLButtonElement>('button.clear')!.click();
    expect(emitted).toEqual([{}]);

    await render({});
    expect(text(element().querySelector('.count'))).toBe('None');
    expect(element().querySelector<HTMLButtonElement>('button.clear')!.disabled).toBe(true);
  });

  it('offers every substance, archived ones marked', async () => {
    await render({});
    const options = await open('substance');
    expect(options.map(text)).toEqual(['All substances', 'Birra', 'Sigarette', 'Energy drink (archived)']);
  });

  it('lists the batches by substance while no substance is chosen, then only its own', async () => {
    await render({});
    let options = await open('batch');
    expect(Array.from(document.querySelectorAll('mat-optgroup')).map((g) => text(g.querySelector('.mat-mdc-optgroup-label')))).toEqual([
      'Birra',
      'Sigarette',
    ]);
    expect(options.map(text)).toEqual([
      'All batches',
      'Peroni 6-pack · 5 Sept 2026 · finished',
      'Unnamed batch · 20 Sept 2026',
      'Unnamed batch · 1 Aug 2026',
    ]);

    document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => (overlay.innerHTML = ''));
    await render({ substanceId: 2 });
    options = await open('batch');
    expect(document.querySelector('mat-optgroup')).toBeNull();
    expect(options.map(text)).toEqual(['All batches', 'Unnamed batch · 20 Sept 2026', 'Unnamed batch · 1 Aug 2026']);
  });

  it('lists substances and batches with the same name one by one: only the id tells them apart', async () => {
    // Two substances called Birra, three batches called Peroni bought at the same moment: naming is lenzi's business.
    const bought = '2026-09-05T17:00:00Z';
    const peroni = (id: number, substanceId: number): BatchListItem => ({
      id,
      substanceId,
      substanceName: 'Birra',
      name: 'Peroni',
      occurredAt: bought,
      deactivatedAt: null,
    });
    const twins = {
      substances: [substance(4, 'Birra', '2026-08-01T10:00:00Z'), substance(9, 'Birra', '2026-08-01T10:00:00Z')],
      batches: [peroni(21, 4), peroni(20, 4), peroni(30, 9)],
    };

    await render({}, bounds, twins);
    let options = await open('substance');
    expect(options.map(text)).toEqual(['All substances', 'Birra', 'Birra']);
    options[2]!.click();
    expect(emitted).toEqual([{ substanceId: 9 }]);

    document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => (overlay.innerHTML = ''));
    await render({}, bounds, twins);
    options = await open('batch');
    expect(Array.from(document.querySelectorAll('mat-optgroup')).map((g) => text(g.querySelector('.mat-mdc-optgroup-label')))).toEqual([
      'Birra',
      'Birra',
    ]);
    expect(options.map(text)).toEqual(['All batches', 'Peroni · 5 Sept 2026', 'Peroni · 5 Sept 2026', 'Peroni · 5 Sept 2026']);
    options[2]!.click();
    options[3]!.click();
    expect(emitted).toEqual([
      { batchId: 20, substanceId: 4 },
      { batchId: 30, substanceId: 9 },
    ]);
  });

  it('fills in the substance of the batch chosen', async () => {
    await render({ from: '2026-09-01' });
    const options = await open('batch');
    options.find((o) => text(o).startsWith('Peroni'))!.click();

    expect(emitted).toEqual([{ from: '2026-09-01', batchId: 11, substanceId: 4 }]);
  });

  it('keeps a batch of the substance chosen, drops a batch of another one, and the ranges', async () => {
    await render({ substanceId: 4, batchId: 11, minUnitPrice: '1.00', maxQuantity: '2' });
    const options = await open('substance');
    options.find((o) => text(o) === 'Sigarette')!.click();

    expect(emitted).toEqual([{ substanceId: 2 }]);
  });

  it('turns the days picked into from..to (a day alone is fine)', async () => {
    await render({ substanceId: 2 });
    const filters = fixture.componentInstance as unknown as { dates: FormGroup; applyDates(): void; clearDates(): void };

    filters.dates.setValue({ start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) });
    filters.applyDates();
    filters.dates.setValue({ start: new Date(2026, 8, 1), end: null });
    filters.applyDates();

    expect(emitted).toEqual([
      { substanceId: 2, from: '2026-09-01', to: '2026-09-30' },
      { substanceId: 2, from: '2026-09-01' },
    ]);
  });

  it('shows the days of the filter, and "Any day" clears them', async () => {
    await render({ from: '2026-09-01', to: '2026-09-30' });
    const [start, end] = Array.from(element().querySelectorAll<HTMLInputElement>('mat-date-range-input input'));
    expect([start!.value, end!.value]).toEqual(['01/09/2026', '30/09/2026']);

    element().querySelector<HTMLButtonElement>('button.any-day')!.click();
    expect(emitted).toEqual([{}]);
  });

  it('writes a range only where a thumb left the end of its slider', async () => {
    await render({ substanceId: 1 });
    const thumbs = (range: string) => Array.from(element().querySelectorAll<HTMLInputElement>(`.range.${range} input`));
    expect(text(element().querySelector('.range.price .range-values'))).toBe('€0.00 – €10.00');
    expect(text(element().querySelector('.range.quantity .range-values'))).toBe('0.25 – 40');

    const [low, high] = thumbs('price');
    low!.value = '0.3';
    low!.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(text(element().querySelector('.range.price .range-values'))).toBe('€0.30 – €10.00'); // while it moves
    low!.dispatchEvent(new Event('change'));
    high!.value = '10';
    high!.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([{ substanceId: 1, minUnitPrice: '0.30' }, { substanceId: 1, minUnitPrice: '0.30' }]);
  });

  it('counts whole units on a whole-units slider, and hides the sliders with nothing in scope', async () => {
    await render({ substanceId: 2 }, { minUnitPrice: '0.300000', maxUnitPrice: '0.325000', minQuantity: '1.000', maxQuantity: '13.000' });
    const [low] = Array.from(element().querySelectorAll<HTMLInputElement>('.range.quantity input'));
    low!.value = '4';
    low!.dispatchEvent(new Event('change'));
    expect(emitted).toEqual([{ substanceId: 2, minQuantity: '4' }]);

    await render({ from: '2027-01-01' }, { minUnitPrice: null, maxUnitPrice: null, minQuantity: null, maxQuantity: null });
    expect(element().querySelector('mat-slider')).toBeNull();
  });

  it('warns when the batch was bought, or the substance added, after the last day chosen', async () => {
    await render({ batchId: 8, substanceId: 2, to: '2026-09-10' });
    expect(text(element().querySelector('.warning span'))).toBe(
      'This batch was bought on 20 Sept 2026: it did not exist yet on the days chosen.',
    );

    await render({ substanceId: 4, to: '2026-07-31' });
    expect(text(element().querySelector('.warning span'))).toBe('Birra was added on 1 Aug 2026: it did not exist yet on the days chosen.');

    await render({ substanceId: 4, to: '2026-08-01' }); // the day it was added counts
    expect(element().querySelector('.warning')).toBeNull();
  });
});
