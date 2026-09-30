import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { Consumption } from '../../data/consumption';
import { Settings } from '../../data/settings';
import { LOCALE } from '../../locale';
import { DeltaPill } from '../delta-pill/delta-pill';
import { IdentityColorPipe } from '../identity-color-pipe';

/** full: on the consumptions page; compact: under a batch, where substance and batch are known. */
export type ConsumptionCardVariant = 'full' | 'compact';

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);

/**
 * One consumption (design-frontend.md, "consumption card"). Presentational: every number is the
 * API's (the cost, the change from the previous consumption); it only formats them. Full, it says
 * when, what, from which batch (or "One-time"), how much, what it cost, the change from the
 * previous one (a delta pill) and the note, with a ⋮ menu that asks the parent for its details, to
 * edit it or to delete it. Compact, only when, how much, the cost and the delta pill.
 */
@Component({
  selector: 'app-consumption-card',
  imports: [DeltaPill, IdentityColorPipe, MatButtonModule, MatCardModule, MatIconModule, MatMenuModule],
  templateUrl: './consumption-card.html',
  styleUrl: './consumption-card.css',
})
export class ConsumptionCard {
  readonly consumption = input.required<Consumption>();
  readonly settings = input.required<Settings>();
  readonly variant = input<ConsumptionCardVariant>('full');
  /** "Details" in the ⋮ menu. */
  readonly details = output<void>();
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
    return {
      when,
      amount: `${exact(quantityFormat, consumption.quantity)} ${consumption.unit} · ${exact(money, consumption.cost)}`,
    };
  });
}
