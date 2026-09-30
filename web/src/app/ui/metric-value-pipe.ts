import { Pipe, PipeTransform } from '@angular/core';

import { MetricDefinition, TimeScale } from '../data/metric';
import { LOCALE } from '../locale';

/** What a value is read with: the substance's unit, the currency of the settings, the scale chosen. */
export interface MetricReading {
  unit: string;
  currency: string;
  per: TimeScale;
}

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
const countFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
/** The same signed percentage as the delta pill ("-33.3%"). */
const changeFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const shareFormat = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
const cardinal = new Intl.PluralRules(LOCALE);
const ordinal = new Intl.PluralRules(LOCALE, { type: 'ordinal' });
const ORDINAL_SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

const moneyFormats = new Map<string, Intl.NumberFormat>();
function moneyFormat(currency: string): Intl.NumberFormat {
  let format = moneyFormats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    moneyFormats.set(currency, format);
  }
  return format;
}

/** Intl reads a decimal string as it is (ECMA-402 NumberFormat v3): no binary rounding. */
const exact = (format: Intl.NumberFormat, value: string) => format.format(value as unknown as number);

/** "3.58 days", "1 week": the count of a scale. */
function inScale(value: string, per: TimeScale): string {
  const plural = cardinal.select(Number(value)) === 'one' ? per : `${per}s`;
  return `${exact(countFormat, value)} ${plural}`;
}

/** Signed hours of the clock ("-0.66") as "-40 min", "+1 h 20 min", "0 min". */
function clockShift(value: string): string {
  const hours = Number(value);
  const minutes = Math.round(Math.abs(hours) * 60);
  if (minutes === 0) return '0 min';
  const sign = hours < 0 ? '-' : '+';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${sign}${h ? `${h} h` : ''}${h && m ? ' ' : ''}${m ? `${m} min` : ''}`;
}

/**
 * A metric's value as the app shows it, from the decimal string of the API: in the substance's unit,
 * the currency of the settings, and, for rates and durations, the scale the user chose ("2.25 beer /
 * week", "€0.21 / day", "3.58 days"). Changes are signed percentages like the delta pill's, shares
 * plain ones, ranks ordinals ("5th"). "—" when the API has no value.
 */
@Pipe({
  name: 'metricValue',
})
export class MetricValuePipe implements PipeTransform {
  transform(value: string | null | undefined, metric: MetricDefinition, reading: MetricReading): string {
    if (value == null) return '—';
    const rate = metric.scales.length > 0 ? ` / ${reading.per}` : '';
    switch (metric.unit) {
      case 'quantity':
        return `${exact(quantityFormat, value)} ${reading.unit}${rate}`;
      case 'money':
        return `${exact(moneyFormat(reading.currency), value)}${rate}`;
      case 'count':
        return `${exact(countFormat, value)}${rate}`;
      case 'rank':
        return `${exact(countFormat, value)}${ORDINAL_SUFFIX[ordinal.select(Number(value))] ?? 'th'}`;
      case 'change':
        return exact(changeFormat, value);
      case 'share':
        return exact(shareFormat, value);
      case 'duration':
        return inScale(value, reading.per);
      case 'hours':
        return clockShift(value);
    }
  }
}
