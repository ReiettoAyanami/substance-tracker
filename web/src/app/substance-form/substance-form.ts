import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ApiError } from '../data/api-error';
import { CatalogApi } from '../data/catalog-api';
import { CreateSubstanceInput, Substance } from '../data/substance';

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
  if (errors['required']) return 'Required';
  if (errors['decimal']) return 'Not a valid number (e.g. 6 or 0.5)';
  if (errors['server']) return errors['server'];
  return null;
}

/** A decimal as typed ("1.20", or "1,20" from a keyboard with a comma) as the API wants it ("1.20"); empty → left out. */
const decimal = (typed: string) => (typed.trim() === '' ? undefined : typed.trim().replace(',', '.'));

/** A decimal string of the API ("20.000", "0.500") as lenzi would type it ("20", "0.5"). */
const asTyped = (value: string | null | undefined) =>
  value == null ? '' : value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/**
 * The substance form (design-frontend.md, "entity form"): it creates a substance, or edits the one
 * it is given (the same form, filled in). It does not know who opened it: it says `saved` with the
 * substance the API returned (the 201 of POST, the 200 of PATCH) or `cancelled`. Errors of the API
 * stay under their field; those of no field above the buttons.
 */
@Component({
  selector: 'app-substance-form',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './substance-form.html',
  styleUrl: './substance-form.css',
})
export class SubstanceForm implements OnInit {
  private readonly catalog = inject(CatalogApi);

  /** The substance to edit; none to create one. */
  readonly substance = input<Substance | null>(null);
  /** The host may show its own title instead (the entity dialog's "New" selector). */
  readonly showTitle = input(true);
  /** The API's answer: the created or the changed substance. */
  readonly saved = output<Substance>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    unit: new FormControl('', { nonNullable: true, validators: [notBlank] }),
    refillQuantity: new FormControl('', { nonNullable: true, validators: [decimalText] }),
  });

  ngOnInit(): void {
    const substance = this.substance();
    if (substance) {
      this.form.setValue({ name: substance.name, unit: substance.unit, refillQuantity: asTyped(substance.refillQuantity) });
    }
  }

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
    const editing = this.substance();
    let request;
    if (editing) {
      // Every field is sent; an emptied optional field is cleared (null).
      request = this.catalog.updateSubstance(editing.id, {
        name: typed.name,
        unit: typed.unit,
        refillQuantity: refillQuantity ?? null,
      });
    } else {
      const body: CreateSubstanceInput = { name: typed.name, unit: typed.unit };
      if (refillQuantity !== undefined) body.refillQuantity = refillQuantity;
      request = this.catalog.createSubstance(body);
    }

    this.formError.set(null);
    request.subscribe({
      next: (saved) => this.saved.emit(saved),
      error: (error: ApiError) => {
        this.saving.set(false);
        this.showErrors(error);
      },
    });
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
      this.formError.set(`Could not save: ${detail}${error.status ? ` (${error.status})` : ''}`);
    }
  }
}
