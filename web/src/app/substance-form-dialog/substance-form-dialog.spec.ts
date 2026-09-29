import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { SubstanceFormData, SubstanceFormDialog } from './substance-form-dialog';

describe('SubstanceFormDialog', () => {
  let fixture: ComponentFixture<SubstanceFormDialog>;
  let backend: HttpTestingController;
  let closedWith: unknown[];
  /** The dialog's data: empty (a new substance) unless a test puts a substance in it. */
  const dialogData: SubstanceFormData = {};

  const created = { id: 8, name: 'Birra', unit: 'bottiglia' } as Substance;
  const element = () => fixture.nativeElement as HTMLElement;

  async function type(field: string, value: string): Promise<void> {
    const input = element().querySelector<HTMLInputElement>(`input[formControlName="${field}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function save(): Promise<void> {
    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    closedWith = [];
    delete dialogData.substance;
    await TestBed.configureTestingModule({
      imports: [SubstanceFormDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: (value?: unknown) => closedWith.push(value) } },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SubstanceFormDialog);
    await fixture.whenStable();
  });

  afterEach(() => backend.verify());

  it('sends what was typed (decimal comma as a dot, empty optional fields left out) and closes with the 201', async () => {
    await type('name', 'Birra');
    await type('unit', 'bottiglia');
    await type('refillQuantity', '0,5');
    await save();

    const req = backend.expectOne('/api/substances');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Birra', unit: 'bottiglia', refillQuantity: '0.5' });
    expect(closedWith).toEqual([]);

    req.flush(created, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(closedWith).toEqual([created]);
  });

  it('disables Save on the first tap: a double tap sends one request', async () => {
    await type('name', 'Birra');
    await type('unit', 'bottiglia');
    const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.click();
    button.click(); // before any change detection: the second tap must still be ignored
    await fixture.whenStable();

    expect(button.disabled).toBe(true);
    backend.expectOne('/api/substances').flush(created, { status: 201, statusText: 'Created' });
  });

  /** The error shown under a field, if any. */
  const errorUnder = (field: string) =>
    element()
      .querySelector(`input[formControlName="${field}"]`)!
      .closest('mat-form-field')!
      .querySelector('mat-error')
      ?.textContent?.trim();

  it('asks for the name and the unit before sending anything', async () => {
    await type('name', '   ');
    await save();

    backend.expectNone('/api/substances');
    expect(errorUnder('name')).toBe('Obbligatorio');
    expect(errorUnder('unit')).toBe('Obbligatorio');
    expect(errorUnder('refillQuantity')).toBeUndefined();
    expect(closedWith).toEqual([]);
  });

  it('refuses a number it cannot read (comma or dot as the decimal separator are both fine)', async () => {
    await type('name', 'Birra');
    await type('unit', 'bottiglia');
    await type('refillQuantity', '6 pezzi');
    await save();

    backend.expectNone('/api/substances');
    expect(errorUnder('refillQuantity')).toBe('Numero non valido (es. 6 o 0,5)');
  });

  it('on a 400 stays open with the error under its field, and Save works again', async () => {
    await type('name', 'Birra');
    await type('unit', 'bottiglia');
    await type('refillQuantity', '1,23456');
    await save();

    backend.expectOne('/api/substances').flush(
      {
        type: 'urn:substance-tracker:problem:validation',
        title: 'Bad Request',
        status: 400,
        detail: 'refillQuantity accepts at most 3 decimal places',
        errors: [{ field: 'refillQuantity', message: 'refillQuantity accepts at most 3 decimal places' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();

    expect(closedWith).toEqual([]);
    expect(errorUnder('refillQuantity')).toBe('refillQuantity accepts at most 3 decimal places');
    expect(element().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('shows an error that belongs to no field above the buttons', async () => {
    await type('name', 'Birra');
    await type('unit', 'bottiglia');
    await save();

    backend.expectOne('/api/substances').flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(closedWith).toEqual([]);
    expect(element().querySelector('.form-error')?.textContent?.trim()).toBe(
      'Impossibile salvare: Internal Server Error (500)',
    );
  });

  it('edits a substance: same form, filled in as typed, every field sent, emptied ones cleared', async () => {
    const coffee = {
      id: 3,
      name: 'Caffè',
      unit: 'capsula',
      refillQuantity: '12.500',
    } as Substance;
    dialogData.substance = coffee;
    fixture = TestBed.createComponent(SubstanceFormDialog);
    await fixture.whenStable();

    expect(element().querySelector('h2')?.textContent?.trim()).toBe('Modifica sostanza');
    const value = (field: string) =>
      element().querySelector<HTMLInputElement>(`input[formControlName="${field}"]`)!.value;
    expect([value('name'), value('unit'), value('refillQuantity')]).toEqual(['Caffè', 'capsula', '12,5']);

    await type('name', 'Caffè Lavazza');
    await type('refillQuantity', '');
    await save();

    const req = backend.expectOne('/api/substances/3');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      name: 'Caffè Lavazza',
      unit: 'capsula',
      refillQuantity: null,
    });
    const changed = { ...coffee, name: 'Caffè Lavazza', refillQuantity: null };
    req.flush(changed);
    await fixture.whenStable();
    expect(closedWith).toEqual([changed]);
  });

  it('closes with nothing on Annulla', async () => {
    await type('name', 'Birra');
    const cancel = Array.from(element().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Annulla')!;
    cancel.click();
    await fixture.whenStable();

    backend.expectNone('/api/substances');
    expect(closedWith).toEqual([undefined]);
  });
});
