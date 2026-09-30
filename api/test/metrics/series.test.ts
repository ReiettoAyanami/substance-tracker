import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectProblem, makeApi, type Api } from '../support/api.js';
import { beerLedger } from './fixture.js';

let api: Api;
beforeAll(async () => {
  api = await makeApi();
});
afterAll(async () => {
  await api.app.close();
});

const series = (query: string) => api.get(`/api/series?${query}`);
const SEPTEMBER = 'from=2026-09-01&to=2026-09-30';
const WEEKS = ['2026-W36', '2026-W37', '2026-W38', '2026-W39', '2026-W40'];

/**
 * The beer ledger (fixture.ts) week by week (ISO weeks: W36 is 31 Aug - 6 Sep, W40 28 Sep - 4 Oct):
 * c1 and c2 in W36, c3 and the one-time o1 in W37, c4 in W38 (Sunday 20), c5 in W39; coffee's one
 * cup in W39 (Sunday 27).
 */
describe('GET /api/series', () => {
  it('consumed, per week, one series per substance, zero-filled, with its total', async () => {
    const { beer, coffee } = await beerLedger(api);
    const res = await series(`metric=series.consumed&per=week&${SEPTEMBER}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      metric: 'series.consumed',
      per: 'week',
      by: 'substance',
      from: '2026-09-01',
      to: '2026-09-30',
      periods: WEEKS,
      series: [
        {
          key: `substance:${beer.id}`,
          kind: 'substance',
          id: beer.id,
          substanceId: beer.id,
          name: 'beer',
          unit: 'beer',
          occurredAt: null,
          values: ['4.000', '3.000', '1.000', '1.000', '0.000'],
          total: '9.000',
        },
        {
          key: `substance:${coffee.id}`,
          kind: 'substance',
          id: coffee.id,
          substanceId: coffee.id,
          name: 'coffee',
          unit: 'cup',
          occurredAt: null,
          values: ['0.000', '0.000', '0.000', '1.000', '0.000'],
          total: '1.000',
        },
      ],
    });
  });

  it('consumptions, cost and spend, per month', async () => {
    await beerLedger(api);
    const values = async (metric: string) =>
      (await series(`metric=${metric}&per=month&${SEPTEMBER}`)).body.series.map((s: any) => [s.name, s.values, s.total]);
    expect(await values('series.consumptions')).toEqual([
      ['beer', ['6'], '6'],
      ['coffee', ['1'], '1'],
    ]);
    expect(await values('series.cost')).toEqual([
      ['beer', ['14.00'], '14.00'],
      ['coffee', ['0.30'], '0.30'],
    ]);
    expect(await values('series.spend')).toEqual([
      ['beer', ['20.00'], '20.00'], // the deleted batch of 100.00 never counts
      ['coffee', ['3.00'], '3.00'],
    ]);
  });

  it('the unit price of the batches bought in each period, none where none was bought', async () => {
    await beerLedger(api);
    const res = await series(`metric=series.unitPrice&per=week&${SEPTEMBER}`);
    expect(res.body.series.map((s: any) => [s.name, s.values, s.total])).toEqual([
      ['beer', ['1.000000', null, '1.500000', null, null], '1.250000'], // 15.00 for 12
      ['coffee', ['0.300000', null, null, null, null], '0.300000'],
    ]);
  });

  it('the hour of the day: the 24 hours of the clock, whatever the scale', async () => {
    await beerLedger(api);
    const res = await series(`metric=series.hourOfDay&${SEPTEMBER}`);
    expect(res.body.periods).toEqual(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')));
    const beer = res.body.series.find((s: any) => s.name === 'beer');
    expect(beer.values[20]).toBe('4'); // 20:00 in Rome
    expect(beer.values[22]).toBe('2');
    expect(beer.total).toBe('6');
    expect(res.body.series.find((s: any) => s.name === 'coffee').values[10]).toBe('1');
    expect(res.body.per).toBeNull();
  });

  it('by batch: one series per batch of the substance, oldest first, and one for its one-time consumptions', async () => {
    const { beer, a, b } = await beerLedger(api);
    const res = await series(`metric=series.consumed&per=week&by=batch&substanceIds=${beer.id}&${SEPTEMBER}`);
    expect(res.body.by).toBe('batch');
    expect(res.body.series.map((s: any) => [s.key, s.kind, s.name, s.occurredAt, s.values])).toEqual([
      [`batch:${a.id}`, 'batch', 'A', '2026-09-01T10:00:00Z', ['4.000', '2.000', '0.000', '0.000', '0.000']],
      [`batch:${b.id}`, 'batch', 'B', '2026-09-15T10:00:00Z', ['0.000', '0.000', '1.000', '1.000', '0.000']],
      [`one-time:${beer.id}`, 'one_time', null, null, ['0.000', '1.000', '0.000', '0.000', '0.000']],
    ]);
  });

  it('leaves out what has nothing in the period; the last N days; one or more substances', async () => {
    const { beer, coffee } = await beerLedger(api);
    const early = await series('metric=series.cost&per=day&from=2026-09-01&to=2026-09-10');
    expect(early.body.series.map((s: any) => s.name)).toEqual(['beer']);
    const week = await series('metric=series.cost&per=day&days=7');
    expect(week.body.periods).toEqual(['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']);
    expect(week.body.series.map((s: any) => [s.name, s.total])).toEqual([
      ['beer', '1.50'],
      ['coffee', '0.30'],
    ]);
    const one = await series(`metric=series.cost&per=year&substanceIds=${coffee.id}`);
    expect(one.body.series.map((s: any) => s.name)).toEqual(['coffee']);
    expect(one.body.periods).toEqual(['2026']);
    const both = await series(`metric=series.cost&per=month&substanceIds=${coffee.id},${beer.id}&${SEPTEMBER}`);
    expect(both.body.series.map((s: any) => s.name)).toEqual(['beer', 'coffee']);
  });

  it('without a period: from the first thing recorded to today', async () => {
    await beerLedger(api);
    const res = await series('metric=series.consumed&per=month');
    expect([res.body.from, res.body.to]).toEqual(['2026-09-01', '2026-09-29']);
    expect(res.body.periods).toEqual(['2026-09']);
  });

  it('validates the metric, the scale, the grouping and the substances', async () => {
    await beerLedger(api);
    expectProblem(await series('metric=series.nothing'), 400, 'validation');
    expectProblem(await series('metric=substance.pace'), 400, 'validation');
    expectProblem(await series('per=week'), 400, 'validation');
    expectProblem(await series('metric=series.cost&per=hour'), 400, 'validation');
    expectProblem(await series('metric=series.cost&by=kitchen'), 400, 'validation');
    expectProblem(await series('metric=series.cost&substanceIds=999999'), 404, 'not-found');
    expectProblem(await series('metric=series.cost&per=day&from=2020-01-01&to=2026-09-29'), 400, 'validation');
  });
});

describe('GET /api/metrics lists the series too', () => {
  it('each with the charts that can draw it and the scales it groups by', async () => {
    const res = await api.get('/api/metrics');
    const series = res.body.filter((m: any) => m.scope === 'series');
    expect(series.map((m: any) => [m.key, m.unit, m.scales, m.charts])).toEqual([
      ['series.consumed', 'quantity', ['day', 'week', 'month', 'year'], ['bar', 'line']],
      ['series.consumptions', 'count', ['day', 'week', 'month', 'year'], ['bar', 'line', 'donut']],
      ['series.cost', 'money', ['day', 'week', 'month', 'year'], ['bar', 'line', 'donut']],
      ['series.spend', 'money', ['day', 'week', 'month', 'year'], ['bar', 'line', 'donut']],
      ['series.unitPrice', 'unitPrice', ['day', 'week', 'month', 'year'], ['line', 'bar']],
      ['series.hourOfDay', 'count', [], ['bar', 'line']],
    ]);
    for (const m of series) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.period).toBe(true);
    }
  });
});
