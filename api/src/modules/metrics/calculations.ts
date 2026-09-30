import { Dec, fmt, fmtMoney, fmtOrNull, fmtQty, fromDb, SCALE, sum, ZERO } from '../../shared/decimal.js';
import { durationIn, type DayConfig, type TimeScale } from '../../shared/time.js';
import type * as repo from '../reports/repository.js';
import {
  compareWithPrevious,
  consumptionEntriesOf,
  ofItsSubstance,
  remainingOf,
  unitPriceOf,
  type ConsumptionEntry,
} from '../reports/service.js';
import { inPeriod, type Period } from './period.js';

/** What a metric request returns for one entity: every key of its scope, a decimal string or null. */
export type MetricValues = Record<string, string | null>;

/** Durations, and counts as a rate, have 2 decimals. */
const TWO = 2;

/** Everything recorded for one substance that counts (nothing deleted), oldest first. */
export interface SubstanceLedger {
  batches: repo.BatchStatRow[];
  consumptions: repo.ConsumptionStatRow[];
  adjustments: repo.AdjustmentStatRow[];
  oneTimes: repo.OneTimeStatRow[];
  /** Batch and one-time consumptions together, with their cost and unit price, and their deltas from the one before of the substance. */
  entries: ConsumptionEntry[];
}

export function substanceLedgerOf(rows: Omit<SubstanceLedger, 'entries'>): SubstanceLedger {
  const entries = consumptionEntriesOf(rows.batches, rows.consumptions, rows.oneTimes);
  compareWithPrevious(entries, ofItsSubstance);
  return { ...rows, entries };
}

/** Splits the ledger of several substances into one per substance (every id gets one, maybe empty). */
export function substanceLedgers(ids: number[], rows: Omit<SubstanceLedger, 'entries'>): Map<number, SubstanceLedger> {
  const by = <T extends { substance_id: number }>(list: T[]) => {
    const map = new Map<number, T[]>(ids.map((id) => [id, []]));
    for (const row of list) map.get(row.substance_id)?.push(row);
    return map;
  };
  const batches = by(rows.batches);
  const consumptions = by(rows.consumptions);
  const adjustments = by(rows.adjustments);
  const oneTimes = by(rows.oneTimes);
  return new Map(
    ids.map((id) => [
      id,
      substanceLedgerOf({
        batches: batches.get(id)!,
        consumptions: consumptions.get(id)!,
        adjustments: adjustments.get(id)!,
        oneTimes: oneTimes.get(id)!,
      }),
    ]),
  );
}

/** How a request reads time: the scale chosen, the zone of the settings, now. */
export interface MetricContext {
  scale: TimeScale;
  day: DayConfig;
  now: Date;
}

const earliest = (dates: Date[]): Date | null =>
  dates.reduce<Date | null>((first, d) => (first === null || d.getTime() < first.getTime() ? d : first), null);

const minDate = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

const largest = (values: Dec[]): Dec | null => values.reduce<Dec | null>((max, v) => (max === null || v.gt(max) ? v : max), null);

/** The stock now: Σ remaining of the active batches. */
export function stockOf(ledger: SubstanceLedger): Dec {
  return sum(ledger.batches.filter((b) => !b.deactivated_at).map(remainingOf));
}

/**
 * The substance metrics over `period` (design-statistics.md). Rates divide by the length of the
 * period up to now: from its first day (or the first thing recorded, all time) to its last day or
 * now, whichever comes first. A pause counts in the period it ends in; the current one ends now.
 */
export function substanceValues(ledger: SubstanceLedger, period: Period, ctx: MetricContext): MetricValues {
  const { scale, now } = ctx;
  const zone = ctx.day.timezone;
  const length = (start: Date, end: Date) => durationIn(start, end, scale, zone);

  const entries = ledger.entries;
  const inside = entries.filter((e) => inPeriod(period, e.occurred_at));
  const last = entries[entries.length - 1];

  const firstEvent = earliest([...ledger.batches.map((b) => b.occurred_at), ...entries.map((e) => e.occurred_at)]);
  const rateStart = period.start ?? firstEvent;
  const span = rateStart === null ? null : length(rateStart, minDate(period.end ?? now, now));
  const perInterval = (amount: Dec): Dec | null => (span !== null && span.gt(0) ? amount.div(span) : null);

  const consumed = sum(inside.map((e) => e.quantity));
  const batchPace = perInterval(sum(inside.filter((e) => e.type === 'consumption').map((e) => e.quantity)));

  const pauses: Array<{ end: Date; length: Dec }> = [];
  for (let i = 1; i < entries.length; i++) {
    pauses.push({ end: entries[i]!.occurred_at, length: length(entries[i - 1]!.occurred_at, entries[i]!.occurred_at) });
  }
  if (last && last.occurred_at.getTime() <= now.getTime()) {
    pauses.push({ end: now, length: length(last.occurred_at, now) });
  }
  const longestPause = largest(pauses.filter((p) => inPeriod(period, p.end)).map((p) => p.length));

  const bought = ledger.batches.filter((b) => inPeriod(period, b.occurred_at));
  const firstPrice = bought[0] ? unitPriceOf(bought[0]) : ZERO;
  const trend =
    bought.length >= 2 && !firstPrice.isZero()
      ? unitPriceOf(bought[bought.length - 1]!)
          .div(firstPrice)
          .pow(new Dec(1).div(bought.length - 1))
          .minus(1)
      : null;

  return {
    'substance.consumed': fmtQty(consumed),
    'substance.pace': fmtOrNull(perInterval(consumed), SCALE.quantity),
    'substance.frequency': fmtOrNull(perInterval(new Dec(inside.length)), TWO),
    'substance.avgGap':
      inside.length >= 2
        ? fmt(length(inside[0]!.occurred_at, inside[inside.length - 1]!.occurred_at).div(inside.length - 1), TWO)
        : null,
    'substance.sinceLast': last ? fmt(Dec.max(length(last.occurred_at, now), ZERO), TWO) : null,
    'substance.longestPause': fmtOrNull(longestPause, TWO),
    'substance.cost': fmtMoney(sum(inside.map((e) => e.cost))),
    'substance.spend': fmtMoney(
      sum([
        ...bought.map((b) => fromDb(b.total_price)),
        ...ledger.oneTimes.filter((o) => inPeriod(period, o.occurred_at)).map((o) => fromDb(o.total_price)),
      ]),
    ),
    'substance.unitPriceTrend': fmtOrNull(trend, SCALE.ratio),
    'substance.stockTime': batchPace !== null && !batchPace.isZero() ? fmt(stockOf(ledger).div(batchPace), TWO) : null,
  };
}
