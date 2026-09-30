import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../data/error-interceptor';
import { Batch } from '../../data/substance-batches';
import { BatchActions } from './batch-actions';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };
const birra = { id: 4, name: 'Birra', unit: 'bottiglia', refillQuantity: '6.000' };

const peroni = {
  id: 11,
  name: 'Peroni 6-pack',
  occurredAt: '2026-09-01T06:30:45Z',
  quantity: '6.000',
  remaining: '4.000',
  totalPrice: '7.20',
  note: null,
} as Batch;
const unnamed = { ...peroni, id: 12, name: null } as Batch;

describe('BatchActions', () => {
  let actions: BatchActions;
  let backend: HttpTestingController;

  const stable = () => TestBed.inject(ApplicationRef).whenStable();
  const button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const text = (selector: string) => (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** The batch form asks for the settings and the substances as it opens. */
  function answerTheForm(): void {
    TestBed.tick();
    backend.expectOne('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush([birra]);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    actions = TestBed.inject(BatchActions);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds with the empty batch form, its substance fixed, and says nothing was written when it is cancelled', async () => {
    const written = actions.add(4);
    answerTheForm();
    await stable();

    expect(text('mat-dialog-container h2')).toBe('New batch');
    expect(document.querySelector('mat-dialog-container mat-select')).toBeNull();
    button('Cancel').click();
    expect(await written).toBe(false);
  });

  it('says a batch was written once its form saved it, for the substance it was opened for', async () => {
    const written = actions.add(4);
    answerTheForm();
    await stable();

    for (const [field, value] of [['quantity', '6'], ['totalPrice', '7.20']]) {
      const input = document.querySelector<HTMLInputElement>(`mat-dialog-container input[formControlName="${field}"]`)!;
      input.value = value!;
      input.dispatchEvent(new Event('input'));
    }
    button('Save').click();
    backend.expectOne({ method: 'POST', url: '/api/substances/4/batches' }).flush({ id: 60 }, { status: 201, statusText: 'Created' });
    expect(await written).toBe(true);
  });

  it('edits in the batch form, filled in, and says it was written once saved', async () => {
    const written = actions.edit(peroni, 4);
    answerTheForm();
    await stable();

    expect(text('mat-dialog-container h2')).toBe('Edit batch');
    expect(document.querySelector<HTMLInputElement>('input[formControlName="name"]')!.value).toBe('Peroni 6-pack');
    button('Save').click();
    backend.expectOne({ method: 'PATCH', url: '/api/batches/11' }).flush({ id: 11 });
    expect(await written).toBe(true);
  });

  it('asks before deleting a batch, saying its consumptions go with it, then deletes it', async () => {
    const written = actions.delete(peroni);
    await stable();

    expect(text('mat-dialog-container h2')).toBe('Delete “Peroni 6-pack”?');
    expect(text('mat-dialog-container p')).toBe('Its consumptions are deleted too.');
    button('Delete').click();
    backend.expectOne({ method: 'DELETE', url: '/api/batches/11' }).flush(null, { status: 204, statusText: 'No Content' });
    expect(await written).toBe(true);
  });

  it('deletes nothing when the confirmation is cancelled; a batch with no name is "this batch"', async () => {
    const written = actions.delete(unnamed);
    await stable();

    expect(text('mat-dialog-container h2')).toBe('Delete this batch?');
    button('Cancel').click();
    expect(await written).toBe(false);
  });

  it('keeps the confirmation open and says why when the API refuses (a finished batch)', async () => {
    const written = actions.delete(peroni);
    await stable();

    button('Delete').click();
    backend.expectOne({ method: 'DELETE', url: '/api/batches/11' }).flush(
      {
        type: 'urn:substance-tracker:problem:batch-deactivated',
        title: 'Conflict',
        status: 409,
        detail: 'Batch 11 is deactivated (remaining reached 0)',
        errors: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await stable();
    expect(text('mat-dialog-container .error')).toBe('Batch 11 is deactivated (remaining reached 0) (409)');

    button('Cancel').click();
    expect(await written).toBe(false);
  });
});
