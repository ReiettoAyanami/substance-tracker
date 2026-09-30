import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { Consumption } from '../data/consumption';
import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { Batch, SubstanceBatches } from '../data/substance-batches';
import { ConsumptionForm } from './consumption-form';

const settings = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' };

const substances = [
  { id: 2, name: 'Sigarette', unit: 'sigaretta' },
  { id: 4, name: 'Birra', unit: 'bottiglia' },
] as Substance[];

/** The active batches of the Sigarette, oldest first. */
const packs: SubstanceBatches = {
  substanceId: 2,
  stock: '23.000',
  stockBarMax: '40.000',
  batches: [
    { id: 8, name: 'Pack A', remaining: '3.000' },
    { id: 9, name: null, remaining: '20.000' },
  ] as Batch[],
};
const noBatches: SubstanceBatches = { substanceId: 4, stock: '0.000', stockBarMax: '0.000', batches: [] };

const fromBatch: Consumption = {
  type: 'consumption',
  id: 31,
  substanceId: 2,
  substanceName: 'Sigarette',
  unit: 'sigaretta',
  batchId: 8,
  batchName: 'Pack A',
  name: null,
  occurredAt: '2026-09-01T06:30:45Z',
  quantity: '4.000',
  unitPrice: '0.325000',
  cost: '1.30',
  note: 'after lunch',
  deltaQuantity: null,
  deltaUnitPrice: null,
};
const oneTime: Consumption = {
  ...fromBatch,
  type: 'one_time',
  id: 5,
  substanceId: 4,
  substanceName: 'Birra',
  unit: 'bottiglia',
  batchId: null,
  batchName: null,
  name: 'Bar',
  quantity: '2.000',
  cost: '9.00',
  note: null,
};

