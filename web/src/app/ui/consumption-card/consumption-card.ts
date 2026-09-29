import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Consumption } from '../../data/consumption';
import { Settings } from '../../data/settings';
import { LOCALE } from '../../locale';
import { IdentityColorPipe } from '../identity-color-pipe';

/** full: on the consumptions page; compact: under a batch, where substance and batch are known. */
export type ConsumptionCardVariant = 'full' | 'compact';

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
/** A delta ratio of the API ("-0.3333") as a signed percentage ("-33.3%"). */
const deltaFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);

/**
 * One consumption (design-frontend.md, "consumption card"). Presentational: every number is the
 * API's (cost, unit price, delta from the previous consumption of the substance); it only formats
 * them. Full, it says when, what, from which batch (or "One-time"), how much, what it cost, the
 * delta and the note, with a ⋮ menu that asks the parent to edit or delete it. Compact, only when,
 * how much, the cost and the delta.
 */
@Component({
  selector: 'app-consumption-card',
  imports: [IdentityColorPipe, MatButtonModule, MatCardModule, MatIconModule, MatMenuModule],
  templateUrl: './consumption-card.html',
  styleUrl: './consumption-card.css',
})
export class ConsumptionCard {
  readonly consumption = input.required<Consumption>();
  readonly settings = input.required<Settings>();
  readonly variant = input<ConsumptionCardVariant>('full');
  /** "Edit" in the ⋮ menu. */
  readonly edit = output<void>();
  /** "Delete" in the ⋮ menu. */
  readonly remove = output<void>();

  protected readonly view = computed(() => {
    const consumption = this.consumption();
    const settings = this.settings();
    const when = new Intl.DateTimeFormat(LOCALE, {
      timeZone: settings.timezone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(consumption.occurredAt));
    const money = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: settings.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const deltas = [
      consumption.deltaQuantity === null ? null : `${exact(deltaFormat, consumption.deltaQuantity)} qty`,
      consumption.deltaUnitPrice === null ? null : `${exact(deltaFormat, consumption.deltaUnitPrice)} price`,
    ];
    return {
      when,
      amount: `${exact(quantityFormat, consumption.quantity)} ${consumption.unit} · ${exact(money, consumption.cost)}`,
      delta: deltas.filter((delta) => delta !== null).join(' · '),
    };
  });
}
