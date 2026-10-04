import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { BatchForm } from '../batch-form/batch-form';
import { ConsumptionDraft, ConsumptionForm } from '../consumption-form/consumption-form';
import { BatchRecord } from '../data/batch';
import { Consumption, ConsumptionRecord } from '../data/consumption';
import { OneTimeRecord } from '../data/one-time';
import { Substance } from '../data/substance';
import { Batch } from '../data/substance-batches';
import { QueuedConsumption } from '../queue/queued-consumption';
import { User } from '../data/user';
import { SubstanceForm } from '../substance-form/substance-form';
import { UserForm } from '../user-form/user-form';

/** What the entity dialog creates or edits: one form per entity (design-frontend.md, "entity form"). */
export type EntityKind = 'substance' | 'batch' | 'consumption' | 'user';

const KIND_LABELS: Record<EntityKind, string> = { substance: 'Substance', batch: 'Batch', consumption: 'Consumption', user: 'User' };

/** What the dialog opens with. */
export interface EntityDialogData {
  /** The kinds it offers for a new record; more than one → a "New" selector on top. */
  kinds: readonly EntityKind[];
  /** The kind shown first; the first of `kinds` when missing. */
  kind?: EntityKind;
  /** A record to edit: only its form, filled in, no selector. A batch comes with its substance (its list item has none). */
  edit?:
    | { kind: 'substance'; substance: Substance }
    | { kind: 'batch'; batch: Batch; substanceId: number }
    | { kind: 'consumption'; consumption: Consumption }
    | { kind: 'user'; user: User };
  /** The substance a new batch or consumption is for, when the opener knows it: the form hides its selector. */
  substanceId?: number;
  /** A new consumption can only be a one-time one: the consumption form shows neither batches nor its checkbox. */
  oneTime?: boolean;
  /** A consumption to record again, filled in (a "To fix" one of the Android app's queue). */
  draft?: ConsumptionDraft;
}

/** What it closes with: the saved record and its kind. Nothing when cancelled or closed by back. */
export type EntityDialogResult =
  | { kind: 'substance'; substance: Substance }
  | { kind: 'batch'; record: BatchRecord }
  | { kind: 'consumption'; record: ConsumptionRecord | OneTimeRecord | QueuedConsumption }
  | { kind: 'user'; user: User };

/**
 * The one dialog that hosts the entity forms (design-frontend.md, "new dialog"). The forms do not
 * know who opened them; this dialog only chooses which one to show and closes with what it saved.
 * The URL never changes: the history entry that lets back close it belongs to whoever opens it
 * (SubstanceActions, ConsumptionActions). Adding a kind to a "+" is adding it to `kinds`.
 */
@Component({
  selector: 'app-entity-dialog',
  imports: [BatchForm, ConsumptionForm, MatDialogModule, MatFormFieldModule, MatSelectModule, SubstanceForm, UserForm],
  templateUrl: './entity-dialog.html',
  styleUrl: './entity-dialog.css',
})
export class EntityDialog {
  protected readonly data = inject<EntityDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject<MatDialogRef<EntityDialog, EntityDialogResult>>(MatDialogRef);

  protected readonly kind = signal<EntityKind>(this.data.edit?.kind ?? this.data.kind ?? this.data.kinds[0]!);
  /** A new record of more than one kind: the selector stands in for the forms' titles. */
  protected readonly chooser = !this.data.edit && this.data.kinds.length > 1;
  protected readonly labels = KIND_LABELS;

  /** The record to edit, by its kind. */
  protected readonly editedSubstance = this.data.edit?.kind === 'substance' ? this.data.edit.substance : null;
  protected readonly editedBatch = this.data.edit?.kind === 'batch' ? this.data.edit.batch : null;
  protected readonly editedConsumption = this.data.edit?.kind === 'consumption' ? this.data.edit.consumption : null;
  protected readonly editedUser = this.data.edit?.kind === 'user' ? this.data.edit.user : null;
  /** The fixed substance of the batch form: the one of the batch edited, or the one the opener gave. */
  protected readonly batchSubstanceId =
    this.data.edit?.kind === 'batch' ? this.data.edit.substanceId : (this.data.substanceId ?? null);

  protected savedSubstance(substance: Substance): void {
    this.dialog.close({ kind: 'substance', substance });
  }

  protected savedBatch(record: BatchRecord): void {
    this.dialog.close({ kind: 'batch', record });
  }

  protected savedConsumption(record: ConsumptionRecord | OneTimeRecord | QueuedConsumption): void {
    this.dialog.close({ kind: 'consumption', record });
  }

  protected savedUser(user: User): void {
    this.dialog.close({ kind: 'user', user });
  }

  protected cancel(): void {
    this.dialog.close();
  }
}
