import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

import { Consumption } from '../data/consumption';
import { Settings } from '../data/settings';
import { LOCALE } from '../locale';
import { IdentityColorPipe } from '../ui/identity-color-pipe';
import { MetricsPanel } from '../ui/metrics-panel/metrics-panel';

/** What the details say of the consumption: what every list of consumptions has (the cost only some). */
export type ConsumptionHeader = Pick<
  Consumption,
  'type' | 'id' | 'substanceId' | 'substanceName' | 'unit' | 'batchId' | 'batchName' | 'name' | 'occurredAt' | 'quantity'
> &
  Partial<Pick<Consumption, 'cost'>>;

export interface ConsumptionDetailsData {
  consumption: ConsumptionHeader;
  settings: Settings;
}

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });

/** A decimal string of the API, formatted exactly (Intl reads it as a string: no binary rounding). */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);

/**
 * A consumption's details (design-statistics.md, "a consumption has metrics too"): what it was,
 * and its metrics panel, open: against the one before it, the averages of its substance and batch,
 * its numbers in its substance, batch and day, its hour. A dialog, opened from "Details" in the ⋮
 * of its card, or from its row on the metrics page; it only reads.
 */
@Component({
  selector: 'app-consumption-details',
  imports: [IdentityColorPipe, MatButtonModule, MatDialogModule, MetricsPanel],
  templateUrl: './consumption-details.html',
  styleUrl: './consumption-details.css',
})
export class ConsumptionDetails {
  protected readonly data = inject<ConsumptionDetailsData>(MAT_DIALOG_DATA);

  protected readonly view = computed(() => {
    const { consumption, settings } = this.data;
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
    const quantity = `${exact(quantityFormat, consumption.quantity)} ${consumption.unit}`;
    return {
      when,
      source:
        consumption.type === 'one_time'
          ? `One-time${consumption.name ? ` · ${consumption.name}` : ''}`
          : (consumption.batchName ?? 'Unnamed batch'),
      amount: consumption.cost === undefined ? quantity : `${quantity} · ${exact(money, consumption.cost)}`,
    };
  });
}
