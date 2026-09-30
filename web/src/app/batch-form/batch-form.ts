import { Component, DestroyRef, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { Observable } from 'rxjs';

import { ApiError } from '../data/api-error';
import { BatchRecord } from '../data/batch';
import { CatalogApi } from '../data/catalog-api';
import { LedgerApi } from '../data/ledger-api';
import { SettingsApi } from '../data/settings-api';
import { Batch } from '../data/substance-batches';
import { LOCALE } from '../locale';
import { IdentityColorPipe } from '../ui/identity-color-pipe';
import { WallTime, instantOf, wallTimeOf } from '../zoned-time';

const DECIMAL = /^\d+([.,]\d+)?$/;

/** Required, and spaces alone do not count. */
const filled: ValidatorFn = (control) => (control.value !== null && String(control.value).trim() !== '' ? null : { required: true });

/** When given, a non-negative decimal with a comma or a dot ("2", "0,5", "1.5"). */
const decimalText: ValidatorFn = (control) =>
  String(control.value ?? '').trim() === '' || DECIMAL.test(String(control.value).trim()) ? null : { decimal: true };

/** The message under a field for its first error, in the UI language. */
function messageFor(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  if (errors['required']) return 'Required';
  if (errors['decimal']) return 'Not a valid number (e.g. 2 or 0.5)';
  if (errors['server']) return errors['server'];
  return null;
}

/** A decimal as typed ("1.20", or "1,20" from a keyboard with a comma) as the API wants it ("1.20"). */
const decimal = (typed: string) => typed.trim().replace(',', '.');

/** A decimal string of the API ("6.000", "0.500") as lenzi would type it ("6", "0.5"). */
const asTyped = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/** What is typed in a number field as a number, for a preview; null when it cannot be read yet. */
const typedNumber = (typed: string) => (DECIMAL.test(typed.trim()) ? Number(decimal(typed)) : null);

const pad = (n: number) => String(n).padStart(2, '0');

/** The picker's Date (local midnight) of a day 'YYYY-MM-DD', and back. */
const dateOfDay = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!);
};
const dayOfDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The timepicker's Date for a wall time: only its hours and minutes count. */
const dateOfWallTime = ({ day, time }: WallTime) => {
  const date = dateOfDay(day);
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours!, minutes!);
  return date;
};

/** Where the API's field errors go: its field names are the form's, except the instant. */
const FIELD_OF: Record<string, string> = { occurredAt: 'day' };

/** How much was bought: typed as a quantity, or as refills of the substance's refill quantity. */
type AmountIn = 'quantity' | 'refills';
/** What was paid: typed as the total price, or as the price per unit. */
type PriceIn = 'total' | 'unit';

/**
 * The batch form (design-frontend.md, "batch form"): it records a batch (a purchase) of a
 * substance, or edits the one it is given. The substance can come fixed (its selector is hidden).
 * How much was bought is a quantity or, for a substance with a refill quantity, a number of
 * refills; what was paid is the total price or the price per unit. The API computes the rest: the
 * form only previews it ("×3 = 18 bottiglia", "≈ €1.20 per unit"), and sends what was typed. The
 * day and the time are those of the settings' time zone, "now" at first. In edit mode the
 * substance and the quantity are shown, not changed (lenzi: the consumptions of a batch count on
 * its quantity; a wrong one is deleted and recorded again), and the price is the total one: name,
 * total price, day and time, note can change. It says `saved` with what the Ledger returned, or
 * `cancelled`.
 */
