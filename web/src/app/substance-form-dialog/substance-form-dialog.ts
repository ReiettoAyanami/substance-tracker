import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { CreateSubstanceInput, Substance } from '../data/substance';

/** What the form opens with: nothing to create a substance, the substance to edit it. */
export interface SubstanceFormData {
  substance?: Substance;
}

/** Required, and spaces alone do not count (the API trims and refuses an empty name). */
const notBlank: ValidatorFn = (control) => (String(control.value ?? '').trim() ? null : { required: true });

/** Optional; when given, a non-negative decimal with a comma or a dot ("6", "0,5", "1.5"). */
const decimalText: ValidatorFn = (control) =>
  String(control.value ?? '').trim() === '' || /^\d+([.,]\d+)?$/.test(String(control.value).trim())
    ? null
    : { decimal: true };

/** The message under a field for its first error, in the UI language. */
function messageFor(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  if (errors['required']) return 'Obbligatorio';
  if (errors['decimal']) return 'Numero non valido (es. 6 o 0,5)';
  if (errors['server']) return errors['server'];
  return null;
}

/** A decimal as typed ("1,20" or "1.20") as the API wants it ("1.20"); empty → left out. */
const decimal = (typed: string) => (typed.trim() === '' ? undefined : typed.trim().replace(',', '.'));

/** A decimal string of the API ("20.000", "0.500") as lenzi would type it ("20", "0,5"). */
const asTyped = (value: string | null | undefined) =>
  value == null ? '' : value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');

/**
 * The form that creates a substance (design-frontend.md, "substance form dialog"), or edits one
 * when it opens with it (the same form, filled in). Opened in a Material dialog, it closes with
 * the created or changed substance (the 201 or the 200 of the PATCH), or with nothing on cancel.
 */
@Component({
  selector: 'app-substance-form-dialog',
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './substance-form-dialog.html',
  styleUrl: './substance-form-dialog.css',
})
export class SubstanceFormDialog {
  private readonly catalog = inject(CatalogApi);
  private readonly dialog = inject<MatDialogRef<SubstanceFormDialog, Substance>>(MatDialogRef);
  /** The substance being edited; null when creating one. */
  protected readonly editing = inject<SubstanceFormData | null>(MAT_DIALOG_DATA, { optional: true })?.substance ?? null;

  protected readonly form = new FormGroup({
    name: new FormControl(this.editing?.name ?? '', { nonNullable: true, validators: [notBlank] }),
    unit: new FormControl(this.editing?.unit ?? '', { nonNullable: true, validators: [notBlank] }),
    refillQuantity: new FormControl(asTyped(this.editing?.refillQuantity), {
      nonNullable: true,
      validators: [decimalText],
    }),
  });

  protected errorOf(field: keyof typeof this.form.controls): string | null {
    return messageFor(this.form.controls[field].errors);
  }

  /** A request is out: Save is disabled (no double submit, design-frontend.md). */
  protected readonly saving = signal(false);
  /** An error of the request that belongs to no field. */
  protected readonly formError = signal<string | null>(null);

  protected save(): void {
    // The guard, not only the disabled button: a second tap can arrive before the view updates.
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const typed = this.form.getRawValue();
    const refillQuantity = decimal(typed.refillQuantity);
    let request;
    if (this.editing) {
      // Every field is sent; an emptied optional field is cleared (null).
      request = this.catalog.updateSubstance(this.editing.id, {
        name: typed.name,
        unit: typed.unit,
        refillQuantity: refillQuantity ?? null,
      });
    } else {
      const input: CreateSubstanceInput = { name: typed.name, unit: typed.unit };
      if (refillQuantity !== undefined) input.refillQuantity = refillQuantity;
      request = this.catalog.createSubstance(input);
    }

    this.formError.set(null);
    request.subscribe({
      next: (saved) => this.dialog.close(saved),
      error: (error: ApiError) => {
        this.saving.set(false);
        this.showErrors(error);
      },
    });
  }

  protected cancel(): void {
    this.dialog.close();
  }

  /** Each field error under its field (the API's message); anything else above the buttons. */
  private showErrors(error: ApiError): void {
    const controls: Record<string, AbstractControl | undefined> = this.form.controls;
    const unplaced = error.fieldErrors.filter((fieldError) => {
      const control = controls[fieldError.field];
      control?.setErrors({ server: fieldError.message });
      control?.markAsTouched();
      return !control;
    });
    if (error.fieldErrors.length === 0 || unplaced.length > 0) {
      const detail = unplaced.map((e) => e.message).join('; ') || error.title;
      this.formError.set(`Impossibile salvare: ${detail}${error.status ? ` (${error.status})` : ''}`);
    }
  }
}
