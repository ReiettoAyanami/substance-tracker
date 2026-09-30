import { Location, PlatformLocation } from '@angular/common';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

import { EntityDialog, EntityDialogResult } from '../entity-dialog/entity-dialog';
import { HistoryDialogs } from '../history-dialogs';
import { SubstanceActions } from './substance-actions';
import { SubstanceList } from './substance-list';

describe('SubstanceActions', () => {
  let actions: SubstanceActions;
  let location: Location;

  const cancel = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('app-substance-form button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
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

    await TestBed.inject(ApplicationRef).whenStable(); // the dialog draws its form
    cancel().click();
    await closed;
    expect(location.getState()).not.toEqual({ dialog: true });
  });

  it('closes the dialog on back, without going back once more', async () => {
    const closed = actions.add();
    const back = vi.spyOn(location, 'back');

    TestBed.inject(PlatformLocation).back(); // the browser's back, not the app's
    await closed;
    expect(document.querySelector('app-substance-form')).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });
});

describe('SubstanceActions, once its dialog has answered', () => {
  let actions: SubstanceActions;
  let list: SubstanceList;
  let backend: HttpTestingController;
  let opened: { component: unknown; data: unknown }[];
  let answer: EntityDialogResult | undefined;

  const shown = () => {
    const state = list.state();
    return state.status === 'loaded' ? state.substances : [];
  };

  beforeEach(() => {
    opened = [];
    answer = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: HistoryDialogs,
          useValue: {
            open: async (component: unknown, data: unknown) => {
              opened.push({ component, data });
              return answer;
            },
          },
        },
        SubstanceList,
        SubstanceActions,
      ],
    });
    actions = TestBed.inject(SubstanceActions);
    list = TestBed.inject(SubstanceList);
    backend = TestBed.inject(HttpTestingController);
    backend.expectOne('/api/settings').flush({ timezone: 'Europe/Rome', dayStartsAt: '00:00:00', currency: 'EUR' });
    backend.expectOne('/api/substances').flush([{ id: 4, name: 'Birra', summary: { stock: '0.000' } }]);
  });

  afterEach(() => backend.verify());

  it('offers a substance or a batch from the "+", the substance first', async () => {
    await actions.add();

    expect(opened).toEqual([{ component: EntityDialog, data: { kinds: ['substance', 'batch'] } }]);
    expect(shown().length).toBe(1); // cancelled: nothing changes, nothing is asked
  });

  it('lists the substance its form created', async () => {
    answer = { kind: 'substance', substance: { id: 9, name: 'Caffè' } } as EntityDialogResult;
    await actions.add();

    expect(shown().map((s) => s.id)).toEqual([4, 9]);
  });

  it('asks the substance of a saved batch again: the numbers on its card are the API’s', async () => {
    answer = { kind: 'batch', record: { id: 60, substanceId: 4 } } as EntityDialogResult;
    await actions.add();

    const restocked = { id: 4, name: 'Birra', summary: { stock: '6.000' } };
    backend.expectOne('/api/substances/4').flush(restocked);
    expect(shown()).toEqual([restocked]);
  });
});
