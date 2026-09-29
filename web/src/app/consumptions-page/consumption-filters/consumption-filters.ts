import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, input, linkedSignal, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';

import { BatchListItem } from '../../data/batch';
import { ConsumptionBounds, ConsumptionFilter } from '../../data/consumption';
import { Settings } from '../../data/settings';
import { Substance } from '../../data/substance';
import { WIDE_SCREEN } from '../../layout';
import { LOCALE } from '../../locale';

/** A range slider over the bounds of the API, widened outwards to its step (cents, or units). */
interface SliderRange {
  min: number;
  max: number;
  step: number;
  /** Where the thumbs are: the filter's ends, or the slider's ends when the filter has none. */
  start: number;
  end: number;
}

type RangeKind = 'price' | 'quantity';

const RANGE_KEYS = {
  price: ['minUnitPrice', 'maxUnitPrice'],
  quantity: ['minQuantity', 'maxQuantity'],
} as const satisfies Record<RangeKind, readonly [keyof ConsumptionFilter, keyof ConsumptionFilter]>;

/** The filter without the fields that are not set. */
function withoutUnset(filter: ConsumptionFilter): ConsumptionFilter {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined)) as ConsumptionFilter;
}

/** 'YYYY-MM-DD' of the calendar day picked (a Date at local midnight, from the datepicker). */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The datepicker's Date of a day 'YYYY-MM-DD'. */
function dateOfDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!);
}

/**
 * The slider of two bounds of the API (decimal strings; null when nothing is in scope), and where
 * its thumbs stand for the filter's ends. The ends are widened to the step, so every value fits.
 */
function sliderRange(
  low: string | null,
  high: string | null,
  step: number,
  chosenLow: string | undefined,
  chosenHigh: string | undefined,
): SliderRange | null {
  if (low === null || high === null) return null;
  const scale = 1 / step;
  const min = Math.floor(Number(low) * scale + 1e-6) / scale;
  const max = Math.ceil(Number(high) * scale - 1e-6) / scale;
  const clamp = (value: number) => Math.min(max, Math.max(min, value));
  return {
    min,
    max,
    step,
    start: chosenLow === undefined ? min : clamp(Number(chosenLow)),
    end: chosenHigh === undefined ? max : clamp(Number(chosenHigh)),
  };
}

/**
 * The filters of the consumptions page (design-frontend.md, "consumption filters"): substance,
 * batch, the days from..to, and ranges on the unit price and on the quantity (two-thumb sliders
 * between the bounds the API gives for the scope). Choosing a batch fills in its substance;
 * choosing a substance narrows the batches, drops a batch of another substance and the ranges
 * (they differ per substance, in units too). Every change goes out at once (a slider on release)
 * as the whole new filter: the page keeps it in the URL. A warning says when the chosen batch or
 * substance did not exist yet on the days chosen.
 */
@Component({
  selector: 'app-consumption-filters',
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSliderModule,
    ReactiveFormsModule,
  ],
  // Days are picked in the calendar (the inputs are read-only: the native adapter cannot read a
  // typed "05/09/2026" as the 5th of September).
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: LOCALE }],
  templateUrl: './consumption-filters.html',
  styleUrl: './consumption-filters.css',
})
export class ConsumptionFilters {
  readonly filter = input.required<ConsumptionFilter>();
  /** Every substance, archived ones too (their consumptions are listed). */
  readonly substances = input.required<Substance[]>();
  /** Every batch (GET /api/batches): by substance, newest first. */
  readonly batches = input.required<BatchListItem[]>();
  /** The ends of the sliders for the current scope; null when unknown or when nothing is in scope. */
  readonly bounds = input<ConsumptionBounds | null>(null);
  readonly settings = input.required<Settings>();
  /** The whole new filter, after any change. */
  readonly changed = output<ConsumptionFilter>();

  /** Open on a wide screen; on a phone the panel starts closed and says how many filters are set. */
  protected readonly startOpen = inject(BreakpointObserver).isMatched(WIDE_SCREEN);

  protected readonly dates = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  constructor() {
    // The picker shows the days of the filter (the URL), whatever changed them.
    effect(() => {
      const { from, to } = this.filter();
      this.dates.setValue(
        { start: from ? dateOfDay(from) : null, end: to ? dateOfDay(to) : null },
        { emitEvent: false },
      );
    });
  }

  private readonly dayFormat = computed(
    () => new Intl.DateTimeFormat(LOCALE, { timeZone: this.settings().timezone, day: 'numeric', month: 'short', year: 'numeric' }),
  );

  /** How many filters are set (the days count once, each range once). */
  protected readonly activeCount = computed(() => {
    const f = this.filter();
    return [f.substanceId, f.batchId, f.from ?? f.to, f.minUnitPrice ?? f.maxUnitPrice, f.minQuantity ?? f.maxQuantity].filter(
      (value) => value !== undefined,
    ).length;
  });

