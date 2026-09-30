import { Injectable, inject } from '@angular/core';

import { DeleteSubstanceDialog } from '../delete-substance-dialog/delete-substance-dialog';
import { Substance } from '../data/substance';
import { EntityDialog, EntityDialogData, EntityDialogResult } from '../entity-dialog/entity-dialog';
import { HistoryDialogs } from '../history-dialogs';
import { SubstanceList } from './substance-list';

/**
 * What can be done from the substances page and from a substance's own page: add a substance or a
 * batch, edit or delete a substance. It opens the dialogs (each one does its own request, and back
 * closes it) and keeps the list in step with their answer. Provided by the SubstancesPage, next to
 * the SubstanceList.
 */
@Injectable()
export class SubstanceActions {
  private readonly list = inject(SubstanceList);
  private readonly dialogs = inject(HistoryDialogs);

  /**
   * The "+": the entity dialog offering a new substance (shown first) or a new batch
   * (design-frontend.md, "new dialog"). A created substance joins the list in its place; the
   * substance of a recorded batch is asked again, for its card.
   */
  async add(): Promise<void> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['substance', 'batch'] },
      { ariaLabel: 'New substance or batch' },
    );
    if (result?.kind === 'substance') this.list.add(result.substance);
    if (result?.kind === 'batch') this.list.reload(result.record.substanceId);
  }

  /** The substance form filled in with the substance; the changed one replaces it in the list. */
  async edit(substance: Substance): Promise<void> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['substance'], edit: { kind: 'substance', substance } },
      { ariaLabel: 'Edit substance' },
    );
    if (result?.kind === 'substance') this.list.replace(result.substance);
  }

  /** Asks, then deletes. True once the substance is deleted and gone from the list. */
  async delete(substance: Substance): Promise<boolean> {
    const deleted = await this.dialogs.open<DeleteSubstanceDialog, Substance, true>(DeleteSubstanceDialog, substance, {
      width: '400px',
    });
    if (deleted) this.list.remove(substance.id);
    return deleted === true;
  }
}
