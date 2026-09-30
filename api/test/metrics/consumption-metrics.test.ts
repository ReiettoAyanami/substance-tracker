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

const ofBatch = (id: number, query = '') => `/api/consumptions/${id}/metrics${query ? `?${query}` : ''}`;
const ofOneTime = (id: number, query = '') => `/api/one-time-consumptions/${id}/metrics${query ? `?${query}` : ''}`;

/**
 * Against its substance (never another one): the beer ledger's six consumptions, 9 beer, 1.5 each
 * on average; the stock left is B's, at 1.50 each; every batch together, 15.00 for 12 beer (1.25).
 * In Rome they happened at 20:00, 20:00, 20:00, 22:00 (the bar), 20:00 and 22:00: the usual hour,
 * a circular mean, is 20:39.6.
 */
describe('GET /api/consumptions/:id/metrics and /api/one-time-consumptions/:id/metrics', () => {
  it('a batch consumption: against the one before it, the averages, the stock; its numbers; its hour', async () => {
    const { c4 } = await beerLedger(api);
    const res = await api.get(ofBatch(c4.id));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({
      per: 'day',
      from: null,
      to: null,
      values: {
        'consumption.deltaQuantity': '0.0000', // 1 after the one-time 1
        'consumption.quantityVsSubstanceAverage': '-0.3333', // 1 against 1.5
        'consumption.quantityVsBatchAverage': '0.0000', // B: 1 and 1
        'consumption.deltaCost': '-0.7000', // 1.50 after 5.00
        'consumption.unitPriceVsStock': '0.0000', // 1.50, the stock's too
        'consumption.unitPriceVsBatches': '0.2000', // 1.50 against 1.25
        'consumption.rankInSubstance': '5',
        'consumption.rankInBatch': '1',
        'consumption.rankInDay': '1',
        'consumption.sincePrevious': '7.92', // 7 days 22 hours after the one-time
        'consumption.hourVsUsual': '-0.66', // 20:00 against 20:39.6
        'consumption.shareOfBatch': '0.1667', // 1 of 6
      },
    });
    expect((await api.get(ofBatch(c4.id, 'per=hour'))).body.values['consumption.sincePrevious']).toBe('190.00');
  });

  it('a one-time consumption: its batch is the one-time ones, and it has no share of one', async () => {
    const { o1 } = await beerLedger(api);
    const res = await api.get(ofOneTime(o1.id));
    expect(res.body.values).toEqual({
      'consumption.deltaQuantity': '-0.5000', // 1 after 2
      'consumption.quantityVsSubstanceAverage': '-0.3333',
      'consumption.quantityVsBatchAverage': '0.0000', // the only one-time
      'consumption.deltaCost': '1.5000', // 5.00 after 2.00
      'consumption.unitPriceVsStock': '2.3333', // 5.00 against 1.50
      'consumption.unitPriceVsBatches': '3.0000', // 5.00 against 1.25
      'consumption.rankInSubstance': '4',
      'consumption.rankInBatch': '1',
      'consumption.rankInDay': '1',
      'consumption.sincePrevious': '2.08',
      'consumption.hourVsUsual': '1.34', // 22:00
      'consumption.shareOfBatch': null,
    });
  });

  it('the first consumption of a substance has nothing before it', async () => {
    const { c1 } = await beerLedger(api);
    const res = await api.get(ofBatch(c1.id));
    expect(res.body.values).toMatchObject({
      'consumption.deltaQuantity': null,
      'consumption.deltaCost': null,
      'consumption.sincePrevious': null,
      'consumption.quantityVsSubstanceAverage': '0.3333',
      'consumption.unitPriceVsStock': '-0.3333',
      'consumption.rankInSubstance': '1',
      'consumption.shareOfBatch': '0.3333',
    });
  });

  it('its number in its day counts the logical day', async () => {
    const tea = await api.substance({ name: 'tea', unit: 'cup' });
    const batch = await api.batch(tea.id, { quantity: 10, totalPrice: '5.00', occurredAt: '2026-09-27T10:00:00Z' });
    const morning = await api.consume(batch.id, { quantity: 1, occurredAt: '2026-09-28T06:00:00Z' }); // 08:00
    const night = await api.consume(batch.id, { quantity: 1, occurredAt: '2026-09-28T20:00:00Z' }); // 22:00
    const after = await api.consume(batch.id, { quantity: 1, occurredAt: '2026-09-28T22:30:00Z' }); // 00:30 of the 29th
    const rank = async (id: number) => (await api.get(ofBatch(id))).body.values['consumption.rankInDay'];
    expect([await rank(morning.id), await rank(night.id), await rank(after.id)]).toEqual(['1', '2', '1']);
  });

  it('a cancelled or unknown consumption is a 404; the scale is validated', async () => {
    const { b, o1, c4 } = await beerLedger(api);
    const cancelled = await api.consume(b.id, { quantity: 1, occurredAt: '2026-09-27T08:00:00Z' });
    await api.del(`/api/consumptions/${cancelled.id}`);
    expectProblem(await api.get(ofBatch(cancelled.id)), 404, 'not-found');
    expectProblem(await api.get(ofBatch(999999)), 404, 'not-found');
    expectProblem(await api.get(ofOneTime(999999)), 404, 'not-found');
    await api.del(`/api/one-time-consumptions/${o1.id}`);
    expectProblem(await api.get(ofOneTime(o1.id)), 404, 'not-found');
    expectProblem(await api.get(ofBatch(c4.id, 'per=fortnight')), 400, 'validation');
    expectProblem(await api.get(ofBatch(c4.id, 'days=7')), 400, 'validation');
  });
});
