import { DateTime } from 'luxon';
import { Dec, fmt, fmtMoney, fmtQty, fmtUnitPrice, fromDb, sum, ZERO } from '../../shared/decimal.js';
import { logicalDate, periodOf, toIso, type DayConfig, type GroupBy } from '../../shared/time.js';
import type * as repo from '../reports/repository.js';
import type { ConsumptionEntry } from '../reports/service.js';
import type { SubstanceLedger } from './calculations.js';
import type { SeriesDefinition } from './catalog.js';
import { inPeriod, type Period } from './period.js';

/** One line (or bar, or slice) of a chart: a substance, a batch, or the one-time consumptions of a substance. */
export interface SeriesLine {
  /** `substance:<id>`, `batch:<id>` or `one-time:<substance id>`: unique in a response. */
  key: string;
  kind: 'substance' | 'batch' | 'one_time';
  /** The substance's or the batch's id (the one-time line: its substance's). */
  id: number;
  substanceId: number;
  /** The substance's name, the batch's (null when it has none), null for the one-time line. */
  name: string | null;
  unit: string;
  /** When a batch was bought; null for the others. */
  occurredAt: string | null;
  /** One per period, in order; null where there is nothing to say (a price with no purchase). */
  values: (string | null)[];
  /** Over the whole period: the sum, or for a price the average of the period. */
  total: string | null;
}

/** What one line is made of: the consumptions, batches and one-time purchases it counts. */
interface Part {
  line: Omit<SeriesLine, 'values' | 'total'>;
  entries: ConsumptionEntry[];
  batches: repo.BatchStatRow[];
  oneTimes: repo.OneTimeStatRow[];
}

export interface SeriesContext {
  period: Period;
  day: DayConfig;
  /** Day, week, month or year; null for the hours of the day. */
  per: GroupBy | null;
  periods: string[];
}

export const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/** The parts of one substance: itself, or each of its batches (oldest first) and its one-time consumptions. */
export function partsOf(
  substance: { id: number; name: string; unit: string },
  ledger: SubstanceLedger,
  by: 'substance' | 'batch',
): Part[] {
  const base = { substanceId: substance.id, unit: substance.unit };
  if (by === 'substance') {
    return [
      {
        line: { key: `substance:${substance.id}`, kind: 'substance', id: substance.id, name: substance.name, occurredAt: null, ...base },
        entries: ledger.entries,
        batches: ledger.batches,
        oneTimes: ledger.oneTimes,
      },
    ];
  }
  return [
    ...ledger.batches.map(
      (b): Part => ({
        line: { key: `batch:${b.id}`, kind: 'batch', id: b.id, name: b.name, occurredAt: toIso(b.occurred_at), ...base },
        entries: ledger.entries.filter((e) => e.type === 'consumption' && e.batch_id === b.id),
        batches: [b],
        oneTimes: [],
      }),
    ),
    {
      line: { key: `one-time:${substance.id}`, kind: 'one_time', id: substance.id, name: null, occurredAt: null, ...base },
      entries: ledger.entries.filter((e) => e.type === 'one_time'),
      batches: [],
      oneTimes: ledger.oneTimes,
    },
  ];
}

/**
 * The line of one part: its value in each period and over the whole period; null when it has
 * nothing in the period (it is left out of the chart).
 */
export function lineOf(definition: SeriesDefinition, part: Part, ctx: SeriesContext): SeriesLine | null {
  const index = new Map(ctx.periods.map((p, i) => [p, i]));
  const bucketOf = (instant: Date): number => {
    if (ctx.per === null) return DateTime.fromJSDate(instant, { zone: ctx.day.timezone }).hour;
    return index.get(periodOf(logicalDate(instant, ctx.day), ctx.per))!;
  };
  const entries = part.entries.filter((e) => inPeriod(ctx.period, e.occurred_at));
  const batches = part.batches.filter((b) => inPeriod(ctx.period, b.occurred_at));
  const oneTimes = part.oneTimes.filter((o) => inPeriod(ctx.period, o.occurred_at));
  const zeros = () => ctx.periods.map(() => ZERO);

  let values: (Dec | null)[];
  let total: Dec | null;
  let format: (v: Dec) => string;
  switch (definition.key) {
    case 'series.consumed':
    case 'series.consumptions':
    case 'series.cost':
    case 'series.hourOfDay': {
      if (entries.length === 0) return null;
      const buckets = zeros();
      const of = (e: ConsumptionEntry): Dec =>
        definition.key === 'series.consumed' ? e.quantity : definition.key === 'series.cost' ? e.cost : new Dec(1);
      for (const e of entries) buckets[bucketOf(e.occurred_at)] = buckets[bucketOf(e.occurred_at)]!.plus(of(e));
      values = buckets;
      total = sum(buckets);
      format = definition.key === 'series.consumed' ? fmtQty : definition.key === 'series.cost' ? fmtMoney : (v) => fmt(v, 0);
      break;
    }
    case 'series.spend': {
      if (batches.length === 0 && oneTimes.length === 0) return null;
      const buckets = zeros();
      for (const b of batches) buckets[bucketOf(b.occurred_at)] = buckets[bucketOf(b.occurred_at)]!.plus(fromDb(b.total_price));
      for (const o of oneTimes) buckets[bucketOf(o.occurred_at)] = buckets[bucketOf(o.occurred_at)]!.plus(fromDb(o.total_price));
      values = buckets;
      total = sum(buckets);
      format = fmtMoney;
      break;
    }
    case 'series.unitPrice': {
      // the batches' price: what was paid ÷ what was bought; the one-time line (by batch) has its own
      const purchases =
        part.line.kind === 'one_time'
          ? oneTimes.map((o) => ({ at: o.occurred_at, paid: fromDb(o.total_price), bought: fromDb(o.quantity) }))
          : batches.map((b) => ({ at: b.occurred_at, paid: fromDb(b.total_price), bought: fromDb(b.quantity) }));
      if (purchases.length === 0) return null;
      const paid = zeros();
      const bought = zeros();
      for (const p of purchases) {
        const i = bucketOf(p.at);
        paid[i] = paid[i]!.plus(p.paid);
        bought[i] = bought[i]!.plus(p.bought);
      }
      values = paid.map((v, i) => (bought[i]!.isZero() ? null : v.div(bought[i]!)));
      const allBought = sum(bought);
      total = allBought.isZero() ? null : sum(paid).div(allBought);
      format = fmtUnitPrice;
      break;
    }
    default:
      throw new Error(`No computation for ${definition.key}`);
  }
  return {
    ...part.line,
    values: values.map((v) => (v === null ? null : format(v))),
    total: total === null ? null : format(total),
  };
}
