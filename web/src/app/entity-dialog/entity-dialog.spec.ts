import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Consumption } from '../data/consumption';
import { Substance } from '../data/substance';
import { EntityDialog, EntityDialogData } from './entity-dialog';

describe('EntityDialog', () => {
  let fixture: ComponentFixture<EntityDialog>;
  let closedWith: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const coffee = { id: 3, name: 'Caffè', unit: 'capsula', refillQuantity: null } as Substance;

  async function open(data: EntityDialogData): Promise<void> {
    closedWith = [];
    TestBed.configureTestingModule({
      imports: [EntityDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MatDialogRef, useValue: { close: (value?: unknown) => closedWith.push(value) } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });
    fixture = TestBed.createComponent(EntityDialog);
    await fixture.whenStable();
  }

  it('shows the form of its one kind, with its own title and no selector', async () => {
    await open({ kinds: ['substance'] });

    expect(element().querySelector('app-substance-form')).not.toBeNull();
    expect(element().querySelector('h2')?.textContent?.trim()).toBe('New substance');
    expect(element().querySelector('mat-select')).toBeNull();
  });

  it('closes with what the form saved, and its kind', async () => {
    await open({ kinds: ['substance'] });
    const input = (field: string, value: string) => {
      const control = element().querySelector<HTMLInputElement>(`input[formControlName="${field}"]`)!;
      control.value = value;
      control.dispatchEvent(new Event('input'));
    };
    input('name', 'Caffè');
    input('unit', 'capsula');
    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    TestBed.inject(HttpTestingController).expectOne('/api/substances').flush(coffee, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(closedWith).toEqual([{ kind: 'substance', substance: coffee }]);
  });

  it('closes with nothing when the form is cancelled', async () => {
    await open({ kinds: ['substance'] });
    Array.from(element().querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();

    expect(closedWith).toEqual([undefined]);
  });

  it('edits a record in its own form, filled in', async () => {
    await open({ kinds: ['substance'], edit: { kind: 'substance', substance: coffee } });

    expect(element().querySelector('h2')?.textContent?.trim()).toBe('Edit substance');
    expect(element().querySelector<HTMLInputElement>('input[formControlName="name"]')!.value).toBe('Caffè');
  });

  it('hosts the consumption form too, and closes with the record it saved', async () => {
    const consumption = {
      type: 'consumption',
      id: 31,
      substanceId: 2,
      substanceName: 'Sigarette',
      unit: 'sigaretta',
      batchId: 8,
      batchName: 'Pack A',
      occurredAt: '2026-09-01T06:30:45Z',
      quantity: '4.000',
      note: null,
    } as Consumption;
    closedWith = [];
    TestBed.configureTestingModule({
      imports: [EntityDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: MatDialogRef, useValue: { close: (value?: unknown) => closedWith.push(value) } },
        { provide: MAT_DIALOG_DATA, useValue: { kinds: ['consumption'], edit: { kind: 'consumption', consumption } } },
      ],
    });
    fixture = TestBed.createComponent(EntityDialog);
    const backend = TestBed.inject(HttpTestingController);
    TestBed.tick(); // the form asks for the settings and the substances once drawn
    backend.expectOne('/api/settings').flush({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    backend.expectOne('/api/substances').flush([]);
    await fixture.whenStable();

    expect(element().querySelector('app-substance-form')).toBeNull();
    expect(element().querySelector('h2')?.textContent?.trim()).toBe('Edit consumption');

    element().querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    backend.expectOne('/api/consumptions/31').flush({ id: 31 });
    await fixture.whenStable();
    expect(closedWith).toEqual([{ kind: 'consumption', record: { id: 31 } }]);
  });
});
