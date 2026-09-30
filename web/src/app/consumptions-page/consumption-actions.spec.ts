import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

import { Consumption } from '../data/consumption';
import { ConsumptionActions } from './consumption-actions';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const fromBatch: Consumption = {
  type: 'consumption',
  id: 31,
  substanceId: 2,
  substanceName: 'Sigarette',
  unit: 'sigaretta',
  batchId: 8,
  batchName: null,
  name: null,
  occurredAt: '2026-09-28T18:00:00Z',
  quantity: '4.000',
  unitPrice: '0.325000',
  cost: '1.30',
  note: null,
  deltaQuantity: null,
  deltaUnitPrice: null,
  deltaCost: null,
};
const oneTime: Consumption = { ...fromBatch, type: 'one_time', id: 5, batchId: null, name: 'Bar', quantity: '1.500' };

describe('ConsumptionActions', () => {
  let actions: ConsumptionActions;
  let backend: HttpTestingController;

  const stable = () => TestBed.inject(ApplicationRef).whenStable();
  const button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const text = (selector: string) => (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** The form asks for the settings and the substances as it opens. */
  function answerTheForm(): void {
    TestBed.tick();
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([]);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    actions = TestBed.inject(ConsumptionActions);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds with the empty consumption form, and says nothing was written when it is cancelled', async () => {
    const written = actions.add();
    answerTheForm();
    await stable();

    expect(text('mat-dialog-container h2')).toBe('New consumption');
    button('Cancel').click();
    expect(await written).toBe(false);
  });

  it('adds a one-time consumption of a substance in the form opened for that alone, and says it was written once saved', async () => {
    const written = actions.addOneTime(4);
    answerTheForm();
    await stable();

    expect(text('mat-dialog-container h2')).toBe('New one-time consumption');
    expect(document.querySelector('mat-dialog-container mat-select')).toBeNull();
    for (const [field, value] of [['quantity', '1'], ['totalPrice', '5']]) {
      const input = document.querySelector<HTMLInputElement>(`mat-dialog-container input[formControlName="${field}"]`)!;
      input.value = value!;
      input.dispatchEvent(new Event('input'));
    }
    button('Save').click();
    backend
      .expectOne({ method: 'POST', url: '/api/substances/4/one-time-consumptions' })
      .flush({ id: 9 }, { status: 201, statusText: 'Created' });
    expect(await written).toBe(true);
  });

  it('edits in the consumption form, filled in, and says it was written once saved', async () => {
    const written = actions.edit(fromBatch);
    answerTheForm();
    await stable();

    expect(text('mat-dialog-container h2')).toBe('Edit consumption');
    expect(document.querySelector<HTMLInputElement>('input[formControlName="quantity"]')!.value).toBe('4');
    button('Save').click();
    backend.expectOne({ method: 'PATCH', url: '/api/consumptions/31' }).flush({ id: 31 });
    expect(await written).toBe(true);
  });

  it('asks before deleting a consumption of a batch, then deletes it', async () => {
    const written = actions.delete(fromBatch);
    await stable();

    expect(text('mat-dialog-container h2')).toBe('Delete this consumption?');
    expect(text('mat-dialog-container p')).toBe('4 sigaretta of Sigarette. Its quantity goes back to its batch.');
    button('Delete').click();
    backend.expectOne({ method: 'DELETE', url: '/api/consumptions/31' }).flush(null, { status: 204, statusText: 'No Content' });
    expect(await written).toBe(true);
  });

  it('deletes a one-time consumption as such', async () => {
    const written = actions.delete(oneTime);
    await stable();

    expect(text('mat-dialog-container p')).toBe('1.5 sigaretta of Sigarette, one-time.');
    button('Delete').click();
    backend
      .expectOne({ method: 'DELETE', url: '/api/one-time-consumptions/5' })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await written).toBe(true);
  });

  it('deletes nothing when the confirmation is cancelled', async () => {
    const written = actions.delete(fromBatch);
    await stable();

    button('Cancel').click();
    expect(await written).toBe(false);
  });
});
