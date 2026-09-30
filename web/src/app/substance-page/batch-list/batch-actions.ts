import { Injectable, inject } from '@angular/core';

import { ConfirmDialog, ConfirmDialogData } from '../../confirm-dialog/confirm-dialog';
import { LedgerApi } from '../../data/ledger-api';
import { Batch } from '../../data/substance-batches';
import { EntityDialog, EntityDialogData, EntityDialogResult } from '../../entity-dialog/entity-dialog';
import { HistoryDialogs } from '../../history-dialogs';

/**
 * What can be done to the batches of a substance, from its batch list: add, edit, delete. It opens
 * the dialogs (each one does its own request, and back closes it) and answers true once something
 * was written: the numbers of a batch list and of its substance's card are the API's, so whoever
 * shows them asks for them again.
 */
@Injectable({
  providedIn: 'root',
})
export class BatchActions {
  private readonly dialogs = inject(HistoryDialogs);
  private readonly ledger = inject(LedgerApi);

  /** The entity dialog with the empty batch form, for this substance. */
  async add(substanceId: number): Promise<boolean> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['batch'], substanceId },
      { ariaLabel: 'New batch' },
    );
    return result?.kind === 'batch';
  }

  /** The batch form filled in with a batch of this substance. */
  async edit(batch: Batch, substanceId: number): Promise<boolean> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['batch'], edit: { kind: 'batch', batch, substanceId } },
      { ariaLabel: 'Edit batch' },
    );
    return result?.kind === 'batch';
  }

  /** Asks, then deletes the batch: the API deletes its consumptions with it (design.md, "deleted"). */
  async delete(batch: Batch): Promise<boolean> {
    const deleted = await this.dialogs.open<ConfirmDialog, ConfirmDialogData, true>(
      ConfirmDialog,
      {
        title: batch.name === null ? 'Delete this batch?' : `Delete “${batch.name}”?`,
        message: 'Its consumptions are deleted too.',
        confirm: 'Delete',
        action: () => this.ledger.deleteBatch(batch.id),
      },
      { width: '400px' },
    );
    return deleted === true;
  }
}