describe('ConsumptionForm', () => {
  let fixture: ComponentFixture<ConsumptionForm>;
  let backend: HttpTestingController;
  let harnesses: HarnessLoader;
  let said: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) => (element().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const input = (field: string) => element().querySelector<HTMLInputElement>(`[formControlName="${field}"]`)!;

  /** The request the form has made by now (a resource asks once the view is drawn). */
  function request(url: string): TestRequest {
    TestBed.tick();
    return backend.expectOne(url);
  }

  /** The form as it opens, its settings and substances answered. */
  async function render(inputs: Record<string, unknown> = {}, offered: Substance[] = substances): Promise<void> {
    fixture = TestBed.createComponent(ConsumptionForm);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    harnesses = TestbedHarnessEnvironment.loader(fixture);
    said = [];
    fixture.componentInstance.saved.subscribe((saved) => said.push(saved));
    fixture.componentInstance.cancelled.subscribe(() => said.push('cancelled'));
    request('/api/settings').flush(settings);
    backend.expectOne('/api/substances').flush(offered);
  }

  /** The form for a consumption of the Sigarette, their two packs offered. */
  async function renderForSigarette(): Promise<void> {
    await render({ substanceId: 2 });
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();
  }

  async function type(field: string, value: string): Promise<void> {
    const control = input(field);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  function save(): void {
    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  }

  /** Opens a selector and answers its options (in the overlay), in order, each with its text. */
  function optionsOf(select: string): { text: string; option: HTMLElement }[] {
    element().querySelector<HTMLElement>(`mat-select.${select}`)!.click();
    TestBed.tick();
    return Array.from(document.querySelectorAll<HTMLElement>('mat-option')).map((option) => ({
      text: (option.textContent ?? '').replace(/\s+/g, ' ').trim(),
      option,
    }));
  }

  /** The error shown under a field, if any. */
  const errorUnder = (field: string) => input(field).closest('mat-form-field')!.querySelector('mat-error')?.textContent?.trim();

  beforeEach(() => {
    // Only the clock: "now" is 5 Sept 2026, 20:15 and 30 seconds in Rome.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T18:15:30Z'));
    TestBed.configureTestingModule({
      imports: [ConsumptionForm],
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

  it('is titled "New consumption", or not at all when its host has a title of its own', async () => {
    await render();
    await fixture.whenStable();
    expect(text('h2')).toBe('New consumption');

    fixture.componentRef.setInput('showTitle', false);
    await fixture.whenStable();
    expect(element().querySelector('h2')).toBeNull();
  });

  it('asks for the substance first, then offers its active batches, the oldest chosen', async () => {
    await render();
    await fixture.whenStable();
    expect(element().querySelector('mat-select.batch')).toBeNull();

    const offered = optionsOf('substance');
    expect(offered.map((o) => o.text)).toEqual(['Sigarette', 'Birra']);
    offered[0]!.option.click();
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();

    expect(text('mat-select.batch .mat-mdc-select-value-text')).toBe('Pack A · 3 sigaretta left');
    const batches = optionsOf('batch');
    expect(batches.map((o) => o.text)).toEqual(['Pack A · 3 sigaretta left', 'Unnamed batch · 20 sigaretta left']);
    batches[0]!.option.click();
    await fixture.whenStable();
    expect(text('mat-form-field:has([formControlName="quantity"]) [matTextSuffix]')).toBe('sigaretta');
  });

  it('offers substances and batches with the same name one by one, and records from the one chosen', async () => {
    const twins = [...substances, { id: 9, name: 'Birra', unit: 'bottiglia' } as Substance];
    await render({}, twins);
    await fixture.whenStable();

    const offered = optionsOf('substance');
    expect(offered.map((o) => o.text)).toEqual(['Sigarette', 'Birra', 'Birra']);
    offered[2]!.option.click();
    request('/api/substances/9/batches').flush({
      substanceId: 9,
      stock: '12.000',
      stockBarMax: '12.000',
      batches: [
        { id: 40, name: 'Peroni', remaining: '6.000' },
        { id: 41, name: 'Peroni', remaining: '6.000' },
      ] as Batch[],
    });
    await fixture.whenStable();

    const batches = optionsOf('batch');
    expect(batches.map((o) => o.text)).toEqual(['Peroni · 6 bottiglia left', 'Peroni · 6 bottiglia left']);
    batches[1]!.option.click();
    await fixture.whenStable();
    await type('quantity', '1');
    save();

    backend.expectOne('/api/batches/41/consumptions').flush({ id: 80 }, { status: 201, statusText: 'Created' });
  });

  it('starts at "now" on the clock of the settings, whatever the browser’s', async () => {
    await renderForSigarette();

    expect(input('day').value).toBe('05/09/2026');
    expect(input('time').value).toBe('20:15');
  });

  it('records a consumption from the chosen batch: the quantity with a dot, the instant of the day and time shown', async () => {
    await renderForSigarette();
    await type('quantity', '2,5');
    await type('note', '  with coffee ');
    save();

    const req = backend.expectOne('/api/batches/8/consumptions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quantity: '2.5', note: 'with coffee', occurredAt: '2026-09-05T18:15:00Z' });
    expect(said).toEqual([]);

    const record = { id: 77, batchId: 8 };
    req.flush(record, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(said).toEqual([record]);
  });

  it('records a one-time consumption with its price and its optional name, previewing the price per unit', async () => {
    await renderForSigarette();
    await (await harnesses.getHarness(MatCheckboxHarness)).check();
    await fixture.whenStable();
    expect(element().querySelector('mat-select.batch')).toBeNull();

    await type('quantity', '3');
    save();
    await fixture.whenStable();
    expect(errorUnder('totalPrice')).toBe('Required');

    await type('totalPrice', '1,00');
    expect(text('mat-form-field:has([formControlName="totalPrice"]) mat-hint')).toBe('≈ €0.33 per unit');
    await type('name', 'Bar');
    save();

    const req = backend.expectOne('/api/substances/2/one-time-consumptions');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quantity: '3', totalPrice: '1.00', name: 'Bar', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 6 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(said).toEqual([{ id: 6 }]);
  });

  it('offers "One-time" from the start, before the substance is chosen: no batch is asked for then', async () => {
    await render();
    await fixture.whenStable();
    const oneTimeBox = await harnesses.getHarness(MatCheckboxHarness);
    expect(await oneTimeBox.getLabelText()).toBe('One-time: bought and used at once');
    expect(await oneTimeBox.isChecked()).toBe(false);

    await oneTimeBox.check();
    await fixture.whenStable();
    expect(input('totalPrice')).not.toBeNull();

    optionsOf('substance')[0]!.option.click(); // the Sigarette, which have active batches
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();
    expect(element().querySelector('mat-select.batch')).toBeNull();
    expect(await oneTimeBox.isChecked()).toBe(true);

    await type('quantity', '2');
    await type('totalPrice', '1');
    save();
    const req = backend.expectOne('/api/substances/2/one-time-consumptions');
    expect(req.request.body).toEqual({ quantity: '2', totalPrice: '1', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 7 }, { status: 201, statusText: 'Created' });
  });

  it('goes back to the batches when "One-time" is unticked: the oldest one is chosen', async () => {
    await render();
    await fixture.whenStable();
    const oneTimeBox = await harnesses.getHarness(MatCheckboxHarness);
    await oneTimeBox.check();
    optionsOf('substance')[0]!.option.click();
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();

    await oneTimeBox.uncheck();
    await fixture.whenStable();
    expect(text('mat-select.batch .mat-mdc-select-value-text')).toBe('Pack A · 3 sigaretta left');
    expect(element().querySelector('[formControlName="totalPrice"]')).toBeNull();
  });

  it('can only be one-time for a substance with no active batch, and says why', async () => {
    await render({ substanceId: 4 });
    request('/api/substances/4/batches').flush(noBatches);
    await fixture.whenStable();

    const oneTimeBox = await harnesses.getHarness(MatCheckboxHarness);
    expect(await oneTimeBox.isChecked()).toBe(true);
    expect(await oneTimeBox.isDisabled()).toBe(true);
    expect(text('.hint')).toBe('No active batch of this substance: record it as one-time, with its price.');
    expect(element().querySelector('mat-select.batch')).toBeNull();
    expect(input('totalPrice')).not.toBeNull();
  });

  it('hides the selectors of a fixed substance and batch: a consumption from that batch', async () => {
    await render({ substanceId: 2, batchId: 9 });
    request('/api/substances/2/batches').flush(packs);
    await fixture.whenStable();

    expect(element().querySelector('mat-select')).toBeNull();
    expect(element().querySelector('mat-checkbox')).toBeNull();
    await type('quantity', '1');
    save();

    const req = backend.expectOne('/api/batches/9/consumptions');
    expect(req.request.body).toEqual({ quantity: '1', occurredAt: '2026-09-05T18:15:00Z' });
    req.flush({ id: 78 }, { status: 201, statusText: 'Created' });
  });

  it('asks for a quantity it can read before sending anything', async () => {
    await renderForSigarette();
    save();
    await fixture.whenStable();
    expect(errorUnder('quantity')).toBe('Required');

    await type('quantity', 'two');
    save();
    await fixture.whenStable();
    expect(errorUnder('quantity')).toBe('Not a valid number (e.g. 2 or 0.5)');
    expect(said).toEqual([]);
  });

  it('disables Save on the first tap: a double tap sends one request', async () => {
    await renderForSigarette();
    await type('quantity', '1');
    const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.click();
    button.click(); // before any change detection: the second tap must still be ignored

    const req = backend.expectOne('/api/batches/8/consumptions');
    TestBed.tick();
    expect(button.disabled).toBe(true);
    req.flush({ id: 79 }, { status: 201, statusText: 'Created' });
  });

  it('on a 400 keeps each error under its field (the instant under the day), and Save works again', async () => {
    await renderForSigarette();
    await type('quantity', '1,23456');
    save();

    backend.expectOne('/api/batches/8/consumptions').flush(
      {
        type: 'urn:substance-tracker:problem:validation',
        title: 'Bad Request',
        status: 400,
        detail: 'quantity accepts at most 3 decimal places',
        errors: [
          { field: 'quantity', message: 'quantity accepts at most 3 decimal places' },
          { field: 'occurredAt', message: 'must match format "date-time"' },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(said).toEqual([]);
    expect(errorUnder('quantity')).toBe('quantity accepts at most 3 decimal places');
    expect(errorUnder('day')).toBe('must match format "date-time"');
    expect(element().querySelector('.form-error')).toBeNull();
    expect(element().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('shows a refusal of the Ledger (409) above the buttons', async () => {
    await renderForSigarette();
    await type('quantity', '30');
    save();

    backend.expectOne('/api/batches/8/consumptions').flush(
      {
        type: 'urn:substance-tracker:problem:quantity-exceeds-remaining',
        title: 'Conflict',
        status: 409,
        detail: "quantity 30.000 is more than the batch's remaining 3.000",
        errors: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    expect(text('.form-error')).toBe("Could not save: quantity 30.000 is more than the batch's remaining 3.000 (409)");
    expect(said).toEqual([]);
  });

  it('once Save was refused, says that the price the one-time checkbox reveals is required too', async () => {
    await renderForSigarette();
    await type('quantity', '30');
    save();
    backend.expectOne('/api/batches/8/consumptions').flush(
      {
        type: 'urn:substance-tracker:problem:quantity-exceeds-remaining',
        title: 'Conflict',
        status: 409,
        detail: "quantity 30.000 is more than the batch's remaining 3.000",
        errors: [],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    await (await harnesses.getHarness(MatCheckboxHarness)).check(); // an empty price in a form already sent
    await fixture.whenStable();
    expect(errorUnder('totalPrice')).toBe('Required');
  });

  it('edits a consumption of a batch: kind and batch only shown, the instant sent only when changed', async () => {
    await render({ consumption: fromBatch });
    await fixture.whenStable();

    expect(text('h2')).toBe('Edit consumption');
    expect(text('.fixed')).toBe('Sigarette · from Pack A');
    expect(element().querySelector('mat-select')).toBeNull();
    expect(element().querySelector('mat-checkbox')).toBeNull();
    expect([input('quantity').value, input('day').value, input('time').value, input('note').value]).toEqual([
      '4',
      '01/09/2026',
      '08:30',
      'after lunch',
    ]);

    await type('quantity', '5');
    await type('note', '');
    save();

    const req = backend.expectOne('/api/consumptions/31');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: '5', note: null }); // 06:30:45Z keeps its seconds
    req.flush({ id: 31 });
    await fixture.whenStable();
    expect(said).toEqual([{ id: 31 }]);
  });

  it('edits a one-time consumption: its price and name too, and the new time when it is changed', async () => {
    await render({ consumption: oneTime });
    await fixture.whenStable();

    expect(text('.fixed')).toBe('Birra · One-time');
    expect([input('quantity').value, input('totalPrice').value, input('name').value]).toEqual(['2', '9.00', 'Bar']);

    await type('totalPrice', '8,50');
    await type('name', '');
    input('time').value = '09:05';
    input('time').dispatchEvent(new Event('input'));
    input('time').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    save();

    const req = backend.expectOne('/api/one-time-consumptions/5');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ quantity: '2', totalPrice: '8.50', name: null, note: null, occurredAt: '2026-09-01T07:05:00Z' });
    req.flush({ id: 5 });
  });

  it('says cancelled on Cancel, sending nothing', async () => {
    await renderForSigarette();
    Array.from(element().querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();

    expect(said).toEqual(['cancelled']);
  });
});
