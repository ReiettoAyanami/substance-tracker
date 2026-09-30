import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Dec, fmt, parseDecimal } from '../../src/shared/decimal.js';
import { ProblemError } from '../../src/shared/errors.js';
import {
  durationIn,
  logicalDate,
  logicalDayStart,
  normalizeTimeOfDay,
  parseInstant,
  periodOf,
  periodsBetween,
  toIso,
} from '../../src/shared/time.js';

const rome = { timezone: 'Europe/Rome', dayStartsAt: '00:00:00' };

describe('time', () => {
  it('logicalDate: local date of (instant − dayStartsAt) in the zone', () => {
    expect(logicalDate(new Date('2026-03-28T23:30:00Z'), rome)).toBe('2026-03-29');
    expect(logicalDate(new Date('2026-03-28T22:59:59Z'), rome)).toBe('2026-03-28');
    expect(logicalDate(new Date('2026-07-01T21:59:59Z'), rome)).toBe('2026-07-01');
    expect(logicalDate(new Date('2026-07-01T22:00:00Z'), rome)).toBe('2026-07-02');
    const early = { timezone: 'Europe/Rome', dayStartsAt: '04:00:00' };
    expect(logicalDate(new Date('2026-07-02T01:59:00Z'), early)).toBe('2026-07-01'); // 03:59 local
    expect(logicalDate(new Date('2026-07-02T02:00:00Z'), early)).toBe('2026-07-02'); // 04:00 local
  });

  it('logicalDayStart is the inverse boundary', () => {
    expect(logicalDayStart('2026-03-29', rome).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(logicalDayStart('2026-03-30', rome).toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(logicalDayStart('2026-10-26', rome).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('periods', () => {
    expect(periodOf('2026-09-29', 'day')).toBe('2026-09-29');
    expect(periodOf('2026-09-29', 'week')).toBe('2026-W40');
    expect(periodOf('2026-09-29', 'month')).toBe('2026-09');
    expect(periodOf('2027-01-01', 'week')).toBe('2026-W53');
    expect(periodsBetween('2026-01-30', '2026-03-01', 'month', 100)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(() => periodsBetween('2020-01-01', '2026-01-01', 'day', 100)).toThrow(ProblemError);
  });

  it('parseInstant needs an offset and returns UTC', () => {
    expect(toIso(parseInstant('2026-09-29T23:40:00+02:00'))).toBe('2026-09-29T21:40:00Z');
    expect(toIso(parseInstant('2026-09-29T21:40:00.999Z'))).toBe('2026-09-29T21:40:00Z');
    expect(() => parseInstant('2026-09-29T21:40:00')).toThrow(ProblemError);
    expect(() => parseInstant('2026-13-01T00:00:00Z')).toThrow(ProblemError);
  });

  it('normalizeTimeOfDay', () => {
    expect(normalizeTimeOfDay('04:00')).toBe('04:00:00');
    expect(normalizeTimeOfDay('23:59:59')).toBe('23:59:59');
    expect(normalizeTimeOfDay('24:00')).toBeNull();
  });
});

describe('durationIn (the interval the user chooses)', () => {
  const at = (iso: string) => new Date(iso);

  it('a calendar day of the DST change is one day, and 23 real hours', () => {
    // 2026-03-28 12:00 CET -> 2026-03-29 12:00 CEST
    const start = at('2026-03-28T11:00:00Z');
    const end = at('2026-03-29T10:00:00Z');
    expect(durationIn(start, end, 'day', 'Europe/Rome').toString()).toBe('1');
    expect(durationIn(start, end, 'hour', 'Europe/Rome').toString()).toBe('23');
  });

  it('weeks are 7 calendar days; the rest of a month is a fraction of that month', () => {
    const start = at('2026-09-01T10:00:00Z');
    expect(durationIn(start, at('2026-09-29T10:00:00Z'), 'week', 'Europe/Rome').toString()).toBe('4');
    expect(fmt(durationIn(start, at('2026-09-16T10:00:00Z'), 'month', 'Europe/Rome'), 4)).toBe('0.5000'); // 15 of 30
    expect(fmt(durationIn(at('2026-02-01T11:00:00Z'), at('2026-02-15T11:00:00Z'), 'month', 'Europe/Rome'), 4)).toBe('0.5000'); // 14 of 28
    expect(durationIn(start, at('2027-09-01T10:00:00Z'), 'year', 'Europe/Rome').toString()).toBe('1');
  });

  it('is negative when the end comes first', () => {
    expect(durationIn(at('2026-09-02T00:00:00Z'), at('2026-09-01T00:00:00Z'), 'day', 'UTC').toString()).toBe('-1');
  });
});

describe('decimal', () => {
  it('formats half-up with a fixed scale and no negative zero', () => {
    expect(fmt(new Dec('0.325'), 2)).toBe('0.33');
    expect(fmt(new Dec('2.675'), 2)).toBe('2.68'); // a float would give 2.67
    expect(fmt(new Dec('-0.0001'), 2)).toBe('0.00');
    expect(fmt(new Dec('10').div(3), 6)).toBe('3.333333');
  });

  it('never uses floats: 0.1 + 0.2 is 0.3', () => {
    expect(new Dec('0.1').plus('0.2').toFixed(2)).toBe('0.30');
    expect(new Dec(0.1).plus(0.2).eq('0.3')).toBe(true);
  });

  it('parseDecimal accepts strings and numbers matching the pattern', () => {
    expect(parseDecimal('1.5', { field: 'q' }).toFixed(3)).toBe('1.500');
    expect(parseDecimal(2, { field: 'q' }).toFixed(3)).toBe('2.000');
    expect(() => parseDecimal('1e3', { field: 'q' })).toThrow(ProblemError);
    expect(() => parseDecimal(' ', { field: 'q' })).toThrow(ProblemError);
    expect(() => parseDecimal('1.2345', { field: 'q', maxDecimals: 3 })).toThrow(ProblemError);
    expect(() => parseDecimal('0', { field: 'q', gt: 0 })).toThrow(ProblemError);
  });
});

describe('source rules', () => {
  const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

  async function sources(dir: string): Promise<string[]> {
    const out: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await sources(full)));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('there is no SQL DELETE (or TRUNCATE) anywhere in src/', async () => {
    for (const file of await sources(srcDir)) {
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(text, file).not.toMatch(/\bTRUNCATE\b/i);
    }
  });

  it('SQL lives only in repository.ts files and the db folder', async () => {
    for (const file of await sources(srcDir)) {
      const normalized = file.replace(/\\/g, '/');
      if (normalized.endsWith('/repository.ts') || normalized.includes('/src/db/')) continue;
      const text = await readFile(file, 'utf8');
      expect(text, file).not.toMatch(/\b(SELECT\s+\S+.*\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET)\b/i);
    }
  });
});
