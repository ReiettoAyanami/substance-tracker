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

const url = (id: number, query = '') => `/api/substances/${id}/metrics${query ? `?${query}` : ''}`;

/**
 * The beer ledger (fixture.ts) read in several periods and scales. All time, the period runs from
 * the first event (batch A, 09-01 10:00Z) to now (09-29 10:00Z): 28 days, 4 weeks, 672 hours.
 */
const CASES: Array<{ name: string; query: string; from: string | null; to: string | null; values: Record<string, string | null> }> = [
  {
    name: 'all time, per day',
    query: '',
    from: null,
    to: null,
    values: {
      'substance.consumed': '9.000', // 6 from A + 1 one-time + 2 from B
      'substance.pace': '0.321', // 9 / 28 days
      'substance.frequency': '0.21', // 6 consumptions / 28 days
      'substance.avgGap': '4.62', // c1 -> c5 = 23 days 2 hours, / 5
      'substance.sinceLast': '3.58', // c5 -> now = 3 days 14 hours
      'substance.longestPause': '7.92', // o1 -> c4 = 7 days 22 hours
      'substance.cost': '14.00', // 2 + 2 + 2 + 5 + 1.50 + 1.50
      'substance.spend': '20.00', // A 6.00 + one-time 5.00 + B 9.00
      'substance.unitPriceTrend': '0.5000', // 1.00 -> 1.50
      'substance.stockTime': '14.00', // 4 left / (8 from the batches / 28 days)
    },
  },
  {
    name: 'all time, per week',
    query: 'per=week',
    from: null,
    to: null,
    values: {
      'substance.consumed': '9.000',
      'substance.pace': '2.250',
      'substance.frequency': '1.50',
      'substance.avgGap': '0.66',
      'substance.sinceLast': '0.51',
      'substance.longestPause': '1.13',
      'substance.cost': '14.00',
      'substance.spend': '20.00',
      'substance.unitPriceTrend': '0.5000',
      'substance.stockTime': '2.00',
    },
  },
  {
    name: 'all time, per hour',
    query: 'per=hour',
    from: null,
    to: null,
    values: {
      'substance.consumed': '9.000',
      'substance.pace': '0.013', // 9 / 672
      'substance.frequency': '0.01',
      'substance.avgGap': '110.80', // 554 hours / 5
      'substance.sinceLast': '86.00',
      'substance.longestPause': '190.00',
      'substance.cost': '14.00',
      'substance.spend': '20.00',
      'substance.unitPriceTrend': '0.5000',
      'substance.stockTime': '336.00',
    },
  },
  {
    name: 'all time, per month (calendar months: 28 of the 30 days of September)',
    query: 'per=month',
    from: null,
    to: null,
    values: {
      'substance.consumed': '9.000',
      'substance.pace': '9.643', // 9 / (28 / 30)
      'substance.frequency': '6.43',
      'substance.avgGap': '0.15',
      'substance.sinceLast': '0.12',
      'substance.longestPause': '0.26',
      'substance.cost': '14.00',
      'substance.spend': '20.00',
      'substance.unitPriceTrend': '0.5000',
      'substance.stockTime': '0.47',
    },
  },
  {
    name: 'the last 7 days (09-23..09-29): 6.5 days up to now',
    query: 'days=7',
    from: '2026-09-23',
    to: '2026-09-29',
    values: {
      'substance.consumed': '1.000', // c5
      'substance.pace': '0.154',
      'substance.frequency': '0.15',
      'substance.avgGap': null, // one consumption
      'substance.sinceLast': '3.58', // not the period's
      'substance.longestPause': '5.08', // c4 -> c5 ends in it; the current pause is shorter
      'substance.cost': '1.50',
      'substance.spend': '0.00',
      'substance.unitPriceTrend': null, // no batch bought
      'substance.stockTime': '26.00', // 4 / (1 / 6.5 days)
    },
  },
  {
    name: 'from 09-01 to 09-10: ten whole days, all past',
    query: 'from=2026-09-01&to=2026-09-10',
    from: '2026-09-01',
    to: '2026-09-10',
    values: {
      'substance.consumed': '6.000',
      'substance.pace': '0.600',
      'substance.frequency': '0.30',
      'substance.avgGap': '4.00',
      'substance.sinceLast': '3.58',
      'substance.longestPause': '5.00', // c2 -> c3
      'substance.cost': '6.00',
      'substance.spend': '6.00',
      'substance.unitPriceTrend': null,
      'substance.stockTime': '6.67', // 4 / 0.6
    },
  },
  {
    name: 'from 09-11 on: 18.5 days up to now',
    query: 'from=2026-09-11',
    from: '2026-09-11',
    to: null,
    values: {
      'substance.consumed': '3.000',
      'substance.pace': '0.162',
      'substance.frequency': '0.16',
      'substance.avgGap': '6.50', // o1 -> c5 = 13 days, / 2
      'substance.sinceLast': '3.58',
      'substance.longestPause': '7.92',
      'substance.cost': '8.00',
      'substance.spend': '14.00', // one-time 5.00 + B 9.00
      'substance.unitPriceTrend': null,
      'substance.stockTime': '37.00', // 4 / (2 / 18.5 days)
    },
  },
];