@Component({
  selector: 'app-batch-form',
  imports: [
    IdentityColorPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTimepickerModule,
    ReactiveFormsModule,
  ],
  // The day is picked in the calendar (read-only input: the native adapter cannot read a typed
  // "05/09/2026" as the 5th of September); the time can be typed ("20:15") or picked.
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: LOCALE }],
  templateUrl: './batch-form.html',
  styleUrl: './batch-form.css',
})
export class BatchForm implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly ledger = inject(LedgerApi);
  private readonly settingsApi = inject(SettingsApi);

  /** The batch to edit (an item of its substance's batch list); none to record one. */
  readonly batch = input<Batch | null>(null);
  /** A fixed substance: no substance selector. When editing, the substance of the batch. */
  readonly substanceId = input<number | null>(null);
  /** The host may show its own title instead (the entity dialog's "New" selector). */
  readonly showTitle = input(true);
  /** What the Ledger returned: the recorded or changed batch. */
  readonly saved = output<BatchRecord>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    substanceId: new FormControl<number | null>(null, { validators: [filled] }),
    name: new FormControl('', { nonNullable: true }),
    quantity: new FormControl('', { nonNullable: true, validators: [filled, decimalText] }),
    refills: new FormControl('', { nonNullable: true, validators: [filled, decimalText] }),
    totalPrice: new FormControl('', { nonNullable: true, validators: [filled, decimalText] }),
    unitPrice: new FormControl('', { nonNullable: true, validators: [filled, decimalText] }),
    day: new FormControl<Date | null>(null),
    time: new FormControl<Date | null>(null),
    note: new FormControl('', { nonNullable: true }),
  });

  /** The chosen substance, the two ways of typing, and what is typed, as signals for the template. */
  private readonly chosenSubstanceId = signal<number | null>(null);
  protected readonly amountIn = signal<AmountIn>('quantity');
  protected readonly priceIn = signal<PriceIn>('total');
  private readonly typed = signal({ quantity: '', refills: '', totalPrice: '', unitPrice: '' });

  private readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  /** The substances a batch can be recorded for (archived ones are read-only for the Ledger). */
  protected readonly substances = rxResource({ stream: () => this.catalog.listSubstances() });

  /** The substance of the batch: the one chosen, or the fixed one. */
  protected readonly substance = computed(() => this.substances.value()?.find((s) => s.id === this.chosenSubstanceId()) ?? null);
  protected readonly unit = computed(() => this.substance()?.unit ?? '');
  /** How much one refill is, when the substance has a refill quantity. */
  private readonly refillQuantity = computed(() => {
    const refill = this.substance()?.refillQuantity;
    return refill == null ? null : Number(refill);
  });
  /** Refills can be typed instead of a quantity: a new batch of a substance with a refill quantity. */
  protected readonly canRefill = computed(() => !this.batch() && this.refillQuantity() !== null);

  private readonly amounts = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

  /** The quantity bought as far as the form can tell, for the previews: typed, or refills × refill quantity. */
  private readonly previewQuantity = computed(() => {
    const { quantity, refills } = this.typed();
    if (this.amountIn() === 'quantity') return typedNumber(quantity);
    const count = typedNumber(refills);
    const refill = this.refillQuantity();
    return count === null || refill === null ? null : count * refill;
  });

  /** "×3 = 18 bottiglia" while refills are typed; before, what one refill is. Never sent (design-frontend.md, "preview"). */
  protected readonly refillsPreview = computed(() => {
    const refill = this.refillQuantity();
    if (refill === null) return '';
    const count = typedNumber(this.typed().refills);
    const bought = this.previewQuantity();
    if (count === null || bought === null) return `1 refill = ${this.amounts.format(refill)} ${this.unit()}`;
    return `×${this.amounts.format(count)} = ${this.amounts.format(bought)} ${this.unit()}`;
  });

  /** The currency's sign for the price fields ("€"). */
  protected readonly currencySign = computed(() => {
    const currency = this.settings.value()?.currency ?? 'EUR';
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value;
  });

  /** "≈ €1.20 per unit" under a total price, "≈ €19.80 in total" under a price per unit: an estimate, never sent. */
  protected readonly pricePreview = computed(() => {
    const settings = this.settings.value();
    const quantity = this.previewQuantity();
    if (!settings || quantity === null) return null;
    const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: settings.currency });
    const { totalPrice, unitPrice } = this.typed();
    if (this.priceIn() === 'unit') {
      const price = typedNumber(unitPrice);
      return price === null ? null : `≈ ${money.format(price * quantity)} in total`;
    }
    const price = typedNumber(totalPrice);
    const perUnit = price === null ? NaN : price / quantity;
    return Number.isFinite(perUnit) ? `≈ ${money.format(perUnit)} per unit` : null;
  });

  /** A request is out: Save is disabled (no double submit). */
  protected readonly saving = signal(false);
  /** An error of the request that belongs to no field (a 409 of the Ledger). */
  protected readonly formError = signal<string | null>(null);

  private prefilled = false;

  constructor() {
    const { substanceId, quantity, refills, totalPrice, unitPrice } = this.form.controls;
    const destroyRef = inject(DestroyRef);
    substanceId.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((id) => this.chosenSubstanceId.set(id));
    for (const [field, control] of Object.entries({ quantity, refills, totalPrice, unitPrice })) {
      control.valueChanges
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe((value) => this.typed.update((typed) => ({ ...typed, [field]: value })));
    }
    // One way of typing the amount and one of typing the price at a time: the other field is off.
    refills.disable({ emitEvent: false });
    unitPrice.disable({ emitEvent: false });

    // The day and the time of "now" (or of the batch edited), on the settings' clocks.
    effect(() => {
      const settings = this.settings.value();
      if (!settings || this.prefilled) return;
      this.prefilled = true;
      untracked(() => {
        const edited = this.batch();
        const wall = wallTimeOf(edited ? new Date(edited.occurredAt) : new Date(), settings.timezone);
        this.form.controls.day.setValue(dateOfDay(wall.day));
        this.form.controls.time.setValue(dateOfWallTime(wall));
      });
    });

    // Refills are of a substance with a refill quantity: another one takes a quantity again.
    effect(() => {
      if (!this.canRefill() && this.amountIn() === 'refills') untracked(() => this.chooseAmount('quantity'));
    });
  }

  ngOnInit(): void {
    const { substanceId, name, quantity, totalPrice, note } = this.form.controls;
    if (this.substanceId() !== null) substanceId.setValue(this.substanceId());
    const edited = this.batch();
    if (edited) {
      name.setValue(edited.name ?? '');
      quantity.setValue(asTyped(edited.quantity));
      totalPrice.setValue(edited.totalPrice);
      note.setValue(edited.note ?? '');
      // The substance and the quantity of a batch are shown, never changed.
      substanceId.disable();
      quantity.disable();
    }
  }

  /** Why a field is in error; Material shows it once the field was touched or the form was sent. */
  protected errorOf(field: keyof typeof this.form.controls): string | null {
    return messageFor(this.form.controls[field].errors);
  }

  /** A quantity or refills: the field of the other goes off, keeping what was typed in it. */
  protected chooseAmount(amountIn: AmountIn): void {
    this.amountIn.set(amountIn);
    const { quantity, refills } = this.form.controls;
    (amountIn === 'refills' ? refills : quantity).enable({ emitEvent: false });
    (amountIn === 'refills' ? quantity : refills).disable({ emitEvent: false });
  }

  /** The total price or the price per unit: the field of the other goes off, keeping what was typed in it. */
  protected choosePrice(priceIn: PriceIn): void {
    this.priceIn.set(priceIn);
    const { totalPrice, unitPrice } = this.form.controls;
    (priceIn === 'unit' ? unitPrice : totalPrice).enable({ emitEvent: false });
    (priceIn === 'unit' ? totalPrice : unitPrice).disable({ emitEvent: false });
  }

  protected save(): void {
    // The guard, not only the disabled button: a second tap can arrive before the view updates.
    if (this.saving()) return;
    const { day, time } = this.form.controls;
    // Both or neither: with neither, the API records "now".
    if (day.value && !time.value) time.setErrors({ required: true });
    if (time.value && !day.value) day.setErrors({ required: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const settings = this.settings.value();
    if (!settings) return;
    this.saving.set(true);
    this.formError.set(null);
    this.request(settings.timezone).subscribe({
      next: (saved) => this.saved.emit(saved),
      error: (error: ApiError) => {
        this.saving.set(false);
        this.showErrors(error);
      },
    });
  }

  private request(timeZone: string): Observable<BatchRecord> {
    const v = this.form.getRawValue();
    const edited = this.batch();
    const name = v.name.trim() || null;
    const note = v.note.trim() || null;
    // Editing, the instant is sent only when changed: the form shows minutes, the API keeps seconds.
    const changedWhen = !edited || this.form.controls.day.dirty || this.form.controls.time.dirty;
    const occurredAt =
      changedWhen && v.day && v.time
        ? instantOf({ day: dayOfDate(v.day), time: `${pad(v.time.getHours())}:${pad(v.time.getMinutes())}` }, timeZone)
            .toISOString()
            .replace('.000', '')
        : undefined;
    const when = occurredAt === undefined ? {} : { occurredAt };

    // Every field that can change is sent; an emptied name or note is cleared (null).
    if (edited) return this.ledger.updateBatch(edited.id, { name, totalPrice: decimal(v.totalPrice), note, ...when });
    return this.ledger.createBatch(v.substanceId!, {
      ...(name === null ? {} : { name }),
      ...(this.amountIn() === 'refills' ? { refills: decimal(v.refills) } : { quantity: decimal(v.quantity) }),
      ...(this.priceIn() === 'unit' ? { unitPrice: decimal(v.unitPrice) } : { totalPrice: decimal(v.totalPrice) }),
      ...(note === null ? {} : { note }),
      ...when,
    });
  }

  /** Each field error under its field (the API's message); anything else above the buttons. */
  private showErrors(error: ApiError): void {
    const controls: Record<string, AbstractControl | undefined> = this.form.controls;
    const unplaced = error.fieldErrors.filter((fieldError) => {
      const control = controls[FIELD_OF[fieldError.field] ?? fieldError.field];
      control?.setErrors({ server: fieldError.message });
      control?.markAsTouched();
      return !control;
    });
    if (error.fieldErrors.length === 0 || unplaced.length > 0) {
      const detail = unplaced.map((e) => e.message).join('; ') || error.detail || error.title;
      this.formError.set(`Could not save: ${detail}${error.status ? ` (${error.status})` : ''}`);
    }
  }
}
