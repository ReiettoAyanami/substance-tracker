import { Pipe, PipeTransform } from '@angular/core';

import { LOCALE } from '../locale';

/**
 * A unit price as the app shows it everywhere (card, batch bar tooltip): a decimal string from the
 * API, rounded to cents only here (design.md: "rounded to cents only when displayed"), in the
 * currency of the settings, per unit: "€0.33/sigaretta". "—" when there is no price.
 */
@Pipe({
  name: 'unitPrice',
})
export class UnitPricePipe implements PipeTransform {
  transform(unitPrice: string | null | undefined, currency: string, unit: string): string {
    if (unitPrice == null) return '—';
    const money = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Intl formats a decimal string exactly (ECMA-402 NumberFormat v3): no binary rounding.
    return `${money.format(unitPrice as unknown as number)}/${unit}`;
  }
}
