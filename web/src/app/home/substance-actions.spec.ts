import { Location, PlatformLocation } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

import { SubstanceActions } from './substance-actions';
import { SubstanceList } from './substance-list';

describe('SubstanceActions', () => {
  let actions: SubstanceActions;
  let location: Location;

  const cancel = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('app-substance-form-dialog button')).find(
      (b) => b.textContent?.trim() === 'Annulla',
    )!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        SubstanceList,
        SubstanceActions,
      ],
    });
    actions = TestBed.inject(SubstanceActions);
    location = TestBed.inject(Location);
    const backend = TestBed.inject(HttpTestingController);
    backend.expectOne('/api/settings').flush({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    backend.expectOne('/api/substances').flush([]);
  });

  it('gives a dialog its own history entry, removed when it closes some other way than back', async () => {
    const closed = actions.add();
    expect(location.getState()).toEqual({ dialog: true });

    cancel().click();
    await closed;
    expect(location.getState()).not.toEqual({ dialog: true });
  });

  it('closes the dialog on back, without going back once more', async () => {
    const closed = actions.add();
    const back = vi.spyOn(location, 'back');

    TestBed.inject(PlatformLocation).back(); // the browser's back, not the app's
    await closed;
    expect(document.querySelector('app-substance-form-dialog')).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });
});
