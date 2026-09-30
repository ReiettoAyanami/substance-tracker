import { Location } from '@angular/common';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';

/** Marks the history entry pushed while a dialog is open. */
interface DialogHistoryState {
  dialog?: true;
}

/**
 * Opens a Material dialog with its own history entry (design-frontend.md, "substance form
 * dialog": back button), so the browser's back, also the phone's back gesture, closes the dialog
 * and stays where it was: MatDialog closes on that back (closeOnNavigation). Closed any other way,
 * the entry is removed. The URL never changes.
 */
@Injectable({
  providedIn: 'root',
})
export class HistoryDialogs {
  private readonly dialog = inject(MatDialog);
  private readonly location = inject(Location);

  /**
   * Resolves with the dialog's result once its history entry is gone: a page that reads the
   * history state when it closes (the substance page) reads the right one.
   */
  open<C, D, R>(component: ComponentType<C>, data: D, config: MatDialogConfig<D> = {}): Promise<R | undefined> {
    const ref = this.dialog.open<C, D, R>(component, {
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
      ...config,
      data,
    });
    this.location.go(this.location.path(), '', { dialog: true } satisfies DialogHistoryState);
    return new Promise((resolve) => {
      ref.afterClosed().subscribe((result) => {
        if (!(this.location.getState() as DialogHistoryState | null)?.dialog) {
          resolve(result); // closed by a back: the entry is already gone
          return;
        }
        const popped = this.location.subscribe(() => {
          popped.unsubscribe();
          resolve(result);
        });
        this.location.back();
      });
    });
  }
}
