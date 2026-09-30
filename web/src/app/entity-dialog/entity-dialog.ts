import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { BatchForm } from '../batch-form/batch-form';
import { ConsumptionForm } from '../consumption-form/consumption-form';
import { BatchRecord } from '../data/batch';
import { Consumption, ConsumptionRecord } from '../data/consumption';
import { OneTimeRecord } from '../data/one-time';
import { Substance } from '../data/substance';
import { SubstanceForm } from '../substance-form/substance-form';

/** What the entity dialog creates or edits: one form per entity (design-frontend.md, "entity form"). */
export type EntityKind = 'substance' | 'batch' | 'consumption';

const KIND_LABELS: Record<EntityKind, string> = { substance: 'Substance', batch: 'Batch', consumption: 'Consumption' };

/** What the dialog opens with. */
export interface EntityDialogData {
  /** The kinds it offers for a new record; more than one → a "New" selector on top. */
  kinds: readonly EntityKind[];
  /** The kind shown first; the first of `kinds` when missing. */
  kind?: EntityKind;
  /** A record to edit: only its form, filled in, no selector. */
  edit?: { kind: 'substance'; substance: Substance } | { kind: 'consumption'; consumption: Consumption };
}

/** What it closes with: the saved record and its kind. Nothing when cancelled or closed by back. */
export type EntityDialogResult =
  | { kind: 'substance'; substance: Substance }
  | { kind: 'batch'; record: BatchRecord }
  | { kind: 'consumption'; record: ConsumptionRecord | OneTimeRecord };

/**
 * The one dialog that hosts the entity forms (design-frontend.md, "new dialog"). The forms do not
 * know who opened them; this dialog only chooses which one to show and closes with what it saved.
 * The URL never changes: the history entry that lets back close it belongs to whoever opens it
 * (SubstanceActions, ConsumptionActions). Adding a kind to a "+" is adding it to `kinds`.
 */
@Component({
  selector: 'app-entity-dialog',
  imports: [BatchForm, ConsumptionForm, MatDialogModule, MatFormFieldModule, MatSelectModule, SubstanceForm],
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
  protected readonly editedConsumption = this.data.edit?.kind === 'consumption' ? this.data.edit.consumption : null;

  protected savedSubstance(substance: Substance): void {
    this.dialog.close({ kind: 'substance', substance });
  }

  protected savedBatch(record: BatchRecord): void {
    this.dialog.close({ kind: 'batch', record });
  }

  protected savedConsumption(record: ConsumptionRecord | OneTimeRecord): void {
    this.dialog.close({ kind: 'consumption', record });
  }

  protected cancel(): void {
    this.dialog.close();
  }
}
