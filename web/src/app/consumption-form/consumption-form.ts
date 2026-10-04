import { Component, DestroyRef, OnInit, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { Observable } from 'rxjs';

import { RUNS_IN_APP } from '../connection/address';
import { Connectivity } from '../connection/connectivity';
import { ApiError, SERVER_NOT_REACHABLE, isUnreachable } from '../data/api-error';
import { newClientRef } from '../data/client-ref';
import { CatalogApi } from '../data/catalog-api';
import { Consumption, ConsumptionRecord, CreateConsumptionInput } from '../data/consumption';
import { LedgerApi } from '../data/ledger-api';
import { CreateOneTimeInput, OneTimeRecord } from '../data/one-time';
import { ReportsApi } from '../data/reports-api';
import { SettingsApi } from '../data/settings-api';
import { LOCALE } from '../locale';
import { Queue } from '../queue/queue';
import { QueuedConsumption } from '../queue/queued-consumption';
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

/** A decimal string of the API ("2.000", "0.500") as lenzi would type it ("2", "0.5"). */
const asTyped = (value: string) => value.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

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

/**
 * A consumption to record again, its fields filled in (a "To fix" consumption of the Android app's
 * queue, design-android.md): its substance stays, the batch or one-time is chosen again.
 */
export interface ConsumptionDraft {
  substanceId: number;
  quantity: string;
  occurredAt: string;
  note: string | null;
  oneTime: boolean;
  totalPrice: string | null;
  name: string | null;
}

/** A create, as sent: to a batch, or a one-time consumption of a substance. */
type CreateRequest = QueuedConsumption['request'];

/** Where the API's field errors go: its field names are the form's, except the instant. */
const FIELD_OF: Record<string, string> = { occurredAt: 'day', unitPrice: 'totalPrice' };

/**
 * The consumption form (design-frontend.md, "consumption form"): it records a consumption from a
 * batch, or a one-time one (bought and used at once: a price, an optional name), or edits the one
 * it is given. The substance and the batch can come fixed (their selectors are hidden), and so can
 * the kind (`oneTimeOnly`: the one-time list of a substance adds one-time consumptions only).
 * "One-time", at the bottom of the form, can be ticked from the start; else the active batches of
 * the substance chosen are offered oldest first, the oldest chosen; with none, the consumption can
 * only be one-time. The day and the time are those of the settings' time zone, "now" at
 * first. In edit mode the kind and the batch are shown, not changed (the API cannot move a
 * consumption). It says `saved` with what the Ledger returned, or `cancelled`. In the Android app a
 * new consumption that gets no answer from the server (or is recorded offline) goes to the queue with
 * its clientRef, and `saved` says the queued consumption (design-android.md, "queue (Pending)").
 */
@Component({
  selector: 'app-consumption-form',
  imports: [
    IdentityColorPipe,
    MatButtonModule,
    MatCheckboxModule,
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
  templateUrl: './consumption-form.html',
  styleUrl: './consumption-form.css',
})
export class ConsumptionForm implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly reports = inject(ReportsApi);
  private readonly ledger = inject(LedgerApi);
  private readonly settingsApi = inject(SettingsApi);
  private readonly inApp = inject(RUNS_IN_APP);
  private readonly connectivity = inject(Connectivity);
  private readonly queue = inject(Queue);

  /** The consumption to edit (an item of the consumptions list); none to record one. */
  readonly consumption = input<Consumption | null>(null);
  /** A consumption to record again (To fix): filled in, its substance fixed. */
  readonly draft = input<ConsumptionDraft | null>(null);
  /** A fixed substance: no substance selector. */
  readonly substanceId = input<number | null>(null);
  /** A fixed batch (of the fixed substance): no batch selector, never one-time. */
  readonly batchId = input<number | null>(null);
  /** A one-time consumption and nothing else: no batches, no "One-time" checkbox. */
  readonly oneTimeOnly = input(false);
  /** The host may show its own title instead. */
  readonly showTitle = input(true);
  /** What the Ledger returned: the recorded or changed consumption. */
  readonly saved = output<ConsumptionRecord | OneTimeRecord | QueuedConsumption>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup({
    substanceId: new FormControl<number | null>(null, { validators: [filled] }),
    oneTime: new FormControl(false, { nonNullable: true }),
    batchId: new FormControl<number | null>(null, { validators: [filled] }),
    quantity: new FormControl('', { nonNullable: true, validators: [filled, decimalText] }),
    totalPrice: new FormControl('', { nonNullable: true, validators: [decimalText] }),
    name: new FormControl('', { nonNullable: true }),
    day: new FormControl<Date | null>(null),
    time: new FormControl<Date | null>(null),
    note: new FormControl('', { nonNullable: true }),
  });

  /** The chosen substance, the kind, and what is typed, as signals for the template. */
  protected readonly chosenSubstanceId = signal<number | null>(null);
  protected readonly oneTime = signal(false);
  private readonly typed = signal({ quantity: '', totalPrice: '' });
  /** The substance has no active batch: the consumption can only be one-time. */
  protected readonly noActiveBatch = signal(false);

  private readonly settings = rxResource({ stream: () => this.settingsApi.getSettings() });
  /** The substances one can record for (archived ones are read-only for the Ledger). */
  protected readonly substances = rxResource({ stream: () => this.catalog.listSubstances() });
  /** The active batches of the chosen substance, oldest first (none to load when editing, or for a one-time only). */
  private readonly batches = rxResource({
    params: () => (this.consumption() || this.oneTimeOnly() ? undefined : (this.chosenSubstanceId() ?? undefined)),
    stream: ({ params }) => this.reports.getSubstanceBatches(params),
  });

  protected readonly unit = computed(
    () => this.consumption()?.unit ?? this.substances.value()?.find((s) => s.id === this.chosenSubstanceId())?.unit ?? '',
  );

  protected readonly batchOptions = computed(() => {
    if (!this.batches.hasValue()) return [];
    const quantity = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
    return this.batches.value().batches.map((batch) => ({
      id: batch.id,
      name: batch.name ?? 'Unnamed batch',
      left: `${quantity.format(batch.remaining as unknown as number)} ${this.unit()} left`,
    }));
  });

  /** The currency's sign for the price field ("€"). */
  protected readonly currencySign = computed(() => {
    const currency = this.settings.value()?.currency ?? 'EUR';
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value;
  });

  /** "≈ €0.33 per unit" while a one-time price is typed: a preview, never sent (design-frontend.md). */
  protected readonly perUnitPreview = computed(() => {
    const { quantity, totalPrice } = this.typed();
    const settings = this.settings.value();
    if (!settings || !DECIMAL.test(quantity.trim()) || !DECIMAL.test(totalPrice.trim())) return null;
    const perUnit = Number(decimal(totalPrice)) / Number(decimal(quantity));
    if (!Number.isFinite(perUnit)) return null;
    return `≈ ${new Intl.NumberFormat(LOCALE, { style: 'currency', currency: settings.currency }).format(perUnit)} per unit`;
  });

  /** A request is out: Save is disabled (no double submit). */
  protected readonly saving = signal(false);
  /** An error of the request that belongs to no field (a 409 of the Ledger). */
  protected readonly formError = signal<string | null>(null);
  /** Sent with the create, the same on every Save of this form: a resend never makes a second row. */
  private clientRef = newClientRef();

  /** The one-time kind was forced on (no active batch), not chosen. */
  private forcedOneTime = false;
  private prefilled = false;

  constructor() {
    const { substanceId, oneTime, quantity, totalPrice } = this.form.controls;
    const destroyRef = inject(DestroyRef);
    substanceId.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((id) => this.chosenSubstanceId.set(id));
    oneTime.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((value) => this.applyOneTime(value));
    quantity.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((value) => this.typed.update((t) => ({ ...t, quantity: value })));
    totalPrice.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((value) => this.typed.update((t) => ({ ...t, totalPrice: value })));

    // The day and the time of "now" (or of the consumption edited), on the settings' clocks.
    effect(() => {
      const settings = this.settings.value();
      if (!settings || this.prefilled) return;
      this.prefilled = true;
      untracked(() => {
        const at = this.consumption()?.occurredAt ?? this.draft()?.occurredAt;
        const wall = wallTimeOf(at ? new Date(at) : new Date(), settings.timezone);
        this.form.controls.day.setValue(dateOfDay(wall.day));
        this.form.controls.time.setValue(dateOfWallTime(wall));
      });
    });

    // The batches of the substance chosen: the oldest by default; none → one-time only.
    effect(() => {
      if (!this.batches.hasValue()) return;
      const active = this.batches.value().batches;
      untracked(() => this.offerBatches(active.map((b) => b.id)));
    });
  }

  ngOnInit(): void {
    const { substanceId, oneTime, batchId, quantity, totalPrice, name, note } = this.form.controls;
    const edited = this.consumption();
    if (edited) {
      substanceId.setValue(edited.substanceId);
      oneTime.setValue(edited.type === 'one_time');
      batchId.setValue(edited.batchId);
      quantity.setValue(asTyped(edited.quantity));
      if (edited.type === 'one_time') {
        totalPrice.setValue(edited.cost); // a one-time consumption's cost is its price
        name.setValue(edited.name ?? '');
      }
      note.setValue(edited.note ?? '');
      // The kind and the batch are shown, never changed.
      substanceId.disable();
      oneTime.disable();
      batchId.disable();
      return;
    }
    const draft = this.draft();
    if (draft) {
      substanceId.setValue(draft.substanceId);
      substanceId.disable();
      quantity.setValue(asTyped(draft.quantity));
      note.setValue(draft.note ?? '');
      if (draft.oneTime) oneTime.setValue(true);
      if (draft.totalPrice !== null) totalPrice.setValue(asTyped(draft.totalPrice));
      name.setValue(draft.name ?? '');
    }
    if (this.substanceId() !== null) substanceId.setValue(this.substanceId());
    if (this.batchId() !== null) {
      batchId.setValue(this.batchId());
      oneTime.disable(); // a fixed batch is a consumption from that batch
    }
    if (this.oneTimeOnly()) oneTime.setValue(true); // no batch, a price required
  }

  /** Why a field is in error; Material shows it once the field was touched or the form was sent. */
  protected errorOf(field: keyof typeof this.form.controls): string | null {
    return messageFor(this.form.controls[field].errors);
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
    const queueable = this.inApp && !this.consumption();
    if (queueable && this.connectivity.offline()) {
      void this.queueIt(settings.timezone);
      return;
    }
    this.request(settings.timezone).subscribe({
      next: (saved) => this.saved.emit(saved),
      error: (error: ApiError) => {
        // No answer in the app: the same consumption, with the same clientRef, waits in the queue.
        if (queueable && isUnreachable(error)) {
          void this.queueIt(settings.timezone);
          return;
        }
        this.saving.set(false);
        this.showErrors(error);
      },
    });
  }

  /** Into the Android app's queue, as it would have been sent, at the time the form shows. */
  private async queueIt(timeZone: string): Promise<void> {
    const create = this.createRequest(timeZone, true);
    const substanceId = this.form.getRawValue().substanceId!;
    const substance = this.substances.value()?.find((s) => s.id === substanceId);
    const batch =
      create.kind === 'batch' && this.batches.hasValue() ? this.batches.value().batches.find((b) => b.id === create.batchId) : undefined;
    try {
      const queued = await this.queue.record(create, {
        substanceId,
        substanceName: substance?.name ?? '',
        unit: substance?.unit ?? '',
        batchName: create.kind === 'batch' ? (batch?.name ?? null) : null,
      });
      this.saved.emit(queued);
    } catch {
      this.saving.set(false);
      this.formError.set(SERVER_NOT_REACHABLE);
    }
  }

  private request(timeZone: string): Observable<ConsumptionRecord | OneTimeRecord> {
    const v = this.form.getRawValue();
    const edited = this.consumption();
    const quantity = decimal(v.quantity);
    const note = v.note.trim() || null;
    const name = v.name.trim() || null;
    // Editing, the instant is sent only when changed: the form shows minutes, the API keeps seconds.
    const changedWhen = !edited || this.form.controls.day.dirty || this.form.controls.time.dirty;
    const occurredAt =
      changedWhen && v.day && v.time
        ? instantOf({ day: dayOfDate(v.day), time: `${pad(v.time.getHours())}:${pad(v.time.getMinutes())}` }, timeZone)
            .toISOString()
            .replace('.000', '')
        : undefined;
    const when = occurredAt === undefined ? {} : { occurredAt };

    if (edited?.type === 'one_time') {
      return this.ledger.updateOneTime(edited.id, { quantity, totalPrice: decimal(v.totalPrice), name, note, ...when });
    }
    if (edited) return this.ledger.updateConsumption(edited.id, { quantity, note, ...when });
    const create = this.createRequest(timeZone, false);
    return create.kind === 'one-time'
      ? this.ledger.createOneTime(create.substanceId, create.body)
      : this.ledger.createConsumption(create.batchId, create.body);
  }

  /**
   * The new consumption as it is sent. `recorded`: for the queue, whose consumption keeps the time it
   * was recorded (the form's, or now), never the time it is sent.
   */
  private createRequest(timeZone: string, recorded: boolean): CreateRequest {
    const v = this.form.getRawValue();
    const quantity = decimal(v.quantity);
    const note = v.note.trim() || null;
    const name = v.name.trim() || null;
    const occurredAt =
      v.day && v.time
        ? instantOf({ day: dayOfDate(v.day), time: `${pad(v.time.getHours())}:${pad(v.time.getMinutes())}` }, timeZone)
            .toISOString()
            .replace('.000', '')
        : recorded
          ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
          : undefined;
    const when = occurredAt === undefined ? {} : { occurredAt };
    if (v.oneTime) {
      const body: CreateOneTimeInput = {
        quantity,
        totalPrice: decimal(v.totalPrice),
        ...(name === null ? {} : { name }),
        ...(note === null ? {} : { note }),
        ...when,
        clientRef: this.clientRef,
      };
      return { kind: 'one-time', substanceId: v.substanceId!, body };
    }
    const body: CreateConsumptionInput = { quantity, ...(note === null ? {} : { note }), ...when, clientRef: this.clientRef };
    return { kind: 'batch', batchId: v.batchId!, body };
  }

  /** One-time: no batch, a price is required. */
  private applyOneTime(oneTime: boolean): void {
    this.oneTime.set(oneTime);
    const { batchId, totalPrice } = this.form.controls;
    if (!this.consumption() && this.batchId() === null) {
      if (oneTime) batchId.disable({ emitEvent: false });
      else batchId.enable({ emitEvent: false });
    }
    totalPrice.setValidators(oneTime ? [filled, decimalText] : [decimalText]);
    totalPrice.updateValueAndValidity({ emitEvent: false });
  }

  /** The active batches arrived: keep a valid choice, else the oldest; with none, one-time only. */
  private offerBatches(activeIds: number[]): void {
    const { oneTime, batchId } = this.form.controls;
    if (this.batchId() !== null) return;
    if (activeIds.length === 0) {
      this.noActiveBatch.set(true);
      this.forcedOneTime = !oneTime.value;
      oneTime.setValue(true);
      oneTime.disable({ emitEvent: false });
      return;
    }
    this.noActiveBatch.set(false);
    if (oneTime.disabled) {
      oneTime.enable({ emitEvent: false });
      if (this.forcedOneTime) oneTime.setValue(false);
      this.forcedOneTime = false;
    }
    if (!activeIds.includes(batchId.value ?? -1)) batchId.setValue(activeIds[0]!);
  }

  /** Each field error under its field (the API's message); anything else above the buttons. */
  private showErrors(error: ApiError): void {
    if (isUnreachable(error)) {
      this.formError.set(SERVER_NOT_REACHABLE);
      return;
    }
    // Someone else's clientRef (a UUID, so never in practice): a new one, and the user tries again.
    if (error.code === 'client-ref-used') {
      this.clientRef = newClientRef();
      this.formError.set('Could not save: press Save again.');
      return;
    }
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