describe('GET /api/substances/:id/metrics', () => {
  it.each(CASES)('$name', async ({ query, from, to, values }) => {
    const { beer } = await beerLedger(api);
    const res = await api.get(url(beer.id, query));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ per: new URLSearchParams(query).get('per') ?? 'day', from, to, values });
  });

  it('a substance with nothing recorded: totals at zero, nothing else', async () => {
    const s = await api.substance({ name: 'tea', unit: 'cup' });
    const res = await api.get(url(s.id));
    expect(res.body.values).toEqual({
      'substance.consumed': '0.000',
      'substance.pace': null,
      'substance.frequency': null,
      'substance.avgGap': null,
      'substance.sinceLast': null,
      'substance.longestPause': null,
      'substance.cost': '0.00',
      'substance.spend': '0.00',
      'substance.unitPriceTrend': null,
      'substance.stockTime': null,
    });
  });

  it('a period that starts after now has no rates', async () => {
    const { beer } = await beerLedger(api);
    const res = await api.get(url(beer.id, 'from=2026-10-05'));
    expect(res.body.values['substance.consumed']).toBe('0.000');
    expect(res.body.values['substance.pace']).toBeNull();
    expect(res.body.values['substance.stockTime']).toBeNull();
    expect(res.body.values['substance.sinceLast']).toBe('3.58');
  });

  it('an archived substance still has its metrics; a deleted or unknown one is a 404', async () => {
    const { beer, coffee } = await beerLedger(api);
    await api.patch(`/api/substances/${beer.id}`, { archived: true });
    expect((await api.get(url(beer.id))).body.values['substance.consumed']).toBe('9.000');
    await api.del(`/api/substances/${coffee.id}`);
    expectProblem(await api.get(url(coffee.id)), 404, 'not-found');
    expectProblem(await api.get(url(999999)), 404, 'not-found');
  });

  it('validates the scale and the period', async () => {
    const { beer } = await beerLedger(api);
    expectProblem(await api.get(url(beer.id, 'per=fortnight')), 400, 'validation');
    expectProblem(await api.get(url(beer.id, 'days=0')), 400, 'validation');
    expectProblem(await api.get(url(beer.id, 'days=7&from=2026-09-01')), 400, 'validation');
    expectProblem(await api.get(url(beer.id, 'from=2026-09-10&to=2026-09-01')), 400, 'validation');
    expectProblem(await api.get(url(beer.id, 'from=yesterday')), 400, 'validation');
    expectProblem(await api.get(url(beer.id, 'color=red')), 400, 'validation');
  });
});
