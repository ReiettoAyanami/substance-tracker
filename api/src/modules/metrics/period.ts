import { badRequest } from '../../shared/errors.js';
import { addDays, isValidIsoDate, logicalDate, logicalDayStart, type DayConfig } from '../../shared/time.js';

/** The period of a query: logical days from..to (inclusive, either end open), or the last N days. */
export interface PeriodQuery {
  from?: string | undefined;
  to?: string | undefined;
  /** The last N logical days, today included. Not with from / to. */
  days?: number | undefined;
}

/** A period resolved against the logical day. */
export interface Period {
  /** First logical day, or null: from the first thing recorded. */
  from: string | null;
  /** Last logical day, or null: up to now. */
  to: string | null;
  /** The instant the first day starts; null when open. */
  start: Date | null;
  /** The instant after the last day; null when open. */
  end: Date | null;
}

/** 400 on an invalid date, from after to, or days together with from / to. */
export function resolvePeriod(query: PeriodQuery, cfg: DayConfig, now: Date): Period {
  if (query.days !== undefined) {
    if (query.from !== undefined || query.to !== undefined) {
      throw badRequest('days cannot be combined with from or to', 'days');
    }
    const to = logicalDate(now, cfg);
    const from = addDays(to, 1 - query.days);
    return { from, to, start: logicalDayStart(from, cfg), end: logicalDayStart(addDays(to, 1), cfg) };
  }
  const { from, to } = query;
  if (from !== undefined && !isValidIsoDate(from)) throw badRequest('from must be a date YYYY-MM-DD', 'from');
  if (to !== undefined && !isValidIsoDate(to)) throw badRequest('to must be a date YYYY-MM-DD', 'to');
  if (from !== undefined && to !== undefined && from > to) throw badRequest('from must not be after to', 'from');
  return {
    from: from ?? null,
    to: to ?? null,
    start: from === undefined ? null : logicalDayStart(from, cfg),
    end: to === undefined ? null : logicalDayStart(addDays(to, 1), cfg),
  };
}

/** The instant falls in the period: start <= t < end, an open end being no bound. */
export function inPeriod(period: Pick<Period, 'start' | 'end'>, instant: Date): boolean {
  const t = instant.getTime();
  return (period.start === null || t >= period.start.getTime()) && (period.end === null || t < period.end.getTime());
}