  /** The batch options: grouped by substance while no substance is chosen, else only its batches. */
  protected readonly batchGroups = computed(() => {
    const substanceId = this.filter().substanceId;
    const day = this.dayFormat();
    const groups: { substanceId: number; label: string | null; batches: { id: number; label: string }[] }[] = [];
    for (const batch of this.batches()) {
      if (substanceId !== undefined && batch.substanceId !== substanceId) continue;
      const option = {
        id: batch.id,
        label: `${batch.name ?? 'Unnamed batch'} · ${day.format(new Date(batch.occurredAt))}${batch.deactivatedAt ? ' · finished' : ''}`,
      };
      const last = groups.at(-1);
      if (last?.substanceId === batch.substanceId) last.batches.push(option);
      else groups.push({ substanceId: batch.substanceId, label: substanceId === undefined ? batch.substanceName : null, batches: [option] });
    }
    return groups;
  });

  protected readonly priceRange = computed(() => {
    const bounds = this.bounds();
    const f = this.filter();
    return bounds && sliderRange(bounds.minUnitPrice, bounds.maxUnitPrice, 0.01, f.minUnitPrice, f.maxUnitPrice);
  });

  /** Whole units when every quantity in scope is whole (cigarettes), else hundredths (grams). */
  protected readonly quantityRange = computed(() => {
    const bounds = this.bounds();
    if (!bounds || bounds.minQuantity === null || bounds.maxQuantity === null) return null;
    const whole = Number.isInteger(Number(bounds.minQuantity)) && Number.isInteger(Number(bounds.maxQuantity));
    const f = this.filter();
    return sliderRange(bounds.minQuantity, bounds.maxQuantity, whole ? 1 : 0.01, f.minQuantity, f.maxQuantity);
  });

  /** Where the thumbs are while they move (printed next to the slider). */
  protected readonly priceShown = linkedSignal(() => this.priceRange());
  protected readonly quantityShown = linkedSignal(() => this.quantityRange());

  /** The chosen batch or substance did not exist yet on the days chosen (bought or added after "to"). */
  protected readonly warning = computed(() => {
    const { to, batchId, substanceId } = this.filter();
    if (!to) return null;
    const timeZone = this.settings().timezone;
    // The day of an instant in the settings' time zone, 'YYYY-MM-DD' (the logical day starts at 00:00).
    const dayIn = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const shown = this.dayFormat();
    const batch = batchId === undefined ? undefined : this.batches().find((b) => b.id === batchId);
    if (batch && dayIn.format(new Date(batch.occurredAt)) > to) {
      return `This batch was bought on ${shown.format(new Date(batch.occurredAt))}: it did not exist yet on the days chosen.`;
    }
    const substance = substanceId === undefined ? undefined : this.substances().find((s) => s.id === substanceId);
    if (substance && dayIn.format(new Date(substance.createdAt)) > to) {
      return `${substance.name} was added on ${shown.format(new Date(substance.createdAt))}: it did not exist yet on the days chosen.`;
    }
    return null;
  });

  protected money(value: number): string {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: this.settings().currency }).format(value);
  }

  protected amount(value: number): string {
    return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value);
  }

  protected chooseSubstance(substanceId: number | null): void {
    const batch = this.batches().find((b) => b.id === this.filter().batchId);
    this.changeScope({
      substanceId: substanceId ?? undefined,
      // a batch of another substance goes, and so does any batch when every substance is shown again
      batchId: substanceId !== null && batch?.substanceId === substanceId ? batch.id : undefined,
    });
  }

  protected chooseBatch(batchId: number | null): void {
    const batch = this.batches().find((b) => b.id === batchId);
    this.changeScope({ batchId: batch?.id, substanceId: batch ? batch.substanceId : this.filter().substanceId });
  }

  /** The picker closed: its days become the filter's from..to (a day alone is fine). */
  protected applyDates(): void {
    const { start, end } = this.dates.getRawValue();
    const from = start ? isoDay(start) : undefined;
    const to = end ? isoDay(end) : undefined;
    if (from !== this.filter().from || to !== this.filter().to) this.emit({ from, to });
  }

  protected clearDates(): void {
    this.emit({ from: undefined, to: undefined });
  }

  /** A thumb moved: printed at once, applied on release. */
  protected slide(kind: RangeKind, start: number, end: number): void {
    const shown = kind === 'price' ? this.priceShown : this.quantityShown;
    shown.update((range) => range && { ...range, start, end });
  }

  /** A thumb was released: the range goes into the filter; an end at the slider's end is not written. */
  protected chooseRange(kind: RangeKind, start: number, end: number): void {
    const range = kind === 'price' ? this.priceRange() : this.quantityRange();
    if (!range) return;
    const decimals = range.step === 1 ? 0 : 2;
    const [low, high] = RANGE_KEYS[kind];
    this.emit({
      [low]: start > range.min ? start.toFixed(decimals) : undefined,
      [high]: end < range.max ? end.toFixed(decimals) : undefined,
    });
  }

  protected clear(): void {
    this.changed.emit({});
  }

  /** Substance and batch changed: the ranges go (other substances, other units). */
  private changeScope(scope: Pick<ConsumptionFilter, 'substanceId' | 'batchId'>): void {
    this.emit({ ...scope, minUnitPrice: undefined, maxUnitPrice: undefined, minQuantity: undefined, maxQuantity: undefined });
  }

  private emit(change: Partial<ConsumptionFilter>): void {
    this.changed.emit(withoutUnset({ ...this.filter(), ...change }));
  }
}
