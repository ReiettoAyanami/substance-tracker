import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { Batch } from '../data/substance-batches';
import { BatchForm } from './batch-form';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

/** As the API lists them (name, then id): two called Birra, only the first bought in refills of 6. */
const substances = [
  { id: 4, name: 'Birra', unit: 'bottiglia', refillQuantity: '6.000' },
  { id: 9, name: 'Birra', unit: 'lattina', refillQuantity: null },
  { id: 3, name: 'Erba', unit: 'g', refillQuantity: null },
] as Substance[];

/** A batch of the first Birra, as its batch list shows it. */
const peroni = {
  id: 11,
  name: 'Peroni 6-pack',
  occurredAt: '2026-09-01T06:30:45Z',
  quantity: '6.000',
  remaining: '4.000',
  totalPrice: '7.20',
  note: 'on offer',
} as Batch;

describe('BatchForm', () => {
  let fixture: ComponentFixture<BatchForm>;
  let backend: HttpTestingController;
  let said: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) => (element().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const input = (field: string) => element().querySelector<HTMLInputElement>(`[formControlName="${field}"]`)!;
  /** What a field shows around its input: its label, and the hint or the error under it. */
  const field = (name: string) => input(name).closest('mat-form-field')!;
  const labelOf = (name: string) => (field(name).querySelector('mat-label')?.textContent ?? '').trim();
  const hintUnder = (name: string) => (field(name).querySelector('mat-hint')?.textContent ?? '').trim();
  const errorUnder = (name: string) => field(name).querySelector('mat-error')?.textContent?.trim();

  /** The request the form has made by now (a resource asks once the view is drawn). */
  function request(url: string): TestRequest {
    TestBed.tick();
    return backend.expectOne(url);
  }

  /** The form as it opens, its settings and substances answered. */
  async function render(inputs: Record<string, unknown> = {}): Promise<void> {
    fixture = TestBed.createComponent(BatchForm);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    said = [];
    fixture.componentInstance.saved.subscribe((saved) => said.push(saved));
    fixture.componentInstance.cancelled.subscribe(() => said.push('cancelled'));
    request('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(substances);
    await fixture.whenStable();
  }

  async function type(name: string, value: string): Promise<void> {
    const control = input(name);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  /** Taps one side of a toggle ("refills", "per unit"). */
  async function toggle(label: string): Promise<void> {
    Array.from(element().querySelectorAll<HTMLButtonElement>('mat-button-toggle button'))
      .find((b) => b.textContent?.trim() === label)!
      .click();
    await fixture.whenStable();
  }

  const toggles = () =>
    Array.from(element().querySelectorAll('mat-button-toggle-group')).map((group) =>
      Array.from(group.querySelectorAll('mat-button-toggle')).map((t) => t.textContent?.trim()),
    );

  function save(): void {
    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  }

  beforeEach(() => {
    // Only the clock: "now" is 5 Sept 2026, 20:15 and 30 seconds in Rome.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T18:15:30Z'));
    TestBed.configureTestingModule({
      imports: [BatchForm],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('is titled "New batch", or not at all when its host has a title of its own', async () => {
    await render();
    expect(text('h2')).toBe('New batch');

    fixture.componentRef.setInput('showTitle', false);
    await fixture.whenStable();
    expect(element().querySelector('h2')).toBeNull();
  });

  it('asks for the substance, those with the same name one by one, and records for the one chosen', async () => {
    await render();
    element().querySelector<HTMLElement>('mat-select.substance')!.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(['Birra', 'Birra', 'Erba']);

    options[1]!.click();
    await fixture.whenStable();
    expect(text('mat-form-field:has([formControlName="quantity"]) [matTextSuffix]')).toBe('lattina');

    await type('quantity', '24');
    await type('totalPrice', '12');
    save();
    backend.expectOne('/api/substances/9/batches').flush({ id: 50 }, { status: 201, statusText: 'Created' });
  });

  it('starts at "now" on the clock of the settings, whatever the browser’s', async () => {
    await render({ substanceId: 3 });

    expect(input('day').value).toBe('05/09/2026');
    expect(input('time').value).toBe('20:15');
  });

  it('records a batch of a fixed substance: no selector, decimals with a dot, name and note when given', async () => {
    await render({ substanceId: 3 });
    expect(element().querySelector('mat-select')).toBeNull();
    expect(text('mat-form-field:has([formControlName="quantity"]) [matTextSuffix]')).toBe('g');

    await type('name', '  Amnesia ');
    await type('quantity', '2,5');
    await type('totalPrice', '25');
    await type('note', ' from the usual guy ');
    save();

    const req = backend.expectOne('/api/substances/3/batches');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Amnesia',
      quantity: '2.5',
      totalPrice: '25',
      note: 'from the usual guy',
      occurredAt: '2026-09-05T18:15:00Z',
    });
    expect(said).toEqual([]);

    const record = { id: 51, substanceId: 3 };
    req.flush(record, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(said).toEqual([record]);
  });

  it('previews the price per unit of a total price, as an estimate', async () => {
    await render({ substanceId: 3 });
    expect(labelOf('totalPrice')).toBe('Total price');
    expect(hintUnder('totalPrice')).toBe('');

    await type('quantity', '3');
    await type('totalPrice', '1,00');
    expect(hintUnder('totalPrice')).toBe('≈ €0.33 per unit');
  });

  it('takes refills instead of a quantity, only for a substance that has a refill quantity, previewing what they make', async () => {
    await render({ substanceId: 3 });
    expect(toggles()).toEqual([['total', 'per unit']]); // Erba has no refill quantity

    await render({ substanceId: 4 });
    expect(toggles()).toEqual([
      ['quantity', 'refills'],
      ['total', 'per unit'],
    ]);
    await toggle('refills');
    expect(element().querySelector('[formControlName="quantity"]')).toBeNull();
    expect(hintUnder('refills')).toBe('1 refill = 6 bottiglia');

    await type('refills', '3');
    expect(hintUnder('refills')).toBe('×3 = 18 bottiglia');
    await type('totalPrice', '21,60');
    expect(hintUnder('totalPrice')).toBe('≈ €1.20 per unit'); // of the 18 they make
    save();

    const req = backend.expectOne('/api/substances/4/batches');
    expect(req.request.body).toEqual({ refills: '3', totalPrice: '21.60', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 52 }, { status: 201, statusText: 'Created' });
  });

  it('takes the price per unit instead of the total, previewing the total', async () => {
    await render({ substanceId: 4 });
    await toggle('per unit');
    expect(element().querySelector('[formControlName="totalPrice"]')).toBeNull();
    expect(labelOf('unitPrice')).toBe('Price per unit');

    await type('quantity', '18');
    await type('unitPrice', '1,10');
    expect(hintUnder('unitPrice')).toBe('≈ €19.80 in total');
    save();

    const req = backend.expectOne('/api/substances/4/batches');
    expect(req.request.body).toEqual({ quantity: '18', unitPrice: '1.10', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 53 }, { status: 201, statusText: 'Created' });
  });

  it('goes back to a quantity when the substance chosen next has no refill quantity', async () => {
    await render();
    const choose = async (index: number) => {
      element().querySelector<HTMLElement>('mat-select.substance')!.click();
      await fixture.whenStable();
      document.querySelectorAll<HTMLElement>('mat-option')[index]!.click();
      await fixture.whenStable();
    };

    await choose(0); // the Birra bought in refills of 6
    await toggle('refills');
    expect(input('refills')).not.toBeNull();

    await choose(2); // Erba
    expect(toggles()).toEqual([['total', 'per unit']]);
    expect(element().querySelector('[formControlName="refills"]')).toBeNull();
    expect(text('mat-form-field:has([formControlName="quantity"]) [matTextSuffix]')).toBe('g');
  });

  it('asks for a substance, a quantity and a price it can read before sending anything', async () => {
    await render();
    save();
    await fixture.whenStable();
    expect(element().querySelector('mat-select.substance')!.closest('mat-form-field')!.querySelector('mat-error')?.textContent?.trim()).toBe(
      'Required',
    );
    expect(errorUnder('quantity')).toBe('Required');
    expect(errorUnder('totalPrice')).toBe('Required');

    await type('quantity', 'a lot');
    await type('totalPrice', '0'); // a gift: a price of 0 is a price
    save();
    await fixture.whenStable();
    expect(errorUnder('quantity')).toBe('Not a valid number (e.g. 2 or 0.5)');
    expect(errorUnder('totalPrice')).toBeUndefined();
    expect(said).toEqual([]);
  });

  it('keeps what was typed on each side of a toggle, and asks only for the side shown', async () => {
    await render({ substanceId: 4 });
    await type('quantity', '12');
    await toggle('refills');
    await type('refills', '2');
    await toggle('quantity');
    expect(input('quantity').value).toBe('12');

    await toggle('per unit'); // nothing typed on this side, while the total is empty too
    save();
    await fixture.whenStable();
    expect(errorUnder('unitPrice')).toBe('Required');
    expect(said).toEqual([]);

    await toggle('total');
    await type('totalPrice', '14,40');
    save();
    const req = backend.expectOne('/api/substances/4/batches');
    expect(req.request.body).toEqual({ quantity: '12', totalPrice: '14.40', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 55 }, { status: 201, statusText: 'Created' });
  });

  it('disables Save on the first tap: a double tap sends one request', async () => {
    await render({ substanceId: 3 });
    await type('quantity', '1');
    await type('totalPrice', '10');
    const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.click();
    button.click(); // before any change detection: the second tap must still be ignored

    const req = backend.expectOne('/api/substances/3/batches');
    TestBed.tick();
    expect(button.disabled).toBe(true);
    req.flush({ id: 54 }, { status: 201, statusText: 'Created' });
  });

  it('on a 400 keeps each error under its field (the instant under the day), and Save works again', async () => {
    await render({ substanceId: 3 });
    await type('quantity', '1,23456');
    await type('totalPrice', '10');
    save();

    backend.expectOne('/api/substances/3/batches').flush(
      {
        type: 'urn:substance-tracker:problem:validation',
        title: 'Bad Request',
        status: 400,
        detail: 'quantity must have at most 3 decimal places',
        errors: [
          { field: 'quantity', message: 'must have at most 3 decimal places' },
          { field: 'occurredAt', message: 'must match format "date-time"' },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(said).toEqual([]);
    expect(errorUnder('quantity')).toBe('must have at most 3 decimal places');
    expect(errorUnder('day')).toBe('must match format "date-time"');
    expect(element().querySelector('.form-error')).toBeNull();
    expect(element().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('once Save was refused, says that the field a toggle reveals is required too', async () => {
    await render({ substanceId: 4 });
    await type('quantity', '1,23456');
    await type('totalPrice', '10');
    save();
    backend.expectOne('/api/substances/4/batches').flush(
      {
        type: 'urn:substance-tracker:problem:validation',
        title: 'Bad Request',
        status: 400,
        detail: 'quantity must have at most 3 decimal places',
        errors: [{ field: 'quantity', message: 'must have at most 3 decimal places' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    await toggle('refills'); // an empty field in a form already sent: in error, and it says why
    expect(errorUnder('refills')).toBe('Required');
    await type('refills', '2');
    expect(errorUnder('refills')).toBeUndefined();
    expect(hintUnder('refills')).toBe('×2 = 12 bottiglia');
  });

  it('shows a refusal of the Ledger (409) above the buttons', async () => {
    await render({ substanceId: 3 });
    await type('quantity', '1');
    await type('totalPrice', '10');
    save();

    backend.expectOne('/api/substances/3/batches').flush(
      {
        type: 'urn:substance-tracker:problem:substance-archived',
        title: 'Conflict',
        status: 409,
        detail: 'Substance 3 is archived: unarchive it to record or change movements',
        errors: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(text('.form-error')).toBe('Could not save: Substance 3 is archived: unarchive it to record or change movements (409)');
    expect(said).toEqual([]);
  });

  it('edits a batch: its substance and its quantity only shown, the rest changed, the instant sent only when changed', async () => {
    await render({ batch: peroni, substanceId: 4 });

    expect(text('h2')).toBe('Edit batch');
    expect(text('.fixed')).toBe('Birra');
    expect(element().querySelector('mat-select')).toBeNull();
    expect(toggles()).toEqual([]); // no refills, no price per unit: the PATCH takes a total price
    expect([input('name').value, input('quantity').value, input('totalPrice').value, input('note').value]).toEqual([
      'Peroni 6-pack',
      '6',
      '7.20',
      'on offer',
    ]);
    // lenzi, 2026-09-30: the quantity of a batch is not changed once recorded (its consumptions count on it)
    expect(input('quantity').disabled).toBe(true);
    expect(hintUnder('quantity')).toBe('Cannot be changed');
    expect([input('day').value, input('time').value]).toEqual(['01/09/2026', '08:30']);
    expect(hintUnder('totalPrice')).toBe('≈ €1.20 per unit');

    await type('name', '');
    await type('totalPrice', '14,40');
    expect(hintUnder('totalPrice')).toBe('≈ €2.40 per unit');
    save();

    const req = backend.expectOne('/api/batches/11');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: null, totalPrice: '14.40', note: 'on offer' }); // 06:30:45Z keeps its seconds
    req.flush({ id: 11 });
    await fixture.whenStable();
    expect(said).toEqual([{ id: 11 }]);
  });

  it('sends the new instant of an edited batch, and shows the refusal of a finished one', async () => {
    await render({ batch: peroni, substanceId: 4 });
    input('time').value = '09:05';
    input('time').dispatchEvent(new Event('input'));
    input('time').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    save();

    const req = backend.expectOne('/api/batches/11');
    expect(req.request.body).toEqual({
      name: 'Peroni 6-pack',
      totalPrice: '7.20',
      note: 'on offer',
      occurredAt: '2026-09-01T07:05:00Z',
    });
    req.flush(
      {
        type: 'urn:substance-tracker:problem:batch-deactivated',
        title: 'Conflict',
        status: 409,
        detail: 'Batch 11 is deactivated (remaining reached 0)',
        errors: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(text('.form-error')).toBe('Could not save: Batch 11 is deactivated (remaining reached 0) (409)');
    expect(said).toEqual([]);
  });

  it('says cancelled on Cancel, sending nothing', async () => {
    await render({ substanceId: 3 });
    Array.from(element().querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();

    expect(said).toEqual(['cancelled']);
  });
});
