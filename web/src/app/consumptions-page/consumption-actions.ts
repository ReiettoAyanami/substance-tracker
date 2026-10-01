import { Injectable, inject } from '@angular/core';

import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { ConsumptionDetails, ConsumptionDetailsData, ConsumptionHeader } from '../consumption-details/consumption-details';
import { Consumption } from '../data/consumption';
import { LedgerApi } from '../data/ledger-api';
import { Settings } from '../data/settings';
import { EntityDialog, EntityDialogData, EntityDialogResult } from '../entity-dialog/entity-dialog';
import { HistoryDialogs } from '../history-dialogs';
import { LOCALE } from '../locale';

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/**
 * What can be done to a consumption, of a batch or one-time: add, edit, delete, see its details. It opens the
 * dialogs (each one does its own request, and back closes it) and answers true once something was
 * written: every number of a list of consumptions is the API's (costs, deltas, slider bounds), so
 * whoever shows one loads it again instead of patching it.
 */
@Injectable({
  providedIn: 'root',
})
export class ConsumptionActions {
  private readonly dialogs = inject(HistoryDialogs);
  private readonly ledger = inject(LedgerApi);

  /** The entity dialog with the empty consumption form. */
  async add(): Promise<boolean> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['consumption'] },
      { ariaLabel: 'New consumption' },
    );
    return result?.kind === 'consumption';
  }

  /** The consumption form for a one-time consumption of this substance, and nothing else (its one-time list). */
  async addOneTime(substanceId: number): Promise<boolean> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['consumption'], substanceId, oneTime: true },
      { ariaLabel: 'New one-time consumption' },
    );
    return result?.kind === 'consumption';
  }

  /** The consumption form filled in with the consumption. */
  async edit(consumption: Consumption): Promise<boolean> {
    const result = await this.dialogs.open<EntityDialog, EntityDialogData, EntityDialogResult>(
      EntityDialog,
      { kinds: ['consumption'], edit: { kind: 'consumption', consumption } },
      { ariaLabel: 'Edit consumption' },
    );
    return result?.kind === 'consumption';
  }

  /** Its details: what it was, and its metrics. Nothing is written. */
  async details(consumption: ConsumptionHeader, settings: Settings): Promise<void> {
    await this.dialogs.open<ConsumptionDetails, ConsumptionDetailsData, void>(
      ConsumptionDetails,
      { consumption, settings },
      // its own look (styles.css): a little lighter, its content a little lower
      { ariaLabel: `Details of the consumption of ${consumption.substanceName}`, panelClass: 'consumption-details-dialog' },
    );
  }

  /** Asks, then deletes. */
  async delete(consumption: Consumption): Promise<boolean> {
    const oneTime = consumption.type === 'one_time';
    const what = `${quantityFormat.format(consumption.quantity as unknown as number)} ${consumption.unit} of ${consumption.substanceName}`;
    const deleted = await this.dialogs.open<ConfirmDialog, ConfirmDialogData, true>(
      ConfirmDialog,
      {
        title: 'Delete this consumption?',
        message: oneTime ? `${what}, one-time.` : `${what}. Its quantity goes back to its batch.`,
        confirm: 'Delete',
        action: () => (oneTime ? this.ledger.deleteOneTime(consumption.id) : this.ledger.deleteConsumption(consumption.id)),
      },
      { width: '400px' },
    );
    return deleted === true;
  }
}
