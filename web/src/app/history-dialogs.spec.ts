import { Location, PlatformLocation } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { HistoryDialogs } from './history-dialogs';

@Component({ template: '<button type="button" (click)="close()">Done</button>' })
class Answering {
  private readonly ref = inject<MatDialogRef<Answering, string>>(MatDialogRef);
  close(): void {
    this.ref.close('answer');
  }
}

describe('HistoryDialogs', () => {
  let dialogs: HistoryDialogs;
  let location: Location;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
    });
    dialogs = TestBed.inject(HistoryDialogs);
    location = TestBed.inject(Location);
  });

  it('gives a dialog its own history entry, removed when it closes some other way than back', async () => {
    const closed = dialogs.open<Answering, object, string>(Answering, {});
    expect(location.getState()).toEqual({ dialog: true });

    document.querySelector<HTMLButtonElement>('mat-dialog-container button')!.click();
    expect(await closed).toBe('answer');
    expect(location.getState()).not.toEqual({ dialog: true });
  });

  it('closes the dialog on back, without going back once more', async () => {
    const closed = dialogs.open<Answering, object, string>(Answering, {});
    const back = vi.spyOn(location, 'back');

    TestBed.inject(PlatformLocation).back(); // the browser's back, not the app's
    expect(await closed).toBeUndefined();
    expect(document.querySelector('mat-dialog-container')).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });
});
