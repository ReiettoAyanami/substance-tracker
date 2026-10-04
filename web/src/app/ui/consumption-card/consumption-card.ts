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
/** A consumption of the Android app's queue (design-android.md): waiting to be sent, or refused. */
export type QueuedState = 'pending' | 'to-fix';

export type ConsumptionCardVariant = 'full' | 'compact';

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);

/**
 * The formats of a time zone and of a currency, made once and shared by every card: making an Intl
 * format costs, and a list makes many cards at once (the recent consumptions of a batch).
 */
const whenFormats = new Map<string, Intl.DateTimeFormat>();
const moneyFormats = new Map<string, Intl.NumberFormat>();

function whenFormat(timeZone: string): Intl.DateTimeFormat {
  let format = whenFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    whenFormats.set(timeZone, format);
  }
  return format;
}

function moneyFormat(currency: string): Intl.NumberFormat {
  let format = moneyFormats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormats.set(currency, format);
  }
  return format;
}

/**
 * One consumption (design-frontend.md, "consumption card"). Presentational: every number is the
 * API's (the cost, the change from the previous consumption); it only formats them. Full, it says
 * when, what, from which batch (or "One-time"), how much, what it cost, the change from the
 * previous one (a delta pill) and the note, with a ⋮ menu that asks the parent for its details (so does a tap on a full card), to
 * edit it or to delete it. Compact, only when, how much, the cost and the delta pill, then a button
 * that opens it in the consumptions page and the same ⋮ menu (lenzi, 2026-10-03: "il tasto per
 * portarti alla pagina delle consumption con quella consumption aperta", "i tre puntini ... come
 * tutte le altre card").
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
  /** The open button of a compact card: the consumptions page, with this consumption's details open. */
  readonly open = output<void>();
  /**
   * A consumption of the Android app's queue: the tag "Pending" or "To fix" at the top, no delta, no
   * cost computed by the server, and its own ⋮ menu (discard; a To fix one recorded again).
   */
  readonly queued = input<QueuedState | null>(null);
  /** Why the server refused a To fix consumption. */
  readonly reason = input<string | null>(null);
  /** "Discard" in the ⋮ menu of a queued consumption. */
  readonly discard = output<void>();
  /** A To fix consumption recorded again: from another batch (false) or as a one-time one (true). */
  readonly fix = output<boolean>();

  protected readonly view = computed(() => {
    const consumption = this.consumption();
    const settings = this.settings();
    return {
      when: whenFormat(settings.timezone).format(new Date(consumption.occurredAt)),
      // A queued consumption has no cost of the server's: a one-time one shows the price typed.
      amount: consumption.cost
        ? `${exact(quantityFormat, consumption.quantity)} ${consumption.unit} · ${exact(moneyFormat(settings.currency), consumption.cost)}`
        : `${exact(quantityFormat, consumption.quantity)} ${consumption.unit}`,
    };
  });
}
