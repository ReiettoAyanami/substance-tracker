import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { RouterLink } from '@angular/router';

import { ApiError } from '../data/api-error';
import { Settings } from '../data/settings';
import { SettingsApi } from '../data/settings-api';
import { LOCALE } from '../locale';
import { Session } from '../session/session';
import { Appearance } from '../ui/appearance';
import { RUNS_IN_APP } from '../connection/address';
import { AccountSettings } from './account-settings/account-settings';
import { AppSettings } from './app-settings/app-settings';

const pad = (n: number) => String(n).padStart(2, '0');

/** The timepicker's Date for a time of day, 'HH:MM[:SS]': only its hours and minutes count. */
function dateOfTime(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
}

/** A time of day as the API reads it: 'HH:MM'. */
const timeOfDate = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The currencies this browser knows (and the current one), by code, with their names. */
function currencyOptions(current: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([LOCALE], { type: 'currency' });
  const codes = new Set([...Intl.supportedValuesOf('currency'), current].filter(Boolean));
  return [...codes].sort().map((code) => ({ code, name: names.of(code) ?? code }));
}

/** The time zones this browser knows, UTC (which it does not list) and the current one. */
function zoneOptions(current: string): string[] {
  return [...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC', current].filter(Boolean))].sort();
}

/** The value must be one of `values`: the list offers them all. */
function oneOf(values: () => ReadonlySet<string>): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    control.value && !values().has(control.value) ? { notInList: true } : null;
}

/** A field's error in words: the form's own, or the API's. */
function messageFor(errors: ValidationErrors | null): string | null {
  if (!errors) return null;
  if (errors['required']) return 'Required';
  if (errors['notInList']) return 'Choose one of the list';
  if (errors['matTimepickerParse']) return 'Not a time (e.g. 04:00)';
  if (errors['server']) return errors['server'];
  return 'Not valid';
}

type Field = 'currency' | 'timezone' | 'dayStartsAt';

/**
 * The settings (design-statistics.md, "settings page"): the one row of `settings`, edited in one
 * form with the usual Material fields. The currency only shows the amounts (nothing is converted);
 * the time zone and the time the day starts decide which logical day a consumption belongs to,
 * and the page says that changing them moves consumptions between days. Save sends what changed;
 * the form then shows what the API saved, and every page opened afterwards asks for the settings
 * again. Below, the way to what the pages show (/statistics/edit), then the user's own account
 * (AccountSettings: password, other devices).
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    AccountSettings,
    AppSettings,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSlideToggleModule,
    MatTimepickerModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: LOCALE }],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsPage {
  private readonly api = inject(SettingsApi);
  protected readonly session = inject(Session);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly appearance = inject(Appearance);
  /** The Android app's own settings (server, versions) show only there. */
  protected readonly inApp = inject(RUNS_IN_APP);

  protected readonly settings = rxResource({ stream: () => this.api.getSettings() });

  private readonly currencies = computed(() => currencyOptions(this.settings.value()?.currency ?? ''));
  private readonly zones = computed(() => zoneOptions(this.settings.value()?.timezone ?? ''));
  private readonly currencyCodes = computed(() => new Set(this.currencies().map((c) => c.code)));
  private readonly zoneNames = computed(() => new Set(this.zones()));

  protected readonly form = new FormGroup({
    currency: new FormControl('', { nonNullable: true, validators: [Validators.required, oneOf(() => this.currencyCodes())] }),
    timezone: new FormControl('', { nonNullable: true, validators: [Validators.required, oneOf(() => this.zoneNames())] }),
    dayStartsAt: new FormControl<Date | null>(null, { validators: [Validators.required] }),
  });

  private readonly typedCurrency = toSignal(this.form.controls.currency.valueChanges, { initialValue: '' });
  private readonly typedZone = toSignal(this.form.controls.timezone.valueChanges, { initialValue: '' });

  /** The currencies offered: all while the field holds one, else those whose code or name has what is typed. */
  protected readonly currencyChoices = computed(() => {
    const typed = this.typedCurrency().trim().toLowerCase();
    if (!typed || this.currencyCodes().has(this.typedCurrency())) return this.currencies();
    return this.currencies().filter((c) => c.code.toLowerCase().includes(typed) || c.name.toLowerCase().includes(typed));
  });

  /** The time zones offered: all while the field holds one, else those whose name has what is typed. */
  protected readonly zoneChoices = computed(() => {
    const typed = this.typedZone().trim().toLowerCase().replaceAll(' ', '_');
    if (!typed || this.zoneNames().has(this.typedZone())) return this.zones();
    return this.zones().filter((zone) => zone.toLowerCase().includes(typed));
  });

  /** A request is out: Save is disabled (no double submit). */
  protected readonly saving = signal(false);
  /** What could not be said under a field. */
  protected readonly formError = signal<string | null>(null);

  protected readonly failure = computed(() => {
    const failure = this.settings.error();
    if (!failure) return null;
    // The interceptor's ApiError is not an Error: the resource wraps it, as its cause.
    const error = (failure.cause ?? failure) as Partial<ApiError>;
    return `Could not load the settings${error.status ? ` (${error.status})` : ''}`;
  });

  constructor() {
    // The form shows the settings as the API has them: when they arrive, and after a save.
    effect(() => {
      if (!this.settings.hasValue()) return;
      const { currency, timezone, dayStartsAt } = this.settings.value();
      this.form.reset({ currency, timezone, dayStartsAt: dateOfTime(dayStartsAt) });
    });
  }

  protected errorOf(field: Field): string | null {
    return messageFor(this.form.controls[field].errors);
  }

  protected save(): void {
    // The guard, not only the disabled button: a second tap can arrive before the view updates.
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { currency, timezone, dayStartsAt } = this.form.controls;
    const patch: Partial<Settings> = {
      ...(currency.dirty ? { currency: currency.value } : {}),
      ...(timezone.dirty ? { timezone: timezone.value } : {}),
      ...(dayStartsAt.dirty && dayStartsAt.value ? { dayStartsAt: timeOfDate(dayStartsAt.value) } : {}),
    };
    if (Object.keys(patch).length === 0) return;
    this.saving.set(true);
    this.formError.set(null);
    this.api.updateSettings(patch).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.settings.set(saved);
        this.snackBar.open('Settings saved', undefined, { duration: 3000 });
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.showErrors(error);
      },
    });
  }

  /** Each field error under its field (the API's message); anything else above the button. */
  private showErrors(error: ApiError): void {
    const controls: Record<string, AbstractControl | undefined> = this.form.controls;
    const unplaced = error.fieldErrors.filter((fieldError) => {
      const control = controls[fieldError.field];
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
