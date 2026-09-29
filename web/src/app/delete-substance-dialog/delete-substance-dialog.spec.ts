import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { errorInterceptor } from '../data/error-interceptor';
import { Substance } from '../data/substance';
import { DeleteSubstanceDialog } from './delete-substance-dialog';

describe('DeleteSubstanceDialog', () => {
  let fixture: ComponentFixture<DeleteSubstanceDialog>;
  let backend: HttpTestingController;
  let closedWith: unknown[];

  const element = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(element().querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;

  beforeEach(async () => {
    closedWith = [];
    await TestBed.configureTestingModule({
      imports: [DeleteSubstanceDialog],
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close: (value?: unknown) => closedWith.push(value) } },
        { provide: MAT_DIALOG_DATA, useValue: { id: 7, name: 'Caffè' } as Substance },
      ],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DeleteSubstanceDialog);
    await fixture.whenStable();
  });

  afterEach(() => backend.verify());

  it('asks about the substance by name, deletes it on Elimina and closes with true on the 204', async () => {
    expect(element().querySelector('h2')?.textContent?.trim()).toBe('Eliminare «Caffè»?');

    button('Elimina').click();
    await fixture.whenStable();
    const req = backend.expectOne('/api/substances/7');
    expect(req.request.method).toBe('DELETE');
    expect(closedWith).toEqual([]);

    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(closedWith).toEqual([true]);
  });

  it('disables Elimina on the first tap: a double tap sends one request', async () => {
    button('Elimina').click();
    button('Elimina').click();
    await fixture.whenStable();

    expect(button('Elimina').disabled).toBe(true);
    backend.expectOne('/api/substances/7').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('on an error stays open, says why, and Elimina works again', async () => {
    button('Elimina').click();
    backend.expectOne('/api/substances/7').flush(null, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();

    expect(closedWith).toEqual([]);
    expect(element().querySelector('.error')?.textContent?.trim()).toBe(
      'Impossibile eliminare: Internal Server Error (500)',
    );
    expect(button('Elimina').disabled).toBe(false);
  });

  it('closes with nothing on Annulla', async () => {
    button('Annulla').click();

    backend.expectNone('/api/substances/7');
    expect(closedWith).toEqual([undefined]);
  });
});
