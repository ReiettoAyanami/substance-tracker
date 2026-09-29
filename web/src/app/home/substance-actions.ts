import { Location } from '@angular/common';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';

import { DeleteSubstanceDialog } from '../delete-substance-dialog/delete-substance-dialog';
import { Substance } from '../data/substance';
import { SubstanceFormData, SubstanceFormDialog } from '../substance-form-dialog/substance-form-dialog';
import { SubstanceList } from './substance-list';

/** Marks the history entry pushed while a dialog is open. */
interface DialogHistoryState {
  dialog?: true;
}

/**
 * What can be done to a substance, from the home and from its page: add, edit, delete. It opens
 * the dialogs (each one does its own request) and keeps the home's list in step with their answer.
 * Provided by the Home, next to the SubstanceList.
 */
@Injectable()
export class SubstanceActions {
  private readonly list = inject(SubstanceList);
  private readonly dialog = inject(MatDialog);
  private readonly location = inject(Location);

  /** The empty substance form; the created substance joins the list in its place. */
  async add(): Promise<void> {
    const created = await this.open<SubstanceFormDialog, SubstanceFormData, Substance>(SubstanceFormDialog, {});
    if (created) this.list.add(created);
  }

  /** The substance form filled in with the substance; the changed one replaces it in the list. */
  async edit(substance: Substance): Promise<void> {
    const changed = await this.open<SubstanceFormDialog, SubstanceFormData, Substance>(SubstanceFormDialog, {
      substance,
    });
    if (changed) this.list.replace(changed);
  }

  /** Asks, then deletes. True once the substance is deleted and gone from the list. */
  async delete(substance: Substance): Promise<boolean> {
    const deleted = await this.open<DeleteSubstanceDialog, Substance, true>(DeleteSubstanceDialog, substance, {
      width: '400px',
    });
    if (deleted) this.list.remove(substance.id);
    return deleted === true;
  }

  /**
   * Opens a dialog with its own history entry, so browser back (also the phone's back gesture)
   * closes it and stays where it was: MatDialog closes on that back (closeOnNavigation). Closed any
   * other way, the entry is removed. Resolves with the dialog's result once the entry is gone: the
   * substance page reads the history state when it closes.
   */
  private open<C, D, R>(component: ComponentType<C>, data: D, config: MatDialogConfig<D> = {}): Promise<R | undefined> {
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
